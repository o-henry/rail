import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

type FloatingPosition = {
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type FloatingPanelOptions = {
  enabled: boolean;
  panelRef: RefObject<HTMLElement | null>;
  defaultPosition: FloatingPosition;
  margin: number;
  minVisibleWidth: number;
  minVisibleHeight: number;
};

type UseFloatingPanelResult = {
  position: FloatingPosition;
  dragging: boolean;
  setPosition: (next: FloatingPosition) => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  clearDragging: () => void;
};

export function useFloatingPanel(options: FloatingPanelOptions): UseFloatingPanelResult {
  const {
    enabled,
    panelRef,
    defaultPosition,
    margin,
    minVisibleWidth,
    minVisibleHeight,
  } = options;
  const [position, setPositionState] = useState<FloatingPosition>(defaultPosition);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);

  const clampPosition = (nextX: number, nextY: number): FloatingPosition => {
    const panel = panelRef.current;
    const panelWidth = panel?.offsetWidth ?? 860;
    const panelHeight = panel?.offsetHeight ?? 540;
    const maxX = window.innerWidth - margin - minVisibleWidth;
    const maxY = window.innerHeight - margin - minVisibleHeight;
    const minX = margin - Math.max(0, panelWidth - minVisibleWidth);
    const minY = margin - Math.max(0, panelHeight - minVisibleHeight);

    return {
      x: Math.min(Math.max(nextX, minX), Math.max(maxX, minX)),
      y: Math.min(Math.max(nextY, minY), Math.max(maxY, minY)),
    };
  };

  const setPosition = (next: FloatingPosition) => {
    setPositionState(clampPosition(next.x, next.y));
  };

  const clearDragging = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const onDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || event.button !== 0) {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    setDragging(true);
    event.preventDefault();
  };

  useEffect(() => {
    if (!enabled || !dragging) {
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      const state = dragRef.current;
      if (!state || event.pointerId !== state.pointerId) {
        return;
      }
      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      setPositionState(clampPosition(state.originX + deltaX, state.originY + deltaY));
      event.preventDefault();
    };

    const onPointerEnd = (event: PointerEvent) => {
      const state = dragRef.current;
      if (!state || event.pointerId !== state.pointerId) {
        return;
      }
      clearDragging();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
    };
  }, [dragging, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onResize = () => {
      setPositionState((prev) => clampPosition(prev.x, prev.y));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      clearDragging();
    }
  }, [enabled]);

  return {
    position,
    dragging,
    setPosition,
    onDragStart,
    clearDragging,
  };
}
