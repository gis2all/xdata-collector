import json
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from backend.collector_service_parts import common
from backend.models import SearchResult


def _item(idv: int, **kwargs: object) -> dict:
    base: dict = {"id": idv}
    base.update(kwargs)  # type: ignore[arg-type]
    return base


class FilterNormalizeTests(unittest.TestCase):
    def test_normalize_relation_accepts_or_and_defaults_invalid(self) -> None:
        self.assertEqual(common._normalize_results_filter_relation("OR"), "OR")
        self.assertEqual(common._normalize_results_filter_relation("and"), "AND")
        self.assertEqual(common._normalize_results_filter_relation("XOR"), "AND")
        self.assertEqual(common._normalize_results_filter_relation(None), "AND")

    def test_normalize_text_trims_and_coerces(self) -> None:
        self.assertEqual(common._normalize_results_filter_text("  hello  "), "hello")
        self.assertEqual(common._normalize_results_filter_text(None), "")

    def test_normalize_number_returns_none_for_invalid(self) -> None:
        self.assertEqual(common._normalize_results_filter_number(42), 42)
        self.assertEqual(common._normalize_results_filter_number("99"), 99)
        self.assertIsNone(common._normalize_results_filter_number("abc"))
        self.assertIsNone(common._normalize_results_filter_number(None))
        self.assertIsNone(common._normalize_results_filter_number(""))

    def test_normalize_scalar_dispatches_number(self) -> None:
        self.assertEqual(common._normalize_results_filter_scalar(42, "number"), 42)
        self.assertIsNone(common._normalize_results_filter_scalar("bad", "number"))

    def test_normalize_scalar_dispatches_boolean(self) -> None:
        self.assertIs(common._normalize_results_filter_scalar(True, "boolean"), True)
        self.assertIsNone(common._normalize_results_filter_scalar("invalid", "boolean"))
        for raw in ("1", "true", "True", "YES"):
            self.assertIs(common._normalize_results_filter_scalar(raw, "boolean"), True)
        for raw in ("0", "false", "False", "no"):
            self.assertIs(common._normalize_results_filter_scalar(raw, "boolean"), False)

    def test_normalize_scalar_dispatches_text(self) -> None:
        self.assertEqual(common._normalize_results_filter_scalar("hello", "text"), "hello")
        self.assertEqual(common._normalize_results_filter_scalar(42, "text"), "42")

    def test_normalize_node_rejects_non_dict_and_unknown_field(self) -> None:
        self.assertIsNone(common._normalize_results_filter_node(None, "curated"))
        self.assertIsNone(common._normalize_results_filter_node([], "curated"))
        self.assertIsNone(common._normalize_results_filter_node({"field": "nonexistent", "operator": "contains"}, "curated"))

    def test_normalize_node_group_filters_bad_children(self) -> None:
        node = {"type": "group", "relation": "OR", "children": [None, {"field": "title", "operator": "contains", "value": "hello"}]}
        result = common._normalize_results_filter_node(node, "curated")
        self.assertEqual(result["relation"], "OR")
        self.assertEqual(len(result["children"]), 1)

    def test_normalize_node_text_condition_all_operators(self) -> None:
        result = common._normalize_results_filter_node(
            {"field": "title", "operator": "contains", "value": "hello"}, "curated"
        )
        self.assertEqual(result["operator"], "contains")
        self.assertEqual(result["value"], "hello")

        result = common._normalize_results_filter_node(
            {"field": "title", "operator": "is_empty"}, "curated"
        )
        self.assertEqual(result["operator"], "is_empty")

        result = common._normalize_results_filter_node(
            {"field": "title", "operator": "INVALID"}, "curated"
        )
        self.assertIsNone(result)

    def test_normalize_node_text_length_operators(self) -> None:
        result = common._normalize_results_filter_node(
            {"field": "title", "operator": "length_between", "min": 5, "max": 10}, "curated"
        )
        self.assertEqual(result["min"], 5)
        self.assertEqual(result["max"], 10)

        result = common._normalize_results_filter_node(
            {"field": "title", "operator": "length_between", "min": 10, "max": 1}, "curated"
        )
        self.assertEqual(result["min"], 1)
        self.assertEqual(result["max"], 10)

        self.assertIsNone(common._normalize_results_filter_node(
            {"field": "title", "operator": "length_between", "min": None, "max": 5}, "curated"
        ))

        result = common._normalize_results_filter_node(
            {"field": "title", "operator": "length_gt", "value": 5}, "curated"
        )
        self.assertEqual(result["value"], 5)

        result = common._normalize_results_filter_node(
            {"field": "title", "operator": "length_gte", "value": "3"}, "curated"
        )
        self.assertEqual(result["value"], 3)

    def test_normalize_node_text_rejects_empty_value_for_non_length(self) -> None:
        self.assertIsNone(common._normalize_results_filter_node(
            {"field": "title", "operator": "contains", "value": ""}, "curated"
        ))

    def test_normalize_node_number_condition(self) -> None:
        result = common._normalize_results_filter_node(
            {"field": "views", "operator": "gte", "value": 100}, "raw"
        )
        self.assertEqual(result["value"], 100)

        result = common._normalize_results_filter_node(
            {"field": "views", "operator": "between", "min": 10, "max": 100}, "raw"
        )
        self.assertEqual(result["min"], 10)
        self.assertEqual(result["max"], 100)

        self.assertIsNone(common._normalize_results_filter_node(
            {"field": "views", "operator": "between", "min": 10, "max": None}, "raw"
        ))

        result = common._normalize_results_filter_node(
            {"field": "views", "operator": "is_empty"}, "raw"
        )
        self.assertEqual(result["operator"], "is_empty")

    def test_normalize_node_datetime_condition(self) -> None:
        result = common._normalize_results_filter_node(
            {"field": "created_at_x", "operator": "on_or_after", "value": "2024-01-01"}, "curated"
        )
        self.assertEqual(result["value"], "2024-01-01")

        result = common._normalize_results_filter_node(
            {"field": "created_at_x", "operator": "between", "min": "2024-01-01", "max": "2024-12-31"}, "curated"
        )
        self.assertEqual(result["min"], "2024-01-01")

        self.assertIsNone(common._normalize_results_filter_node(
            {"field": "created_at_x", "operator": "between", "min": "", "max": "2024-12-31"}, "curated"
        ))

    def test_normalize_node_boolean_condition(self) -> None:
        result = common._normalize_results_filter_node(
            {"field": "is_zero_cost", "operator": "is_true"}, "curated"
        )
        self.assertEqual(result["operator"], "is_true")

    def test_normalize_node_tags_condition(self) -> None:
        result = common._normalize_results_filter_node(
            {"field": "tags", "operator": "has_any", "value": ["alpha", "beta"]}, "curated"
        )
        self.assertEqual(result["values"], ["alpha", "beta"])

        self.assertIsNone(common._normalize_results_filter_node(
            {"field": "tags", "operator": "has_any", "value": []}, "curated"
        ))

        result = common._normalize_results_filter_node(
            {"field": "tags", "operator": "is_empty"}, "curated"
        )
        self.assertEqual(result["operator"], "is_empty")

    def test_normalize_tree_falls_back_to_empty_for_non_group(self) -> None:
        result = common._normalize_results_filter_tree({"type": "condition", "field": "title"}, "curated")
        self.assertEqual(result["type"], "group")

    def test_has_conditions_detects_nested(self) -> None:
        self.assertFalse(common._results_filter_tree_has_conditions(None))
        self.assertFalse(common._results_filter_tree_has_conditions({"type": "group", "relation": "AND", "children": []}))
        self.assertTrue(common._results_filter_tree_has_conditions({"type": "condition", "field": "title"}))
        self.assertTrue(common._results_filter_tree_has_conditions(
            {"type": "group", "children": [
                {"type": "group", "children": [{"type": "condition"}]}
            ]}
        ))

    def test_stringify_results_filter_value(self) -> None:
        self.assertEqual(common._stringify_results_filter_value(None), "")
        self.assertEqual(common._stringify_results_filter_value("hello"), "hello")
        self.assertEqual(common._stringify_results_filter_value([1, 2]), "[1, 2]")


