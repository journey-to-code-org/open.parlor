// The arcade table: any arcade game, played in this browser. You have seat 0 and computer players
// the rest. The game runs at its own rate whatever the screen's (a fixed step, caught up a few ticks
// at a time), is drawn from its view on a canvas, and stops while the page is hidden or paused.
//
// A game that is steered (Shitstorm) is played with the keys and a finger on the field. A game that
// builds on a grid (Tower of Ryan) says so in its view (`build`), and gets a shop under the field: pick
// something and tap a square to build it, or tap what stands there to upgrade or sell it. A game
// with things to buy that are built nowhere (Chip Stack) says so too (`market`): its field is
// shorter, a tap on it is a tap, and everything on offer is listed underneath.
import { arcadeGame, points, recorder, shortly, type ArcadeBuild, type ArcadeGameId, type ArcadeMarket, type ArcadeView } from "@journey-to-code/games";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadFeedbackSettings, saveFeedbackSettings } from "../feedback/sounds";
import { loadArcadeBest, loadArcadeHouse, loadAutofire, saveArcadeBest, type ArcadeRules } from "../storage";
import { boardOf, sendRun, type HouseRun } from "./scores";
import { wants3d } from "../display";
import { controlsFor } from "./controls";
import { createPredictor, type Frame } from "./predict";
import { arcadeSays } from "./flavour";
import { hasArcade3d, loadArcade3d, type Arcade3d } from "./scene3d";
import { createArcadeScreen, type ArcadePointer } from "./screen";
import { notes, setArcadeSound, wakeArcadeSound } from "./sounds";

/** What the server's room says of an arcade game played live (see the server's arcade.ts). */
export interface LiveView {
  live: true;
  game: ArcadeGameId;
  seats: number;
  seat: number;
  rate: number;
  /** The whole game, as the arcade game itself keeps it. */
  arcade: unknown;
  /** Thousandths of a tick the game is behind (or, below zero, ahead of) the time it was reached. */
  owed: number;
  /** When it was reached, by the server's clock (ms); 0 before the first move. */
  at: number;
  /** How many of each seat's orders have been carried out. */
  done: number[];
  over: boolean;
}
/**
 * A game played live at a table on the server, with other people. The server's game is the real
 * one: this page is handed all of it every so often, plays it forward itself in between (the game
 * is deterministic), and sends its own orders to the table. An order shows here at once, and is
 * put back on top of each newer game from the server until the server's own count says it landed.
 */
export interface LiveDriver {
  seat: number;
  names: string[];
  /** The newest view from the room, and a number that changes when it does. */
  view: () => LiveView;
  version: () => number;
  serverNow: () => number;
  /** `gaps`: how many ticks each order waited after the one before it. */
  send: (inputs: unknown[], gaps: number[]) => Promise<unknown>;
}

/**
 * A game flown live at a table (Shitstorm): the server plays the one real game and says, over a
 * socket, what every seat's controls did on each tick. This page starts from the game as it stood
 * when it joined and plays every tick it is told of, so it sees the very same game a moment behind;
 * all it sends is what its own controls are doing.
 */
export interface StreamDriver {
  /** The table, which is where the socket is: /live/<table>. */
  table: string;
  /** The seat this page flies, or null when it only watches. */
  seat: number | null;
  names: string[];
  /** How the game came out, when the room already knows: a page that arrives after the end has no game to join. */
  result: { score: number; stage: string; scores: number[]; ticks: number } | null;
}

interface Props {
  game: ArcadeGameId;
  rules: ArcadeRules;
  seats: number;
  seed: number;
  autofire: boolean;
  /** A housemate's run being taken on: this is their seed, and that is their score. */
  rival?: { name: string; score: number };
  /** Played live at a table on the server, instead of here. */
  live?: LiveDriver;
  /** Flown live at a table on the server. */
  stream?: StreamDriver;
  /** Back to the game's setup screen. */
  onLeave: () => void;
}

/** What the corners show. The score is written straight to the page, as it changes most ticks. */
interface Hud {
  stage: string;
  lives: number;
  stats: ArcadeView["pilots"][number]["stats"];
  build: ArcadeBuild | null;
  market: ArcadeMarket | null;
}
interface Ending {
  score: number;
  best: number;
  isBest: boolean;
  stage: string;
  time: string;
  scores: number[];
}
/** What the house made of the run: still on its way, kept or not, or never got there. */
type Posted = { state: "sending" } | { state: "failed" } | { state: "done"; kept: boolean; best: number; place: number; top: HouseRun[] };

/** Whether this game was last switched to 3-D or to flat on this device; null when it never has been. */
function loadArcadeDepth(game: ArcadeGameId): boolean | null {
  try {
    const saved = localStorage.getItem(`cardroom:arcade3d:${game}`);
    return saved === "on" ? true : saved === "off" ? false : null;
  } catch {
    return null;
  }
}

