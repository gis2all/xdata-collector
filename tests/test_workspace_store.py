import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.workspace_store import RuntimeStateStore, TaskPackStore, WorkspaceStore


def _rule_set_payload(rule_set_id: int, name: str) -> dict:
    return {
        "id": rule_set_id,
        "name": name,
        "description": f"{name} description",
        "is_enabled": 1,
        "is_builtin": 1 if rule_set_id == 1 else 0,
        "version": 1,
        "definition_json": {"levels": [], "rules": []},
        "created_at": "2026-04-01T00:00:00+00:00",
        "updated_at": "2026-04-01T00:00:00+00:00",
    }


class WorkspaceStoreTests(unittest.TestCase):
    def test_bootstrap_workspace_does_not_migrate_repo_search_preset_files(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            config_dir = root / "config"
            config_dir.mkdir(parents=True, exist_ok=True)
            workspace_path = config_dir / "workspace.json"
            (config_dir / "search_presets.json").write_text(
                json.dumps(
                    [
                        {
                            "name": "legacy-preset",
                            "query": "alpha from:demo",
                            "max_results": 20,
                        }
                    ],
                    ensure_ascii=False,
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )

            store = WorkspaceStore(workspace_path=workspace_path, legacy_config_dir=config_dir, legacy_db_path=root / "data" / "app.db")

            workspace = store.get_workspace()
            pack_store = TaskPackStore(packs_dir=config_dir / "packs")

            self.assertEqual(workspace["jobs"], [])
            self.assertFalse((config_dir / "packs").exists())
            self.assertEqual(pack_store.list_packs(), [])

    def test_migrates_legacy_workspace_to_light_registry_and_task_packs(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            config_dir = root / "config"
            config_dir.mkdir(parents=True, exist_ok=True)
            workspace_path = config_dir / "workspace.json"

            legacy_workspace = {
                "version": 1,
                "meta": {
                    "updated_at": "2026-04-14T00:00:00+00:00",
                    "next_rule_set_id": 3,
                    "next_job_id": 12,
                    "next_manual_preset_id": 2,
                },
                "manual": {
                    "draft": {
                        "all_keywords": ["draft"],
                        "language_mode": "zh_en",
                        "days_filter": {"mode": "lte", "min": None, "max": 20},
                        "metric_filters": {
                            "views": {"mode": "any", "min": None, "max": None},
                            "likes": {"mode": "any", "min": None, "max": None},
                            "replies": {"mode": "any", "min": None, "max": None},
                            "retweets": {"mode": "any", "min": None, "max": None},
                        },
                        "metric_filters_explicit": True,
                    },
                    "selected_rule_set_id": 1,
                    "presets": [
                        {
                            "id": 1,
                            "name": "legacy-alpha",
                            "description": "preset from old workspace",
                            "search_spec": {
                                "all_keywords": ["alpha"],
                                "language_mode": "zh_en",
                                "days_filter": {"mode": "lte", "min": None, "max": 20},
                                "metric_filters": {
                                    "views": {"mode": "any", "min": None, "max": None},
                                    "likes": {"mode": "any", "min": None, "max": None},
                                    "replies": {"mode": "any", "min": None, "max": None},
                                    "retweets": {"mode": "any", "min": None, "max": None},
                                },
                                "metric_filters_explicit": True,
                            },
                        }
                    ],
                },
                "rule_sets": [
                    _rule_set_payload(1, "Default Rule"),
                    _rule_set_payload(2, "\u65b0\u89c4\u5219\u96c6 2"),
                ],
                "jobs": [
                    {
                        "id": 11,
                        "name": "Legacy Job",
                        "keywords_json": ["alpha"],
                        "interval_minutes": 30,
                        "days": 20,
                        "thresholds_json": {"views": 0, "likes": 0, "replies": 0, "retweets": 0, "mode": "OR"},
                        "levels_json": [],
                        "enabled": 1,
                        "next_run_at": "2026-04-14T00:30:00+00:00",
                        "created_at": "2026-04-14T00:00:00+00:00",
                        "updated_at": "2026-04-14T00:00:00+00:00",
                        "deleted_at": None,
                        "search_spec_json": {
                            "all_keywords": ["alpha"],
                            "language_mode": "zh_en",
                            "days_filter": {"mode": "lte", "min": None, "max": 20},
                            "metric_filters": {
                                "views": {"mode": "gte", "min": 100, "max": None},
                                "likes": {"mode": "any", "min": None, "max": None},
                                "replies": {"mode": "any", "min": None, "max": None},
                                "retweets": {"mode": "any", "min": None, "max": None},
                            },
                            "metric_filters_explicit": True,
                        },
                        "rule_set_id": 1,
                    }
                ],
            }
            workspace_path.write_text(
                json.dumps(legacy_workspace, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

            store = WorkspaceStore(workspace_path=workspace_path, legacy_config_dir=config_dir, legacy_db_path=root / "data" / "app.db")

            workspace = store.get_workspace()

            self.assertEqual(set(workspace.keys()), {"version", "meta", "environment", "jobs"})
            self.assertEqual(len(workspace["jobs"]), 1)
            self.assertEqual(workspace["jobs"][0]["id"], 11)
            self.assertTrue(workspace["jobs"][0]["pack_path"].startswith("config/packs/"))
            self.assertEqual(workspace["meta"]["next_job_id"], 12)

            pack_store = TaskPackStore(packs_dir=config_dir / "packs")
            summaries = pack_store.list_packs()
            self.assertGreaterEqual(len(summaries), 3)
            summary_names = {item["name"] for item in summaries}
            self.assertIn("Legacy Job", summary_names)
            self.assertIn("legacy-alpha", summary_names)
            self.assertIn("\u65b0\u89c4\u5219\u96c6 2", summary_names)

            job_pack = pack_store.get_pack(workspace["jobs"][0]["pack_name"])
            self.assertEqual(job_pack["kind"], "task_pack")
            self.assertEqual(job_pack["meta"]["name"], "Legacy Job")
            self.assertEqual(job_pack["search_spec"]["all_keywords"], ["alpha"])
            self.assertEqual(job_pack["rule_set"]["name"], "Default Rule")

            saved = json.loads(workspace_path.read_text(encoding="utf-8"))
            self.assertEqual(set(saved.keys()), {"version", "meta", "environment", "jobs"})
            self.assertNotIn("manual", saved)
            self.assertNotIn("rule_sets", saved)

    def test_task_pack_store_creates_updates_and_reloads_pack_files(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = TaskPackStore(packs_dir=root / "config" / "packs")

            created = store.create_pack(
                "alpha-watch",
                {
                    "version": 1,
                    "kind": "task_pack",
                    "meta": {
                        "name": "Alpha Watch",
                        "description": "watch alpha",
                        "updated_at": "2026-04-14T00:00:00+00:00",
                    },
                    "search_spec": {
                        "all_keywords": ["alpha"],
                        "language_mode": "en",
                        "days_filter": {"mode": "lte", "min": None, "max": 20},
                        "metric_filters": {
                            "views": {"mode": "any", "min": None, "max": None},
                            "likes": {"mode": "any", "min": None, "max": None},
                            "replies": {"mode": "any", "min": None, "max": None},
                            "retweets": {"mode": "any", "min": None, "max": None},
                        },
                        "metric_filters_explicit": True,
                    },
                    "rule_set": {
                        "id": 1,
                        "name": "Default Rule",
                        "description": "builtin",
                        "version": 1,
                        "definition": {"levels": [], "rules": []},
                    },
                },
            )

            self.assertEqual(created["meta"]["name"], "Alpha Watch")
            self.assertTrue((root / "config" / "packs" / "alpha-watch.json").exists())

            listed = store.list_packs()
            self.assertEqual(len(listed), 1)
            self.assertEqual(listed[0]["pack_name"], "alpha-watch")
            self.assertEqual(listed[0]["pack_path"], "config/packs/alpha-watch.json")

            updated = store.update_pack(
                "alpha-watch",
                {
                    **created,
                    "meta": {
                        **created["meta"],
                        "description": "watch alpha updated",
                        "updated_at": "2026-04-15T00:00:00+00:00",
                    },
                    "search_spec": {
                        **created["search_spec"],
                        "all_keywords": ["alpha", "beta"],
                    },
                },
            )

            self.assertEqual(updated["meta"]["description"], "watch alpha updated")
            self.assertEqual(updated["search_spec"]["all_keywords"], ["alpha", "beta"])

            loaded = store.get_pack("alpha-watch")
            self.assertEqual(loaded["meta"]["updated_at"], "2026-04-15T00:00:00+00:00")
            self.assertEqual(loaded["search_spec"]["all_keywords"], ["alpha", "beta"])


class RuntimeStateStoreTests(unittest.TestCase):
    def test_persists_runs_and_health_snapshots_to_runtime_files(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = RuntimeStateStore(
                runs_path=root / "runtime" / "history" / "search_runs.jsonl",
                health_path=root / "runtime" / "state" / "runtime_health_snapshot.json",
                sequence_path=root / "runtime" / "state" / "sequences.json",
            )

            run_id = store.create_run(job_id=12, trigger_type="auto", started_at="2026-04-14T00:00:00+00:00")
            store.finish_run(
                run_id,
                status="success",
                stats={"matched": 3},
                error_text="",
                ended_at="2026-04-14T00:01:00+00:00",
            )
            store.save_health_snapshots(
                {
                    "db": {
                        "configured": True,
                        "connected": True,
                        "detail": {"db_path": "data/app.db"},
                        "last_checked_at": "2026-04-14T00:02:00+00:00",
                        "last_error": "",
                    }
                }
            )

            page = store.list_runs(page=1, page_size=10)
            snapshots = store.load_health_snapshots()

            self.assertEqual(run_id, 1)
            self.assertEqual(page["total"], 1)
            self.assertEqual(page["items"][0]["id"], 1)
            self.assertEqual(page["items"][0]["job_id"], 12)
            self.assertEqual(page["items"][0]["stats_json"]["matched"], 3)
            self.assertEqual(snapshots["db"]["detail"]["db_path"], "data/app.db")
            self.assertTrue((root / "runtime" / "history" / "search_runs.jsonl").exists())
            self.assertTrue((root / "runtime" / "state" / "runtime_health_snapshot.json").exists())
            self.assertTrue((root / "runtime" / "state" / "sequences.json").exists())


if __name__ == "__main__":
    unittest.main()
