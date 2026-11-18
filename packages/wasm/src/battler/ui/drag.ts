// Dragging a card with a finger or a mouse, from one place on the page to another. Plain pointer events
// (the browser's own drag and drop doesn't work on touch screens). A press that doesn't move is a tap
// and is left alone, so the card's own click still works; one that moves picks the card up, and where it
// is let go the page is told which `data-zone` is under it.
import type { Action } from "svelte/action";

export interface DragOptions {
  /** False for a card that can't be picked up now. */
  enabled: boolean;
  /** The card is picked up. */
  onstart?: () => void;
  /** The pointer moved over this zone (or none). */
  onover?: (zone: HTMLElement | null) => void;
  /** The card was let go; `zone` is what was under it, if anything, and `x` where along the page. */
  ondrop: (zone: HTMLElement, x: number) => void;
  /** The card was let go without a drop, or the drag was cancelled. */
  onend?: () => void;
}

const MOVE = 8;

export const zoneAt = (x: number, y: number): HTMLElement | null => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-zone]") ?? null;

export const draggable: Action<HTMLElement, DragOptions> = (node, initial) => {
  let options = initial;
  let from: { x: number; y: number; id: number } | null = null;
  let dragging = false;

  const finish = (e: PointerEvent | null, drop: boolean) => {
    const was = dragging;
    if (from && node.hasPointerCapture?.(from.id)) node.releasePointerCapture(from.id);
    const zone = e && drop ? zoneAt(e.clientX, e.clientY) : null;
    node.style.transform = "";
    node.classList.remove("dragging");
    from = null;
    dragging = false;
    if (!was) return;
    // The click that follows a drag is not a tap.
    node.addEventListener("click", eat, { capture: true, once: true });
    setTimeout(() => node.removeEventListener("click", eat, { capture: true }), 50);
    options.onover?.(null);
    if (zone && e) options.ondrop(zone, e.clientX);
    else options.onend?.();
  };
  const eat = (event: Event) => {
    event.stopImmediatePropagation();
    event.preventDefault();
  };

  const down = (e: PointerEvent) => {
    if (!options.enabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    from = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const move = (e: PointerEvent) => {
    if (!from || e.pointerId !== from.id) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (!dragging) {
      if (Math.hypot(dx, dy) < MOVE) return;
      dragging = true;
      node.setPointerCapture(from.id);
      node.classList.add("dragging");
      options.onstart?.();
    }
    node.style.transform = `translate(${dx}px, ${dy}px) rotate(${Math.max(-8, Math.min(8, dx / 20))}deg)`;
    options.onover?.(zoneAt(e.clientX, e.clientY));
  };
  const up = (e: PointerEvent) => from && e.pointerId === from.id && finish(e, true);
  const cancel = (e: PointerEvent) => from && e.pointerId === from.id && finish(e, false);
  const key = (e: KeyboardEvent) => e.key === "Escape" && dragging && finish(null, false);

  node.addEventListener("pointerdown", down);
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", key);
  return {
    update(next) {
      options = next;
    },
    destroy() {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    },
  };
};

/** Where a card let go at `x` goes in a row of cards: how many of the others are to its left. */
export function slotIn(row: HTMLElement, x: number, skip: HTMLElement | null): number {
  let at = 0;
  for (const child of Array.from(row.children) as HTMLElement[]) {
    if (child === skip) continue;
    const box = child.getBoundingClientRect();
    if (x > box.left + box.width / 2) at++;
  }
  return at;
}
