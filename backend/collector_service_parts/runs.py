from __future__ import annotations

from .common import *  # noqa: F401,F403



def _service_module():
    import sys

    return sys.modules["backend.collector_service_impl"]

class RunMixin:
    def _running_run_for_job(self, job_id: int) -> dict[str, Any] | None:
        for item in sorted(self._list_all_runs(), key=lambda row: int(row.get("id") or 0), reverse=True):
            if int(item.get("job_id") or 0) != int(job_id):
                continue
            if str(item.get("status") or "").lower() == "running":
                item = self._reconcile_orphaned_run(item)
            if str(item.get("status") or "").lower() == "running":
                return item
        return None

    def _register_run_cancel_event(self, run_id: int) -> threading.Event:
        with self._run_cancel_lock:
            event = threading.Event()
            self._run_cancel_events[int(run_id)] = event
            return event

    def _pop_run_cancel_event(self, run_id: int) -> threading.Event | None:
        with self._run_cancel_lock:
            return self._run_cancel_events.pop(int(run_id), None)

    def _cancel_event_for_run(self, run_id: int) -> threading.Event | None:
        with self._run_cancel_lock:
            return self._run_cancel_events.get(int(run_id))

    def _owner_pid_alive(self, owner_pid: Any) -> bool:
        try:
            pid = int(owner_pid or 0)
        except (TypeError, ValueError):
            return False
        if pid <= 0:
            return False
        if pid == os.getpid():
            return True
        try:
            if os.name == "nt":
                import ctypes

                kernel32 = ctypes.windll.kernel32
                SYNCHRONIZE = 0x00100000
                PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
                STILL_ACTIVE = 259
                handle = kernel32.OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, 0, pid)
                if not handle:
                    return False
                exit_code = ctypes.c_ulong()
                if not kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code)):
                    kernel32.CloseHandle(handle)
                    return False
                kernel32.CloseHandle(handle)
                return exit_code.value == STILL_ACTIVE
            os.kill(pid, 0)
            return True
        except Exception:  # noqa: BLE001
            return False

    def _reconcile_orphaned_run(self, run: dict[str, Any]) -> dict[str, Any]:
        if str(run.get("status") or "").lower() != "running":
            return run
        if self._owner_pid_alive(run.get("owner_pid")):
            return run
        self._finish_run(
            int(run["id"]),
            "cancelled",
            copy.deepcopy(run.get("stats_json") or {}),
            "Cancelled because the owner process is no longer running.",
            result=copy.deepcopy(run.get("result_json")) if isinstance(run.get("result_json"), dict) else None,
        )
        return self.runtime_store.get_run(int(run["id"]))

    def _run_auto_job_in_background(
        self,
        run_id: int,
        payload: dict[str, Any],
        job_id: int,
        interval_minutes: int,
        release_run_slot: bool = False,
    ) -> None:
        try:
            report = self._execute_manual_run(payload, trigger_type="auto", job_id=job_id, run_id=run_id)
            if report.get("status") == "success":
                self._schedule_job_next_run(job_id, interval_minutes)
        except Exception as exc:  # noqa: BLE001
            self._record_background_run_failure(run_id, exc)
        finally:
            self._pop_run_cancel_event(run_id)
            if release_run_slot:
                self._release_run_slot()

    def run_job_now(self, job_id: int) -> dict[str, Any]:
        workspace = self._ensure_builtin_rule_set()
        index = self._find_job_index(workspace.get("jobs", []), job_id)
        if index < 0:
            raise ValueError(f"job {job_id} not found")
        job = copy.deepcopy(workspace["jobs"][index])
        if job.get("deleted_at"):
            raise ValueError(f"job {job_id} is deleted")
        current = self._running_run_for_job(int(job_id))
        if current is not None:
            return {"run_id": int(current["id"]), "status": "running", "job_id": int(job_id)}
        payload = self._build_job_run_payload(job)
        if not self._try_acquire_run_slot():
            raise RuntimeError("too many background runs")
        try:
            run_id = self._create_run(job_id=job_id, trigger_type="auto")
            self._register_run_cancel_event(run_id)
            thread = threading.Thread(
                target=self._run_auto_job_in_background,
                args=(run_id, copy.deepcopy(payload), int(job_id), int(job["interval_minutes"]), True),
                daemon=True,
            )
            thread.start()
        except Exception as exc:
            self._record_background_run_failure(run_id, exc)
            self._release_run_slot()
            raise
        return {"run_id": run_id, "status": "running", "job_id": int(job_id)}

    def start_manual_run(self, payload: dict[str, Any], trigger_type: str = "manual", job_id: int | None = None) -> dict[str, Any]:
        if not self._try_acquire_run_slot():
            raise RuntimeError("too many background runs")
        try:
            run_id = self._create_run(job_id=job_id, trigger_type=trigger_type)
            self._register_run_cancel_event(run_id)
            thread = threading.Thread(
                target=self._run_manual_in_background,
                args=(run_id, copy.deepcopy(payload), trigger_type, job_id, True),
                daemon=True,
            )
            thread.start()
        except Exception as exc:
            self._record_background_run_failure(run_id, exc)
            self._release_run_slot()
            raise
        return {"run_id": run_id, "status": "running"}

    def run_manual(self, payload: dict[str, Any], trigger_type: str = "manual", job_id: int | None = None) -> dict[str, Any]:
        run_id = self._create_run(job_id=job_id, trigger_type=trigger_type)
        self._register_run_cancel_event(run_id)
        return self._execute_manual_run(payload, trigger_type=trigger_type, job_id=job_id, run_id=run_id)

    def _run_manual_in_background(
        self,
        run_id: int,
        payload: dict[str, Any],
        trigger_type: str,
        job_id: int | None,
        release_run_slot: bool = False,
    ) -> None:
        try:
            self._execute_manual_run(payload, trigger_type=trigger_type, job_id=job_id, run_id=run_id)
        except Exception as exc:  # noqa: BLE001
            self._record_background_run_failure(run_id, exc)
        finally:
            self._pop_run_cancel_event(run_id)
            if release_run_slot:
                self._release_run_slot()

    def _execute_manual_run(self, payload: dict[str, Any], *, trigger_type: str, job_id: int | None, run_id: int) -> dict[str, Any]:
        if payload.get("search_spec") is not None:
            search_spec = normalize_search_spec(payload.get("search_spec"))
        else:
            search_spec = normalize_search_spec(
                {
                    "keywords": payload.get("keywords", []),
                    "days": payload.get("days", 1),
                    "thresholds": payload.get("thresholds", {}),
                    "max_results": payload.get("max_results", 100),
                }
            )
        now_utc = datetime.now(timezone.utc)
        final_queries = build_execution_query_plan_from_search_spec(
            search_spec,
            now_utc=now_utc,
            slice_minutes=int(search_spec.get("time_slice_minutes") or 60),
        )
        final_query = build_query_from_search_spec(search_spec)
        if not search_spec.get("all_keywords") and not search_spec.get("raw_query") and not final_queries:
            raise ValueError("search_spec is empty")
        if not final_queries and final_query:
            final_queries = [final_query]
        tags = normalize_tags(payload.get("tags"))
        rule_set = self._resolve_rule_set(
            rule_set_id=int(payload.get("rule_set_id") or 0) or None,
            inline_rule_set=payload.get("rule_set"),
        )
        days = int(search_spec.get("days", 1))
        cancel_event = self._cancel_event_for_run(run_id)

        try:
            fetched_results: list[SearchResult] = []
            query_errors: list[str] = []
            total_queries = len(final_queries)
            self.runtime_store.update_run_progress(
                run_id,
                stats={
                    "total_queries": total_queries,
                    "completed_queries": 0,
                    "progress_percent": 0,
                    "fetched_raw": 0,
                },
            )
            for index, query in enumerate(final_queries, start=1):
                if cancel_event is not None and cancel_event.is_set():
                    raise RunCancelled("cancelled")
                try:
                    try:
                        raw_payload = _service_module().run_twitter_search(
                            query,
                            int(search_spec.get("max_results", 40)),
                            cancel_event=cancel_event,
                        )
                    except TypeError as exc:
                        if "cancel_event" not in str(exc):
                            raise
                        raw_payload = _service_module().run_twitter_search(query, int(search_spec.get("max_results", 40)))
                    normalized = _service_module().normalize_search_payload(f"{trigger_type}:{index}", raw_payload, query)
                    fetched_results.extend(normalized)
                except Exception as exc:  # noqa: BLE001
                    if isinstance(exc, RunCancelled):
                        raise
                    query_errors.append(f"{query}: {exc}")
                completed_queries = index
                progress_percent = int((completed_queries / total_queries) * 100) if total_queries else 100
                self.runtime_store.update_run_progress(
                    run_id,
                    stats={
                        "total_queries": total_queries,
                        "completed_queries": completed_queries,
                        "progress_percent": progress_percent,
                        "fetched_raw": len(fetched_results),
                        "query_errors": len(query_errors),
                    },
                )

            if not fetched_results and query_errors:
                raise RuntimeError("; ".join(query_errors[:3]))

            deduped_results = _dedupe_search_results(fetched_results)
            fetched_at = _service_module().utc_now_iso()
            run_errors = query_errors[:10]
            filtered_results = [item for item in deduped_results if passes_search_filters(item, search_spec, now_utc)]
            self._store_raw(run_id, filtered_results, fetched_at=fetched_at, tags=tags)
            matched_items, match_stats = _service_module().evaluate_rule_set(
                items=filtered_results,
                rule_definition=rule_set["definition_json"],
                now_utc=now_utc,
                fallback_days=days,
            )
            for item in matched_items:
                item["fetched_at"] = item.get("fetched_at") or fetched_at
                item["tags"] = tags
            self._store_curated(run_id, matched_items, int(rule_set.get("id") or 0) or None, fetched_at=fetched_at, tags=tags)

            dedupe_stats: dict[str, Any] = {}
            if matched_items:
                try:
                    dedupe_summary = self.dedupe_items(table="curated")
                    dedupe_stats = {
                        "dedupe_groups": int(dedupe_summary.get("groups", 0) or 0),
                        "dedupe_deleted": int(dedupe_summary.get("deleted", 0) or 0),
                        "dedupe_kept": int(dedupe_summary.get("kept", 0) or 0),
                        "dedupe_rows_after": int(dedupe_summary.get("rows_after", 0) or 0),
                    }
                except Exception as exc:  # noqa: BLE001
                    dedupe_stats = {"dedupe_failed": 1}
                    if len(run_errors) >= 10:
                        run_errors = run_errors[:9]
                    run_errors.append(f"auto dedupe failed: {exc}")

            raw_items = [{**serialize_search_result(item), "fetched_at": fetched_at} for item in filtered_results[:100]]
            for item in raw_items:
                item["tags"] = tags
            rule_set_summary = {
                "id": int(rule_set.get("id") or 0) if rule_set.get("id") else None,
                "name": rule_set.get("name", ""),
                "description": rule_set.get("description", ""),
                "version": int(rule_set.get("version", 1) or 1),
                "is_builtin": bool(rule_set.get("is_builtin")),
            }
            report = {
                "run_id": run_id,
                "status": "success",
                "search_spec": search_spec,
                "tags": tags,
                "final_query": final_query,
                "final_queries": final_queries,
                "rule_set_summary": rule_set_summary,
                "raw_total": len(filtered_results),
                "matched_total": len(matched_items),
                "raw_items": raw_items,
                "matched_items": matched_items[:100],
                "stats": {
                    "queries": len(final_queries),
                    "fetched_raw": len(fetched_results),
                    "raw_deduped": len(deduped_results),
                    "raw": len(filtered_results),
                    "search_filter_passed": len(filtered_results),
                    "query_errors": len(query_errors),
                    **match_stats,
                    **dedupe_stats,
                },
                "errors": run_errors,
            }
            self._finish_run(run_id, "success", report["stats"], "\n".join(run_errors), result=report)
            return report
        except Exception as exc:  # noqa: BLE001
            current = self.runtime_store.get_run(int(run_id))
            current_stats = copy.deepcopy(current.get("stats_json") or {})
            cancelled = isinstance(exc, RunCancelled)
            self._finish_run(
                run_id,
                "cancelled" if cancelled else "failed",
                current_stats,
                str(exc),
                result={
                    "run_id": run_id,
                    "status": "cancelled" if cancelled else "failed",
                    "errors": [str(exc)],
                },
            )
            raise
        finally:
            self._pop_run_cancel_event(run_id)

    def get_run(self, run_id: int) -> dict[str, Any]:
        run = self.runtime_store.get_run(int(run_id))
        return self._reconcile_orphaned_run(run)

    def list_runs(self, page: int = 1, page_size: int = 50) -> dict[str, Any]:
        page = max(1, int(page or 1))
        page_size = max(1, min(200, int(page_size or 50)))
        payload = self.runtime_store.list_runs(page=page, page_size=page_size)
        payload["items"] = [self._reconcile_orphaned_run(copy.deepcopy(item)) for item in payload.get("items", [])]
        return payload

    def cancel_run(self, run_id: int) -> dict[str, Any]:
        current = self.get_run(int(run_id))
        if str(current.get("status") or "").lower() != "running":
            return {"id": int(run_id), "status": current.get("status"), "cancel_requested": False}
        cancel_event = self._cancel_event_for_run(int(run_id))
        if cancel_event is None:
            self._finish_run(
                int(run_id),
                "cancelled",
                copy.deepcopy(current.get("stats_json") or {}),
                "Cancelled because the execution context is no longer available.",
                result=copy.deepcopy(current.get("result_json")) if isinstance(current.get("result_json"), dict) else None,
            )
            return {"id": int(run_id), "status": "cancelled", "cancel_requested": True}
        cancel_event.set()
        deadline = time.time() + 2.0
        while time.time() < deadline:
            latest = self.runtime_store.get_run(int(run_id))
            if str(latest.get("status") or "").lower() != "running":
                break
            time.sleep(0.05)
        latest = self.get_run(int(run_id))
        return {"id": int(run_id), "status": latest.get("status"), "cancel_requested": True}

    def get_runtime_logs(self) -> dict[str, Any]:
        items: list[dict[str, Any]] = []
        log_dir = _service_module().RUNTIME_LOG_DIR
        for name in RUNTIME_LOG_FILES:
            path = log_dir / name
            exists = path.exists()
            payload: dict[str, Any] = {
                "name": name,
                "exists": exists,
                "size": int(path.stat().st_size) if exists else 0,
                "updated_at": datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat() if exists else "",
                "content": "",
            }
            if exists:
                try:
                    payload["content"] = path.read_text(encoding="utf-8", errors="replace")
                except OSError as exc:
                    payload["error"] = str(exc)
            items.append(payload)
        return {"items": items}

    def _create_run(self, job_id: int | None, trigger_type: str) -> int:
        return self.runtime_store.create_run(job_id=job_id, trigger_type=trigger_type, started_at=_service_module().utc_now_iso())

    def _try_acquire_run_slot(self) -> bool:
        return self._run_slot_limit.acquire(blocking=False)

    def _release_run_slot(self) -> None:
        try:
            self._run_slot_limit.release()
        except ValueError:
            pass

    def _record_background_run_failure(self, run_id: int, exc: Exception) -> None:
        try:
            current = self.runtime_store.get_run(int(run_id))
        except Exception:  # noqa: BLE001
            return
        if str(current.get("status") or "").lower() != "running":
            return
        current_stats = copy.deepcopy(current.get("stats_json") or {})
        cancelled = isinstance(exc, RunCancelled)
        self._finish_run(
            run_id,
            "cancelled" if cancelled else "failed",
            current_stats,
            str(exc),
            result={
                "run_id": run_id,
                "status": "cancelled" if cancelled else "failed",
                "errors": [str(exc)],
            },
        )

    def _finish_run(self, run_id: int, status: str, stats: dict[str, Any], error_text: str, result: dict[str, Any] | None = None) -> None:
        self.runtime_store.finish_run(
            int(run_id),
            status=status,
            stats=copy.deepcopy(stats),
            error_text=error_text or "",
            result=copy.deepcopy(result) if isinstance(result, dict) else None,
            ended_at=_service_module().utc_now_iso(),
        )

    def _store_raw(
        self,
        run_id: int,
        items: list[SearchResult],
        fetched_at: str | None = None,
        tags: Any = None,
    ) -> None:
        now = fetched_at or _service_module().utc_now_iso()
        normalized_tags = normalize_tags(tags)
        with connect(self.db_path) as conn:
            for item in items:
                canonical_url = canonicalize_source_url(item.url)
                metrics = item.raw.get("metrics", {}) if isinstance(item.raw, dict) else {}
                conn.execute(
                    """
                    INSERT INTO x_items_raw
                    (run_id, tweet_id, canonical_url, author_name, author, text, created_at_x, metrics_json, tags_json, query_name, fetched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        run_id,
                        item.tweet_id,
                        canonical_url,
                        item.author_name,
                        item.author,
                        item.text,
                        item.created_at,
                        json.dumps(metrics, ensure_ascii=False),
                        json.dumps(normalized_tags, ensure_ascii=False),
                        item.query_name,
                        now,
                    ),
                )

    def _store_curated(
        self,
        run_id: int,
        curated_items: list[dict[str, Any]],
        rule_set_id: int | None,
        fetched_at: str | None = None,
        tags: Any = None,
    ) -> None:
        normalized_tags = normalize_tags(tags)
        with connect(self.db_path) as conn:
            for item in curated_items:
                dedupe_key = build_source_dedupe_key_with_fallback(
                    tweet_id=item.get("tweet_id"),
                    url=item.get("url"),
                    text=item.get("text"),
                    author=item.get("author"),
                    created_at=item.get("created_at"),
                )
                item_fetched_at = item.get("fetched_at") or fetched_at
                conn.execute(
                    """
                    INSERT INTO x_items_curated
                    (run_id, dedupe_key, level, score, title, summary_zh, excerpt, is_zero_cost, source_url, author_name, author, created_at_x, views, likes, replies, retweets, fetched_at, tags_json, reasons_json, rule_set_id, state)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        run_id,
                        dedupe_key,
                        item.get("level", ""),
                        int(item.get("score", 0) or 0),
                        item.get("title", ""),
                        item.get("summary", ""),
                        " ".join((item.get("text", "") or "").split())[:900],
                        1,
                        item.get("url", ""),
                        item.get("author_name", ""),
                        item.get("author", ""),
                        item.get("created_at", ""),
                        _item_metric(item, "views"),
                        _item_metric(item, "likes"),
                        _item_metric(item, "replies"),
                        _item_metric(item, "retweets"),
                        item_fetched_at,
                        json.dumps(normalize_tags(item.get("tags") or normalized_tags), ensure_ascii=False),
                        json.dumps(item.get("reasons", []), ensure_ascii=False),
                        rule_set_id,
                        "new",
                    ),
                )

    def _update_curated_state(self, row_id: int, state: str) -> None:
        with connect(self.db_path) as conn:
            conn.execute("UPDATE x_items_curated SET state = ? WHERE id = ?", (state, row_id))
