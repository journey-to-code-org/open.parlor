<!--
  What is placed in a level: where the players start, the monsters, what can be picked up, the
  scenery. The level's walls are drawn as a map; things are moved, added, changed and taken away
  on it. The walls themselves can't be changed here yet.

  The map is a canvas: drag it to move about, pinch or use the wheel to come closer. Everything a
  pointer does to a thing can also be done from the panel beside the map, and from the keyboard
  with the map in focus (arrows move the chosen thing, [ and ] choose the one before or after,
  Delete takes it away).
-->
<script lang="ts">
  import type { Asset, Kind } from "../../wad/catalogue.ts";
  import { decodeThings, encodeThings, FLAG_AMBUSH, FLAG_EASY, FLAG_HARD, FLAG_MEDIUM, FLAG_MULTIPLAYER, type Level, levelLumps, levelNames, readLevel, type Thing, THING_KINDS, thingKind } from "../../wad/level.ts";
  import type { Change } from "../../wad/mod.ts";
  import type { Palette } from "../../wad/picture.ts";
  import type { Wad } from "../../wad/wad.ts";
  import Thumb from "./Thumb.svelte";

  type News<T> = CustomEvent<T>;

  let {
    wad,
    assets,
    palette,
    level = $bindable(""),
    saved,
    keep,
    restore,
    toast,
    ontry,
  }: {
    wad: Wad;
    assets: Asset[];
    palette: Palette;
    /** The level being changed. */
    level: string;
    /** A level's things as they were last kept, if they have been changed. */
    saved: (level: string) => Uint8Array | undefined;
    keep: (change: Change) => void;
    restore: (kind: Kind, name: string) => void;
    toast: (message: string, variant?: "danger" | "info" | "success") => void;
    /** Play this level, with the changes. */
    ontry: (level: string) => void;
  } = $props();

  const names = $derived(levelNames(wad));
  const levels = $derived(names.map((name) => ({ value: name, label: name.replace(/^E(\d)M(\d)$/, "Episode $1, map $2").replace(/^MAP(\d\d)$/, "Map $1") })));
  const GROUPS = [
    { label: "Where players start", group: "start" },
    { label: "Monsters", group: "monster" },
    { label: "To pick up", group: "pickup" },
    { label: "Scenery", group: "scenery" },
  ] as const;
  const kinds = GROUPS.map(({ label, group }) => ({ label, options: THING_KINDS.filter((kind) => kind.group === group).map((kind) => ({ value: String(kind.number), label: kind.name })) }));
  const COLOURS = { start: "#5b8def", monster: "#e5484d", pickup: "#46a758", scenery: "#8b8d98" };
  /** The eight ways a thing can face, as the engine keeps them. */
  const FACINGS = [
    { value: "0", label: "→" },
    { value: "45", label: "↗" },
    { value: "90", label: "↑" },
    { value: "135", label: "↖" },
    { value: "180", label: "←" },
    { value: "225", label: "↙" },
    { value: "270", label: "↓" },
    { value: "315", label: "↘" },
  ];
  const modes = [
    { value: "move", label: "Choose and move" },
    { value: "add", label: "Add" },
  ];

  // With no level asked for, the game's first.
  $effect.pre(() => {
    if (!level) level = names[0] ?? "";
  });

  // The level's walls, which don't change, and its things, which are what this is for.
  let map = $state.raw<Level | null>(null);
  let things = $state<Thing[]>([]);
  let chosen = $state(-1);
  let mode = $state<"move" | "add">("move");
  let adding = $state("3004");
  let canvas = $state<HTMLCanvasElement>();
  /** The view: how many screen pixels a unit of the level is, and which point of the level is at the canvas's middle. */
  let view = $state({ scale: 0.1, x: 0, y: 0 });
  let size = $state({ width: 300, height: 300 });

  const original = (name: string) => levelLumps(wad, name)!.get("THINGS")!.lump.data;
  const changed = $derived(saved(level) !== undefined);
  const picked = $derived(things[chosen]);
  const pickedKind = $derived(picked ? thingKind(picked.type) : null);
  const counts = $derived.by(() => {
    const count = (group: string) => things.filter((thing) => thingKind(thing.type).group === group).length;
    return `${things.length} things: ${count("monster")} monsters, ${count("pickup")} to pick up, ${count("start")} starts, ${count("scenery")} scenery.`;
  });

  /** The picture a kind of thing stands as, if the game has one. */
  function pictureOf(sprite: string, frame: string): Asset | undefined {
    const sprites = assets.filter((asset) => asset.kind === "sprite" && asset.name.startsWith(sprite));
    return sprites.find((asset) => asset.name[4] === frame && (asset.name[5] === "0" || asset.name[5] === "1")) ?? sprites.find((asset) => asset.name[4] === frame) ?? sprites[0];
  }

  function fit() {
    if (!map) return;
    const { left, right, top, bottom } = map.bounds;
    view = { scale: Math.min(size.width / (right - left + 128), size.height / (top - bottom + 128)), x: (left + right) / 2, y: (top + bottom) / 2 };
  }

  // Another level is chosen (or this one put back): read it, as it was last kept.
  let shownFor = "";
  $effect(() => {
    if (!level) return;
    const data = saved(level);
    const stamp = `${level}:${data ? "changed" : "own"}`;
    // The things on the map are the truth while they are being changed: only a change from outside (another level, or putting this one back) reads again.
    if (stamp === shownFor) return;
    const first = !shownFor.startsWith(`${level}:`);
    shownFor = stamp;
    map = readLevel(wad, level, data);
    things = map.things.map((thing) => ({ ...thing }));
    if (first) {
      chosen = -1;
      fit();
    }
  });

  /** Keeps the level as it now stands: as a change, or as no change if it is back to how it came. */
  function commit() {
    const data = encodeThings($state.snapshot(things));
    const own = original(level);
    const same = data.length === own.length && data.every((byte, i) => byte === own[i]);
    shownFor = `${level}:${same ? "own" : "changed"}`;
    if (same) restore("things", level);
    else keep({ kind: "things", name: level, data });
  }

  function putBack() {
    restore("things", level);
    chosen = -1;
  }

  /** A change to the chosen thing. */
  function change(to: Partial<Thing>) {
    if (!picked) return;
    // The level has to keep a place for the first player to start.
    if (to.type !== undefined && picked.type === 1 && to.type !== 1 && things.filter((thing) => thing.type === 1).length === 1) return toast("A level needs somewhere for player 1 to start. Add another start before changing this one.", "danger");
    Object.assign(picked, to);
    commit();
  }

  function remove() {
    if (!picked) return;
    if (picked.type === 1 && things.filter((thing) => thing.type === 1).length === 1) return toast("A level needs somewhere for player 1 to start.", "danger");
    things.splice(chosen, 1);
    chosen = -1;
    commit();
  }

  const flag = (bit: number) => !!picked && (picked.flags & bit) !== 0;
  const setFlag = (bit: number, on: boolean) => picked && change({ flags: on ? picked.flags | bit : picked.flags & ~bit });
  /** The engine's eight directions: any other angle in a level is rounded to one. */
  const facing = $derived(picked ? String((((Math.round(picked.angle / 45) * 45) % 360) + 360) % 360) : "0");

  // The map.
  const toScreen = (x: number, y: number) => [size.width / 2 + (x - view.x) * view.scale, size.height / 2 - (y - view.y) * view.scale] as const;
  const toLevel = (px: number, py: number) => [view.x + (px - size.width / 2) / view.scale, view.y - (py - size.height / 2) / view.scale] as const;
  const clamp = (value: number) => Math.max(-32768, Math.min(32767, Math.round(value)));

  $effect(() => {
    const pen = canvas?.getContext("2d");
    if (!pen || !canvas || !map) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    pen.setTransform(ratio, 0, 0, ratio, 0, 0);
    pen.fillStyle = "#101312";
    pen.fillRect(0, 0, size.width, size.height);
    // Edges between rooms first, then what does something, then the walls on top.
    for (const [which, colour, width] of [["edge", "#4a4f4c", 1], ["special", "#e6b84a", 1.5], ["solid", "#e4e2da", 1.5]] as const) {
      pen.strokeStyle = colour;
      pen.lineWidth = width;
      pen.beginPath();
      for (const line of map.lines) {
        if ((which === "solid") !== line.solid || (!line.solid && (which === "special") !== line.special)) continue;
        const [x1, y1] = toScreen(line.x1, line.y1);
        const [x2, y2] = toScreen(line.x2, line.y2);
        pen.moveTo(x1, y1);
        pen.lineTo(x2, y2);
      }
      pen.stroke();
    }
    things.forEach((thing, i) => {
      const kind = thingKind(thing.type);
      const [x, y] = toScreen(thing.x, thing.y);
      const radius = Math.max(3.5, kind.radius * view.scale);
      pen.fillStyle = COLOURS[kind.group];
      pen.globalAlpha = thing.flags & (FLAG_EASY | FLAG_MEDIUM | FLAG_HARD) ? 1 : 0.4;
      pen.beginPath();
      pen.arc(x, y, radius, 0, Math.PI * 2);
      pen.fill();
      pen.globalAlpha = 1;
      // Which way it faces matters for what moves or looks.
      if (kind.group === "monster" || kind.group === "start") {
        const turn = (thing.angle * Math.PI) / 180;
        pen.strokeStyle = "#fff";
        pen.lineWidth = 1.5;
        pen.beginPath();
        pen.moveTo(x, y);
        pen.lineTo(x + Math.cos(turn) * (radius + 3), y - Math.sin(turn) * (radius + 3));
        pen.stroke();
      }
      if (i === chosen) {
        pen.strokeStyle = "#fff";
        pen.lineWidth = 2;
        pen.beginPath();
        pen.arc(x, y, radius + 4, 0, Math.PI * 2);
        pen.stroke();
      }
    });
  });

  /** Fits the canvas to the box the page gives it. */
  function sized(node: HTMLElement) {
    const watcher = new ResizeObserver(([entry]) => {
      const first = size.width === 300 && size.height === 300;
      size = { width: Math.max(50, entry!.contentRect.width), height: Math.max(50, entry!.contentRect.height) };
      if (first) fit();
    });
    watcher.observe(node);
    return { destroy: () => watcher.disconnect() };
  }

  /** The thing under a point of the canvas: the nearest whose circle, or a finger's width round it, the point is in. */
  function thingAt(px: number, py: number): number {
    let best = -1;
    let nearest = Infinity;
    things.forEach((thing, i) => {
      const [x, y] = toScreen(thing.x, thing.y);
      const distance = Math.hypot(px - x, py - y);
      if (distance < Math.max(14, thingKind(thing.type).radius * view.scale + 4) && distance < nearest) {
        nearest = distance;
        best = i;
      }
    });
    return best;
  }

  /** The fingers (or the mouse) on the map, by pointer. */
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { kind: "thing" | "pan"; startX: number; startY: number; moved: boolean } | null = null;
  let pinch = 0;
  const at = (event: PointerEvent | WheelEvent) => {
    const box = canvas!.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top] as const;
  };

  function down(event: PointerEvent) {
    canvas!.setPointerCapture(event.pointerId);
    const [x, y] = at(event);
    pointers.set(event.pointerId, { x, y });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      drag = null;
      return;
    }
    const hit = mode === "move" ? thingAt(x, y) : -1;
    if (hit >= 0) chosen = hit;
    drag = { kind: hit >= 0 ? "thing" : "pan", startX: x, startY: y, moved: false };
  }

  function move(event: PointerEvent) {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const [x, y] = at(event);
    pointers.set(event.pointerId, { x, y });
    if (pointers.size === 2) {
      // Two fingers: closer or further, about the point between them.
      const [a, b] = [...pointers.values()];
      const apart = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinch > 0) zoom(apart / pinch, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      pinch = apart;
      return;
    }
    if (!drag) return;
    if (Math.hypot(x - drag.startX, y - drag.startY) > 5) drag.moved = true;
    if (!drag.moved) return;
    if (drag.kind === "thing" && picked) {
      const [lx, ly] = toLevel(x, y);
      picked.x = clamp(lx);
      picked.y = clamp(ly);
    } else {
      view.x -= (x - last.x) / view.scale;
      view.y += (y - last.y) / view.scale;
    }
  }

  function up(event: PointerEvent) {
    if (!pointers.delete(event.pointerId)) return;
    pinch = 0;
    const was = drag;
    drag = null;
    if (!was || pointers.size > 0) return;
    const [x, y] = at(event);
    if (was.kind === "thing" && was.moved) return commit();
    if (was.moved) return;
    if (mode === "add") {
      // A tap puts one down, as it will be at every skill, facing east.
      const [lx, ly] = toLevel(x, y);
      things.push({ x: clamp(lx), y: clamp(ly), angle: 0, type: Number(adding), flags: FLAG_EASY | FLAG_MEDIUM | FLAG_HARD });
      chosen = things.length - 1;
      commit();
    } else if (was.kind === "pan") chosen = -1;
  }

  function zoom(by: number, px = size.width / 2, py = size.height / 2) {
    const [lx, ly] = toLevel(px, py);
    const scale = Math.max(0.01, Math.min(4, view.scale * by));
    // The point under the pointer stays under it.
    view = { scale, x: lx - (px - size.width / 2) / scale, y: ly + (py - size.height / 2) / scale };
  }

  function wheel(event: WheelEvent) {
    event.preventDefault();
    zoom(event.deltaY < 0 ? 1.2 : 1 / 1.2, ...at(event));
  }

  function keyed(event: KeyboardEvent) {
    const step = event.shiftKey ? 64 : 8;
    const nudge: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (event.key === "[" || event.key === "]") {
      if (!things.length) return;
      chosen = (chosen + (event.key === "]" ? 1 : things.length - 1) + (chosen < 0 ? (event.key === "]" ? 0 : 1) : 0)) % things.length;
      const thing = things[chosen]!;
      // Brought into view, if it isn't.
      const [x, y] = toScreen(thing.x, thing.y);
      if (x < 20 || y < 20 || x > size.width - 20 || y > size.height - 20) view = { ...view, x: thing.x, y: thing.y };
    } else if (nudge[event.key] && picked) change({ x: clamp(picked.x + nudge[event.key]![0]), y: clamp(picked.y + nudge[event.key]![1]) });
    else if ((event.key === "Delete" || event.key === "Backspace") && picked) remove();
    else if (event.key === "Escape") chosen = -1;
    else return;
    event.preventDefault();
  }
