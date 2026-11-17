<!--
  A level, seen from above, to change: what is placed in it (where the players start, the
  monsters, what can be picked up, the scenery) and what it is built of (its corners, its walls,
  its rooms).

  Things are moved, added, changed and taken away. Corners are dragged, and the walls that meet at
  one go with it; a wall is split, given pictures, made a door or a switch; a room's floor,
  ceiling and light are set; and rooms are added, inside a room or on the far side of a wall.
  After each change to what the level is built of, the node builder (wad/nodes.ts) is run on it,
  and the result is what is kept: a level that can be played.

  The map is a canvas: drag it to move about, pinch or use the wheel to come closer. Everything a
  pointer does to a thing can also be done from the panel beside the map, and from the keyboard
  with the map in focus (arrows move the chosen thing or corner, [ and ] choose the thing before or
  after, Delete takes a thing away, Ctrl+Z undoes a change to the walls).
-->
<script lang="ts">
  import type { Asset, Kind } from "../../wad/catalogue.ts";
  import { choices, ROOM_DOES, WALL_DOES } from "../../wad/does.ts";
  import { encodeShape, encodeThings, FLAG_AMBUSH, FLAG_EASY, FLAG_HARD, FLAG_MEDIUM, FLAG_MULTIPLAYER, levelLumps, levelNames, readLevel, type Room, SHAPE_LUMPS, type Shape, type Side, type Thing, THING_KINDS, thingKind, WALL_BLOCKS, WALL_BLOCKS_MONSTERS, WALL_BLOCKS_SOUND, WALL_SECRET } from "../../wad/level.ts";
  import { type Change, wallLumps } from "../../wad/mod.ts";
  import { buildLevel } from "../../wad/nodes.ts";
  import { addDoor, addRoomBeyond, addRoomInside, emptyLevel, lookOf, moveCorner, removeCorner, removeRoom, roomAt, roomTrouble, snap, splitWall, wallsAt } from "../../wad/shape.ts";
  import type { Palette, Picture } from "../../wad/picture.ts";
  import type { Wad } from "../../wad/wad.ts";
  import Shown from "./Shown.svelte";
  import Thumb from "./Thumb.svelte";

  type News<T> = CustomEvent<T>;

  let {
    wad,
    assets,
    palette,
    level = $bindable(""),
    wallPictures,
    wallPicture,
    builder,
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
    /** The names of the pictures a wall can have. */
    wallPictures: string[];
    /** What a wall picture looks like, by name; null for none. */
    wallPicture: (name: string) => Picture | null;
    /** The node builder, compiled: fetched the first time it is wanted. */
    builder: () => Promise<WebAssembly.Module>;
    /** A level's things, or its walls, as they were last kept, if they have been changed. */
    saved: (kind: "things" | "walls", level: string) => Uint8Array | undefined;
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
    { value: "move", label: "Things" },
    { value: "add", label: "Add a thing" },
    { value: "build", label: "Walls" },
  ];
  const pictures = $derived([{ value: "-", label: "Nothing" }, ...wallPictures.map((name) => ({ value: name, label: name }))]);
  const flats = $derived(assets.filter((asset) => asset.kind === "floor").map((asset) => ({ value: asset.name, label: asset.note ? `${asset.name}: ${asset.note}` : asset.name })));
  /** The choices, and what is there now if it isn't one of them. */
  const withNow = (options: { value: string; label: string }[], now: string) => (options.some((option) => option.value === now) ? options : [...options, { value: now, label: now }]);

  // With no level asked for, the game's first.
  $effect.pre(() => {
    if (!level) level = names[0] ?? "";
  });

  // What the level is built of, and what is placed in it. The shape is changed in place, and
  // `drawn` counted up each time, which is what the map and the panel watch.
  let shape = $state.raw<Shape | null>(null);
  let drawn = $state(0);
  let things = $state<Thing[]>([]);
  let chosen = $state(-1);
  /** A corner, a wall or a room, chosen; for a room, where it was tapped. */
  let part = $state<{ kind: "corner" | "wall" | "room"; index: number; x: number; y: number } | null>(null);
  /** The shape as it was before each change to it, to go back to. */
  let undo = $state.raw<Shape[]>([]);
  let building = $state(false);
  /** Why the level as it stands can't be built, if it can't. */
  let broken = $state("");
  let mode = $state<"move" | "add" | "build">("move");
  /** Asking whether to start the level again, empty. */
  let emptying = $state(false);
  /** Corners can be told apart, and so chosen, from this close. */
  const CLOSE = 0.3;
  let adding = $state("3004");
  let canvas = $state<HTMLCanvasElement>();
  /** The view: how many screen pixels a unit of the level is, and which point of the level is at the canvas's middle. */
  let view = $state({ scale: 0.1, x: 0, y: 0 });
  let size = $state({ width: 300, height: 300 });

  const original = (name: string) => levelLumps(wad, name)!.get("THINGS")!.lump.data;
  const changed = $derived(saved("things", level) !== undefined || saved("walls", level) !== undefined);
  const corner = $derived.by(() => {
    void drawn;
    return part?.kind === "corner" && shape ? { ...shape.corners[part.index]! } : null;
  });
  const wall = $derived.by(() => {
    void drawn;
    return part?.kind === "wall" && shape ? { ...shape.walls[part.index]! } : null;
  });
  const front = $derived.by(() => {
    void drawn;
    return wall && shape ? { ...shape.sides[wall.front]! } : null;
  });
  const back = $derived.by(() => {
    void drawn;
    return wall && shape && wall.back >= 0 ? { ...shape.sides[wall.back]! } : null;
  });
  const room = $derived.by(() => {
    void drawn;
    return part?.kind === "room" && shape ? { ...shape.rooms[part.index]! } : null;
  });
  const wallLength = $derived(wall && shape ? Math.round(Math.hypot(shape.corners[wall.to]!.x - shape.corners[wall.from]!.x, shape.corners[wall.to]!.y - shape.corners[wall.from]!.y)) : 0);
  /** How many walls meet at the chosen corner: two can be made one. */
  const meeting = $derived.by(() => {
    void drawn;
    return part?.kind === "corner" && shape ? wallsAt(shape, part.index).length : 0;
  });
  /** A floor or ceiling's picture, by name. */
  const flatPicture = (name: string): Picture | null => {
    const asset = assets.find((one) => one.kind === "floor" && one.name === name);
    const data = asset && wad.lumps[asset.index]!.data;
    return data && data.length >= 4096 ? { width: 64, height: 64, left: 0, top: 0, pixels: data.subarray(0, 4096), solid: new Uint8Array(4096).fill(1) } : null;
  };
  const built = $derived.by(() => {
    void drawn;
    return shape ? `${shape.walls.length} walls round ${shape.rooms.length === 1 ? "one room" : `${shape.rooms.length} rooms`}.` : "";
  });
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
    if (!shape) return;
    const used = shape.walls.flatMap((one) => [shape!.corners[one.from]!, shape!.corners[one.to]!]);
    const [left, right, bottom, top] = [Math.min(...used.map((at) => at.x)), Math.max(...used.map((at) => at.x)), Math.min(...used.map((at) => at.y)), Math.max(...used.map((at) => at.y))];
    view = { scale: Math.min(size.width / (right - left + 128), size.height / (top - bottom + 128)), x: (left + right) / 2, y: (top + bottom) / 2 };
  }

  // Another level is chosen (or this one put back): read it, as it was last kept.
  let shownFor = "";
  const stampOf = (name: string, placed: boolean, walls: boolean) => `${name}:${placed ? "changed" : "own"}:${walls ? "changed" : "own"}`;
  $effect(() => {
    if (!level) return;
    const [placed, walls] = [saved("things", level), saved("walls", level)];
    const stamp = stampOf(level, !!placed, !!walls);
    // The level on the map is the truth while it is being changed: only a change from outside (another level, or putting this one back) reads again.
    if (stamp === shownFor) return;
    const first = !shownFor.startsWith(`${level}:`);
    shownFor = stamp;
    const lumps = walls && wallLumps(walls);
    const read = readLevel(wad, level, placed, lumps ? Object.fromEntries(SHAPE_LUMPS.map((name) => [name, lumps.get(name)])) : undefined);
    shape = read.shape;
    things = read.things.map((thing) => ({ ...thing }));
    part = null;
    undo = [];
    broken = "";
    drawn++;
    if (first) {
      chosen = -1;
      fit();
    }
  });

  const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);

  /** Keeps what is placed in the level as it now stands: as a change, or as no change if it is back to how it came. */
  function commit() {
    const data = encodeThings($state.snapshot(things));
    const same = sameBytes(data, original(level));
    shownFor = stampOf(level, !same, saved("walls", level) !== undefined);
    if (same) restore("things", level);
    else keep({ kind: "things", name: level, data });
  }

  /** Counted up by each change to the walls: a build that finds a later one has started gives way to it. */
  let run = 0;
  /** The build under way, for "Play this level" to wait for. */
  let settled: Promise<void> = Promise.resolve();

  /**
   * Keeps what the level is built of as it now stands, once the node builder has been run on it:
   * a moment after the last change, so that a drag or a number being typed is built once.
   */
  function rebuild() {
    const mine = ++run;
    const name = level;
    if (!shape) return;
    // As it stands now: by the time it is built, another level may be on the map.
    const now = structuredClone(shape);
    const placed = encodeThings($state.snapshot(things));
    building = true;
    settled = (async () => {
      await new Promise((done) => setTimeout(done, 250));
      // Another change to this level has come: its build is the one that counts. (A change to another level doesn't stop this one being kept.)
      const stale = () => mine !== run && name === level;
      if (stale()) return;
      try {
        const lumps = encodeShape(now);
        const own = encodeShape(readLevel(wad, name).shape);
        if (SHAPE_LUMPS.every((lump) => sameBytes(lumps[lump], own[lump]))) {
          if (name === level) shownFor = stampOf(name, saved("things", name) !== undefined, false);
          restore("walls", name);
        } else {
          const data = await buildLevel(await builder(), name, now, placed);
          if (stale()) return;
          if (name === level) shownFor = stampOf(name, saved("things", name) !== undefined, true);
          keep({ kind: "walls", name, data });
        }
        if (mine === run) broken = "";
      } catch (error) {
        if (mine === run) broken = (error as Error).message;
      } finally {
        if (mine === run) building = false;
      }
    })();
  }

  /**
   * A change to what the level is built of: made, drawn and built, or refused with why. Changes
   * that share a `run` and come one on another's heels (a number being typed) are one to undo.
   */
  let lastRun = "";
  let lastAt = 0;
  function reshape(act: (shape: Shape) => string | null | void, together = "") {
    if (!shape) return;
    const before = structuredClone(shape);
    const why = act(shape);
    if (why) return void toast(why, "danger");
    const now = performance.now();
    if (!together || together !== lastRun || now - lastAt > 1500) undo = [...undo.slice(-29), before];
    lastRun = together;
    lastAt = now;
    drawn++;
    rebuild();
  }

  function goBack() {
    const before = undo.at(-1);
    if (!before) return;
    undo = undo.slice(0, -1);
    shape = before;
    part = null;
    lastRun = "";
    drawn++;
    rebuild();
  }

  function putBack() {
    run++;
    building = false;
    restore("things", level);
    restore("walls", level);
    chosen = -1;
  }

  /** Plays the level once it is built as it stands; not at all if it can't be. */
  async function play() {
    await settled;
    if (broken) return toast(`This level can't be played as it stands: ${broken}`, "danger");
    ontry(level);
  }

  const whole = (text: string) => Math.max(-32768, Math.min(32767, Math.round(Number(text) || 0)));
  /** A change to the chosen room. */
  const setRoom = (to: Partial<Room>, together = "") => part && reshape((now) => roomTrouble({ ...now.rooms[part!.index]!, ...to }) ?? void Object.assign(now.rooms[part!.index]!, to), together);
  /** A change to one side of the chosen wall. */
  const setSide = (which: "front" | "back", to: Partial<Side>) => part && reshape((now) => void Object.assign(now.sides[now.walls[part!.index]![which]]!, to));
  const setWall = (to: { special?: number; tag?: number; flags?: number }, together = "") => part && reshape((now) => void Object.assign(now.walls[part!.index]!, to), together);
  const wallFlag = (bit: number, on: boolean) => wall && setWall({ flags: on ? wall.flags | bit : wall.flags & ~bit });

  function split() {
    if (part?.kind !== "wall") return;
    const at = part.index;
    reshape((now) => {
      const made = splitWall(now, at);
      if (typeof made === "string") return made;
      part = { kind: "corner", index: made, x: 0, y: 0 };
    });
  }

  function roomBeyond() {
    if (part?.kind !== "wall") return;
    const at = part.index;
    reshape((now) => {
      const made = addRoomBeyond(now, at, Math.max(64, Math.min(256, snap(wallLength))));
      if (typeof made === "string") return made;
      part = { kind: "room", index: made, x: 0, y: 0 };
    });
  }

  function takeRoom() {
    if (part?.kind !== "room") return;
    const at = part.index;
    reshape((now) => {
      const why = removeRoom(now, at, $state.snapshot(things));
      if (!why) part = null;
      return why;
    });
  }

  function takeCorner() {
    if (part?.kind !== "corner") return;
    const at = part.index;
    reshape((now) => {
      const why = removeCorner(now, at);
      if (!why) part = null;
      return why;
    });
  }

  /** The level again from one empty room, made of what the level was mostly made of, with only the players' starts in it. */
  function empty() {
    emptying = false;
    if (!shape) return;
    const fresh = emptyLevel(lookOf(shape));
    things = fresh.things;
    chosen = -1;
    commit();
    reshape(() => {
      shape = fresh.shape;
      part = null;
    });
    // Not something to undo a step at a time: "Put this level back" is the way back.
    undo = [];
    mode = "build";
    fit();
  }

  /** A door picture the game has, for a new door to wear. */
  const doorPicture = $derived(["BIGDOOR2", "DOOR3", "DOOR1"].find((name) => wallPictures.includes(name)));
  function door() {
    if (part?.kind !== "wall") return;
    const at = part.index;
    reshape((now) => {
      const made = addDoor(now, at, Math.max(64, Math.min(256, snap(wallLength))), doorPicture);
      if (typeof made === "string") return made;
      part = { kind: "room", index: made, x: 0, y: 0 };
    });
  }

  function roomInside() {
    if (part?.kind !== "room") return;
    const { x, y } = part;
    reshape((now) => {
      const made = addRoomInside(now, x, y);
      if (typeof made === "string") return made;
      part = { kind: "room", index: made, x, y };
    });
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
    void drawn;
    if (!pen || !canvas || !shape) return;
    const built = shape;
    const edit = mode === "build";
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
      for (const one of built.walls) {
        const solid = one.back < 0;
        if ((which === "solid") !== solid || (!solid && (which === "special") !== (one.special !== 0))) continue;
        const [x1, y1] = toScreen(built.corners[one.from]!.x, built.corners[one.from]!.y);
        const [x2, y2] = toScreen(built.corners[one.to]!.x, built.corners[one.to]!.y);
        pen.moveTo(x1, y1);
        pen.lineTo(x2, y2);
      }
      pen.stroke();
    }
    if (edit) {
      // What is chosen: a room's walls, or one wall with a tick on its front; and every corner, once close enough to tell them apart.
      const lit = built.walls.filter((one, index) => (part?.kind === "wall" ? index === part.index : part?.kind === "room" && (built.sides[one.front]!.room === part.index || (one.back >= 0 && built.sides[one.back]!.room === part.index))));
      pen.strokeStyle = "#3ec5ff";
      pen.lineWidth = 3;
      pen.beginPath();
      for (const one of lit) {
        const [x1, y1] = toScreen(built.corners[one.from]!.x, built.corners[one.from]!.y);
        const [x2, y2] = toScreen(built.corners[one.to]!.x, built.corners[one.to]!.y);
        pen.moveTo(x1, y1);
        pen.lineTo(x2, y2);
        if (part?.kind === "wall") {
          const far = Math.hypot(x2 - x1, y2 - y1) || 1;
          pen.moveTo((x1 + x2) / 2, (y1 + y2) / 2);
          pen.lineTo((x1 + x2) / 2 - ((y2 - y1) / far) * 9, (y1 + y2) / 2 + ((x2 - x1) / far) * 9);
        }
      }
      pen.stroke();
      if (view.scale > CLOSE) {
        pen.fillStyle = "#e4e2da";
        for (const one of built.walls) for (const at of [built.corners[one.from]!, built.corners[one.to]!]) pen.fillRect(toScreen(at.x, at.y)[0] - 2, toScreen(at.x, at.y)[1] - 2, 4, 4);
      }
      if (part?.kind === "corner") {
        const [x, y] = toScreen(built.corners[part.index]!.x, built.corners[part.index]!.y);
        pen.fillStyle = "#3ec5ff";
        pen.fillRect(x - 5, y - 5, 10, 10);
      }
    }
    things.forEach((thing, i) => {
      const kind = thingKind(thing.type);
      const [x, y] = toScreen(thing.x, thing.y);
      const radius = Math.max(3.5, kind.radius * view.scale);
      pen.fillStyle = COLOURS[kind.group];
      // With the walls being changed, what is placed is only there to see.
      pen.globalAlpha = edit ? 0.3 : thing.flags & (FLAG_EASY | FLAG_MEDIUM | FLAG_HARD) ? 1 : 0.4;
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
      if (i === chosen && !edit) {
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

  /** The corner under a point of the canvas, within a finger's width; -1 for none. */
  function cornerAt(px: number, py: number): number {
    // From far off they are too close together to tell apart: a tap there is for a wall or a room.
    if (view.scale <= CLOSE) return -1;
    let best = -1;
    let nearest = 14;
    for (const one of shape?.walls ?? [])
      for (const index of [one.from, one.to]) {
        const [x, y] = toScreen(shape!.corners[index]!.x, shape!.corners[index]!.y);
        const distance = Math.hypot(px - x, py - y);
        if (distance < nearest) [nearest, best] = [distance, index];
      }
    return best;
  }

  /** The wall under a point of the canvas, within a finger's width; -1 for none. */
  function wallAt(px: number, py: number): number {
    let best = -1;
    let nearest = 12;
    shape?.walls.forEach((one, index) => {
      const [x1, y1] = toScreen(shape!.corners[one.from]!.x, shape!.corners[one.from]!.y);
      const [x2, y2] = toScreen(shape!.corners[one.to]!.x, shape!.corners[one.to]!.y);
      const along = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2 || 1)));
      const distance = Math.hypot(px - (x1 + (x2 - x1) * along), py - (y1 + (y2 - y1) * along));
      if (distance < nearest) [nearest, best] = [distance, index];
    });
    return best;
  }

  /** The fingers (or the mouse) on the map, by pointer. */
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { kind: "thing" | "corner" | "pan"; startX: number; startY: number; moved: boolean; before?: Shape } | null = null;
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
    if (mode === "build") {
      const found = cornerAt(x, y);
      if (found >= 0) part = { kind: "corner", index: found, x: 0, y: 0 };
      drag = { kind: found >= 0 ? "corner" : "pan", startX: x, startY: y, moved: false };
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
    } else if (drag.kind === "corner" && part && shape) {
      // To the grid; a place that would make walls cross is passed over, and the corner waits where it last could be.
      drag.before ??= structuredClone(shape);
      const [lx, ly] = toLevel(x, y);
      if (!moveCorner(shape, part.index, clamp(snap(lx)), clamp(snap(ly)))) drawn++;
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
    if (was.kind === "corner" && was.moved) {
      if (was.before && shape && SHAPE_LUMPS.some((lump) => !sameBytes(encodeShape(was.before!)[lump], encodeShape(shape!)[lump]))) {
        undo = [...undo.slice(-29), was.before];
        lastRun = "";
        rebuild();
      }
      return;
    }
    if (was.moved) return;
    if (mode === "build") {
      // A tap: the corner it was on is chosen already; otherwise the wall under it, or the room.
      if (was.kind === "corner" || !shape) return;
      const [lx, ly] = toLevel(x, y);
      const on = wallAt(x, y);
      const inside = on < 0 ? roomAt(shape, lx, ly) : -1;
      part = on >= 0 ? { kind: "wall", index: on, x: lx, y: ly } : inside >= 0 ? { kind: "room", index: inside, x: lx, y: ly } : null;
      return;
    }
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
    if (mode === "build") {
      if (nudge[event.key] && part?.kind === "corner") {
        const at = part.index;
        reshape((now) => moveCorner(now, at, clamp(now.corners[at]!.x + nudge[event.key]![0]), clamp(now.corners[at]!.y + nudge[event.key]![1])), `corner ${at}`);
      } else if (event.key === "z" && (event.ctrlKey || event.metaKey)) goBack();
      else if (event.key === "Escape") part = null;
      else return;
      return void event.preventDefault();
    }
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
      <action-button variant="outline" size="sm" onclick={() => (emptying = true)}>Start it again, empty</action-button>
      <action-button size="sm" onclick={play}>Play this level</action-button>
    </cluster-layout>
  </div>
  {#if mode === "build"}
    <p class="quiet">{built} White is a wall with nothing behind it, grey an opening between two rooms, yellow one that does something.</p>
  {:else}
    <p class="quiet">{counts} Blue is where a player starts, red a monster, green something to pick up, grey scenery; a faint one is left out at every skill.</p>
  {/if}

  <div class="bench">
    <div class="map" use:sized>
      <canvas
        bind:this={canvas}
        tabindex="0"
        aria-label="The level, seen from above. With a thing chosen: arrows move it, Delete takes it away. The square bracket keys choose the thing before or after. With a corner chosen: arrows move it."
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
      <segmented-control label="What a tap on the map does" options={modes} value={mode} onvaluechange={(event: News<string>) => (mode = event.detail as "move" | "add" | "build")}></segmented-control>
      {#if mode === "add"}
        <select-field label="Add" description="Tap the map where it should go." options={kinds} value={adding} onvaluechange={(event: News<string>) => (adding = event.detail)}></select-field>
      {/if}

      {#if mode === "build"}
        <cluster-layout gap="0.5rem">
          <action-button variant="outline" size="sm" disabled={!undo.length} onclick={goBack}>Undo</action-button>
          {#if building}<status-badge>Building the level…</status-badge>{/if}
        </cluster-layout>
        {#if broken}
          <alert-banner variant="danger" heading="This can't be played as it stands">{broken} Undo, or change it until it can; nothing is kept until then.</alert-banner>
        {/if}
        {#if corner}
          <div class="thing">
            <strong>A corner</strong>
            <p class="quiet">At {corner.x}, {corner.y}. Drag it to move it, or use the arrow keys; the walls that meet here go with it.</p>
            {#if meeting === 2}<action-button variant="outline" size="sm" onclick={takeCorner}>Take it away</action-button>{/if}
          </div>
        {:else if wall && front}
          <div class="thing">
            <strong>{back ? "An opening between two rooms" : "A wall"}, {wallLength} long</strong>
            {#if back}
              <p class="quiet">The tick on the map is its front. Each side has a picture above the opening, where the next room's ceiling is lower, and below it, where its floor is higher.</p>
              <div class="pick"><Shown picture={wallPicture(front.upper)} {palette} /><select-field class="front-upper" label="Front, above the opening" options={withNow(pictures, front.upper)} value={front.upper} onvaluechange={(event: News<string>) => setSide("front", { upper: event.detail })}></select-field></div>
              <div class="pick"><Shown picture={wallPicture(front.lower)} {palette} /><select-field class="front-lower" label="Front, below the opening" options={withNow(pictures, front.lower)} value={front.lower} onvaluechange={(event: News<string>) => setSide("front", { lower: event.detail })}></select-field></div>
              <div class="pick"><Shown picture={wallPicture(back.upper)} {palette} /><select-field label="Back, above the opening" options={withNow(pictures, back.upper)} value={back.upper} onvaluechange={(event: News<string>) => setSide("back", { upper: event.detail })}></select-field></div>
              <div class="pick"><Shown picture={wallPicture(back.lower)} {palette} /><select-field label="Back, below the opening" options={withNow(pictures, back.lower)} value={back.lower} onvaluechange={(event: News<string>) => setSide("back", { lower: event.detail })}></select-field></div>
              <div class="pick"><Shown picture={wallPicture(front.middle)} {palette} /><select-field label="Across the opening" description="Something seen through: bars, a grate. Mostly nothing." options={withNow(pictures, front.middle)} value={front.middle} onvaluechange={(event: News<string>) => (setSide("front", { middle: event.detail }), setSide("back", { middle: event.detail }))}></select-field></div>
            {:else}
              <div class="pick"><Shown picture={wallPicture(front.middle)} {palette} /><select-field class="wall-picture" label="Its picture" options={withNow(pictures, front.middle)} value={front.middle} onvaluechange={(event: News<string>) => setSide("front", { middle: event.detail })}></select-field></div>
            {/if}
            <select-field class="wall-does" label="What it does" options={choices(WALL_DOES, wall.special)} value={String(wall.special)} onvaluechange={(event: News<string>) => setWall({ special: Number(event.detail) })}></select-field>
            {#if WALL_DOES.find((one) => one.number === wall.special)?.tagged ?? wall.special !== 0}
              <text-field class="wall-tag" type="number" inputmode="numeric" required label="Which rooms it does it to" description="The rooms with this number." value={String(wall.tag)} onvaluechange={(event: News<string>) => setWall({ tag: Math.max(0, whole(event.detail)) }, "wall tag")}></text-field>
            {/if}
            {#if back}
              <toggle-switch label="Nothing can cross it" checked={(wall.flags & WALL_BLOCKS) !== 0} oncheckedchange={(event: News<boolean>) => wallFlag(WALL_BLOCKS, event.detail)}></toggle-switch>
              <toggle-switch label="Monsters can't cross it" checked={(wall.flags & WALL_BLOCKS_MONSTERS) !== 0} oncheckedchange={(event: News<boolean>) => wallFlag(WALL_BLOCKS_MONSTERS, event.detail)}></toggle-switch>
              <toggle-switch label="Sound doesn't pass" checked={(wall.flags & WALL_BLOCKS_SOUND) !== 0} oncheckedchange={(event: News<boolean>) => wallFlag(WALL_BLOCKS_SOUND, event.detail)}></toggle-switch>
              <toggle-switch label="Looks like a plain wall on the player's map" description="For a hidden door." checked={(wall.flags & WALL_SECRET) !== 0} oncheckedchange={(event: News<boolean>) => wallFlag(WALL_SECRET, event.detail)}></toggle-switch>
            {/if}
            <cluster-layout gap="0.5rem">
              <action-button variant="outline" size="sm" onclick={split}>Split it in two</action-button>
              {#if !back}
                <action-button variant="outline" size="sm" onclick={roomBeyond}>Add a room behind it</action-button>
                <action-button variant="outline" size="sm" onclick={door}>Add a door, and a room behind it</action-button>
              {/if}
            </cluster-layout>
          </div>
        {:else if room && part}
          <div class="thing">
            <strong>A room</strong>
            <text-field class="room-floor" type="number" inputmode="numeric" required label="Floor height" description="A step up of more than 24 can't be climbed." value={String(room.floor)} onvaluechange={(event: News<string>) => setRoom({ floor: whole(event.detail) }, "floor")}></text-field>
            <text-field class="room-ceiling" type="number" inputmode="numeric" required label="Ceiling height" description="A player is 56 tall." value={String(room.ceiling)} onvaluechange={(event: News<string>) => setRoom({ ceiling: whole(event.detail) }, "ceiling")}></text-field>
            <div class="pick"><Shown picture={flatPicture(room.floorFlat)} {palette} /><select-field label="Floor" options={withNow(flats, room.floorFlat)} value={room.floorFlat} onvaluechange={(event: News<string>) => setRoom({ floorFlat: event.detail })}></select-field></div>
            <div class="pick"><Shown picture={flatPicture(room.ceilingFlat)} {palette} /><select-field label="Ceiling" description="F_SKY1 is the open sky." options={withNow(flats, room.ceilingFlat)} value={room.ceilingFlat} onvaluechange={(event: News<string>) => setRoom({ ceilingFlat: event.detail })}></select-field></div>
            <range-slider class="room-light" label="Light" min={0} max={255} step={16} value={Math.min(255, room.light)} onvaluechange={(event: News<number>) => setRoom({ light: Math.min(255, event.detail) }, "light")}></range-slider>
            <select-field label="What it does" options={choices(ROOM_DOES, room.special)} value={String(room.special)} onvaluechange={(event: News<string>) => setRoom({ special: Number(event.detail) })}></select-field>
            <text-field type="number" inputmode="numeric" required label="Its number" description="A switch or a door acts on the rooms with its number. 0 for none." value={String(room.tag)} onvaluechange={(event: News<string>) => setRoom({ tag: Math.max(0, whole(event.detail)) }, "room tag")}></text-field>
            <action-button variant="outline" size="sm" onclick={roomInside}>Add a room inside it, here</action-button>
            <p class="quiet">The new room starts the same as this one. Give it a higher floor for a platform, a lower one for a pit.</p>
            <action-button variant="outline" size="sm" onclick={takeRoom}>Take this room away</action-button>
          </div>
        {:else}
          <p class="quiet">Tap a wall or the floor of a room. {view.scale > CLOSE ? "Tap a corner to choose it, and drag it to move it." : "Come closer to choose and move corners."} Drag the map to move about.</p>
        {/if}
      {:else if picked && pickedKind}
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

<modal-dialog open={emptying} label="Start {level} again, empty?" onopenchange={(event: News<boolean>) => (emptying = event.detail)}>
  <p>Everything in this level goes, and it is one empty room with the players' starts in it: somewhere to build a level of your own. "Put this level back" brings the game's level back.</p>
  <cluster-layout slot="actions" gap="0.6rem">
    <action-button variant="outline" size="sm" data-close>Keep it as it is</action-button>
    <action-button variant="destructive" size="sm" onclick={empty}>Start it again, empty</action-button>
  </cluster-layout>
</modal-dialog>

<style>
  .pick {
    display: flex;
    align-items: end;
    gap: 0.6rem;
    width: 100%;
  }
  .pick > :global(select-field) {
    flex: 1;
    min-width: 0;
  }
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