class FilterEvaluateTests(unittest.TestCase):
    def test_item_value_dispatches_by_kind(self) -> None:
        self.assertEqual(common._item_results_filter_value({"views": "100"}, "views", "number"), 100)
        self.assertIs(common._item_results_filter_value({"is_zero_cost": True}, "is_zero_cost", "boolean"), True)
        self.assertIsNotNone(common._item_results_filter_value({"created_at_x": "2024-06-01T00:00:00Z"}, "created_at_x", "datetime"))
        self.assertEqual(common._item_results_filter_value({"title": "Hello"}, "title", "text"), "Hello")
        self.assertEqual(common._item_results_filter_value({"tags": ["alpha"]}, "tags", "tags"), ["alpha"])

    def test_eval_text_operators(self) -> None:
        item = _item(1, title="Hello World")
        self.assertTrue(common._evaluate_results_filter_condition({"field": "title", "operator": "contains", "value": "world"}, item, "curated"))
        self.assertFalse(common._evaluate_results_filter_condition({"field": "title", "operator": "not_contains", "value": "world"}, item, "curated"))
        self.assertTrue(common._evaluate_results_filter_condition({"field": "title", "operator": "equals", "value": "hello world"}, item, "curated"))
        self.assertFalse(common._evaluate_results_filter_condition({"field": "title", "operator": "not_equals", "value": "hello world"}, item, "curated"))
        self.assertTrue(common._evaluate_results_filter_condition({"field": "title", "operator": "starts_with", "value": "hello"}, item, "curated"))
        self.assertTrue(common._evaluate_results_filter_condition({"field": "title", "operator": "ends_with", "value": "world"}, item, "curated"))

    def test_eval_text_is_empty_not_empty(self) -> None:
        self.assertTrue(common._evaluate_results_filter_condition({"field": "title", "operator": "is_empty"}, _item(1, title=""), "curated"))
        self.assertFalse(common._evaluate_results_filter_condition({"field": "title", "operator": "is_empty"}, _item(1, title="abc"), "curated"))
        self.assertTrue(common._evaluate_results_filter_condition({"field": "title", "operator": "is_not_empty"}, _item(1, title="abc"), "curated"))

    def test_eval_text_length_operators(self) -> None:
        item = _item(1, title="Hello")
        self.assertTrue(common._evaluate_results_filter_condition({"field": "title", "operator": "length_gt", "value": 3}, item, "curated"))
        self.assertTrue(common._evaluate_results_filter_condition({"field": "title", "operator": "length_lt", "value": 10}, item, "curated"))
        self.assertFalse(common._evaluate_results_filter_condition({"field": "title", "operator": "length_gt", "value": 10}, item, "curated"))

    def test_eval_text_length_between(self) -> None:
        item = _item(1, title="Hello")
        self.assertTrue(common._evaluate_results_filter_condition({"field": "title", "operator": "length_between", "min": 1, "max": 10}, item, "curated"))
        self.assertFalse(common._evaluate_results_filter_condition({"field": "title", "operator": "length_between", "min": 10, "max": 20}, item, "curated"))

    def test_eval_number_operators(self) -> None:
        item = _item(1, views=100)
        self.assertTrue(common._evaluate_results_filter_condition({"field": "views", "operator": "gte", "value": 100}, item, "raw"))
        self.assertTrue(common._evaluate_results_filter_condition({"field": "views", "operator": "lte", "value": 100}, item, "raw"))
        self.assertTrue(common._evaluate_results_filter_condition({"field": "views", "operator": "eq", "value": 100}, item, "raw"))
        self.assertFalse(common._evaluate_results_filter_condition({"field": "views", "operator": "neq", "value": 100}, item, "raw"))
        self.assertFalse(common._evaluate_results_filter_condition({"field": "views", "operator": "gt", "value": 100}, item, "raw"))
        self.assertTrue(common._evaluate_results_filter_condition({"field": "views", "operator": "lt", "value": 200}, item, "raw"))

    def test_eval_number_between(self) -> None:
        item = _item(1, views=50)
        self.assertTrue(common._evaluate_results_filter_condition({"field": "views", "operator": "between", "min": 10, "max": 100}, item, "raw"))
        self.assertFalse(common._evaluate_results_filter_condition({"field": "views", "operator": "between", "min": 100, "max": 200}, item, "raw"))

    def test_eval_number_is_empty(self) -> None:
        self.assertTrue(common._evaluate_results_filter_condition({"field": "score", "operator": "is_empty"}, _item(1), "curated"))
        self.assertFalse(common._evaluate_results_filter_condition({"field": "score", "operator": "is_not_empty"}, _item(1), "curated"))
        self.assertTrue(common._evaluate_results_filter_condition({"field": "score", "operator": "is_not_empty"}, _item(1, score=5), "curated"))

    def test_eval_datetime_operators(self) -> None:
        item = _item(1, created_at_x="2024-06-15T00:00:00Z")
        self.assertTrue(common._evaluate_results_filter_condition(
            {"field": "created_at_x", "operator": "on_or_after", "value": "2024-06-01T00:00:00Z"}, item, "curated"))
        self.assertFalse(common._evaluate_results_filter_condition(
            {"field": "created_at_x", "operator": "on_or_before", "value": "2024-06-01T00:00:00Z"}, item, "curated"))

    def test_eval_datetime_between(self) -> None:
        item = _item(1, created_at_x="2024-06-15T00:00:00Z")
        self.assertTrue(common._evaluate_results_filter_condition(
            {"field": "created_at_x", "operator": "between", "min": "2024-06-01T00:00:00Z", "max": "2024-07-01T00:00:00Z"}, item, "curated"))

    def test_eval_datetime_is_empty(self) -> None:
        self.assertTrue(common._evaluate_results_filter_condition({"field": "fetched_at", "operator": "is_empty"}, _item(1), "curated"))

    def test_eval_boolean(self) -> None:
        self.assertTrue(common._evaluate_results_filter_condition({"field": "is_zero_cost", "operator": "is_true"}, _item(1, is_zero_cost=True), "curated"))
        self.assertFalse(common._evaluate_results_filter_condition({"field": "is_zero_cost", "operator": "is_true"}, _item(1, is_zero_cost=False), "curated"))
        self.assertTrue(common._evaluate_results_filter_condition({"field": "is_zero_cost", "operator": "is_false"}, _item(1, is_zero_cost=False), "curated"))

    def test_eval_tags_operators(self) -> None:
        item = _item(1, tags=["alpha", "beta", "gamma"])
        self.assertTrue(common._evaluate_results_filter_condition(
            {"field": "tags", "operator": "has_any", "values": ["alpha", "delta"]}, item, "curated"))
        self.assertFalse(common._evaluate_results_filter_condition(
            {"field": "tags", "operator": "has_all", "values": ["alpha", "delta"]}, item, "curated"))
        self.assertTrue(common._evaluate_results_filter_condition(
            {"field": "tags", "operator": "has_all", "values": ["alpha", "beta"]}, item, "curated"))

    def test_eval_tags_empty(self) -> None:
        self.assertTrue(common._evaluate_results_filter_condition({"field": "tags", "operator": "is_empty"}, _item(1), "curated"))
        self.assertFalse(common._evaluate_results_filter_condition({"field": "tags", "operator": "is_not_empty"}, _item(1), "curated"))
        self.assertTrue(common._evaluate_results_filter_condition({"field": "tags", "operator": "is_not_empty"}, _item(1, tags=["x"]), "curated"))

    def test_eval_unknown_field_returns_false(self) -> None:
        self.assertFalse(common._evaluate_results_filter_condition({"field": "unknown", "operator": "contains"}, _item(1), "curated"))

    def test_eval_tree_and_or(self) -> None:
        tree = {
            "type": "group", "relation": "AND", "children": [
                {"type": "condition", "field": "title", "operator": "contains", "value": "hello"},
                {"type": "condition", "field": "title", "operator": "contains", "value": "world"},
            ]
        }
        item = _item(1, title="hello world")
        self.assertTrue(common._evaluate_results_filter_tree(tree, item, "curated"))

    def test_eval_tree_or(self) -> None:
        tree = {
            "type": "group", "relation": "OR", "children": [
                {"type": "condition", "field": "title", "operator": "contains", "value": "hello"},
                {"type": "condition", "field": "title", "operator": "contains", "value": "missing"},
            ]
        }
        item = _item(1, title="hello world")
        self.assertTrue(common._evaluate_results_filter_tree(tree, item, "curated"))

    def test_eval_tree_empty_children_returns_true(self) -> None:
        tree = {"type": "group", "relation": "AND", "children": []}
        self.assertTrue(common._evaluate_results_filter_tree(tree, _item(1), "curated"))

    def test_filter_items_in_memory_active_filter(self) -> None:
        items = [_item(1, title="hello"), _item(2, title="world"), _item(3, title="hello again")]
        tree = {"type": "condition", "field": "title", "operator": "contains", "value": "hello"}
        result = common._filter_items_in_memory(items, "curated", tree)
        self.assertEqual(len(result), 3)

    def test_filter_items_in_memory_with_group_tree(self) -> None:
        items = [_item(1, title="hello"), _item(2, title="world"), _item(3, title="hello again")]
        tree = {"type": "group", "relation": "AND", "children": [
            {"type": "condition", "field": "title", "operator": "contains", "value": "hello"}
        ]}
        result = common._filter_items_in_memory(items, "curated", tree)
        self.assertEqual(len(result), 2)

    def test_filter_items_in_memory_empty_filter_returns_all(self) -> None:
        items = [_item(1), _item(2)]
        result = common._filter_items_in_memory(items, "curated", {"type": "group", "relation": "AND", "children": []})
        self.assertEqual(len(result), 2)


