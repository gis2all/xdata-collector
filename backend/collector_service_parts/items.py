from __future__ import annotations

from .common import *  # noqa: F401,F403

class ItemMixin:
    def _normalize_item_table(self, table: str | None) -> str:
        return "raw" if str(table or "").strip().lower() == "raw" else "curated"

    def _item_table_name(self, table: str) -> str:
        return "x_items_raw" if table == "raw" else "x_items_curated"

    def _normalize_item_sort(self, table: str, sort_by: str | None, sort_dir: str | None) -> tuple[str, str]:
        requested = str(sort_by or "").strip()
        sort_fields = RAW_ITEM_SORT_FIELDS if table == "raw" else CURATED_ITEM_SORT_FIELDS
        if requested in sort_fields:
            direction = "ASC" if str(sort_dir or "").strip().lower() == "asc" else "DESC"
            return sort_fields[requested], direction
        return sort_fields["id"], "DESC"

    def _normalize_item_ids(self, ids: list[Any] | None) -> list[int]:
        normalized: list[int] = []
        seen: set[int] = set()
        for raw in ids or []:
            item_id = int(raw)
            if item_id in seen:
                continue
            seen.add(item_id)
            normalized.append(item_id)
        return normalized

    def _item_where_clause(self, table: str, level: str | None = None, keyword: str | None = None) -> tuple[str, list[Any]]:
        where: list[str] = []
        params: list[Any] = []
        normalized_keyword = str(keyword or "").strip()
        if table == "curated":
            normalized_level = str(level or "").strip()
            if normalized_level:
                where.append("level = ?")
                params.append(normalized_level.upper())
            if normalized_keyword:
                safe_keyword = normalized_keyword.replace("%", "\\%").replace("_", "\\_")
                token = f"%{safe_keyword}%"
                where.append("(title LIKE ? ESCAPE '\\' OR excerpt LIKE ? ESCAPE '\\' OR tags_json LIKE ? ESCAPE '\\')")
                params.extend([token, token, token])
        else:
            if normalized_keyword:
                safe_keyword = normalized_keyword.replace("%", "\\%").replace("_", "\\_")
                token = f"%{safe_keyword}%"
                where.append("(text LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\' OR canonical_url LIKE ? ESCAPE '\\' OR tags_json LIKE ? ESCAPE '\\')")
                params.extend([token, token, token, token])
        where_sql = f"WHERE {' AND '.join(where)}" if where else ""
        return where_sql, params

    def _list_curated_items(
        self,
        page: int,
        page_size: int,
        level: str | None,
        keyword: str | None,
        sort_by: str | None,
        sort_dir: str | None,
        filter_tree: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        offset = max(0, (page - 1) * page_size)
        where_sql, params = self._item_where_clause("curated", level=level, keyword=keyword)
        normalized_filter_tree = _normalize_results_filter_tree(filter_tree, "curated")
        if _results_filter_tree_has_conditions(normalized_filter_tree):
            selected_fields = ", ".join(CURATED_ITEM_DB_FIELDS)
            with connect(self.db_path) as conn:
                rows = conn.execute(
                    f"""
                    SELECT {selected_fields}
                    FROM x_items_curated
                    {where_sql}
                    """,
                    tuple(params),
                ).fetchall()
            if len(rows) > MAX_FILTER_TREE_ROWS:
                raise ValueError(f"too many rows for in-memory filter ({len(rows)} > {MAX_FILTER_TREE_ROWS})")
            items = [_curated_row_to_item(row) for row in rows]
            items = _filter_items_in_memory(items, "curated", normalized_filter_tree)
            items = _sort_items_in_memory(items, "curated", sort_by, sort_dir)
            total = len(items)
            paged_items = items[offset : offset + page_size]
            return {
                "page": page,
                "page_size": page_size,
                "total": total,
                "items": paged_items,
            }
        sort_column, sort_direction = self._normalize_item_sort("curated", sort_by, sort_dir)
        selected_fields = ", ".join(CURATED_ITEM_DB_FIELDS)
        with connect(self.db_path) as conn:
            total = conn.execute(f"SELECT COUNT(1) FROM x_items_curated {where_sql}", tuple(params)).fetchone()[0]
            if sort_column == "created_at_x":
                rows = conn.execute(
                    f"""
                    SELECT {selected_fields}
                    FROM x_items_curated
                    {where_sql}
                    """,
                    tuple(params),
                ).fetchall()
            else:
                order_sql = f"{sort_column} {sort_direction}" if sort_column == "id" else f"{sort_column} {sort_direction}, id ASC"
                rows = conn.execute(
                    f"""
                    SELECT {selected_fields}
                    FROM x_items_curated
                    {where_sql}
                    ORDER BY {order_sql}
                    LIMIT ? OFFSET ?
                    """,
                    tuple(params + [page_size, offset]),
                ).fetchall()
        items = [_curated_row_to_item(row) for row in rows]
        if sort_column == "created_at_x":
            items = sorted(items, key=lambda item: _item_created_at_sort_key(item, sort_direction))
            items = items[offset : offset + page_size]
        return {
            "page": page,
            "page_size": page_size,
            "total": int(total),
            "items": items,
        }

    def _list_raw_items(
        self,
        page: int,
        page_size: int,
        keyword: str | None,
        sort_by: str | None,
        sort_dir: str | None,
        filter_tree: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        offset = max(0, (page - 1) * page_size)
        where_sql, params = self._item_where_clause("raw", keyword=keyword)
        normalized_filter_tree = _normalize_results_filter_tree(filter_tree, "raw")
        if _results_filter_tree_has_conditions(normalized_filter_tree):
            selected_fields = ", ".join(RAW_ITEM_DB_FIELDS)
            with connect(self.db_path) as conn:
                rows = conn.execute(
                    f"""
                    SELECT {selected_fields}
                    FROM x_items_raw
                    {where_sql}
                    """,
                    tuple(params),
                ).fetchall()
            if len(rows) > MAX_FILTER_TREE_ROWS:
                raise ValueError(f"too many rows for in-memory filter ({len(rows)} > {MAX_FILTER_TREE_ROWS})")
            items = [_raw_row_to_item(row) for row in rows]
            items = _filter_items_in_memory(items, "raw", normalized_filter_tree)
            items = _sort_items_in_memory(items, "raw", sort_by, sort_dir)
            total = len(items)
            paged_items = items[offset : offset + page_size]
            return {
                "page": page,
                "page_size": page_size,
                "total": total,
                "items": paged_items,
            }
        sort_column, sort_direction = self._normalize_item_sort("raw", sort_by, sort_dir)
        selected_fields = ", ".join(RAW_ITEM_DB_FIELDS)
        with connect(self.db_path) as conn:
            total = int(conn.execute(f"SELECT COUNT(1) FROM x_items_raw {where_sql}", tuple(params)).fetchone()[0])
            if sort_column in RAW_ITEM_PYTHON_SORT_FIELDS:
                rows = conn.execute(
                    f"""
                    SELECT {selected_fields}
                    FROM x_items_raw
                    {where_sql}
                    """,
                    tuple(params),
                ).fetchall()
                items = [_raw_row_to_item(row) for row in rows]
                if sort_column == "created_at_x":
                    items = sorted(items, key=lambda item: _item_created_at_sort_key(item, sort_direction))
                else:
                    items = sorted(items, key=lambda item: _number_sort_key(item, sort_column, sort_direction))
                items = items[offset : offset + page_size]
            else:
                order_sql = f"{sort_column} {sort_direction}" if sort_column == "id" else f"{sort_column} {sort_direction}, id ASC"
                rows = conn.execute(
                    f"""
                    SELECT {selected_fields}
                    FROM x_items_raw
                    {where_sql}
                    ORDER BY {order_sql}
                    LIMIT ? OFFSET ?
                    """,
                    tuple(params + [page_size, offset]),
                ).fetchall()
                items = [_raw_row_to_item(row) for row in rows]
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "items": items,
        }

    def list_items(
        self,
        page: int = 1,
        page_size: int = 50,
        level: str | None = None,
        keyword: str | None = None,
        sort_by: str | None = None,
        sort_dir: str | None = None,
        table: str = "curated",
        filter_tree: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        page = max(1, int(page or 1))
        page_size = max(1, min(MAX_ITEM_PAGE_SIZE, int(page_size or 50)))
        normalized_table = self._normalize_item_table(table)
        if normalized_table == "raw":
            return self._list_raw_items(
                page=page,
                page_size=page_size,
                keyword=keyword,
                sort_by=sort_by,
                sort_dir=sort_dir,
                filter_tree=filter_tree,
            )
        return self._list_curated_items(
            page=page,
            page_size=page_size,
            level=level,
            keyword=keyword,
            sort_by=sort_by,
            sort_dir=sort_dir,
            filter_tree=filter_tree,
        )

    def delete_item(self, item_id: int, table: str = "curated") -> dict[str, Any]:
        normalized_id = int(item_id)
        normalized_table = self._normalize_item_table(table)
        table_name = self._item_table_name(normalized_table)
        with connect(self.db_path) as conn:
            row = conn.execute(f"SELECT id FROM {table_name} WHERE id = ?", (normalized_id,)).fetchone()
            if row is None:
                raise ValueError(f"item {normalized_id} not found")
            conn.execute(f"DELETE FROM {table_name} WHERE id = ?", (normalized_id,))
        return {"id": normalized_id, "deleted": 1}

    def delete_items(self, ids: list[int], table: str = "curated") -> dict[str, Any]:
        normalized_ids = self._normalize_item_ids(ids)
        if not normalized_ids:
            return {"ids": [], "deleted": 0}
        normalized_table = self._normalize_item_table(table)
        table_name = self._item_table_name(normalized_table)
        placeholders = ", ".join("?" for _ in normalized_ids)
        delete_ids: list[int] = []
        with connect(self.db_path) as conn:
            existing_rows = conn.execute(
                f"SELECT id FROM {table_name} WHERE id IN ({placeholders})",
                tuple(normalized_ids),
            ).fetchall()
            existing_ids = {int(row["id"]) for row in existing_rows}
            delete_ids = [item_id for item_id in normalized_ids if item_id in existing_ids]
            if delete_ids:
                delete_placeholders = ", ".join("?" for _ in delete_ids)
                conn.execute(
                    f"DELETE FROM {table_name} WHERE id IN ({delete_placeholders})",
                    tuple(delete_ids),
                )
        return {"ids": normalized_ids, "deleted": len(delete_ids)}

    def delete_items_matching(
        self,
        keyword: str | None = None,
        level: str | None = None,
        table: str = "curated",
        filter_tree: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        normalized_table = self._normalize_item_table(table)
        table_name = self._item_table_name(normalized_table)
        where_sql, params = self._item_where_clause(normalized_table, level=level, keyword=keyword)
        normalized_filter_tree = _normalize_results_filter_tree(filter_tree, normalized_table)
        delete_ids: list[int]
        if _results_filter_tree_has_conditions(normalized_filter_tree):
            selected_fields = ", ".join(RAW_ITEM_DB_FIELDS if normalized_table == "raw" else CURATED_ITEM_DB_FIELDS)
            with connect(self.db_path) as conn:
                rows = conn.execute(
                    f"SELECT {selected_fields} FROM {table_name} {where_sql}",
                    tuple(params),
                ).fetchall()
                items = (
                    [_raw_row_to_item(row) for row in rows]
                    if normalized_table == "raw"
                    else [_curated_row_to_item(row) for row in rows]
                )
                filtered_items = _filter_items_in_memory(items, normalized_table, normalized_filter_tree)
                delete_ids = [int(item["id"]) for item in filtered_items]
                if delete_ids:
                    placeholders = ", ".join("?" for _ in delete_ids)
                    conn.execute(
                        f"DELETE FROM {table_name} WHERE id IN ({placeholders})",
                        tuple(delete_ids),
                    )
        else:
            with connect(self.db_path) as conn:
                rows = conn.execute(
                    f"SELECT id FROM {table_name} {where_sql} ORDER BY id ASC",
                    tuple(params),
                ).fetchall()
                delete_ids = [int(row["id"]) for row in rows]
                if delete_ids:
                    placeholders = ", ".join("?" for _ in delete_ids)
                    conn.execute(
                        f"DELETE FROM {table_name} WHERE id IN ({placeholders})",
                        tuple(delete_ids),
                    )
        return {"ids": [], "deleted": len(delete_ids)}

    def dedupe_items(self, table: str = "curated") -> dict[str, Any]:
        normalized_table = self._normalize_item_table(table)
        table_name = self._item_table_name(normalized_table)
        with connect(self.db_path) as conn:
            rows_before = int(conn.execute(f"SELECT COUNT(1) FROM {table_name}").fetchone()[0])
            grouped: dict[str, list[dict[str, Any]]] = {}
            if normalized_table == "raw":
                rows = [
                    row_to_dict(row)
                    for row in conn.execute(
                        """
                        SELECT id, tweet_id, canonical_url, author, text, created_at_x
                        FROM x_items_raw
                        ORDER BY id ASC
                        """
                    ).fetchall()
                ]
                for row in rows:
                    dedupe_key = build_source_dedupe_key(
                        tweet_id=row.get("tweet_id"),
                        url=row.get("canonical_url"),
                        text=row.get("text"),
                        author=row.get("author"),
                    ) or ""
                    if not dedupe_key:
                        continue
                    grouped.setdefault(dedupe_key, []).append(
                        {
                            "id": int(row["id"]),
                            "created_at_x": row.get("created_at_x"),
                        }
                    )
            else:
                rows = [
                    row_to_dict(row)
                    for row in conn.execute(
                        """
                        SELECT id, dedupe_key, created_at_x
                        FROM x_items_curated
                        WHERE TRIM(COALESCE(dedupe_key, '')) <> ''
                        ORDER BY dedupe_key ASC, id ASC
                        """
                    ).fetchall()
                ]
                for row in rows:
                    grouped.setdefault(str(row.get("dedupe_key") or ""), []).append(row)

            delete_ids: list[int] = []
            duplicate_groups = 0
            kept = 0
            for items in grouped.values():
                if len(items) < 2:
                    continue
                duplicate_groups += 1
                ranked = sorted(items, key=_dedupe_sort_key)
                kept += 1
                delete_ids.extend(int(item["id"]) for item in ranked[1:])

            if delete_ids:
                placeholders = ", ".join("?" for _ in delete_ids)
                conn.execute(
                    f"DELETE FROM {table_name} WHERE id IN ({placeholders})",
                    tuple(delete_ids),
                )
            rows_after = int(conn.execute(f"SELECT COUNT(1) FROM {table_name}").fetchone()[0])
        return {
            "groups": duplicate_groups,
            "deleted": len(delete_ids),
            "kept": kept,
            "rows_before": rows_before,
            "rows_after": rows_after,
        }
