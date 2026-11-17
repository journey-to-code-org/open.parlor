// One table for every game on the table-sports kit, as KitTable is for the card games and
// BoardTable for the board games. The engine's view says everything: the physics world and how
// to draw it, whose shot it is, what this seat may strike, and the last shot taken. This draws it
// on a canvas fitted to the screen, lets you aim, and plays each shot.
//
// Aiming is a slingshot: press anywhere on the table, pull back, let go. The ball goes the
// opposite way to the pull, harder the further you pulled; pull back to where you started (or
// press Escape) to call it off. It doesn't matter where the thumb goes down, so the ball is never
// under it. The same aim can be set with the arrow keys or the buttons under the table, and it is
// read out as it changes. However it was aimed, what is sent is a whole-number angle and power:
// the pointer maths is free to be approximate because the shot isn't.
//
// A shot is played by stepping the same simulation the server ran (see roll.ts), with sounds from
// its events as they happen. While it rolls, the scores, the story and the sheets stay as they
// were: nobody is told the putt dropped before they have watched it drop. When it stops the
// screen shows the server's table, and a check confirms that is where the roll ended.
import { angleTo, kitGame, UNITS_PER_METRE, type SportBody, type SportCard, type SportView } from "@journey-to-code/games";
import { type TableSettings } from "@journey-to-code/rules";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bubble, TableChat, useBubbles, type ChatProps } from "../Chat";
import { Confetti } from "../Confetti";
import { loadFeedbackSettings, play, saveFeedbackSettings } from "../feedback/sounds";
import { named, ResultTable } from "../kit/KitTable";
import { viewSetting, wants3d } from "../display";
import { reducedMotion } from "../motion";
import { TableSettingsButton } from "../TableSettings";
import { drawOverlay, drawScene, playFrame, powerColour, toneColour, type Aim, type Disc, type Effect } from "./draw";
import { drawsIn3d, loadSport3d, type Sport3d } from "./scene3d";
import { fitFrame, TILT, unprojectVector, type Projection } from "./projection";
import { advanceRoll, beginRoll, finishRoll, landed, type Roll } from "./roll";
import { AIM_LIMIT, guideOf, readSwipe, sideways, type Throw, type Touch } from "./throw";
import type { Point } from "@journey-to-code/physics";
import { SoundButton } from "../SoundButton";

export interface SportTableProps {
  view: SportView;
  names: string[];
  /** Resolves to an error message when the move is refused. */
  act: (move: Record<string, unknown>) => Promise<string | null>;
  onLeave: () => void;
  banner?: React.ReactNode;
  chat?: ChatProps;
  /** Several people share this screen and take turns at it: say whose turn it is by name, not "your". */
  together?: boolean;
  settings?: {
    value: TableSettings;
    change: (next: TableSettings) => Promise<void> | void;
  };
}

/** An aim, in the numbers that are sent: hundredths of a degree and a power within the view's range; and, where the game takes them, side spin and a place to start from. */
interface AimAt {
  angle: number;
  power: number;
  spin?: number;
  at?: number;
  /** A called shot (pool): the ball and the pocket. */
  call?: { ball: string; pocket: string } | null;
}
/** A finger on a bowling lane: a sideways drag (where to stand) or a swipe up it (the throw). */
interface Swipe {
  pointer: number;
  path: Touch[];
  mode: "unsure" | "stand" | "throw";
  /** Where the bowler stood when the drag began. */
  from: number;
}
/** A finger down on the table, pulling. */
interface Pull {
  pointer: number;
  x: number;
  y: number;
  /** The aim before the pull began, to go back to if it is called off. */
  before: AimAt;
  cancel: boolean;
}

/** A pull shorter than this (CSS pixels) is no pull: letting go there does nothing. */
const CANCEL_ZONE = 16;
const wrap = (angle: number) => ((Math.round(angle) % 36000) + 36000) % 36000;
const GHOST_MS = 320;
/** How long a ball is seen going into a tunnel. */
const GONE_MS = 200;

/** The body a view lets you strike, where it lies. */
const strikable = (v: SportView) => (v.shoot ? (v.table.world.bodies.find((b) => b.id === v.shoot!.body) ?? null) : null);

/** The nearest pocket to a point: what "straight at the cup" means. */
function nearestPocket(v: SportView, from: { x: number; y: number }) {
  let best: { x: number; y: number } | null = null;
  let least = Infinity;
  for (const p of v.table.world.pockets) {
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    if (d < least) [best, least] = [p, d];
  }
  return best ? { ...best, far: least } : null;
}

const metres = (units: number) => {
  const m = units / UNITS_PER_METRE;
  return m < 1 ? `${Math.round(m * 100)} centimetres` : `${m.toFixed(1)} metres`;
};

/** An aim in words, for a screen reader and the line under the table: where it points relative to the hole, and how hard. */
function aimWords(v: SportView, aim: AimAt): { short: string; long: string } {
  const ball = strikable(v);
  const shoot = v.shoot;
  if (!ball || !shoot) return { short: "", long: "" };
  const hole = v.table.look.pockets === "cup" ? "the cup" : "the nearest pocket";
  const pocket = nearestPocket(v, ball);
  const percent = Math.round((aim.power / 1000) * 100);
  if (!pocket) return { short: `${(aim.angle / 100).toFixed(1)}° · ${percent}%`, long: `Aim ${(aim.angle / 100).toFixed(1)} degrees, power ${percent} percent.` };
  // Left and right as the player sees them, looking along the aim.
  const off = ((aim.angle - angleTo(ball, pocket) + 54000) % 36000) - 18000;
  const by = Math.abs(off) / 100;
  const where = Math.abs(off) < 5 ? `Straight at ${hole}` : `${by < 10 ? by.toFixed(1) : Math.round(by)}° ${off < 0 ? "left" : "right"} of ${hole}`;
  return { short: `${where} · ${percent}%`, long: `${where.replace("°", " degrees")}, power ${percent} percent. ${hole[0]!.toUpperCase()}${hole.slice(1)} is ${metres(pocket.far)} away.` };
}

/** A game whose shot starts anywhere along a line, aimed any way: pool with the cue ball in hand, and Carrom's striker on its baseline. (Bowling's line is a throw: aimed up the lane.) */
const onLine = (game: string) => game === "billiards" || game === "carrom";