class FilterSQLTests(unittest.TestCase):
    def test_escape_sql_like(self) -> None:
        self.assertEqual(common._escape_sql_like("100%_\\test"), "100\\%\\_\\\\test")

    def test_sql_text_contains(self) -> None:
        sql, params = common._results_filter_condition_to_sql(
            {"field": "title", "operator": "contains", "value": "hello"}, "curated")
        self.assertIn("LIKE", sql)
        self.assertEqual(params[0], "%hello%")

    def test_sql_text_starts_with_ends_with(self) -> None:
        sql, params = common._results_filter_condition_to_sql(
            {"field": "title", "operator": "starts_with", "value": "hello"}, "curated")
        self.assertEqual(params[0], "hello%")

        sql, params = common._results_filter_condition_to_sql(
            {"field": "title", "operator": "ends_with", "value": "hello"}, "curated")
        self.assertEqual(params[0], "%hello")

    def test_sql_text_equals_not_equals(self) -> None:
        sql, params = common._results_filter_condition_to_sql(
            {"field": "title", "operator": "equals", "value": "hello"}, "curated")
        self.assertIn("=", sql)
        self.assertEqual(params[0], "hello")

        sql, params = common._results_filter_condition_to_sql(
            {"field": "title", "operator": "not_equals", "value": "hello"}, "curated")
        self.assertIn("<>", sql)

    def test_sql_text_not_contains(self) -> None:
        sql, params = common._results_filter_condition_to_sql(
            {"field": "title", "operator": "not_contains", "value": "hello"}, "curated")
        self.assertIn("NOT LIKE", sql)

    def test_sql_text_is_empty(self) -> None:
        sql, params = common._results_filter_condition_to_sql(
            {"field": "title", "operator": "is_empty"}, "curated")
        self.assertIn("TRIM", sql)
        self.assertEqual(params, [])

    def test_sql_text_length_operators(self) -> None:
        sql, params = common._results_filter_condition_to_sql(
            {"field": "title", "operator": "length_gt", "value": 5}, "curated")
        self.assertIn("LENGTH", sql)
        self.assertIn(">", sql)
        self.assertEqual(params[0], 5)

        sql, params = common._results_filter_condition_to_sql(
            {"field": "title", "operator": "length_between", "min": 1, "max": 10}, "curated")
        self.assertIn("BETWEEN", sql)
        self.assertEqual(params, [1, 10])

    def test_sql_number_operators(self) -> None:
        sql, params = common._results_filter_condition_to_sql(
            {"field": "views", "operator": "gte", "value": 100}, "raw")
        self.assertIn(">=", sql)
        self.assertEqual(params[0], 100)

        sql, params = common._results_filter_condition_to_sql(
            {"field": "views", "operator": "between", "min": 10, "max": 100}, "raw")
        self.assertEqual(params, [10, 100])

        sql, params = common._results_filter_condition_to_sql(
            {"field": "views", "operator": "is_empty"}, "raw")
        self.assertIn("IS NULL", sql)

    def test_sql_datetime_operators(self) -> None:
        sql, params = common._results_filter_condition_to_sql(
            {"field": "created_at_x", "operator": "on_or_after", "value": "2024-01-01"}, "curated")
        self.assertIn(">=", sql)

        sql, params = common._results_filter_condition_to_sql(
            {"field": "created_at_x", "operator": "between", "min": "2024-01-01", "max": "2024-12-31"}, "curated")
        self.assertEqual(params, ["2024-01-01", "2024-12-31"])

    def test_sql_boolean(self) -> None:
        sql, params = common._results_filter_condition_to_sql(
            {"field": "is_zero_cost", "operator": "is_true"}, "curated")
        self.assertEqual(params[0], 1)

        sql, params = common._results_filter_condition_to_sql(
            {"field": "is_zero_cost", "operator": "is_false"}, "curated")
        self.assertEqual(params[0], 0)

    def test_sql_tags_has_any(self) -> None:
        sql, params = common._results_filter_condition_to_sql(
            {"field": "tags", "operator": "has_any", "values": ["alpha", "beta"]}, "curated")
        self.assertIn("LIKE", sql)
        self.assertIn("OR", sql)
        self.assertEqual(len(params), 2)

    def test_sql_tags_has_all(self) -> None:
        sql, params = common._results_filter_condition_to_sql(
            {"field": "tags", "operator": "has_all", "values": ["alpha"]}, "curated")
        self.assertIn("LIKE", sql)

        sql, params = common._results_filter_condition_to_sql(
            {"field": "tags", "operator": "has_all", "values": ["alpha", "beta"]}, "curated")
        self.assertIn("LIKE", sql)
        self.assertIn("AND", sql)

    def test_sql_tags_empty(self) -> None:
        sql, _ = common._results_filter_condition_to_sql(
            {"field": "tags", "operator": "is_empty"}, "curated")
        self.assertIn("'[]'", sql)

    def test_sql_returns_none_for_unknown(self) -> None:
        self.assertIsNone(common._results_filter_condition_to_sql(
            {"field": "nonexistent", "operator": "contains"}, "curated"))

    def test_sql_tree_and_children(self) -> None:
        tree = {
            "type": "group", "relation": "AND", "children": [
                {"type": "condition", "field": "title", "operator": "contains", "value": "hello"},
                {"type": "condition", "field": "is_zero_cost", "operator": "is_true"},
            ]
        }
        result = common._results_filter_tree_to_sql(tree, "curated")
        self.assertIsNotNone(result)
        sql, params = result  # type: ignore[misc]
        self.assertIn("AND", sql)
        self.assertEqual(len(params), 2)

    def test_sql_tree_empty_group(self) -> None:
        result = common._results_filter_tree_to_sql({"type": "group", "relation": "AND", "children": []}, "curated")
        sql, params = result  # type: ignore[misc]
        self.assertEqual(sql, "1 = 1")
        self.assertEqual(params, [])

    def test_sql_tree_skips_non_dict_children(self) -> None:
        tree = {"type": "group", "relation": "AND", "children": [
            None, {"type": "condition", "field": "title", "operator": "is_empty"}
        ]}
        result = common._results_filter_tree_to_sql(tree, "curated")
        self.assertIsNotNone(result)

    def test_sql_tree_returns_none_when_child_fails(self) -> None:
        tree = {"type": "group", "relation": "AND", "children": [
            {"type": "condition", "field": "nonexistent", "operator": "contains"}
        ]}
        self.assertIsNone(common._results_filter_tree_to_sql(tree, "curated"))


