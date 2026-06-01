import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  getJobColumnMinWidth,
  type JobColumnResizeState,
  type JobColumnWidths,
  type JobTableColumnDefinition,
  type JobTableColumnKey,
} from "./jobsTableConfig";

type UseJobsColumnResizeParams = {
  setColumnWidths: Dispatch<SetStateAction<JobColumnWidths>>;
};

export function useJobsColumnResize({ setColumnWidths }: UseJobsColumnResizeParams) {
  const [isResizingColumn, setIsResizingColumn] = useState(false);
  const [resizingColumnId, setResizingColumnId] = useState<JobTableColumnKey | null>(null);
  const columnResizeStateRef = useRef<JobColumnResizeState | null>(null);

  useEffect(() => {
    function updateResizedColumnWidth(clientX: number | undefined) {
      const resizeState = columnResizeStateRef.current;
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
      setColumnWidths((current) => {
        if (current[resizeState.leftKey] === nextLeftWidth && current[resizeState.rightKey] === nextRightWidth) {
          return current;
        }
        return {
          ...current,
          [resizeState.leftKey]: nextLeftWidth,
          [resizeState.rightKey]: nextRightWidth,
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
      columnResizeStateRef.current = null;
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
  }, [setColumnWidths]);

  function startColumnResize(
    leftColumn: JobTableColumnDefinition & { currentWidth: number },
    rightColumn: (JobTableColumnDefinition & { currentWidth: number }) | undefined,
    clientX: number | undefined,
  ) {
    if (typeof clientX !== "number" || Number.isNaN(clientX) || !rightColumn) {
      return;
    }
    columnResizeStateRef.current = {
      leftKey: leftColumn.key,
      rightKey: rightColumn.key,
      startX: clientX,
      leftStartWidth: leftColumn.currentWidth,
      rightStartWidth: rightColumn.currentWidth,
      leftMinWidth: getJobColumnMinWidth(leftColumn),
      rightMinWidth: getJobColumnMinWidth(rightColumn),
    };
    setIsResizingColumn(true);
    setResizingColumnId(leftColumn.key);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  return {
    isResizingColumn,
    resizingColumnId,
    startColumnResize,
  };
}
