import { useMemo, useState } from "react";

import type { ItemSortField, ItemTable } from "../../api";
import {
  COLUMN_DEFINITIONS_BY_TABLE,
  DEFAULT_VISIBLE_COLUMNS_BY_TABLE,
  orderVisibleColumns,
  resolveColumnWidth,
  type ColumnWidthsByTable,
} from "./resultsTableConfig";

type UseResultsColumnsParams = {
  table: ItemTable;
  columnWidthsByTable: ColumnWidthsByTable;
};

export function useResultsColumns({ table, columnWidthsByTable }: UseResultsColumnsParams) {
  const [visibleColumnsByTable, setVisibleColumnsByTable] = useState<Record<ItemTable, ItemSortField[]>>({
    curated: [...DEFAULT_VISIBLE_COLUMNS_BY_TABLE.curated],
    raw: [...DEFAULT_VISIBLE_COLUMNS_BY_TABLE.raw],
  });
  const [fieldMenuOpen, setFieldMenuOpen] = useState(false);

  const visibleColumns = visibleColumnsByTable[table];
  const columnDefinitions = COLUMN_DEFINITIONS_BY_TABLE[table];
  const visibleColumnDefinitions = columnDefinitions.filter((column) => visibleColumns.includes(column.key));
  const currentColumnWidths = columnWidthsByTable[table];
  const resolvedVisibleColumnDefinitions = useMemo(
    () =>
      visibleColumnDefinitions.map((column) => ({
        ...column,
        currentWidth: resolveColumnWidth(column, currentColumnWidths?.[column.key]),
      })),
    [currentColumnWidths, visibleColumnDefinitions],
  );
  const sortFieldSet = useMemo(() => new Set(columnDefinitions.map((column) => column.key)), [columnDefinitions]);

  function toggleColumnVisibility(key: ItemSortField) {
    setVisibleColumnsByTable((current) => {
      const tableColumns = current[table];
      const nextColumns = tableColumns.includes(key)
        ? tableColumns.filter((field) => field !== key)
        : orderVisibleColumns(table, [...tableColumns, key]);
      return {
        ...current,
        [table]: nextColumns,
      };
    });
  }

  function handleRestoreDefaultColumns() {
    setVisibleColumnsByTable((current) => ({
      ...current,
      [table]: [...DEFAULT_VISIBLE_COLUMNS_BY_TABLE[table]],
    }));
  }

  function handleToggleFieldMenu() {
    setFieldMenuOpen((current) => !current);
  }

  return {
    visibleColumnsByTable,
    setVisibleColumnsByTable,
    fieldMenuOpen,
    setFieldMenuOpen,
    visibleColumns,
    columnDefinitions,
    visibleColumnDefinitions,
    currentColumnWidths,
    resolvedVisibleColumnDefinitions,
    sortFieldSet,
    toggleColumnVisibility,
    handleRestoreDefaultColumns,
    handleToggleFieldMenu,
  };
}