class SortAndMetricsTests(unittest.TestCase):
    def test_sort_by_id_desc_default(self) -> None:
        items = [_item(3), _item(1), _item(2)]
        result = common._sort_items_in_memory(items, "curated", "id", "DESC")
        self.assertEqual([it["id"] for it in result], [3, 2, 1])

    def test_sort_text_asc(self) -> None:
        items = [_item(1, title="B"), _item(2, title="a"), _item(3, title="C")]
        result = common._sort_items_in_memory(items, "curated", "title", "ASC")
        self.assertEqual([it["id"] for it in result], [2, 1, 3])

    def test_sort_number_desc(self) -> None:
        items = [_item(1, views=10), _item(2, views=100), _item(3, views=50)]
        result = common._sort_items_in_memory(items, "raw", "views", "DESC")
        self.assertEqual([it["id"] for it in result], [2, 3, 1])

    def test_sort_datetime_asc(self) -> None:
        items = [
            _item(1, created_at_x="2024-06-15T00:00:00Z"),
            _item(2, created_at_x="2024-01-01T00:00:00Z"),
        ]
        result = common._sort_items_in_memory(items, "curated", "created_at_x", "ASC")
        self.assertEqual(result[0]["id"], 2)

    def test_sort_invalid_field_fallsback_to_id(self) -> None:
        items = [_item(3), _item(1)]
        result = common._sort_items_in_memory(items, "curated", "nonexistent", "ASC")
        self.assertEqual(result[0]["id"], 1)

    def test_metric_returns_int(self) -> None:
        sr = SearchResult(query_name="q", query="q", tweet_id="1", url="u", text="t", author_name="a", author="a", created_at="2024-01-01", raw={"metrics": {"views": 42}})
        self.assertEqual(common._metric(sr, "views"), 42)
        self.assertEqual(common._metric(sr, "likes"), 0)

    def test_item_metric_falls_back_to_top_level(self) -> None:
        payload = {"views": 10, "metrics": {"likes": 20}}
        self.assertEqual(common._item_metric(payload, "views"), 10)
        self.assertEqual(common._item_metric(payload, "likes"), 20)
        self.assertEqual(common._item_metric(payload, "retweets"), 0)

    def test_threshold_pass_mode_or(self) -> None:
        sr = SearchResult(query_name="q", query="q", tweet_id="1", url="u", text="t", author_name="a", author="a", created_at="2024-01-01", raw={"metrics": {"views": 100, "retweets": 0}})
        self.assertTrue(common._threshold_pass(sr, {"mode": "OR", "views": 100, "retweets": 10}))

    def test_threshold_pass_mode_and(self) -> None:
        sr = SearchResult(query_name="q", query="q", tweet_id="1", url="u", text="t", author_name="a", author="a", created_at="2024-01-01", raw={"metrics": {"views": 100, "retweets": 0}})
        self.assertFalse(common._threshold_pass(sr, {"mode": "AND", "views": 100, "retweets": 10}))

    def test_threshold_pass_all_zero_returns_true(self) -> None:
        sr = SearchResult(query_name="q", query="q", tweet_id="1", url="u", text="t", author_name="a", author="a", created_at="2024-01-01", raw={})
        self.assertTrue(common._threshold_pass(sr, {"views": 0, "retweets": 0}))

    def test_dedupe_search_results_removes_duplicates(self) -> None:
        sr1 = SearchResult(query_name="q", query="q", tweet_id="1", url="http://x.com/u/1", text="hello", author_name="a", author="a", created_at="2024-01-01", raw={})
        sr2 = SearchResult(query_name="q", query="q", tweet_id="2", url="http://x.com/u/2", text="world", author_name="b", author="b", created_at="2024-01-01", raw={})
        sr3 = SearchResult(query_name="q", query="q", tweet_id="1", url="http://x.com/u/1", text="hello", author_name="a", author="a", created_at="2024-01-01", raw={})
        result = common._dedupe_search_results([sr1, sr2, sr3])
        self.assertEqual(len(result), 2)

    def test_search_result_to_raw_uses_asdict(self) -> None:
        sr = SearchResult(query_name="q", query="q", tweet_id="123", url="u", text="t", author_name="a", author="a", created_at="2024-01-01", raw={})
        raw = common._search_result_to_raw(sr)
        self.assertEqual(raw["tweet_id"], "123")

    def test_parse_item_created_at(self) -> None:
        self.assertIsNone(common._parse_item_created_at(None))
        self.assertIsNone(common._parse_item_created_at(""))
        dt = common._parse_item_created_at("2024-06-15T12:00:00Z")
        self.assertIsInstance(dt, datetime)

    def test_dedupe_sort_key_orders_none_last(self) -> None:
        early = _item(1, created_at_x="2024-01-01T00:00:00Z")
        later = _item(2, created_at_x="2024-06-15T00:00:00Z")
        none_field = _item(3)
        keys = sorted([early, later, none_field], key=common._dedupe_sort_key)
        self.assertEqual(keys[0]["id"], 1)
        self.assertEqual(keys[2]["id"], 3)

    def test_raw_metrics_handles_missing_and_corrupt(self) -> None:
        self.assertEqual(common._raw_metrics({"metrics_json": {}})["views"], 0)
        self.assertEqual(common._raw_metrics({})["views"], 0)
        self.assertEqual(common._raw_metrics({"metrics_json": {"views": "100"}})["views"], 100)
        self.assertEqual(common._raw_metrics({"metrics_json": "invalid"})["views"], 0)

    def test_row_tags_prefers_tags_field(self) -> None:
        self.assertEqual(common._row_tags({"tags": ["alpha"], "tags_json": "[\"beta\"]"}), ["alpha"])
        self.assertEqual(common._row_tags({"tags_json": ["beta"]}), ["beta"])

    def test_curated_row_to_item(self) -> None:
        row = {k: None for k in ["id", "run_id", "dedupe_key", "level", "score", "title", "summary_zh",
                                  "excerpt", "is_zero_cost", "source_url", "author_name", "author",
                                  "created_at_x", "views", "likes", "replies", "retweets", "fetched_at",
                                  "tags_json", "reasons_json", "rule_set_id", "state"]}
        row["id"] = 1
        row["title"] = "Hello"
        row["tags_json"] = '["alpha"]'  # type: ignore[index]
        result = common._curated_row_to_item(row)
        self.assertEqual(result["id"], 1)
        self.assertEqual(result["tags"], ["alpha"])
        self.assertNotIn("tags_json", result)

    def test_raw_row_to_item(self) -> None:
        import sqlite3
        with patch("backend.collector_service_parts.common.row_to_dict") as mock_row:
            mock_row.return_value = {
                "id": 1, "run_id": 2, "tweet_id": "123", "canonical_url": "http://x",
                "author_name": "a", "author": "a", "text": "hello",
                "created_at_x": "2024-01-01", "metrics_json": {"views": 42},
                "tags_json": ["tag1"], "query_name": "q", "fetched_at": None,
            }
            result = common._raw_row_to_item(Mock())
        self.assertEqual(result["id"], 1)
        self.assertEqual(result["views"], 42)
        self.assertEqual(result["tags"], ["tag1"])

    def test_item_created_at_sort_key(self) -> None:
        key_asc = common._item_created_at_sort_key(_item(1, created_at_x="2024-01-01T00:00:00Z"), "ASC")
        self.assertEqual(key_asc[0], 0)
        key_missing = common._item_created_at_sort_key(_item(2), "ASC")
        self.assertEqual(key_missing[0], 1)

    def test_number_sort_key(self) -> None:
        key_desc = common._number_sort_key(_item(1, views=50), "views", "DESC")
        self.assertEqual(key_desc[0], -50)
        key_invalid = common._number_sort_key(_item(2, views="bad"), "views", "ASC")
        self.assertEqual(key_invalid[0], 0)


if __name__ == "__main__":
    unittest.main()
