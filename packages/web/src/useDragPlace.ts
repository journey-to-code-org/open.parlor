import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { loadPlace, savePlace, type Place } from "./storage";

const EDGE = 4;
/** A press that travels less than this is a tap, not a drag. */
const SLOP = 6;

/**
 * Lets a player drag something on the table to where they'd like it, and remembers the spot on this
 * device. Until it's dragged, the thing sits wherever the stylesheet puts it.
 *
 * `target` goes on what moves and `handle` on what's held to move it (often the same element).
 * A drag never counts as a click: ask `wasDrag()` first in the handle's onClick.
 */
export function useDragPlace<T extends HTMLElement>(what: string) {
  const target = useRef<T>(null);
  const [place, setPlace] = useState<Place | null>(() => loadPlace(what));
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const press = useRef<{ id: number; x: number; y: number; left: number; top: number; dragging: boolean } | null>(null);
  const dragged = useRef(false);

  const room = () => {
    const el = target.current;
    return { w: Math.max(window.innerWidth - (el?.offsetWidth ?? 0) - EDGE * 2, 0), h: Math.max(window.innerHeight - (el?.offsetHeight ?? 0) - EDGE * 2, 0) };
  };

  // Turn the remembered spot into pixels: again whenever the thing or the window changes size.
  useLayoutEffect(() => {
    if (!place || press.current?.dragging) return;
    const settle = () => {
      const { w, h } = room();
      const next = { left: EDGE + place.x * w, top: EDGE + place.y * h };
      setAt((now) => (now && Math.abs(now.left - next.left) < 0.5 && Math.abs(now.top - next.top) < 0.5 ? now : next));
    };
    settle();
    window.addEventListener("resize", settle);
    return () => window.removeEventListener("resize", settle);
  });

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    const el = target.current;
    if (!el || (e.pointerType === "mouse" && e.button !== 0)) return;
    // A button inside the handle (Close) is for pressing, not for dragging by.
    const inner = (e.target as HTMLElement).closest("button, a, input");
    if (inner && inner !== e.currentTarget) return;
    const r = el.getBoundingClientRect();
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top, dragging: false };
    dragged.current = false;
    // Hold on to the pointer from the start: a quick flick leaves a small button before it has moved far.
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.dragging) {
      if (Math.hypot(dx, dy) < SLOP) return;
      p.dragging = true;
      dragged.current = true;
    }
    const { w, h } = room();
    setAt({ left: Math.min(Math.max(p.left + dx, EDGE), EDGE + w), top: Math.min(Math.max(p.top + dy, EDGE), EDGE + h) });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    if (!p.dragging) return;
    const el = target.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const { w, h } = room();
      const next = { x: w ? (r.left - EDGE) / w : 0, y: h ? (r.top - EDGE) / h : 0 };
      setPlace(next);
      savePlace(what, next);
    }
    // The click that follows this release belongs to the drag.
    setTimeout(() => (dragged.current = false), 0);
  };

  const reset = useCallback(() => {
    setPlace(null);
    setAt(null);
    savePlace(what, null);
  }, [what]);

  const style: CSSProperties | undefined = at ? { position: "fixed", left: at.left, top: at.top, right: "auto", bottom: "auto", margin: 0 } : undefined;
  return { target, style, moved: at !== null, reset, wasDrag: () => dragged.current, handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}
