import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { loadPlace, savePlace, type Place } from "./storage";

const EDGE = 4;
/** A press that travels less than this is a tap, not a drag. */
const SLOP = 6;

// What's out of its usual spot right now, so one "Put back" anywhere can offer to return it all.
const movedNow = new Set<string>();
const watchers = new Set<() => void>();
const putBack = new Set<() => void>();
const tell = () => watchers.forEach((w) => w());
const watch = (w: () => void) => {
  watchers.add(w);
  return () => void watchers.delete(w);
};
/** Whether the player has dragged anything on this screen away from where it started. */
export const useAnythingMoved = () => useSyncExternalStore(watch, () => movedNow.size > 0);
/** Return everything on this screen that's been dragged to its usual spot, and forget where it was. */
export const putEverythingBack = () => [...putBack].forEach((back) => back());

/**
 * Lets a player drag something on the table to where they'd like it, and remembers the spot on this
 * device. Until it's dragged, the thing sits wherever the stylesheet puts it.
 *
 * `target` goes on what moves, `handle` on what's held to move it (often the same element), and
 * what's rendered is wrapped in `lift(...)`.
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

  // The drag is followed on the window, not the handle: once it starts the thing is lifted out to
  // the page (see `lift`), and a handle that has just moved in the document would lose the pointer.
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    const el = target.current;
    if (!el || press.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    // A button inside the handle (Close) is for pressing, not for dragging by.
    const inner = (e.target as HTMLElement).closest("button, a, input");
    if (inner && inner !== e.currentTarget) return;
    const r = el.getBoundingClientRect();
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top, dragging: false };
    press.current = p;
    dragged.current = false;

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== p.id) return;
      const dx = ev.clientX - p.x;
      const dy = ev.clientY - p.y;
      if (!p.dragging) {
        if (Math.hypot(dx, dy) < SLOP) return;
        p.dragging = true;
        dragged.current = true;
      }
      ev.preventDefault();
      const { w, h } = room();
      setAt({ left: Math.min(Math.max(p.left + dx, EDGE), EDGE + w), top: Math.min(Math.max(p.top + dy, EDGE), EDGE + h) });
    };
    const done = (ev: PointerEvent) => {
      if (ev.pointerId !== p.id) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointercancel", done);
      press.current = null;
      if (!p.dragging) return;
      const now = target.current?.getBoundingClientRect();
      if (now) {
        const { w, h } = room();
        const next = { x: w ? (now.left - EDGE) / w : 0, y: h ? (now.top - EDGE) / h : 0 };
        setPlace(next);
        savePlace(what, next);
      }
      // The click that follows this release belongs to the drag.
      setTimeout(() => (dragged.current = false), 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done);
    window.addEventListener("pointercancel", done);
  };

  const reset = useCallback(() => {
    setPlace(null);
    setAt(null);
    savePlace(what, null);
  }, [what]);

  useEffect(() => {
    putBack.add(reset);
    return () => void putBack.delete(reset);
  }, [reset]);
  useEffect(() => {
    if (!place) return;
    movedNow.add(what);
    tell();
    return () => {
      movedNow.delete(what);
      tell();
    };
  }, [what, place !== null]);

  const style: CSSProperties | undefined = at ? { position: "fixed", left: at.left, top: at.top, right: "auto", bottom: "auto", margin: 0 } : undefined;
  /**
   * Wrap what's rendered in this: once moved, it lives on the page itself instead of inside its
   * bar or panel, so it floats above the whole table wherever it's put.
   */
  const lift = (node: ReactNode): ReactNode => (at ? createPortal(node, document.body) : node);
  return { target, style, lift, moved: at !== null, reset, wasDrag: () => dragged.current, handle: { onPointerDown } };
}