/** The computer players: steady, and not quite perfect. */
const WINGMAN = { skill: 0.75, sloppy: 0.04 };
const clock = (ticks: number, rate: number) => `${Math.floor(ticks / rate / 60)}:${String(Math.floor(ticks / rate) % 60).padStart(2, "0")}`;

/** How often saved-up orders go to the table, and how many at once (the server takes no more). */
const SEND_EVERY_MS = 350;
const SEND_AT_MOST = 24;

export function ArcadeTable({ game: id, rules, seats, seed, autofire, rival, live: table, stream, onLeave }: Props) {
  // At a table on the server, either way: the game is everyone's, so no pause, no second go, no score of one's own.
  const shared = !!table || !!stream;
  const game = arcadeGame(id)!;
  const canvas = useRef<HTMLCanvasElement>(null);
  // The 3-D scene's canvas lies under the field's own, which then only draws what goes over it.
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const gl = useRef<Arcade3d | null>(null);
  /** Whether the frame just drawn was the 3-D scene's: where a tap lands depends on it. */
  const solid = useRef(false);
  // This game's own choice on this device, where one has been made with the 3D switch; until then
  // it follows the setting the tables share (⚙︎ at any of them: "The table is drawn").
  const [depth, setDepth] = useState(() => loadArcadeDepth(id) ?? wants3d(id));
  const depthRef = useRef(depth);
  depthRef.current = depth;
  const says = (text: string) => arcadeSays(id, text);
  const scoreEl = useRef<HTMLElement>(null);
  const bankEl = useRef<HTMLElement>(null);
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ending, setEnding] = useState<Ending | null>(null);
  const [house] = useState(() => (shared ? null : loadArcadeHouse()));
  const [posted, setPosted] = useState<Posted | null>(null);
  const [hud, setHud] = useState<Hud>({ stage: "", lives: 0, stats: [], build: null, market: null });
  // Building: what is picked in the shop, and which square is picked out on the field.
  const [pick, setPick] = useState<string | null>(null);
  const [chosen, setChosen] = useState<[number, number] | null>(null);
  const pointing = useRef<{ pick: string | null; chosen: [number, number] | null; hover: [number, number] | null }>({ pick: null, chosen: null, hover: null });
  pointing.current.pick = pick;
  pointing.current.chosen = chosen;
  const [sound, setSound] = useState(() => loadFeedbackSettings().sound);
  const [best, setBest] = useState(() => loadArcadeBest(id, rules, seats));
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const controls = useMemo(() => controlsFor(id, { autofire: () => autofire }), [id, autofire]);

  useEffect(() => {
    const el = canvas.current!;
    const normal = game.normalize(rules);
    // Play again: a new game from a new seed, unless a housemate's run is being taken on, which is always the same game.
    const playing = run === 0 || rival ? seed : Math.floor(Math.random() * 2 ** 31);
    let state = table ? structuredClone(table.view().arcade) : game.newGame(normal, seats, playing);
    const mySeat = table?.seat ?? stream?.seat ?? 0;
    // Flown at a table: the server's game as this page plays it (predict.ts), and the socket it comes over.
    const flight = stream ? createPredictor(game, stream.seat) : null;
    flight?.reset(state, 0, Array.from({ length: seats }, () => game.idle));
    let serverOver = false;
    let joined = false;
    let socket: WebSocket | null = null;
    let again: ReturnType<typeof setTimeout> | undefined;
    const endOf = (result: { score: number; stage: string; scores: number[]; ticks: number }) => {
      over = true;
      setEnding({ score: result.score, best: 0, isBest: false, stage: result.stage, time: clock(result.ticks, game.rate), scores: result.scores });
    };
    /** How the server's own game stands, as far as this page has been told. */
    const standing = () => {
      const sum = game.summary(flight!.real);
      return { score: sum.score, stage: game.view(flight!.real).stage, scores: sum.scores, ticks: sum.ticks };
    };
    function connect() {
      if (!stream || !flight || !live) return;
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live/${encodeURIComponent(stream.table)}`);
      socket = ws;
      ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data)) as { snap?: unknown; tick?: number; inputs?: unknown[]; over?: boolean; f?: Frame[] };
        if (m.snap) {
          flight.reset(m.snap, m.tick ?? 0, m.inputs ?? []);
          state = m.snap;
          joined = true;
          serverOver = !!m.over;
        } else if (m.f) flight.told(m.f);
        if (m.over) serverOver = true;
      };
      ws.onclose = (e) => {
        if (!live || over) return;
        // No game in the air at this table: it ended, or the server lost it.
        if (e.code === 4404) return endOf(stream.result ?? (joined ? standing() : { ...standing(), stage: "Lost in the storm" }));
        again = setTimeout(connect, 1000);
      };
    }
    /** One frame of a game that is flown: my controls out, the server's ticks in, and the game to draw. */
    function fly() {
      // As the server will take them: the same controls, said the same way.
      const out = flight!.frame(game.input(controls.read()));
      if (out.send && socket?.readyState === 1) socket.send(out.send);
      state = out.state;
      for (let i = 0; i < out.played; i++) {
        frame++;
        screen.settle();
      }
      screen.hear(out.events as Parameters<typeof screen.hear>[0], false, 0);
      if (serverOver && !flight!.behind && !over) {
        state = flight!.real;
        endOf(standing());
      }
    }
    // Live: every seat holding still, which is all this page knows of anyone else between the server's words.
    const held = (): { n: number }[] => {
      const seen = (state as { seen?: number[] }).seen ?? [];
      return Array.from({ length: seats }, (_, seat) => ({ ...(game.idle as object), n: seen[seat] ?? 0 }));
    };
    /** One of my orders carried out on the game here, as the server will: this seat's next, in a tick of its own. */
    const carryOut = (order: { gap: number }, spaced = true) => {
      for (let i = 0; spaced && i < order.gap; i++) game.step(state, held());
      const inputs = held();
      inputs[mySeat] = { ...order, n: inputs[mySeat]!.n + 1 };
      game.step(state, inputs);
    };
    // My orders the server has not said it carried out, oldest first; and those not sent yet.
    let pending: { gap: number }[] = [];
    let outbox: { gap: number }[] = [];
    let sinceOrder = 0;
    let landedBefore = table ? (table.view().done[mySeat] ?? 0) : 0;
    let lastRead = -1;
    let seenVersion = -1;
    /** Take up the server's newest game: played forward to now, with my own orders that have not landed put back on top. */
    function adopt() {
      if (!table) return;
      const v = table.view();
      seenVersion = table.version();
      state = structuredClone(v.arcade);
      const landed = (v.done[mySeat] ?? 0) - landedBefore;
      if (landed > 0) pending = pending.slice(landed);
      landedBefore = v.done[mySeat] ?? 0;
      const behind = v.at ? Math.max(0, table.serverNow() - v.at) : 0;
      let ticks = Math.min(v.rate * 5, Math.floor((behind * v.rate + v.owed) / 1000));
      while (ticks-- > 0) game.step(state, held());
      for (const order of pending) carryOut(order);
      owed = 0;
      if (v.over && !over) {
        over = true;
        const sum = game.summary(state);
        setEnding({ score: sum.score, best: 0, isBest: false, stage: game.view(state).stage, time: clock(sum.ticks, game.rate), scores: sum.scores });
      }
    }
    let sending = false;
    const post = table
      ? setInterval(() => {
          if (sending || !outbox.length || over) return;
          const batch = outbox.splice(0, SEND_AT_MOST);
          sending = true;
          table.send(batch, batch.map((o) => o.gap)).then(
            () => (sending = false),
            () => {
              // The table never got these: they are nobody's orders now.
              sending = false;
              pending = pending.filter((o) => !batch.includes(o));
            },
          );
        }, SEND_EVERY_MS)
      : null;
    // The run is written down as it is played, for the house to play back.
    const rec = recorder(game, seats);
    let live = true;
    setPosted(null);
    const screen = createArcadeScreen(el, game.view(state).field, says);
    screen.resize();
    gl.current?.reset();
    const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.clear();
    setEnding(null);
    setPaused(false);
    setChosen(null);
    pointing.current.hover = null;
    let over = false;
    let frame = 0;
    let last = performance.now();
    let owed = 0;
    let hudKey = "";
    let raf = 0;
    const stepMs = 1000 / game.rate;

    function liveTick() {
      const read = controls.read() as { n: number; cmd?: string };
      if (read.n !== lastRead && read.cmd && read.cmd !== "none") {
        lastRead = read.n;
        // How long since my last order goes with it, so the table can space them as they were given.
        const order = { ...read, gap: Math.min(sinceOrder, 30) };
        sinceOrder = 0;
        pending.push(order);
        outbox.push(order);
        carryOut(order, false);
      } else {
        lastRead = read.n;
        sinceOrder++;
        game.step(state, held());
      }
      screen.hear(game.view(state).events, false, 0);
      screen.settle();
    }

    function tick() {
      if (table) return liveTick();
      const inputs: unknown[] = [controls.read()];
      for (let seat = 1; seat < seats; seat++) inputs.push(game.bot(state, seat, WINGMAN));
      game.step(state, rec.tick(inputs));
      const view = game.view(state);
      screen.hear(view.events, false, 0);
      screen.settle();
      gl.current?.hear(view.events);
      gl.current?.settle();
      if (view.over) {
        over = true;
        const sum = game.summary(state);
        const isBest = saveArcadeBest(id, rules, seats, sum.score);
        const now = loadArcadeBest(id, rules, seats);
        setBest(now);
        setEnding({ score: sum.score, best: now, isBest, stage: view.stage, time: clock(sum.ticks, game.rate), scores: sum.scores });
        if (isBest && sum.score > 0) notes([523, 659, 784, 1046, 1318]);
        if (house) {
          setPosted({ state: "sending" });
          const board = boardOf(id, rules, seats);
          void sendRun(house.slug, { game: id, rules: normal, seats, seed: playing, log: rec.log, score: sum.score }).then((got) => {
            if (!live) return;
            if (!got) return setPosted({ state: "failed" });
            const top = got.runs.filter((r) => r.board === board);
            setPosted({ state: "done", kept: got.kept, best: got.best, place: top.findIndex((r) => r.me) + 1, top: top.slice(0, 5) });
          });
        }
      }
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(100, now - last);
      last = now;
      if (table && table.version() !== seenVersion) adopt();
      if (stream) {
        if (!over) fly();
        else {
          screen.settle();
          frame++;
        }
      } else if ((table || !pausedRef.current) && !over) {
        owed += dt;
        // Catch up a few ticks at most: after a long stall the game carries on from where it was.
        let steps = 0;
        while (owed >= stepMs && steps++ < 5 && !over) {
          tick();
          owed -= stepMs;
          frame++;
        }
        if (owed > stepMs * 5) owed = 0;
      } else if (over) {
        screen.settle();
        gl.current?.settle();
        frame++;
      }
      const view = game.view(state);
      const build = view.build;
      let pointer: ArcadePointer | undefined;
      if (build && !over) {
        const { pick: picked, chosen: at, hover } = pointing.current;
        const standing = at && build.built.find((b) => b.col === at[0] && b.row === at[1]);
        const item = picked ? build.shop.find((i) => i.key === picked) : undefined;
        if (standing) pointer = { cell: [standing.col, standing.row], range: standing.range, tone: "white" };
        else if (item && hover) pointer = { cell: hover, range: item.range, tone: item.tone, open: !build.closed.includes(hover[1] * build.cols + hover[0]) && !build.built.some((b) => b.col === hover[0] && b.row === hover[1]) };
      }
      // In three dimensions where the scene is up and wanted: its canvas has the field and what is
      // on it, and this one only what is written over it. Everywhere else it is drawn flat as ever.
      const scene = gl.current;
      const glEl = glCanvas.current;
      if (glEl && glEl.style.width !== el.style.width) {
        glEl.style.width = el.style.width;
        glEl.style.height = el.style.height;
      }
      solid.current = !!scene && depthRef.current && scene.render({ view, frame, width: el.clientWidth, height: el.clientHeight, dpr: Math.min(2, window.devicePixelRatio || 1), still, ...(pointer ? { pointer } : {}) });
      if (glEl) glEl.style.visibility = solid.current ? "visible" : "hidden";
      if (solid.current) screen.drawOverlay(view, frame, scene!.project);
      else screen.draw(view, frame, pointer);
      const me = view.pilots[mySeat] ?? view.pilots[0];
      const market = view.market;
      if (scoreEl.current) scoreEl.current.textContent = market ? shortly(view.score) : points(view.score);
      if (bankEl.current && market) bankEl.current.textContent = shortly(market.bank);
      if (me) {
        const building = build ? `|${build.bank}|${build.lives}|${build.next ? `${build.next.wave}:${Math.ceil(build.next.inTicks / game.rate)}:${build.next.bonus}` : ""}|${build.built.map((b) => `${b.id}:${b.level}`).join(",")}` : "";
        // The bank is written straight to the page; the list is drawn again only when what it says changes.
        const selling = market ? `|${market.perSecond}|${market.perTap}|${market.items.map((i) => `${i.key}:${i.cost}:${i.owned ?? ""}:${i.can ? 1 : 0}:${i.label}`).join(",")}|${market.badges.map((b) => b.label).join(",")}` : "";
        const stats = market ? "" : me.stats.map((s) => (s.max && s.max >= 100 ? Math.round((s.value * 20) / s.max) : s.value)).join(",");
        const key = `${view.stage}|${me.lives}|${stats}${building}${selling}`;
        if (key !== hudKey) {
          hudKey = key;
          setHud({ stage: view.stage, lives: me.lives, stats: me.stats, build: build ?? null, market: market ?? null });
        }
      }
    }
    raf = requestAnimationFrame(loop);
    connect();

    // A game at a table is everyone's: it does not stop for one of them.
    const pause = () => !over && !shared && setPaused(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      const down = e.type === "keydown";
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) e.preventDefault();
      if (down) wakeArcadeSound();
      if (down && !e.repeat && over && key === "enter" && !shared) return setRun((n) => n + 1);
      const build = game.view(state).build;
      if (build && down && !e.repeat && !over) {
        // Building by keyboard: a number picks from the shop, U and S are for the tower picked out, Space sends the wave.
        const { chosen: at, pick: picked } = pointing.current;
        const item = build.shop[Number(key) - 1];
        if (item) {
          setPick(item.key);
          return setChosen(null);
        }
        if (key === "escape" && (at || picked)) {
          setChosen(null);
          return setPick(null);
        }
        if (at && key === "u") return controls.order?.("upgrade", at[0], at[1]);
        if (at && key === "s") {
          controls.order?.("sell", at[0], at[1]);
          return setChosen(null);
        }
        if (key === " ") return controls.order?.("send");
      }
      if (down && !e.repeat && !over && !shared && (key === "p" || key === "escape")) return setPaused((p) => !p);
      controls.key(key, down);
    };
    const onBlur = () => {
      controls.clear();
      pause();
    };
    const onHide = () => document.hidden && pause();
    const onResize = () => screen.resize();
    const scale = () => game.view(state).field.width / Math.max(1, el.getBoundingClientRect().width);
    /** The square of the grid under a pointer, if the game has a grid and the pointer is on it. */
    const cellAt = (e: PointerEvent): [number, number] | null => {
      const build = game.view(state).build;
      const box = el.getBoundingClientRect();
      if (!build || !box.width) return null;
      // In the 3-D scene the ground is seen from an angle: the scene says what is under the pointer.
      const spot = solid.current ? gl.current?.pick((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height) : undefined;
      if (solid.current && !spot) return null;
      const col = Math.floor(spot ? spot[0] / build.cell : (((e.clientX - box.left) / box.width) * build.cols * build.cell) / build.cell);
      const row = Math.floor(spot ? spot[1] / build.cell : (((e.clientY - box.top) / box.height) * build.rows * build.cell) / build.cell);
      return col >= 0 && col < build.cols && row >= 0 && row < build.rows ? [col, row] : null;
    };
    const down = (e: PointerEvent) => {
      wakeArcadeSound();
      const seen = game.view(state);
      if (seen.market && !over && (table || !pausedRef.current)) {
        // A tap on the field is a tap on the chip, unless it lands on something to catch.
        const box = el.getBoundingClientRect();
        const x = ((e.clientX - box.left) / Math.max(1, box.width)) * seen.field.width;
        const y = ((e.clientY - box.top) / Math.max(1, box.height)) * seen.field.height;
        // In the 3-D scene the golden chip stands up off the table: it is caught where it is drawn.
        const where = (t: { x: number; y: number; r: number }): [number, number] => (solid.current && gl.current ? gl.current.project(t.x, t.y, t.r * 1.25) : [t.x, t.y]);
        const gold = seen.things.find((t) => t.kind === "golden" && Math.hypot(where(t)[0] - x, where(t)[1] - y) <= t.r * 1.6);
        return controls.order?.(gold ? "catch" : "tap");
      }
      const build = seen.build;
      const cell = cellAt(e);
      if (build && cell && !over && (table || !pausedRef.current)) {
        const { pick: picked } = pointing.current;
        pointing.current.hover = cell;
        if (build.built.some((b) => b.col === cell[0] && b.row === cell[1])) setChosen(cell);
        else {
          setChosen(null);
          // The game says why not, if not: the road, something there already, not enough gold.
          if (picked) controls.order?.("build", cell[0], cell[1], picked);
        }
        return;
      }
      controls.pointerDown(e.pointerId, e.clientX, e.clientY);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* a pointer that can't be captured still moves the ship while it is over the field */
      }
    };
    const move = (e: PointerEvent) => {
      // A mouse shows where a tower would go before it is built; a finger has no hover.
      if (e.pointerType === "mouse") pointing.current.hover = cellAt(e);
      controls.pointerMove(e.pointerId, e.clientX, e.clientY, scale());
    };
    const up = (e: PointerEvent) => controls.pointerUp(e.pointerId);
    addEventListener("keydown", onKey);
    addEventListener("keyup", onKey);
    addEventListener("blur", onBlur);
    addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onHide);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    const watcher = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
    if (el.parentElement) watcher?.observe(el.parentElement);
    wakeArcadeSound();
    return () => {
      live = false;
      if (post) clearInterval(post);
      clearTimeout(again);
      socket?.close();
      cancelAnimationFrame(raf);
      removeEventListener("keydown", onKey);
      removeEventListener("keyup", onKey);
      removeEventListener("blur", onBlur);
      removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onHide);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      watcher?.disconnect();
    };
  }, [run]);

  // The 3-D scene is fetched once the table is up, and only for a game that has one and where WebGL
  // works; until it is there (and for good, where it isn't) the field is drawn flat.
  useEffect(() => {
    const el = glCanvas.current;
    if (!el || !hasArcade3d(id)) return;
    let alive = true;
    let made: Arcade3d | null = null;
    loadArcade3d(el, id, game.view(game.newGame(game.normalize(rules), seats, seed)).field).then((scene) => {
      if (!alive || !scene) return scene?.dispose();
      made = scene;
      gl.current = scene;
    });
    return () => {
      alive = false;
      gl.current = null;
      made?.dispose();
    };
  }, [id]);

  /** In 3-D or flat: this device's choice for this game. */
  function toggleDepth() {
    const next = !depth;
    setDepth(next);
    try {
      localStorage.setItem(`cardroom:arcade3d:${id}`, next ? "on" : "off");
    } catch {
      /* private mode: it still applies for now */
    }
  }

  // A stat that is a meter (a timer running down) is drawn as a bar under the number before it,
  // which is what it belongs to: the chain's timer under the multiplier.
  const cells: { stat: Hud["stats"][number]; meter?: Hud["stats"][number] }[] = [];
  for (const stat of hud.stats) {
    const before = cells[cells.length - 1];
    const isMeter = (stat.max ?? 0) >= 100;
    if (isMeter && before && !before.meter) before.meter = stat;
    else if (!isMeter) cells.push({ stat });
  }

  const market = hud.market;
  const groups = market ? [...new Set(market.items.map((i) => i.group))] : [];
  const build = hud.build;
  const standing = build && chosen ? build.built.find((b) => b.col === chosen[0] && b.row === chosen[1]) : undefined;
  // The first thing in the shop is picked to begin with, so the first tap on the field builds.
  useEffect(() => {
    if (build && pick === null && !chosen) setPick(build.shop[0]?.key ?? null);
  }, [build === null]);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    saveFeedbackSettings({ ...loadFeedbackSettings(), sound: next });
    setArcadeSound(next);
    if (next) wakeArcadeSound();
  }

  return (
    <main className="arcade">
      <div className="arcade-cabinet">
        <div className="arcade-rail">
          <div className="arcade-cell">
            <small>Score</small>
            <b className="arcade-score" ref={scoreEl}>0</b>
          </div>
          <div className="arcade-cell">
            <small>Best</small>
            <b className="arcade-best">{market ? shortly(best) : points(best)}</b>
          </div>
          <span className="arcade-grow" />
          <div className="arcade-cell right">
            <small>{game.name}</small>
            <b>{hud.stage}</b>
          </div>
        </div>
        <div className={`arcade-stage ${market ? "short" : ""}`}>
          <canvas ref={glCanvas} className="arcade-gl" aria-hidden />
          <canvas ref={canvas} tabIndex={0} aria-label={`${game.name}: the field`} />
          {paused && !ending && (
            <section className="arcade-sheet" aria-label="Paused">
              <div className="arcade-card">
                <h2>Paused</h2>
                <ul className="arcade-controls">
                  {game.controls.map((line) => (
                    <li key={line}>{says(line)}</li>
                  ))}
                </ul>
                <div className="arcade-row">
                  <button type="button" className="primary" autoFocus onClick={() => setPaused(false)}>
                    Carry on
                  </button>
                  <button type="button" className="secondary" onClick={onLeave}>
                    Leave the game
                  </button>
                </div>
              </div>
            </section>
          )}
          {ending && (
            <section className="arcade-sheet" aria-label="Game over">
              <div className="arcade-card">
                <h2>Game over</h2>
                <div className="arcade-final">{points(ending.score)}</div>
                {shared ? <p>Everyone at the table, together.</p> : <p>{ending.isBest ? "A new best on this device." : `Your best: ${points(ending.best)}`}</p>}
                {rival && (
                  <p className="arcade-rival">
                    {ending.score > rival.score ? `You beat ${rival.name} (${points(rival.score)}) at the very same game.` : ending.score === rival.score ? `Level with ${rival.name} at the very same game.` : `${rival.name === "your best" ? "Your best" : rival.name} had ${points(rival.score)} at this same game.`}
                  </p>
                )}
                {house && posted && (
                  <div className="arcade-house">
                    {posted.state === "sending" ? (
                      <p>Sending the run to {house.name}…</p>
                    ) : posted.state === "failed" ? (
                      <p>{house.name} could not be reached, so this run stays here.</p>
                    ) : (
                      <>
                        <p>{posted.kept ? `That is your best in ${house.name}${posted.place ? `: number ${posted.place} with these rules.` : "."}` : `Your best in ${house.name} is still ${points(posted.best)}.`}</p>
                        <ol>
                          {posted.top.map((r) => (
                            <li key={r.name + r.at} className={r.me ? "mine" : ""}>
                              <b>{r.me ? `${r.name} (you)` : r.name}</b>
                              <span>{points(r.score)}</span>
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                  </div>
                )}
                {market && <p>Every chip earned in the run.</p>}
                <dl className="arcade-stats">
                  {!market && (
                    <>
                      <dt>Reached</dt>
                      <dd>{ending.stage}</dd>
                    </>
                  )}
                  <dt>Time</dt>
                  <dd>{ending.time}</dd>
                  {ending.scores.length > 1 &&
                    ending.scores.map((n, seat) => (
                      <div key={seat} className="arcade-pair">
                        <dt>{shared ? (seat === (table ?? stream)!.seat ? `${(table ?? stream)!.names[seat] ?? "You"} (you)` : ((table ?? stream)!.names[seat] ?? `Seat ${seat + 1}`)) : seat === 0 ? "You" : `Computer ${seat}`}</dt>
                        <dd>{points(n)}</dd>
                      </div>
                    ))}
                </dl>
                <div className="arcade-row">
                  {!shared && (
                    <button type="button" className="primary" autoFocus onClick={() => setRun((n) => n + 1)}>
                      {rival ? "Try that game again" : "Play again"}
                    </button>
                  )}
                  <button type="button" className={shared ? "primary" : "secondary"} onClick={onLeave}>
                    {shared ? "Leave the table" : "Change the rules"}
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
        {market && (
          <div className="arcade-market">
            <div className="arcade-till">
              <div className="arcade-cell">
                <small>In the bank</small>
                <b className="arcade-bank" ref={bankEl}>
                  0
                </b>
              </div>
              <div className="arcade-cell">
                <small>A second</small>
                <b>{shortly(market.perSecond)}</b>
              </div>
              <div className="arcade-cell">
                <small>A tap</small>
                <b>{shortly(market.perTap)}</b>
              </div>
              <span className="arcade-grow" />
              {market.badges.map((b) => (
                <span key={b.key} className="arcade-badge" data-tone={b.tone}>
                  {b.label}
                </span>
              ))}
            </div>
            <div className="arcade-goods">
              {groups.map((group) => (
                <section key={group} aria-label={group}>
                  <h3>{group}</h3>
                  {market.items
                    .filter((i) => i.group === group)
                    .map((item) => (
                      <button key={item.key} type="button" className="arcade-good" disabled={!item.can || !!ending} onClick={() => controls.order?.(item.key)}>
                        <span className="arcade-good-name">
                          <b>{item.label}</b>
                          <small>{item.hint}</small>
                        </span>
                        {item.owned !== undefined && <span className="arcade-owned">{item.owned}</span>}
                        {item.cost > 0 && <span className="arcade-cost">{shortly(item.cost)}</span>}
                      </button>
                    ))}
                </section>
              ))}
            </div>
          </div>
        )}
        {build && !ending && (
          <div className="arcade-shop">
            {standing ? (
              <>
                <div className="arcade-cell arcade-about">
                  <small>
                    Level {standing.level} of {standing.maxLevel}
                  </small>
                  <b>{standing.label}</b>
                </div>
                <span className="arcade-grow" />
                <button type="button" className="arcade-btn buy" disabled={standing.upgrade === null || standing.upgrade > build.bank} onClick={() => controls.order?.("upgrade", standing.col, standing.row)}>
                  {standing.upgrade === null ? "Fully upgraded" : `Upgrade · ${standing.upgrade}`}
                </button>
                <button
                  type="button"
                  className="arcade-btn"
                  onClick={() => {
                    controls.order?.("sell", standing.col, standing.row);
                    setChosen(null);
                  }}
                >
                  Sell · {standing.sell}
                </button>
                <button type="button" className="arcade-btn" aria-label="Back to the shop" onClick={() => setChosen(null)}>
                  ✕
                </button>
              </>
            ) : (
              build.shop.map((item, i) => (
                <button key={item.key} type="button" className="arcade-btn item" data-tone={item.tone} aria-pressed={pick === item.key} disabled={item.cost > build.bank} title={`${item.hint} (key ${i + 1})`} onClick={() => setPick(item.key)}>
                  <b>{item.label}</b>
                  <small>{item.cost}</small>
                </button>
              ))
            )}
          </div>
        )}
        <div className="arcade-rail low">
          {build ? (
            <>
              <div className="arcade-cell">
                <small>Lives</small>
                <b className="arcade-hearts">♥ {build.lives}</b>
              </div>
              <div className="arcade-cell">
                <small>Gold</small>
                <b className="arcade-best">{points(build.bank)}</b>
              </div>
              {build.next && !ending && (
                <button type="button" className="arcade-btn send" title={build.next.preview} onClick={() => controls.order?.("send")}>
                  <b>
                    Send wave {build.next.wave}
                    {build.next.bonus > 0 ? ` · +${build.next.bonus}` : ""}
                  </b>
                  <small>
                    {build.next.preview} · {Math.ceil(build.next.inTicks / game.rate)}s
                  </small>
                </button>
              )}
            </>
          ) : market ? null : (
            <div className="arcade-cell">
              <small>Ships</small>
              <b className="arcade-lives">{"▲".repeat(Math.max(0, hud.lives - 1)) || "–"}</b>
            </div>
          )}
          {!build && !market && cells.map(({ stat: s, meter }) => (
            <div className="arcade-cell" key={s.key}>
              <small>{says(s.label)}</small>
              {s.key === "multiplier" ? (
                <b data-hot={s.value >= 8 ? 2 : s.value >= 3 ? 1 : 0}>×{s.value}</b>
              ) : (
                <b className={`arcade-pips ${s.key}`} aria-label={`${s.value}${s.max ? ` of ${s.max}` : ""}`}>
                  {"●".repeat(s.value) || "–"}
                </b>
              )}
              {meter?.max && <div className="arcade-bar" role="img" aria-label={`${meter.label}: ${Math.round((meter.value * 100) / meter.max)}%`} style={{ ["--fill" as string]: `${(meter.value * 100) / meter.max}%` }} />}
            </div>
          ))}
          <span className="arcade-grow" />
          {controls.specialLabel && (
            <button type="button" className="arcade-btn special" onPointerDown={(e) => (e.preventDefault(), controls.special())}>
              {says(controls.specialLabel)}
            </button>
          )}
          {hasArcade3d(id) && (
            <button type="button" className="arcade-btn" aria-pressed={depth} title={depth ? "Drawn in 3D. Press for the flat drawing." : "Drawn flat. Press for 3D."} onClick={toggleDepth}>
              3D
            </button>
          )}
          <button type="button" className="arcade-btn" hidden={shared} onClick={() => !ending && !shared && setPaused((p) => !p)}>
            {paused ? "Carry on" : "Pause"}
          </button>
          <button type="button" className="arcade-btn" aria-pressed={sound} aria-label={sound ? "Turn sounds off" : "Turn sounds on"} onClick={toggleSound}>
            {sound ? "🔊" : "🔇"}
          </button>
        </div>
      </div>
    </main>
  );
}

/** The arcade games that can be played live at a table on the server: by giving orders through the room, or (Shitstorm) flown over a socket. */
export const LIVE_ARCADE: ArcadeGameId[] = ["skyfire", "bulwark", "chipstack"];
export const isLiveArcade = (id: unknown): id is ArcadeGameId => LIVE_ARCADE.includes(id as ArcadeGameId);

/** An arcade game at a table on the server: the room's views in, this seat's orders out. */
export function LiveArcade({ view, table, seat, flying, names, serverNow, act, onLeave }: { view: LiveView | FlownView; table: string; seat: number; /** False for someone only watching. */ flying: boolean; names: string[]; serverNow: () => number; act: (move: unknown) => Promise<unknown>; onLeave: () => void }) {
  if ("stream" in view) return <Flown view={view} table={table} seat={flying ? seat : null} names={names} onLeave={onLeave} />;
  return <Ordered view={view} seat={seat} names={names} serverNow={serverNow} act={act} onLeave={onLeave} />;
}

/** What the room says of a game that is flown: who sits where, and how it came out. The game itself comes over the socket. */
export interface FlownView {
  live: true;
  stream: true;
  game: ArcadeGameId;
  seats: number;
  seat: number;
  over: boolean;
  result: StreamDriver["result"];
}

function Flown({ view, table, seat, names, onLeave }: { view: FlownView; table: string; seat: number | null; names: string[]; onLeave: () => void }) {
  const game = arcadeGame(view.game)!;
  // The driver is read once, as the table opens: the socket says everything after that.
  const driver = useMemo<StreamDriver>(() => ({ table, seat, names, result: view.result }), [table, seat]);
  return <ArcadeTable game={view.game} rules={game.presets[0] as ArcadeRules} seats={view.seats} seed={0} autofire={loadAutofire()} stream={driver} onLeave={onLeave} />;
}

function Ordered({ view, seat, names, serverNow, act, onLeave }: { view: LiveView; seat: number; names: string[]; serverNow: () => number; act: (move: unknown) => Promise<unknown>; onLeave: () => void }) {
  const latest = useRef({ view, version: 0 });
  if (latest.current.view !== view) latest.current = { view, version: latest.current.version + 1 };
  const driver = useMemo<LiveDriver>(
    () => ({
      seat,
      names,
      view: () => latest.current.view,
      version: () => latest.current.version,
      serverNow,
      send: (inputs, gaps) => act({ type: "cmd", inputs, gaps }),
    }),
    [seat, names.join("|")],
  );
  const game = arcadeGame(view.game)!;
  return <ArcadeTable game={view.game} rules={game.presets[0] as ArcadeRules} seats={view.seats} seed={0} autofire={false} live={driver} onLeave={onLeave} />;
}
