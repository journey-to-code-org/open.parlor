// The solid chips, for the card table: fetches the scene when a table has chips on it, keeps it
// drawn as the game moves on, and says whether it is up (the CSS chips are then made see-through,
// and stay as what holds each stack's place on the page: see chips3d.ts).
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { reducedMotion } from "../motion";
import { loadChips3d, type Chips3d, type Stack3d } from "./chips3d";

/** After anything changes the scene keeps drawing this long (ms), for seats and sheets that slide to where they go. */
const SETTLE = 700;

/** Every stack on the table, read off the page: where it stands on the canvas, and what it is made of. */
function stacksOn(table: HTMLElement, canvas: HTMLCanvasElement): Stack3d[] {
  const view = canvas.getBoundingClientRect();
  // The bar and your own row stay put while the felt scrolls under them: chips under either aren't drawn over it.
  const top = table.querySelector(".kit-bar")?.getBoundingClientRect().bottom ?? view.top;
  const mine = table.querySelector<HTMLElement>(":scope > .me");
  const bottom = mine?.getBoundingClientRect().top ?? view.bottom;
  const out: Stack3d[] = [];
  for (const col of table.querySelectorAll<HTMLElement>(".chip-col")) {
    const box = col.getBoundingClientRect();
    if (box.width < 2) continue;
    if (!mine?.contains(col) && (box.top < top - 1 || box.bottom > bottom + 1)) continue;
    out.push({
      id: col,
      x: box.left + box.width / 2 - view.left,
      y: box.bottom - view.top,
      width: box.width,
      count: col.childElementCount,
      colour: col.style.getPropertyValue("--c"),
      inset: col.style.getPropertyValue("--inset"),
      drops: !col.parentElement?.classList.contains("stack"),
      value: Number(col.dataset.value) || 1,
      edge: col.parentElement?.dataset.edge ?? "stripes",
      mark: col.parentElement?.dataset.mark ?? "value",
      finish: col.parentElement?.dataset.finish ?? "clay",
    });
  }
  return out;
}

export function useChips3d(table: RefObject<HTMLElement | null>, wanted: boolean) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Chips3d | null>(null);
  const [up, setUp] = useState(false);
  const raf = useRef(0);
  const until = useRef(0);

  const paint = useCallback((time: number) => {
    raf.current = 0;
    const s = scene.current;
    const c = canvas.current;
    const t = table.current;
    if (!s || !c || !t) return;
    const state = s.render({ stacks: stacksOn(t, c), width: c.clientWidth, height: c.clientHeight, dpr: Math.min(2, window.devicePixelRatio || 1), time, still: reducedMotion() });
    setUp(state !== null);
    if (state === null) return;
    if (state === "busy" || time < until.current) raf.current = requestAnimationFrame(paint);
  }, []);
  /** Draw now, and keep drawing while anything may still be moving. */
  const wake = useCallback(() => {
    until.current = performance.now() + SETTLE;
    if (!raf.current) raf.current = requestAnimationFrame(paint);
  }, [paint]);

  useEffect(() => {
    const c = canvas.current;
    if (!wanted || !c) return setUp(false);
    let alive = true;
    let made: Chips3d | null = null;
    loadChips3d(c).then((s) => {
      if (!alive || !s) return s?.dispose();
      made = s;
      scene.current = s;
      wake();
    });
    // The stacks are wherever the page has them: a turned phone, a resized window or a scrolled table moves them.
    const watcher = typeof ResizeObserver === "function" ? new ResizeObserver(wake) : null;
    if (table.current) watcher?.observe(table.current);
    addEventListener("resize", wake);
    addEventListener("scroll", wake, { capture: true, passive: true });
    return () => {
      alive = false;
      scene.current = null;
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      watcher?.disconnect();
      removeEventListener("resize", wake);
      removeEventListener("scroll", wake, { capture: true });
      made?.dispose();
      setUp(false);
    };
  }, [wanted]);

  // Whenever the table is drawn again (a bet, a pot taken, a seat's turn), so are the chips.
  useEffect(() => {
    if (wanted) wake();
  });

  return {
    /** The scene is up and drawing: the CSS chips are hidden, and hold the stacks' places. */
    up: wanted && up,
    /** The canvas the scene draws on: over the whole table, and never in the way of a tap. */
    canvas: wanted ? <canvas ref={canvas} className={`chips-gl${up ? " up" : ""}`} aria-hidden /> : null,
  };
}