</script>

<div class="levels">
  <div class="bar">
    <select-field class="which" label="Level" options={levels} value={level} onvaluechange={(event: News<string>) => (level = event.detail)}></select-field>
    <cluster-layout gap="0.5rem">
      {#if changed}<status-badge variant="primary">Changed</status-badge>{/if}
      <action-button variant="outline" size="sm" disabled={!changed} onclick={putBack}>Put this level back</action-button>
      <action-button size="sm" onclick={() => ontry(level)}>Play this level</action-button>
    </cluster-layout>
  </div>
  <p class="quiet">{counts} Blue is where a player starts, red a monster, green something to pick up, grey scenery; a faint one is left out at every skill. The walls can't be changed here yet.</p>

  <div class="bench">
    <div class="map" use:sized>
      <canvas
        bind:this={canvas}
        tabindex="0"
        aria-label="The level, seen from above. With a thing chosen: arrows move it, Delete takes it away. The square bracket keys choose the thing before or after."
        style:cursor={mode === "add" ? "crosshair" : "grab"}
        onpointerdown={down}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
        onwheel={wheel}
        onkeydown={keyed}
      ></canvas>
      <div class="zoom">
        <action-button variant="outline" size="sm" label="Closer" onclick={() => zoom(1.4)}>+</action-button>
        <action-button variant="outline" size="sm" label="Further" onclick={() => zoom(1 / 1.4)}>−</action-button>
        <action-button variant="outline" size="sm" onclick={fit}>All of it</action-button>
      </div>
    </div>

    <div class="side">
      <segmented-control label="What a tap on the map does" options={modes} value={mode} onvaluechange={(event: News<string>) => (mode = event.detail as "move" | "add")}></segmented-control>
      {#if mode === "add"}
        <select-field label="Add" description="Tap the map where it should go." options={kinds} value={adding} onvaluechange={(event: News<string>) => (adding = event.detail)}></select-field>
      {/if}

      {#if picked && pickedKind}
        {@const picture = pictureOf(pickedKind.sprite, pickedKind.frame)}
        <div class="thing">
          <div class="head">
            {#if picture}
              <span class="thumb"><Thumb kind="sprite" data={wad.lumps[picture.index]!.data} {palette} label="" /></span>
            {/if}
            <strong>{pickedKind.name}</strong>
          </div>
          <select-field label="What it is" options={kinds} value={String(picked.type)} onvaluechange={(event: News<string>) => change({ type: Number(event.detail) })}></select-field>
          <div class="group">
            <span class="label">Facing</span>
            <segmented-control label="Facing" options={FACINGS} value={facing} onvaluechange={(event: News<string>) => change({ angle: Number(event.detail) })}></segmented-control>
          </div>
          <toggle-switch label="In easy games" checked={flag(FLAG_EASY)} oncheckedchange={(event: News<boolean>) => setFlag(FLAG_EASY, event.detail)}></toggle-switch>
          <toggle-switch label="In medium games" checked={flag(FLAG_MEDIUM)} oncheckedchange={(event: News<boolean>) => setFlag(FLAG_MEDIUM, event.detail)}></toggle-switch>
          <toggle-switch label="In hard games" checked={flag(FLAG_HARD)} oncheckedchange={(event: News<boolean>) => setFlag(FLAG_HARD, event.detail)}></toggle-switch>
          {#if pickedKind.group === "monster"}
            <toggle-switch label="Waits in ambush" description="It doesn't come at a noise: only when it sees you." checked={flag(FLAG_AMBUSH)} oncheckedchange={(event: News<boolean>) => setFlag(FLAG_AMBUSH, event.detail)}></toggle-switch>
          {/if}
          <toggle-switch label="Only when playing with others" checked={flag(FLAG_MULTIPLAYER)} oncheckedchange={(event: News<boolean>) => setFlag(FLAG_MULTIPLAYER, event.detail)}></toggle-switch>
          <action-button variant="outline" size="sm" onclick={remove}>Take it away</action-button>
        </div>
      {:else}
        <p class="quiet">{mode === "add" ? "" : "Tap a thing to choose it, and drag it to move it. Drag the map to move about."}</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .levels {
    display: grid;
    gap: 0.75rem;
    width: 100%;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.75rem 1.25rem;
  }
  .bench {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(15rem, 19rem);
    gap: 1rem;
    align-items: start;
  }
  @media (max-width: 46rem) {
    .bench {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .map {
    position: relative;
    height: min(68vh, 40rem);
    border-radius: var(--radius);
    overflow: hidden;
    background: #101312;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    /* The map is moved by the finger on it, not the page under it. */
    touch-action: none;
  }
  canvas:focus-visible {
    outline: 3px solid var(--ring);
    outline-offset: -3px;
  }
  .zoom {
    position: absolute;
    right: 0.5rem;
    bottom: 0.5rem;
    display: flex;
    gap: 0.35rem;
  }
  .side,
  .thing {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
  }
  .thing {
    width: 100%;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .head .thumb {
    width: 3.5rem;
    height: 3.5rem;
    flex: none;
  }
  .group {
    display: grid;
    gap: 0.4rem;
  }
  .label {
    font-size: 0.9rem;
    font-weight: 600;
  }
</style>
