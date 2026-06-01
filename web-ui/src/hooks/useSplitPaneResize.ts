import { useEffect, useRef, useState } from "react";

type SplitPaneResizeOptions = {
  breakpoint: number;
  minLeftPaneWidth: number;
  minRightPaneWidth: number;
  resizerWidth: number;
};

export function useSplitPaneResize<TElement extends HTMLElement = HTMLDivElement>(options: SplitPaneResizeOptions) {
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? options.breakpoint : window.innerWidth));
  const [, setLeftPaneWidth] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const layoutRef = useRef<TElement | null>(null);
  const dragBoundsRef = useRef<{ left: number; width: number } | null>(null);
  const isSplitLayout = viewportWidth > options.breakpoint;

  function applyLeftPaneWidth(nextWidth: number | null) {
    setLeftPaneWidth(nextWidth);
    if (!layoutRef.current) return;
    layoutRef.current.style.gridTemplateColumns = nextWidth === null
      ? ""
      : `${nextWidth}px ${options.resizerWidth}px minmax(${options.minRightPaneWidth}px, 1fr)`;
  }

  function updateDraggedWidth(clientX: number | undefined) {
    const bounds = dragBoundsRef.current;
    if (!bounds || typeof clientX !== "number" || Number.isNaN(clientX)) return;
    const maxWidth = Math.max(options.minLeftPaneWidth, bounds.width - options.minRightPaneWidth - options.resizerWidth);
    const nextWidth = Math.min(Math.max(clientX - bounds.left, options.minLeftPaneWidth), maxWidth);
    applyLeftPaneWidth(nextWidth);
  }

  function startResizing() {
    if (!isSplitLayout || !layoutRef.current) return;
    const bounds = layoutRef.current.getBoundingClientRect();
    dragBoundsRef.current = { left: bounds.left, width: bounds.width };
    setIsResizing(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  useEffect(() => {
    function handleWindowResize() {
      setViewportWidth(window.innerWidth);
    }

    function handlePointerMove(event: PointerEvent) {
      updateDraggedWidth(event.clientX);
    }

    function handleMouseMove(event: MouseEvent) {
      updateDraggedWidth(event.clientX);
    }

    function stopResizing() {
      dragBoundsRef.current = null;
      setIsResizing(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizing);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizing);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, []);

  useEffect(() => {
    if (isSplitLayout) return;
    setIsResizing(false);
    applyLeftPaneWidth(null);
    dragBoundsRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, [isSplitLayout]);

  return {
    isSplitLayout,
    isResizing,
    layoutRef,
    startResizing,
  };
}
