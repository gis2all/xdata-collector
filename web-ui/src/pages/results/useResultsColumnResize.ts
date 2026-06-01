import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { ItemTable } from "../../api";
import {
  getColumnMinWidth,
  type ColumnDefinition,
  type ColumnResizeState,
  type ColumnWidthsByTable,
} from "./resultsTableConfig";

type UseResultsColumnResizeParams = {
  table: ItemTable;
  setColumnWidthsByTable: Dispatch<SetStateAction<ColumnWidthsByTable>>;
};

export function useResultsColumnResize({ table, setColumnWidthsByTable }: UseResultsColumnResizeParams) {
  const [isResizingColumn, setIsResizingColumn] = useState(false);
  const [resizingColumnId, setResizingColumnId] = useState<string | null>(null);
  const resizeStateRef = useRef<ColumnResizeState | null>(null);

  useEffect(() => {
    function updateResizedColumnWidth(clientX: number | undefined) {
      const resizeState = resizeStateRef.current;
      if (!resizeState || typeof clientX !== "number" || Number.isNaN(clientX)) {
        return;
      }
      const delta = clientX - resizeState.startX;
      const pairTotal = resizeState.leftStartWidth + resizeState.rightStartWidth;
      const nextLeftWidth = Math.min(
        Math.max(Math.round(resizeState.leftStartWidth + delta), resizeState.leftMinWidth),
        pairTotal - resizeState.rightMinWidth,
      );
      const nextRightWidth = pairTotal - nextLeftWidth;
      setColumnWidthsByTable((current) => {
        const tableWidths = current[resizeState.table];
        if (
          tableWidths?.[resizeState.leftKey] === nextLeftWidth &&
          tableWidths?.[resizeState.rightKey] === nextRightWidth
        ) {
          return current;
        }
        return {
          ...current,
          [resizeState.table]: {
            ...tableWidths,
            [resizeState.leftKey]: nextLeftWidth,
            [resizeState.rightKey]: nextRightWidth,
          },
        };
      });
    }

    function handlePointerMove(event: PointerEvent) {
      updateResizedColumnWidth(event.clientX);
    }

    function handleMouseMove(event: MouseEvent) {
      updateResizedColumnWidth(event.clientX);
    }

    function stopResizingColumn() {
      resizeStateRef.current = null;
      setIsResizingColumn(false);
      setResizingColumnId(null);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizingColumn);
    window.addEventListener("pointercancel", stopResizingColumn);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizingColumn);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizingColumn);
      window.removeEventListener("pointercancel", stopResizingColumn);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizingColumn);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [setColumnWidthsByTable]);

  function startColumnResize(
    leftColumn: ColumnDefinition & { currentWidth: number },
    rightColumn: (ColumnDefinition & { currentWidth: number }) | undefined,
    clientX: number | undefined,
  ) {
    if (typeof clientX !== "number" || Number.isNaN(clientX) || !rightColumn) {
      return;
    }
    resizeStateRef.current = {
      table,
      leftKey: leftColumn.key,
      rightKey: rightColumn.key,
      startX: clientX,
      leftStartWidth: leftColumn.currentWidth,
      rightStartWidth: rightColumn.currentWidth,
      leftMinWidth: getColumnMinWidth(leftColumn),
      rightMinWidth: getColumnMinWidth(rightColumn),
    };
    setIsResizingColumn(true);
    setResizingColumnId(`${table}:${leftColumn.key}`);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  return {
    isResizingColumn,
    resizingColumnId,
    startColumnResize,
  };
}