export function SportTable({ view, names, act, onLeave, banner, chat, together, settings }: SportTableProps) {
  const game = kitGame(view.game)!;
  const me = view.me;
  const pace = settings?.value.pace;

  // ---- What is on screen ------------------------------------------------------------------------
  // `shown` is the view the screen presents: the latest one, except while a shot is rolling,
  // when it stays the view from before the shot until the ball has stopped.
  const [shown, setShownState] = useState(view);
  const [rolling, setRolling] = useState(false);
  const shownRef = useRef(view);
  const roll = useRef<Roll | null>(null);
  /** Views that arrived while a shot was rolling, oldest first. */
  const waiting = useRef<SportView[]>([]);
  /** The number of the last shot already played or shown. */
  const seen = useRef(view.last?.n ?? 0);
  /** Other players' balls sliding to where they now lie: where each came from and when it set off. */
  const slides = useRef(new Map<string, { x: number; y: number; at: number }>());
  const paceRef = useRef(pace);
  paceRef.current = pace;

  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [soundOn, setSoundOn] = useState(() => loadFeedbackSettings().sound);
  const [cardOpen, setCardOpen] = useState(false);
  /** Bowling's big moment after a ball: a strike, a spare, a split, a gutter ball. */
  const [callout, setCallout] = useState<{ kind: "strike" | "spare" | "split" | "gutter"; text: string; n: number } | null>(null);
  /** How fast a roll plays: slower for a replay. */
  const slow = useRef(1);
  /** This roll has hit the pins already: the crash is heard once. */
  const crashed = useRef(false);
  /** A strike's moment isn't cut short: the next ball waits until this time (ms, the page's clock). */
  const holdUntil = useRef(0);
  const holdTimer = useRef(0);
  const bubbles = useBubbles(chat?.messages ?? []);

  // ---- The aim ----------------------------------------------------------------------------------
  const [aim, setAimState] = useState<AimAt>({ angle: 27000, power: 400 });
  const aimRef = useRef(aim);
  const pull = useRef<Pull | null>(null);
  const [pulling, setPulling] = useState(false);
  const swipe = useRef<Swipe | null>(null);
  /** The ball's path for the throw as it stands (bowling): drawn on the lane before it's thrown. */
  const guide = useRef<Point[] | null>(null);
  const setAim = (next: AimAt) => {
    aimRef.current = next;
    setAimState(next);
  };

  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const glScene = useRef<Sport3d | null>(null);
  const box = useRef({ w: 0, h: 0, dpr: 1 });
  const sign = useRef<HTMLDivElement>(null);
  const fit = useRef<Projection>({ scale: 1, ox: 0, oy: 0, turn: 0, tilt: 0 });
  const lastPaint = useRef(0);
  const frame = useRef(0);
  const lastFrame = useRef(0);
  const sendingRef = useRef(false);

  const canShoot = !!shown.shoot && !rolling && !sending && !shown.over;
  const canShootRef = useRef(canShoot);
  canShootRef.current = canShoot;

  // ---- Drawing ----------------------------------------------------------------------------------
  const paint = useCallback((now: number) => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    const { w, h, dpr } = box.current;
    if (!el || !ctx || w === 0 || h === 0) return;
    const r = roll.current;
    const v = shownRef.current;
    const table = r ? r.target.table : v.table;
    // On a phone the hole's sign stands over the top of the table: the hole is fitted below it,
    // and the garden carries on underneath.
    const board = sign.current;
    const over = board && getComputedStyle(board).position === "absolute" ? board.offsetTop + board.offsetHeight + 4 : 0;
    // Seen from an angle unless this device has asked for the plan view: the same drawing with no tilt.
    fit.current = fitFrame(playFrame(table), w, h, { top: over, tilt: viewSetting() === "above" ? 0 : TILT });
    lastPaint.current = now;
    const looks = new Map<string, SportBody>(table.bodies.map((b) => [b.id, b]));
    // The ball that's rolling is the colour of whoever threw it, not of whoever is up next.
    if (r) {
      const struck = looks.get(r.record.shot.body);
      const thrower = r.target.players[r.record.seat]?.body;
      if (struck && thrower && struck.owner !== null && thrower.tone) looks.set(struck.id, { ...struck, tone: thrower.tone });
    }
    // What lies still: the bodies and ghosts of the view on screen (of the shot's own table, if
    // the shot is on a different one), except whatever the roll is moving.
    const still = r && v.table.key !== r.target.table.key ? r.target : v;
    const discs: Disc[] = [];
    for (const b of still.table.world.bodies) {
      if (r?.at.has(b.id) || b.pocketed !== undefined || b.out !== undefined) continue;
      const mine = canShootRef.current && b.id === v.shoot?.body;
      // A bowler stands where they've chosen to on the foul line: the ball is there.
      const placed = mine && v.shoot?.place ? v.shoot.place : null;
      const x = placed ? (aimRef.current.at ?? b.x) : b.x;
      // In pool the cue ball is put anywhere along a line across the table, and in Carrom the striker
      // anywhere along your baseline: not on the bowler's line.
      const y = placed && onLine(v.game) ? placed.y : b.y;
      discs.push({ id: b.id, x, y, r: b.r, look: looks.get(b.id), mine });
    }
    for (const g of still.table.ghosts) {
      if (r?.at.has(g.id)) continue;
      const slide = slides.current.get(g.id);
      const t = slide ? Math.min(1, (now - slide.at) / GHOST_MS) : 1;
      if (slide && t >= 1) slides.current.delete(g.id);
      const ease = 1 - (1 - t) * (1 - t);
      discs.push({ id: g.id, x: slide ? slide.x + (g.x - slide.x) * ease : g.x, y: slide ? slide.y + (g.y - slide.y) * ease : g.y, r: g.r, look: g, ghost: true });
    }
    const effects: Effect[] = [];
    if (r) {
      for (const [id, at] of r.at) {
        const dropped = r.sunk.get(id);
        // A ball that has just gone into a tunnel is seen going in, for a moment.
        const entered = r.entered.get(id);
        const gone = entered && !at.live && r.clock - entered.at < GONE_MS ? (r.clock - entered.at) / GONE_MS : undefined;
        // Pins in the pit and a ball in the gutter stay where they went, lying there, until the
        // pinsetter sweeps them; anywhere else, a ball that's out of play is gone.
        const lies = v.game === "bowling" && !at.live && dropped === undefined;
        if (!at.live && dropped === undefined && gone === undefined && !lies) continue;
        const hit = r.struck.get(id);
        discs.push({ id, x: at.x, y: at.y, r: at.r, look: looks.get(id), sunk: dropped === undefined ? 0 : Math.min(1, (r.clock - dropped) / 260), struck: hit === undefined ? 0 : Math.max(0, 1 - (r.clock - hit) / 180), ...(gone !== undefined && dropped === undefined ? { gone, tunnel: entered!.tunnel } : {}) });
      }
      for (const e of r.effects) {
        const life = e.kind === "splash" ? 650 : e.kind === "drop" ? 420 : 380;
        if (r.clock - e.at < life) effects.push({ kind: e.kind, x: e.x, y: e.y, t: (r.clock - e.at) / life });
      }
    }
    let aiming: Aim | null = null;
    const ball = strikable(v);
    const pool = onLine(v.game);
    const throwing = !!v.shoot?.place && !pool;
    if (canShootRef.current && ball && v.shoot && !throwing) {
      const a = aimRef.current;
      const from = pool && v.shoot.place ? { x: a.at ?? ball.x, y: v.shoot.place.y } : ball;
      aiming = { x: from.x, y: from.y, r: ball.r, angle: (a.angle * Math.PI) / 18000, power: a.power / 1000, pulling: !!pull.current, cancel: !!pull.current?.cancel, ...(v.game === "billiards" ? { tool: "cue" as const } : v.game === "minigolf" ? { tool: "putter" as const } : {}) };
    }
    const shownGuide = canShootRef.current && throwing ? guide.current : null;
    const scene = { table, discs, aim: aiming, trace: r?.jump && r.rested !== null ? r.trace : shownGuide, trails: r ? [...r.trails.values()] : [], effects, time: now, still: reducedMotion(), hurry: !!r || !!pull.current || slides.current.size > 0 };
    // Seen in three dimensions where the scene is up and can draw this table: the 3-D canvas
    // under this one has the table and what is on it, and this one only what is laid over it.
    // Everywhere else (no WebGL, a table with a step or a pipe) the table is drawn flat as ever.
    const gl = glScene.current;
    // Bowling in 3-D is seen from behind the bowler, following the ball: the guide is drawn on the
    // lane in the scene itself, since the flat overlay is drawn from above and wouldn't line up.
    const behind = v.game === "bowling";
    const rollingBall = r ? r.at.get(r.record.shot.body) : undefined;
    const bowler = behind ? { guide: shownGuide, follow: rollingBall ? rollingBall.y : null } : undefined;
    const solid = !!gl && wants3d(v.game) && drawsIn3d(table) && gl.render({ table, discs, proj: fit.current, width: w, height: h, dpr, time: now, still: reducedMotion(), ...(bowler ? { bowler } : {}) });
    if (glCanvas.current) glCanvas.current.style.visibility = solid ? "visible" : "hidden";
    if (solid) drawOverlay(ctx, w, h, dpr, fit.current, behind ? { ...scene, aim: null, trace: null, trails: [], effects: [] } : scene);
    else drawScene(ctx, w, h, dpr, fit.current, scene);
  }, []);

  /** Draw now, and keep drawing while anything is moving. */
  const wake = useCallback(() => {
    if (frame.current) return;
    lastFrame.current = performance.now();
    const loop = (now: number) => {
      frame.current = 0;
      // A tab that was hidden comes back with one huge gap: treat it as a tenth of a second.
      const ms = Math.min(100, Math.max(0, now - lastFrame.current));
      lastFrame.current = now;
      const r = roll.current;
      if (r) {
        // Catching up on shots that arrived while this one rolled: play faster the further behind.
        const behind = waiting.current.filter((v) => v.last && v.last.n > r.record.n).length;
        const speed = (paceRef.current === "fast" ? 1.5 : 1) * (behind >= 3 ? 4 : behind >= 1 ? 2 : 1) * slow.current;
        hear(advanceRoll(r, ms, speed));
        if (r.over) settle();
      }
      // A shot, a slide or a pull is drawn every frame. With nothing going on there is still the
      // water and the marker on the ball to play, which are happy at half that.
      const busy = !!roll.current || slides.current.size > 0 || !!pull.current || !!swipe.current;
      if (busy || now - lastPaint.current >= 30) paint(now);
      if (busy || !reducedMotion()) frame.current = requestAnimationFrame(loop);
    };
    frame.current = requestAnimationFrame(loop);
  }, [paint]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // The 3-D scene is fetched once the table is up, and only where WebGL works; until it is there
  // (and for good, where it isn't) the table is drawn flat.
  useEffect(() => {
    const el = glCanvas.current;
    if (!el) return;
    let alive = true;
    let made: Sport3d | null = null;
    loadSport3d(el).then((g) => {
      if (!alive || !g) return g?.dispose();
      made = g;
      glScene.current = g;
      paint(performance.now());
      wake();
    });
    return () => {
      alive = false;
      glScene.current = null;
      made?.dispose();
    };
  }, [paint, wake]);
  // This device's choice of view (from an angle, or from above) is kept on the page: draw again when it changes.
  useEffect(() => {
    const watch = new MutationObserver(() => {
      paint(performance.now());
      wake();
    });
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-view", "data-depth"] });
    return () => watch.disconnect();
  }, [paint, wake]);

  // ---- Sounds, from what the simulation says happened -------------------------------------------
  const lastKnock = useRef(0);
  function hear(events: ReturnType<typeof advanceRoll>) {
    if (shownRef.current.game === "bowling") {
      for (const e of events) {
        if (e.type === "hit" && (e.a.startsWith("pin") || e.b.startsWith("pin"))) {
          // The ball into the pins is the crash; the pins rattling into each other after it are knocks.
          if (!crashed.current) {
            crashed.current = true;
            play("pins");
          } else if (e.speed > 2500) {
            const now = performance.now();
            if (now - lastKnock.current > 60) play("knock");
            lastKnock.current = now;
          }
        } else if ((e.type === "wall" || e.type === "hit") && e.speed > 1500) play("knock");
      }
      return;
    }
    for (const e of events) {
      if (e.type === "pocket") play("cup");
      else if (e.type === "out") play(shownRef.current.table.look.regions.some((g) => g.id === e.region && g.surface === "water") ? "splash" : "nope");
      else if (e.type === "skip" || e.type === "tunnel") play("knock");
      else if (e.type === "emerge") play("putt");
      else if ((e.type === "wall" || e.type === "hit") && e.speed > 500) {
        // A ball rattling in a corner is one knock, not a drum roll.
        const now = performance.now();
        if (now - lastKnock.current > 70) play("knock");
        lastKnock.current = now;
      }
    }
  }

  // ---- Shots, one after another -----------------------------------------------------------------
  function show(v: SportView) {
    const before = shownRef.current;
    // The other players' balls slide to where they are now; on a new table they are simply there.
    slides.current.clear();
    if (before.table.key === v.table.key && !reducedMotion()) {
      const was = new Map(before.table.ghosts.map((g) => [g.id, g]));
      const at = performance.now();
      for (const g of v.table.ghosts) {
        const from = was.get(g.id);
        if (from && (from.x !== g.x || from.y !== g.y) && roll.current?.record.shot.body !== g.id) slides.current.set(g.id, { x: from.x, y: from.y, at });
      }
    }
    shownRef.current = v;
    seen.current = v.last?.n ?? 0;
    setShownState(v);
  }

  function begin(v: SportView) {
    // The roll itself isn't shown to someone who asked for less motion, or at the instant pace:
    // they get where it went, with the path drawn for a moment.
    roll.current = beginRoll(v, reducedMotion() || paceRef.current === "instant");
    seen.current = v.last!.n;
    crashed.current = false;
    setCallout(null);
    setRolling(true);
    play(v.game === "bowling" ? "bowl" : "putt");
    wake();
  }

  /** A view to deal with: play its shot if it has a new one, else just show it. */
  function take(v: SportView) {
    if (v.last && v.last.n > seen.current) begin(v);
    else show(v);
  }

  /** The roll is over: check it, show the table it led to, and go on to whatever arrived meanwhile. */
  function settle() {
    const r = roll.current;
    if (!r) return;
    if (!landed(r)) {
      // This should never happen: the physics core is deterministic by construction. If it does,
      // the screen is put right by showing the server's table below; say so where a developer will see.
      console.warn(`open.parlor: shot ${r.record.n} rolled to a different place here than on the server. Showing the server's table.`, { shot: r.record.shot, server: r.record.rest, here: [...r.at] });
      if (import.meta.env.DEV) console.assert(false, "a locally stepped shot must end exactly where the server's did");
    }
    show(r.target);
    roll.current = null;
    // A replay ends where it began; a new ball's outcome gets its moment.
    if (slow.current !== 1) slow.current = 1;
    else if (r.target.game === "bowling") callOut(r.target, r.record.n);
    setRolling(false);
    flushWaiting();
  }

  /** Whatever arrived while a ball rolled (or a strike was being enjoyed): played, or shown, in order. */
  function flushWaiting() {
    const wait = holdUntil.current - performance.now();
    if (wait > 0 && waiting.current.some((v) => v.last && v.last.n > seen.current)) {
      clearTimeout(holdTimer.current);
      holdTimer.current = window.setTimeout(flushWaiting, wait);
      return;
    }
    while (waiting.current.length) {
      const next = waiting.current.shift()!;
      if (next.last && next.last.n > seen.current) return begin(next);
      show(next);
    }
  }
  useEffect(() => () => clearTimeout(holdTimer.current), []);

  /** The moment after a ball, from what the game said happened. */
  function callOut(v: SportView, n: number) {
    const said = v.narration ?? "";
    const kind = /strike/i.test(said) ? "strike" : /spare/i.test(said) ? "spare" : /split/i.test(said) ? "split" : /gutter/i.test(said) ? "gutter" : null;
    if (!kind) return;
    const split = /the ([\d-]+) split/i.exec(said)?.[1];
    setCallout({ kind, n, text: kind === "strike" ? "STRIKE!" : kind === "spare" ? "SPARE!" : kind === "split" ? `${split ?? ""} split`.trim() : "Gutter ball" });
    // Long enough to enjoy it (and reach Replay) before anyone else's ball rolls.
    holdUntil.current = performance.now() + (kind === "gutter" ? 900 : reducedMotion() ? 1200 : 2600);
    if (kind === "strike") play("strike");
    else if (kind === "spare") play("trickUs");
  }
  useEffect(() => {
    if (!callout) return;
    const t = setTimeout(() => setCallout((c) => (c === callout ? null : c)), callout.kind === "gutter" ? 1600 : 4200);
    return () => clearTimeout(t);
  }, [callout]);

  /** That ball again, slowly: the last shot played back from where everything stood. */
  function replay() {
    const v = shownRef.current;
    if (!v.last || roll.current) return;
    slow.current = 0.45;
    holdUntil.current = 0;
    roll.current = beginRoll(v, false);
    crashed.current = false;
    setCallout(null);
    setRolling(true);
    play("bowl");
    wake();
  }

  /** Stop watching: the rest of this roll, and any that are queued, happen at once. */
  function skip() {
    const r = roll.current;
    if (!r) return;
    const events = finishRoll(r);
    hear(events.filter((e) => e.type === "pocket" || e.type === "out"));
    r.hold = 0;
    r.over = true;
    const latest = waiting.current.pop();
    waiting.current = [];
    settle();
    if (latest) show(latest);
    wake();
  }

  useEffect(() => {
    if (view === shownRef.current) return;
    if (roll.current || (holdUntil.current > performance.now() && view.last && view.last.n > seen.current)) {
      waiting.current.push(view);
      // Far behind (a phone that slept through several putts): drop the oldest and catch up.
      if (waiting.current.length > 6) waiting.current.splice(0, waiting.current.length - 6);
      if (!roll.current) flushWaiting();
      return;
    }
    take(view);
    wake();
  }, [view]);

  // ---- The canvas follows its box ---------------------------------------------------------------
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      // Two device pixels to the CSS pixel is as fine as the table is drawn. It is grass, timber
      // and soft shadows, which look the same at three, and a dense phone screen then has less
      // than half as many pixels to paint and to copy every frame.
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth;
      const h = el.clientHeight;
      box.current = { w, h, dpr };
      const c = canvas.current;
      if (c && (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr))) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      paint(performance.now());
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [paint]);
  // Anything React knows changed is drawn straight away; motion is drawn by the loop, which
  // runs all the while the table is up unless the person has asked for stillness.
  useEffect(() => {
    paint(performance.now());
    if (slides.current.size || !reducedMotion()) wake();
  });

  // ---- Aiming -----------------------------------------------------------------------------------
  // A fresh shot starts aimed at the hole, which is where most putts go.
  const ball = strikable(shown);
  const ballKey = shown.shoot && ball ? `${shown.table.key}/${ball.id}/${ball.x}/${ball.y}` : "";
  useEffect(() => {
    if (!ball || !shown.shoot) return;
    if (shown.shoot.place && onLine(shown.game)) {
      // Pool, with the cue ball in hand: start in the middle of the line, aimed up the table. Carrom:
      // the striker where it lies on your baseline, aimed at the middle of the board.
      const pl = shown.shoot.place;
      if (shown.game === "carrom") {
        const frame = shown.table.look.frame;
        const middle = { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
        setAim({ angle: angleTo({ x: ball.x, y: pl.y }, middle), power: Math.min(shown.shoot.maxPower, Math.max(shown.shoot.minPower, 450)), at: Math.round(ball.x), call: null });
        return;
      }
      setAim({ angle: 0, power: Math.min(shown.shoot.maxPower, Math.max(shown.shoot.minPower, 400)), at: Math.round((pl.min + pl.max) / 2), call: null });
      return;
    }
    if (shown.shoot.place) {
      // A bowler keeps their spot and their spin from ball to ball, and starts aimed straight.
      const was = aimRef.current;
      setAim({ angle: 27000, power: Math.min(shown.shoot.maxPower, Math.max(shown.shoot.minPower, was.power > 400 ? was.power : 780)), spin: was.spin ?? 0, at: was.at ?? 0 });
      return;
    }
    const pocket = nearestPocket(shown, ball);
    setAim({ angle: pocket ? angleTo(ball, pocket) : 27000, power: Math.min(shown.shoot.maxPower, Math.max(shown.shoot.minPower, 400)), call: null });
  }, [ballKey, shown.shoot?.place?.y]);
  // The guide follows the throw as it stands, whichever way it was set (a swipe, the buttons, the keys).
  useEffect(() => {
    const ballNow = strikable(shown);
    if (!canShoot || !shown.shoot?.place || onLine(shown.game) || !ballNow) {
      guide.current = null;
      return;
    }
    guide.current = guideOf(shown.table, ballNow.id, { at: aim.at ?? 0, angle: aim.angle, power: aim.power, spin: aim.spin ?? 0 });
  }, [aim, canShoot, shown]);

  const clampPower = (power: number) => (shown.shoot ? Math.min(shown.shoot.maxPower, Math.max(shown.shoot.minPower, Math.round(power))) : power);
  const turn = (by: number) => {
    if (!canShoot) return;
    // Down a lane, the aim is a few degrees either side of straight.
    const angle = shown.shoot?.place && !onLine(shown.game) ? 27000 + Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, aimRef.current.angle - 27000 + by)) : wrap(aimRef.current.angle + by);
    setAim({ ...aimRef.current, angle });
  };
  const push = (by: number) => canShoot && setAim({ ...aimRef.current, power: clampPower(aimRef.current.power + by) });
  const stand = (by: number) => {
    const place = shown.shoot?.place;
    if (!canShoot || !place) return;
    setAim({ ...aimRef.current, at: Math.round(Math.max(place.min, Math.min(place.max, (aimRef.current.at ?? 0) + by))) });
  };
  const hook = (by: number) => {
    const max = shown.shoot?.maxSpin ?? 0;
    if (!canShoot || !max) return;
    setAim({ ...aimRef.current, spin: Math.round(Math.max(-max, Math.min(max, (aimRef.current.spin ?? 0) + by))) });
  };

  async function shoot() {
    const v = shownRef.current;
    if (!canShootRef.current || !v.shoot || sendingRef.current) return;
    const a = aimRef.current;
    sendingRef.current = true;
    setSending(true);
    // Whole numbers, whatever the pointer maths made of them.
    if (v.shoot.call && !a.call) {
      sendingRef.current = false;
      setSending(false);
      setError("Call your shot: pick a ball and a pocket first.");
      play("nope");
      return;
    }
    const extra = {
      ...(v.shoot.place ? { at: Math.round(a.at ?? 0), ...(a.spin ? { spin: Math.round(a.spin) } : {}) } : {}),
      ...(v.shoot.call && a.call ? { call: a.call } : {}),
    };
    const refused = await act({ type: "shot", body: v.shoot.body, angle: wrap(a.angle), power: clampPower(a.power), ...extra });
    sendingRef.current = false;
    setSending(false);
    if (refused) {
      setError(refused);
      play("nope");
    }
  }

  /** How long a pull is full power: most of the way across a phone, and no more on a big screen. */
  const fullPull = () => Math.min(230, Math.max(110, Math.min(box.current.w, box.current.h) * 0.42));

  function onPointerDown(e: React.PointerEvent) {
    if (!canShoot || !shown.shoot || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (shown.shoot.place && !onLine(shown.game)) {
      if (swipe.current) return cancelPull();
      swipe.current = { pointer: e.pointerId, path: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }], mode: "unsure", from: aimRef.current.at ?? 0 };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
      setPulling(true);
      e.preventDefault();
      wake();
      return;
    }
    // A second finger calls the pull off.
    if (pull.current) return cancelPull();
    pull.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, before: aimRef.current, cancel: true };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* a pointer that can't be captured still sends its moves while it is over the table */
    }
    setPulling(true);
    e.preventDefault();
  }
  function onPointerMove(e: React.PointerEvent) {
    const sw = swipe.current;
    if (sw && sw.pointer === e.pointerId && shown.shoot?.place && !onLine(shown.game)) {
      sw.path.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (sw.mode === "unsure") sw.mode = sideways(sw.path) ? "stand" : Math.abs(e.clientY - sw.path[0]!.y) > 12 ? "throw" : "unsure";
      if (sw.mode === "stand") {
        // Across the lane: most of the table's width is the whole foul line.
        const place = shown.shoot.place;
        const per = (place.max - place.min) / Math.max(120, box.current.w * 0.7);
        setAim({ ...aimRef.current, at: Math.round(Math.max(place.min, Math.min(place.max, sw.from + (e.clientX - sw.path[0]!.x) * per))) });
      } else if (sw.mode === "throw") {
        const th = readSwipe(sw.path, shown.shoot, aimRef.current.at ?? 0, box.current.h);
        if (th) setAim({ ...aimRef.current, angle: th.angle, power: th.power, spin: th.spin });
      }
      return;
    }
    const p = pull.current;
    if (!p || p.pointer !== e.pointerId || !shown.shoot) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const far = Math.hypot(dx, dy);
    p.cancel = far < CANCEL_ZONE;
    if (p.cancel) return setAim(p.before);
    // The ball goes the opposite way to the pull along the ground: the drag across the screen is
    // taken back through the same projection the table is drawn with (it may be on its side, and
    // it is seen at an angle), so the aim line on the turf points exactly away from the thumb.
    // Any maths will do here: what is kept is rounded.
    const [wx, wy] = unprojectVector(fit.current, dx, dy);
    const angle = wrap((Math.atan2(-wy, -wx) * 18000) / Math.PI);
    const share = Math.min(1, (far - CANCEL_ZONE) / (fullPull() - CANCEL_ZONE));
    // Only the direction and the power change: where the cue ball or striker was put, its spin and a
    // called shot stay as they were, or the shot sent on letting go is one the game turns down.
    setAim({ ...aimRef.current, angle, power: clampPower(shown.shoot.minPower + share * (shown.shoot.maxPower - shown.shoot.minPower)) });
  }
  function onPointerUp(e: React.PointerEvent) {
    const sw = swipe.current;
    if (sw && sw.pointer === e.pointerId) {
      swipe.current = null;
      setPulling(false);
      if (sw.mode !== "throw" || !shown.shoot) return;
      sw.path.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      const th: Throw | null = readSwipe(sw.path, shown.shoot, aimRef.current.at ?? 0, box.current.h);
      if (!th) return;
      setAim({ ...aimRef.current, angle: th.angle, power: th.power, spin: th.spin });
      void shoot();
      return;
    }
    const p = pull.current;
    if (!p || p.pointer !== e.pointerId) return;
    pull.current = null;
    setPulling(false);
    if (p.cancel) return setAim(p.before);
    void shoot();
  }
  function cancelPull() {
    if (swipe.current) {
      swipe.current = null;
      setPulling(false);
      return;
    }
    const p = pull.current;
    if (!p) return;
    pull.current = null;
    setPulling(false);
    setAim(p.before);
  }
  // The shot went, or the turn passed, with a finger still down: let go of it.
  useEffect(() => {
    if (!canShoot) cancelPull();
  }, [canShoot]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (pull.current) cancelPull();
      else if (cardOpen) setCardOpen(false);
      return;
    }
    if (!canShoot || e.target !== e.currentTarget) return;
    const fine = e.altKey ? 10 : e.shiftKey ? 500 : 100;
    const step = e.shiftKey ? 100 : 20;
    if (shown.shoot?.place && !onLine(shown.game)) {
      // Bowling: Shift and the arrows move along the foul line; [ and ] set the hook.
      if (e.shiftKey && e.key === "ArrowLeft") stand(-400);
      else if (e.shiftKey && e.key === "ArrowRight") stand(400);
      else if (e.key === "ArrowLeft") turn(-25);
      else if (e.key === "ArrowRight") turn(25);
      else if (e.key === "[") hook(-100);
      else if (e.key === "]") hook(100);
      else if (e.key === "ArrowUp") push(20);
      else if (e.key === "ArrowDown") push(-20);
      else if (e.key === "Enter" || e.key === " ") void shoot();
      else return;
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowLeft") turn(-fine);
    else if (e.key === "ArrowRight") turn(fine);
    else if (e.key === "ArrowUp") push(step);
    else if (e.key === "ArrowDown") push(-step);
    else if (e.key === "Home" && ball) {
      const pocket = nearestPocket(shown, ball);
      if (pocket) setAim({ ...aimRef.current, angle: angleTo(ball, pocket) });
    } else if (e.key === "Enter" || e.key === " ") void shoot();
    else return;
    e.preventDefault();
  }

  // What the aim is, said aloud a moment after it stops changing.
  const words = canShoot ? aimWords(shown, aim) : { short: "", long: "" };
  const [spoken, setSpoken] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSpoken(words.long), 450);
    return () => clearTimeout(t);
  }, [words.long]);

  // ---- The rest of the table --------------------------------------------------------------------
  const tie = !!shown.over && shown.over.winners.length === shown.seats && shown.seats > 1;
  const won = !!shown.over && !tie && shown.seats > 1 && shown.over.winners.includes(me);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 2500);
    return () => clearTimeout(t);
  }, [error]);
  const turnSeen = useRef(false);
  useEffect(() => {
    // Alone on the course it is always your shot: no need to say so every time.
    if (canShoot && !turnSeen.current && shown.seats > 1 && shown.turn !== null) play("yourTurn");
    turnSeen.current = canShoot;
  }, [canShoot]);
  const overSeen = useRef(!!shown.over);
  useEffect(() => {
    if (shown.over && !overSeen.current) play(tie || shown.seats === 1 ? "handDone" : won ? "won" : "lost");
    overSeen.current = !!shown.over;
  }, [shown.over]);
  const resultSeen = useRef(shown.result?.key ?? null);
  useEffect(() => {
    if (shown.result && !shown.over && resultSeen.current !== shown.result.key) play("handDone");
    resultSeen.current = shown.result?.key ?? null;
  }, [shown.result?.key]);

  const send = async (move: Record<string, unknown>) => {
    const refused = await act(move);
    if (refused) {
      setError(refused);
      play("nope");
    }
  };
  function toggleSound() {
    const next = { ...loadFeedbackSettings(), sound: !soundOn };
    saveFeedbackSettings(next);
    setSoundOn(next.sound);
  }

  const shooter = rolling && roll.current ? roll.current.record.seat : null;
  const status = error ? (
    <span className="error">{error}</span>
  ) : shooter !== null ? (
    shooter === me && !together ? "There it goes…" : `${names[shooter] ?? "Someone"} ${shown.game === "bowling" ? "bowls" : shown.game === "billiards" ? "shoots" : shown.game === "carrom" ? "flicks" : "putts"}…`
  ) : shown.over || shown.result ? null : canShoot ? (
    <span className="mine">{together ? `${names[shown.me] ?? "Someone"}: ` : ""}{shown.game === "bowling" ? "Drag sideways to stand, swipe up to bowl" : shown.shoot?.place && shown.game === "billiards" ? "Place the cue ball, then pull back and let go" : shown.shoot?.place && shown.game === "carrom" ? "Slide the striker along your line, then pull back and flick" : shown.seats > 1 && !together ? "Your shot" : "Pull back and let go"}</span>
  ) : sending ? (
    "…"
  ) : shown.turn !== null ? (
    `${names[shown.turn] ?? "Someone"} is lining it up…`
  ) : shown.players[me]?.done ? (
    "You're in. Waiting for the others…"
  ) : (
    "Waiting for everyone…"
  );

  const mine = strikable(shown) ?? shown.table.world.bodies.find((b) => shown.table.bodies.some((look) => look.id === b.id && look.owner === me));
  const pocket = mine && mine.pocketed === undefined ? nearestPocket(shown, mine) : null;
  const picture = `${shown.table.name}. ${shown.info.join(". ")}.${pocket ? ` Your ball is ${metres(pocket.far)} from ${shown.table.look.pockets === "cup" ? "the cup" : "the nearest pocket"}.` : ""}`;
  const percent = Math.round(aim.power / 10);
  const throwing = (!!shown.shoot?.place && !onLine(shown.game)) || shown.game === "bowling";

  return (
    <main className={`table kit sport sport-${shown.game}`} onKeyDown={(e) => e.key === "Escape" && onKeyDown(e)}>
      <header className="palace-bar kit-bar">
        <button type="button" className="leave" aria-label="Leave game" onClick={() => (shown.over || confirm("Leave this game?")) && onLeave()}>
          ←
        </button>
        <span className="sport-course">{shown.card?.title ?? game.name}</span>
        <span className="bar-buttons">
          {shown.card && (
            <button type="button" className="sound-toggle inline" onClick={() => setCardOpen(true)} aria-label="Scorecard" aria-haspopup="dialog">
              📋
            </button>
          )}
          {settings && <TableSettingsButton settings={settings.value} onChange={settings.change} sport />}
          <SoundButton on={soundOn} toggle={toggleSound} inline />
        </span>
      </header>
      {banner}

      <div className="felt sport-felt">
        {shown.game === "bowling" && shown.card ? <BowlingSheet view={shown} card={shown.card} names={names} active={shooter ?? shown.turn} /> : <ScorePanel view={shown} names={names} active={shooter ?? shown.turn} />}

        <div className="sport-view">
          <HoleSign view={shown} names={names} board={sign} />
          <div
            ref={stage}
            className={`sport-stage${canShoot ? " can" : ""}${pulling ? " pulling" : ""}`}
            tabIndex={0}
            role="group"
            aria-label={`${picture}${canShoot ? (throwing ? " Left and right aim, Shift with them moves along the foul line, [ and ] set the hook, up and down the power, Enter bowls." : " Arrow keys aim, up and down set the power, Enter putts.") : ""}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={cancelPull}
            onKeyDown={onKeyDown}
          >
            <canvas ref={glCanvas} className="sport-gl" aria-hidden />
            <canvas ref={canvas} aria-hidden />
            {pulling && (
              <div className="sport-meter" aria-hidden>
                <span style={{ height: `${percent}%`, background: powerColour(aim.power / 1000) }} />
              </div>
            )}
            {rolling && (
              <button type="button" className="sport-skip" onClick={skip} onPointerDown={(e) => e.stopPropagation()}>
                Skip ⏭
              </button>
            )}
            {callout && !rolling && (
              <div key={callout.n} className={`bowl-callout bowl-${callout.kind}`} role="status">
                <span>{callout.text}</span>
                {callout.kind !== "gutter" && !reducedMotion() && (
                  <button type="button" className="bowl-replay" onClick={replay} onPointerDown={(e) => e.stopPropagation()}>
                    ↺ Replay
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="center-info">
          <p className="narration" aria-live="polite">
            {shown.narration ? named(shown.narration, names) : null}
          </p>
          <div className="status" role="status">
            {status}
          </div>
          {/* Kept in place (hidden) while a shot rolls or someone else plays, so the table doesn't change size between shots. */}
          {!shown.over && !shown.result && !shown.players[me]?.done && (
            <div className={`sport-controls${canShoot ? "" : " idle"}`} role="group" aria-label="Aim and power" aria-hidden={!canShoot} inert={!canShoot}>
              {throwing ? (
                <BowlControls aim={aim} place={shown.shoot?.place ?? null} maxSpin={shown.shoot?.maxSpin ?? 0} stand={stand} turn={turn} hook={hook} />
              ) : (
              <div className="sport-row">
                <button type="button" aria-label="Aim 5 degrees left" onClick={() => turn(-500)}>
                  ⟲
                </button>
                <button type="button" aria-label="Aim half a degree left" onClick={() => turn(-50)}>
                  ‹
                </button>
                <output className="sport-aim">{pulling && pull.current?.cancel ? "Let go to cancel" : words.short}</output>
                <button type="button" aria-label="Aim half a degree right" onClick={() => turn(50)}>
                  ›
                </button>
                <button type="button" aria-label="Aim 5 degrees right" onClick={() => turn(500)}>
                  ⟳
                </button>
              </div>
              )}
              {onLine(shown.game) && (shown.shoot?.place || shown.shoot?.call) && (
                <PoolControls view={shown} aim={aim} stand={stand} call={(call) => setAim({ ...aimRef.current, call })} />
              )}
              <div className="sport-row">
                <button type="button" aria-label="Less power" onClick={() => push(-20)}>
                  −
                </button>
                <input
                  type="range"
                  aria-label="Power"
                  aria-valuetext={`${percent} percent`}
                  min={shown.shoot?.minPower ?? 0}
                  max={shown.shoot?.maxPower ?? 1000}
                  step={10}
                  value={aim.power}
                  style={{ accentColor: powerColour(aim.power / 1000) }}
                  onChange={(e) => setAim({ ...aimRef.current, power: clampPower(Number(e.target.value)) })}
                />
                <button type="button" aria-label="More power" onClick={() => push(20)}>
                  +
                </button>
                <button type="button" className="primary sport-go" onClick={() => void shoot()}>
                  {shown.game === "bowling" ? "Roll" : shown.game === "billiards" ? "Shoot" : shown.game === "carrom" ? "Flick" : "Putt"}
                </button>
              </div>
            </div>
          )}
          <p className="sr-only" aria-live="polite">
            {spoken}
          </p>
        </div>
      </div>

      {chat && (
        <section className="me sport-me" data-seat={me}>
          <TableChat {...chat} />
        </section>
      )}

      <div className="bubble-layer" aria-live="polite">
        {[...bubbles.entries()].map(([s, m]) => (
          <Bubble key={`${s}-${m.at}`} message={m} seat={s} />
        ))}
      </div>

      {cardOpen && shown.card && (
        <>
          <div className="sheet-backdrop" onClick={() => setCardOpen(false)} />
          <div className="sheet sport-card-sheet" role="dialog" aria-label="Scorecard">
            <Scorecard card={shown.card} names={names} me={me} />
            <button type="button" className="primary" autoFocus onClick={() => setCardOpen(false)}>
              Back to the game
            </button>
          </div>
        </>
      )}
      {shown.result && !shown.over && (
        <div className="sheet sport-sheet">
          <ResultTable result={shown.result} names={names} me={me} />
          {shown.choices ? (
            shown.choices.options.map((o, i) => (
              <button key={i} type="button" className={o.primary ? "primary" : "secondary"} onClick={() => void send(o.move)}>
                {named(o.label, names)}
              </button>
            ))
          ) : (
            <p className="fine">Waiting for everyone…</p>
          )}
        </div>
      )}
      {won && <Confetti />}
      {shown.over && (
        <div className="sheet won-sheet sport-sheet sport-over">
          <h2>{won && !together ? "You won! 🏆" : named(shown.over.title, names)}</h2>
          {won && !together && !shown.over.title.includes(`{${me}}`) && <p className="won-line">{named(shown.over.title, names)}</p>}
          {shown.card ? <Scorecard card={shown.card} names={names} me={me} /> : shown.result && <ResultTable result={shown.result} names={names} me={me} untitled />}
          <button type="button" className="primary" onClick={onLeave}>
            Play again
          </button>
        </div>
      )}
      <p className="sr-only">{game.name}</p>
    </main>
  );
}

/**
 * The sign at the hole: its number, its name and its par, on a painted board. A table's name is
 * "Hole 3: The Elbow" and its first facts are "Hole 3 of 9" and "Par 3"; the board takes the
 * number from the name, and shows whatever other facts there are small.
 */
function HoleSign({ view, names, board }: { view: SportView; names: string[]; board: React.RefObject<HTMLDivElement | null> }) {
  const [label, title] = view.table.name.includes(": ") ? [view.table.name.slice(0, view.table.name.indexOf(": ")), view.table.name.slice(view.table.name.indexOf(": ") + 2)] : ["", view.table.name];
  const number = /\d+/.exec(label)?.[0];
  const [, par, ...rest] = view.info;
  return (
    <div ref={board} className="sport-sign">
      <h2 className="sr-only">{view.table.name}</h2>
      <div className="sport-sign-board" aria-hidden>
        {number && <span className="sport-sign-number">{number}</span>}
        <span className="sport-sign-words">
          <strong>{title}</strong>
          {par && <em>{named(par, names)}</em>}
        </span>
      </div>
      <ul className="sport-sign-facts">
        <li className="sr-only">{view.info[0]}</li>
        {par && <li className="sr-only">{named(par, names)}</li>}
        {rest.map((line, i) => (
          <li key={i}>{named(line, names)}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Everyone at the table in a few lines: the colour of their ball, their name, what they have
 * taken on this hole (or frame, or rack) and their total. On a phone it is a row of chips over
 * the table; on a wide screen, a list down the side.
 */
function ScorePanel({ view, names, active }: { view: SportView; names: string[]; active: number | null }) {
  const now = view.card?.current ?? null;
  return (
    <ol className="sport-panel" aria-label="Scores">
      {view.players.map((p, seat) => {
        const row = view.card?.rows.find((r) => r.seat === seat);
        const here = row && now !== null ? row.cells[now] || "0" : null;
        const total = row?.total ?? String(view.scores.find((s) => s.seats.includes(seat))?.value ?? "");
        const on = active === seat && !view.over;
        return (
          <li key={seat} className={`sport-player${on ? " is-up" : ""}${p.done ? " is-in" : ""}${seat === view.me ? " is-me" : ""}`} data-seat={seat} aria-current={on ? "true" : undefined} title={[p.line, p.badge].filter(Boolean).join(" · ")}>
            {p.body && <span className="sport-dot" style={{ background: toneColour(p.body.tone) }} aria-hidden />}
            <span className="sport-player-name">
              {names[seat] ?? `Seat ${seat + 1}`}
              {p.body && <span className="sr-only"> plays the {p.body.tone} ball. </span>}
              <span className="sr-only">{[p.line, p.badge].filter(Boolean).join(". ")}.</span>
            </span>
            {p.done && (
              <span className="sport-player-in" aria-hidden>
                ✓
              </span>
            )}
            {here !== null && (
              <span className="sport-player-here">
                <span className="sr-only">This hole: </span>
                {here}
              </span>
            )}
            <strong className="sport-player-total">
              <span className="sr-only">Total: </span>
              {total}
            </strong>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Bowling's score sheet, always in view: a row per bowler, a box per frame with its marks (X, /,
 * pins) over the running total, the frame being bowled and the bowler who's up picked out.
 */
function BowlingSheet({ view, card, names, active }: { view: SportView; card: SportCard; names: string[]; active: number | null }) {
  const now = card.current;
  return (
    <div className="bowl-sheet" role="table" aria-label="Score sheet" style={{ "--frames": card.columns.length } as React.CSSProperties}>
      {card.rows.map((row) => {
        const on = active === row.seat && !view.over;
        const tone = view.players[row.seat]?.body?.tone;
        return (
          <div key={row.seat} role="row" className={`bowl-row${on ? " is-up" : ""}${row.seat === view.me ? " is-me" : ""}`}>
            <span role="rowheader" className="bowl-who">
              <span className="sport-dot" style={{ background: toneColour(tone) }} aria-hidden />
              {names[row.seat] ?? `Seat ${row.seat + 1}`}
            </span>
            {row.cells.map((cell, f) => {
              const [mark = "", total = ""] = cell.split(" ");
              return (
                <span key={f} role="cell" className={`bowl-frame${f === now ? " is-now" : ""}${f === card.columns.length - 1 ? " is-tenth" : ""}`} aria-label={`Frame ${f + 1}: ${mark || "not bowled"}${total ? `, ${total}` : ""}`}>
                  <span className="bowl-marks">
                    {[...mark].map((m, i) => (
                      <span key={i} className={m === "X" ? "x" : m === "/" ? "sl" : ""}>
                        {m}
                      </span>
                    ))}
                  </span>
                  <span className="bowl-total">{total}</span>
                </span>
              );
            })}
            <strong role="cell" className="bowl-sum">
              {row.total}
            </strong>
          </div>
        );
      })}
    </div>
  );
}

/** The score sheet: a column per hole with its par, a row per player, the totals at the end. */
function Scorecard({ card, names, me }: { card: SportCard; names: string[]; me: number }) {
  return (
    <div className="sport-card">
      <table className="summary">
        <caption>{card.title}</caption>
        <thead>
          <tr>
            <th scope="col">Hole</th>
            {card.columns.map((c, i) => (
              <th key={i} scope="col" className={card.current === i ? "now" : ""} aria-current={card.current === i ? "true" : undefined}>
                {c.label}
              </th>
            ))}
            <th scope="col">{card.totalLabel}</th>
            {card.noteLabel && <th scope="col">{card.noteLabel}</th>}
          </tr>
          {card.columns.some((c) => c.sub) && (
            <tr className="par">
              <th scope="row">Par</th>
              {card.columns.map((c, i) => (
                <td key={i}>{c.sub}</td>
              ))}
              <td>{card.columns.reduce((n, c) => n + (Number(c.sub) || 0), 0) || ""}</td>
              {card.noteLabel && <td />}
            </tr>
          )}
        </thead>
        <tbody>
          {card.rows.map((r) => (
            <tr key={r.seat} className={r.seat === me ? "mine" : ""}>
              <th scope="row">{names[r.seat] ?? `Seat ${r.seat + 1}`}</th>
              {r.cells.map((c, i) => (
                <td key={i} className={card.current === i ? "now" : ""}>
                  {c}
                </td>
              ))}
              <td className="sum">{r.total}</td>
              {card.noteLabel && <td>{r.note}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Where the bowler stands, the aim and the hook, for those who'd rather tap than swipe. */
function BowlControls({ aim, place, maxSpin, stand, turn, hook }: { aim: AimAt; place: { min: number; max: number } | null; maxSpin: number; stand: (by: number) => void; turn: (by: number) => void; hook: (by: number) => void }) {
  const at = aim.at ?? 0;
  const spot = !place ? "" : Math.abs(at) < 200 ? "the middle" : `${Math.round((Math.abs(at) / place.max) * 100)}% ${at < 0 ? "left" : "right"}`;
  const off = (aim.angle - 27000) / 100;
  const spin = aim.spin ?? 0;
  const curl = !maxSpin || spin === 0 ? "none" : `${Math.round((Math.abs(spin) / maxSpin) * 100)}% ${spin < 0 ? "left" : "right"}`;
  return (
    <div className="bowl-controls">
      <div className="sport-row">
        <span className="bowl-label">Stand</span>
        <button type="button" aria-label="Stand further left" onClick={() => stand(-400)}>
          ‹
        </button>
        <output className="sport-aim">{spot}</output>
        <button type="button" aria-label="Stand further right" onClick={() => stand(400)}>
          ›
        </button>
      </div>
      <div className="sport-row">
        <span className="bowl-label">Aim</span>
        <button type="button" aria-label="Aim a little left" onClick={() => turn(-25)}>
          ‹
        </button>
        <output className="sport-aim">{Math.abs(off) < 0.05 ? "straight" : `${Math.abs(off).toFixed(1)}° ${off < 0 ? "left" : "right"}`}</output>
        <button type="button" aria-label="Aim a little right" onClick={() => turn(25)}>
          ›
        </button>
      </div>
      {maxSpin > 0 && (
        <div className="sport-row">
          <span className="bowl-label">Hook</span>
          <button type="button" aria-label="Hook more to the left" onClick={() => hook(-100)}>
            ‹
          </button>
          <output className="sport-aim">{curl}</output>
          <button type="button" aria-label="Hook more to the right" onClick={() => hook(100)}>
            ›
          </button>
        </div>
      )}
    </div>
  );
}

/** Where a pocket is, in words: its corner or side. */
function pocketName(view: SportView, id: string): string {
  const pockets = view.table.world.pockets;
  const p = pockets.find((x) => x.id === id);
  if (!p) return id;
  const xs = pockets.map((x) => x.x);
  const ys = pockets.map((x) => x.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const across = (p.y - y0) / Math.max(1, y1 - y0) < 0.5 ? "top" : "bottom";
  const along = (p.x - x0) / Math.max(1, x1 - x0);
  return `${along < 0.34 ? "left" : along > 0.66 ? "right" : "middle"} ${across}`;
}

/** Pool: move the cue ball along the line when it is in hand, and call a ball and a pocket when the game asks. */
function PoolControls({ view, aim, stand, call }: { view: SportView; aim: AimAt; stand: (by: number) => void; call: (c: { ball: string; pocket: string } | null) => void }) {
  const place = view.shoot?.place ?? null;
  const asks = view.shoot?.call ?? null;
  const labels = new Map(view.table.bodies.map((b) => [b.id, b.label]));
  const pick = (ball: string | undefined, pocket: string | undefined) => call(ball && pocket ? { ball, pocket } : null);
  const what = view.game === "carrom" ? "striker" : "cue ball";
  return (
    <div className="sport-row pool-controls">
      {place && (
        <>
          <button type="button" aria-label={`Move the ${what} left`} onClick={() => stand(-300)}>
            ◀
          </button>
          <output className="sport-aim">{view.game === "carrom" ? "Striker on your line" : "Cue ball in hand"}</output>
          <button type="button" aria-label={`Move the ${what} right`} onClick={() => stand(300)}>
            ▶
          </button>
        </>
      )}
      {asks && (
        <>
          <label>
            <span className="sr-only">Ball to call</span>
            <select value={aim.call?.ball ?? ""} onChange={(e) => pick(e.target.value, aim.call?.pocket ?? asks.pockets[0])}>
              <option value="">Call a ball…</option>
              {asks.balls.map((id) => (
                <option key={id} value={id}>
                  {labels.get(id) ?? `Ball ${id}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Pocket to call</span>
            <select value={aim.call?.pocket ?? ""} onChange={(e) => pick(aim.call?.ball, e.target.value)}>
              <option value="">…in a pocket</option>
              {asks.pockets.map((id) => (
                <option key={id} value={id}>
                  {pocketName(view, id)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}
