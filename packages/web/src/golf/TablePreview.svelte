<!--
  Any table of a table sport, as a table draws it: the course editor's hole, the lane editor's lane.
  Still, or playing `replay` (shots as a table records them) one after another, each from the bodies
  as they stood when it was struck. The very same painting as at a table (sport/draw.ts), so what
  the maker sees is what the players get.
-->
<script lang="ts">
  import { BALL_RADIUS, type SportBody, type SportShot, type SportView } from "@journey-to-code/games";
  import { frames, type Frame, type SimResult } from "@journey-to-code/physics";
  import { drawScene, playFrame, type Disc } from "../sport/draw";
  import { fitFrame, TILT } from "../sport/projection";
  import { TEE_BALL } from "./table";

  let {
    table,
    label,
    flat = false,
    class: className = "hole-preview",
    replay = null,
    onreplayend,
  }: {
    table: SportView["table"];
    label: string;
    flat?: boolean;
    class?: string;
    replay?: SportShot[] | null;
    onreplayend?: () => void;
  } = $props();

  let canvas = $state<HTMLCanvasElement>()!;

  /** A ball the table's own looks don't name (the game's ball on a playtest): a white one. */
  const looseBall = (id: string): SportBody => ({ id, owner: 0, kind: "ball", tone: "white", label: "the ball" });

  /** The canvas at its size on the page, and the table fitted to it. */
  function surface() {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, box.width);
    const h = Math.max(1, box.height);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    return ctx ? { ctx, w, h, dpr, fit: fitFrame(playFrame(table), w, h, { tilt: flat ? 0 : TILT }) } : null;
  }

  $effect(() => {
    void flat; // drawn again when it changes, replaying or not
    const looks = new Map(table.bodies.map((b) => [b.id, b]));
    if (replay?.length) {
      const shots = replay;
      // Each shot from where everything stood, stepped as a table steps it: two steps a screen frame.
      let shot = 0;
      let run: Generator<Frame, SimResult, void> | null = null;
      let sizes = new Map<string, number>();
      let pause = 0;
      let raf = 0;
      const tick = () => {
        if (pause > 0) {
          pause -= 1;
          raf = requestAnimationFrame(tick);
          return;
        }
        if (!run) {
          if (shot >= shots.length) {
            onreplayend?.();
            return;
          }
          const s = shots[shot++]!;
          sizes = new Map(s.from.map((b) => [b.id, b.r]));
          run = frames({ ...table.world, bodies: s.from }, s.shot);
        }
        let frame: IteratorResult<Frame, SimResult> | null = null;
        for (let i = 0; i < 2; i++) {
          frame = run.next();
          if (frame.done) break;
        }
        const step = frame && !frame.done ? frame.value : null;
        if (step) {
          const discs: Disc[] = step.bodies.map((b) => {
            const r = sizes.get(b.id) ?? BALL_RADIUS;
            return { id: b.id, x: b.x, y: b.y, r, look: looks.get(b.id) ?? looseBall(b.id), ...(b.in ? { gone: 1, tunnel: b.in } : !b.live ? { sunk: 1 } : {}) };
          });
          const s = surface();
          if (s) drawScene(s.ctx, s.w, s.h, s.dpr, s.fit, { table, discs, aim: null, trace: null, trails: [], effects: [], time: performance.now(), still: false, hurry: false });
        } else {
          run = null;
          pause = 40;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    const paint = () => {
      const s = surface();
      if (!s) return;
      const discs: Disc[] = table.world.bodies.map((b) => ({ id: b.id, x: b.x, y: b.y, r: b.id === TEE_BALL.id && !b.r ? BALL_RADIUS : b.r, look: looks.get(b.id) }));
      drawScene(s.ctx, s.w, s.h, s.dpr, s.fit, { table, discs, aim: null, trace: null, trails: [], effects: [], time: 0, still: true, hurry: false });
    };
    paint();
    const watch = new ResizeObserver(paint);
    watch.observe(canvas);
    return () => watch.disconnect();
  });
</script>

<!-- A picture, with words for those who can't see it: a canvas has no role of its own to lose. -->
<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
<canvas bind:this={canvas} class={className} role="img" aria-label={label}></canvas>
