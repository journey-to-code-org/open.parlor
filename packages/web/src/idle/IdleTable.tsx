// The screen for an idle game. The game is kept in this browser: opened again, it is brought up to
// date from the clock, and if that was a while it says what happened. While the page is open it is
// brought up to date a few times a second, and saved every few seconds and whenever the page is
// put away.
//
// A player in a house can keep the store there instead (the Parts Network): it is then the same
// store on every device they are in that house on, and the house sees how each member's store
// stands. The page still plays it; the house is sent a copy every so often, and when the house's
// copy has been played somewhere else since, that one is taken up here.
import { DELBIES_FLOOR_RULES, DELBIES_PIECES, dollars, idleGame, type DelbiesCommand, type DelbiesPieceId, type DelbiesState, type DelbiesView, type IdleClock, type IdleGameId, type IdleReport } from "@journey-to-code/games";
import { useEffect, useRef, useState } from "react";
import { blip, notes, wakeArcadeSound } from "../arcade/sounds";
import { loadIdle, loadIdleHouse, loadMyHouses, saveIdle, saveIdleHouse } from "../storage";
import { useWants3d } from "../display";
import { BOARD_TRANSFORM } from "../board/board3d";
import { loadCounter3d, type Counter3d, type CounterLook } from "./counter3d";
import { loadFloor3d, type Floor3d, type FloorLook } from "./floor3d";
import { fetchNetwork, fetchStandings, fetchStore, networkDo, sendStore, type NetworkLook, type Parcel, type Standing } from "./network";

/** The time, as the game wants it: the second, and the time of day on this device. */
export function clockNow(): IdleClock {
  const d = new Date();
  return { now: Math.floor(d.getTime() / 1000), minute: d.getHours() * 60 + d.getMinutes(), day: d.getDay() };
}

/** What a piece is called on its square, where there is only room for a word. */
const SHORT: Partial<Record<DelbiesPieceId, string>> = { door: "Door", office: "Office", warranty: "Returns", bench: "Bench", microwave: "Pasta", bathroom: "WC" };

const hoursAndMinutes = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`);
const minutesAndSeconds = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const GROUPS: [role: string, name: string, about: string][] = [
  ["counter", "The Daycare", "The counter crew. They need watching."],
  ["driver", "The Geriatrics", "The drivers. They need dispatching."],
  ["office", "The office", "The ones who keep it legal."],
];

export function IdleTable({ game: id, onHome }: { game: IdleGameId; onHome: () => void }) {
  // One idle game so far, so this screen is its screen.
  const game = idleGame(id)!;
  const state_ = useRef<DelbiesState | null>(null);
  const [view, setView] = useState<DelbiesView | null>(null);
  const [report, setReport] = useState<IdleReport | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [asking, setAsking] = useState(false);
  const [moving, setMoving] = useState(false);
  // The floor plan: the piece picked up, waiting for a square to be put down on.
  const [holding, setHolding] = useState<DelbiesPieceId | null>(null);
  // The Parts Network: the house this store is kept in, how its stores stand, and a choice to make
  // when the house already has a store of this player's.
  const [house, setHouse] = useState(() => loadIdleHouse(id));
  const houseRef = useRef(house);
  houseRef.current = house;
  const [standings, setStandings] = useState<Standing[]>([]);
  const [clash, setClash] = useState<{ slug: string; name: string; state: DelbiesState; rev: number } | null>(null);
  const myHouses = loadMyHouses();
  const [net, setNet] = useState<NetworkLook | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Look at the house's network: take in whatever is waiting for this store, and make what the house
   * has up for sale agree with what this store thinks it has listed.
   */
  const lookNet = async () => {
    const at = houseRef.current;
    const s = state_.current;
    if (!at || !s) return setNet(null);
    let seen = await fetchNetwork(at.slug, id);
    if (!seen || houseRef.current?.slug !== at.slug) return;
    if (seen.waiting > 0) {
      const got = await networkDo(at.slug, id, "collect");
      const parcels: Parcel[] = got.ok && Array.isArray(got.body.parcels) ? got.body.parcels : [];
      for (const parcel of parcels) act({ cmd: "receive", what: parcel.what, from: parcel.from }, true);
      if (parcels.length) {
        notes([523, 659, 784], 70, 0.1);
        void sync();
      }
    }
    const listed = state_.current ? game.view(state_.current, clockNow()).network.tabs.listed : 0;
    const mine = seen.listings.some((l) => l.mine);
    if (listed > 0 && !mine) await networkDo(at.slug, id, "list", { amount: listed });
    if (listed === 0 && mine) await networkDo(at.slug, id, "unlist");
    if ((listed > 0) !== mine) seen = (await fetchNetwork(at.slug, id)) ?? seen;
    if (houseRef.current?.slug === at.slug) setNet(seen);
  };
  /** One thing at a time on the network, then a fresh look at it. */
  const onNetwork = async (work: (slug: string) => Promise<void>) => {
    const at = houseRef.current;
    if (!at || busy) return;
    setBusy(true);
    try {
      await work(at.slug);
      await sync();
      await lookNet();
      void fetchStandings(at.slug, id).then(setStandings);
    } finally {
      setBusy(false);
    }
  };
  const say = (text: string) => setToast({ text, key: Date.now() });
  const sendHotshot = (to: Standing) =>
    onNetwork(async (slug) => {
      if (!state_.current || !game.view(state_.current, clockNow()).network.hotshot.can) return void act({ cmd: "hotshot" });
      const sent = await networkDo(slug, id, "hotshot", { to: to.id });
      if (!sent.ok) return say(sent.status === 429 ? "The truck was out too recently." : sent.body.error ?? "The house can't be reached just now.");
      act({ cmd: "hotshot" });
      say(`A driver is on his way to ${to.name}.`);
    });
  const listTabs = () =>
    onNetwork(async (slug) => {
      const done = act({ cmd: "list" });
      if (!done?.ok || !state_.current) return;
      const listed = game.view(state_.current, clockNow()).network.tabs.listed;
      const up = await networkDo(slug, id, "list", { amount: listed });
      if (!up.ok) {
        act({ cmd: "unlist" }, true);
        say("The house can't be reached just now.");
      }
    });
  const unlistTabs = () =>
    onNetwork(async (slug) => {
      const down = await networkDo(slug, id, "unlist");
      // Refused: somebody has bought them, and the money is waiting.
      if (down.ok) act({ cmd: "unlist" });
      else if (down.status !== 409) say("The house can't be reached just now.");
    });
  const buyTabs = (lot: NetworkLook["listings"][number]) =>
    onNetwork(async (slug) => {
      if (!state_.current || !game.view(state_.current, clockNow()).network.tabs.canBuy) return void act({ cmd: "buy", from: lot.name });
      const bought = await networkDo(slug, id, "buy", { id: lot.id });
      if (!bought.ok) return say(bought.status === 409 ? "Somebody got there first." : bought.body.error ?? "The house can't be reached just now.");
      act({ cmd: "buy", from: lot.name });
    });

  const keep = (next: { slug: string; name: string; rev: number } | null) => {
    saveIdleHouse(id, next);
    houseRef.current = next;
    setHouse(next);
  };
  /** Take up a store from the house in place of the one here. */
  const adopt = (state: unknown, rev: number, at: { slug: string; name: string }) => {
    const loaded = game.load(state) as DelbiesState | null;
    if (!loaded) return false;
    state_.current = loaded;
    saveIdle(id, loaded);
    keep({ ...at, rev });
    refresh();
    return true;
  };
  /** Send the store to its house; take the house's up instead when that one is newer. */
  const sync = async () => {
    const at = houseRef.current;
    const s = state_.current;
    if (!at || !s || document.hidden) return;
    const sent = await sendStore(at.slug, id, s, at.rev);
    if (houseRef.current?.slug !== at.slug) return;
    if (sent.kind === "saved") keep({ ...at, rev: sent.rev });
    else if (sent.kind === "newer") {
      if (adopt(sent.state, sent.rev, at)) setToast({ text: "Picked up where your other device left off.", key: Date.now() });
    } else if (sent.kind === "gone") {
      keep(null);
      setToast({ text: `You are no longer in ${at.name}. The store is kept here.`, key: Date.now() });
    }
  };
  /** Put the store in a house: straight in when the house has none of this player's, a choice when it has. */
  const join = async (slug: string) => {
    const chosen = myHouses.find((h) => h.slug === slug);
    if (!chosen) return;
    const theirs = await fetchStore(slug, id);
    if (!theirs) return setToast({ text: "That house can't be reached just now.", key: Date.now() });
    const loaded = theirs.state ? (game.load(theirs.state) as DelbiesState | null) : null;
    if (loaded) return setClash({ slug, name: chosen.name, state: loaded, rev: theirs.rev });
    keep({ slug, name: chosen.name, rev: theirs.rev });
    void sync().then(() => fetchStandings(slug, id).then(setStandings));
  };

  useEffect(() => {
    if (!house) {
      setNet(null);
      return setStandings([]);
    }
    let live = true;
    const look = () => {
      void fetchStandings(house.slug, id).then((s) => live && setStandings(s));
      void lookNet();
    };
    // On opening, the house's copy is taken up if it was played somewhere else since this browser last agreed with it.
    void fetchStore(house.slug, id).then((theirs) => {
      if (!live || !theirs) return;
      if (theirs.state && theirs.rev !== house.rev) adopt(theirs.state, theirs.rev, house);
      else void sync();
      look();
    });
    const send = setInterval(() => void sync(), 15_000);
    const watch = setInterval(() => document.hidden || look(), 20_000);
    const away = () => document.hidden || void sync();
    document.addEventListener("visibilitychange", away);
    return () => {
      live = false;
      clearInterval(send);
      clearInterval(watch);
      document.removeEventListener("visibilitychange", away);
    };
  }, [house?.slug]);

  // The counter, drawn in 3-D in the big button where the face was (counter3d.ts): a picture of
  // what the numbers already say. Where it can't be drawn, or isn't wanted, the face is still there.
  const three = useWants3d(id);
  const sceneCanvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Counter3d | null>(null);
  const [sceneUp, setSceneUp] = useState(false);
  const look = useRef<CounterLook | null>(null);
  /** Taken on, and at work just now: not in the restroom, picking things up, off, or clocked out. */
  const here = (c: DelbiesView["crew"][number]) => c.hired && (!c.status || c.status === "On the clock");
  if (view) {
    const driversIn = view.crew.filter((c) => c.role === "driver" && here(c));
    look.current = {
      chaos: view.chaos / 1000,
      stress: view.stress / 1000,
      dream: view.fever > 0,
      away: view.vacation > 0,
      panic: view.panic,
      clutter: Math.min(1, view.clutter / 1000),
      asking: !!view.request,
      radio: !!view.radio,
      // Along the counter in the order the floor plan seats them: its front row, left to right.
      counter: view.floor.pieces.flatMap((p) => {
        const who = DELBIES_PIECES.find((x) => x.id === p.id)?.crew;
        const c = who && view.crew.find((x) => x.id === who);
        return c && here(c) && p.square >= view.floor.cols ? [{ who: c.id, seat: p.square - view.floor.cols }] : [];
      }),
      // A truck in the yard for each driver who is in, less the one out on a hotshot run.
      trucks: Math.max(0, driversIn.length - (view.network.hotshot.outSeconds > 0 ? 1 : 0)),
      desk: view.desk.hired && view.desk.on,
      payroll: view.payroll.inSeconds,
      moves: view.move.moves,
      department: view.move.departments[view.move.departments.length - 1] ?? null,
      inspector: view.inspector ? (view.inspector.here ? "here" : "coming") : null,
      sticker: view.sticker > 0,
      minute: clockNow().minute,
    };
  }
  // What has just happened is said over the picture for a few seconds, as well as in the log.
  const newest = view?.log[view.log.length - 1];
  const [caption, setCaption] = useState<{ text: string; key: string } | null>(null);
  const lastTold = useRef<string | null>(null);
  useEffect(() => {
    if (!newest) return;
    const key = `${newest.at}|${newest.text}`;
    // Whatever was already in the log when the page opened is old news.
    if (lastTold.current !== null && key !== lastTold.current) setCaption({ text: newest.text, key });
    lastTold.current = key;
  }, [newest?.at, newest?.text]);
  useEffect(() => {
    if (!caption) return;
    const gone = setTimeout(() => setCaption(null), 6000);
    return () => clearTimeout(gone);
  }, [caption]);

  // The floor plan as a room (floor3d.ts), under its own grid of squares.
  const roomCanvas = useRef<HTMLCanvasElement>(null);
  const roomGrid = useRef<HTMLDivElement>(null);
  const room = useRef<Floor3d | null>(null);
  const [roomUp, setRoomUp] = useState(false);
  const floorLook = useRef<FloorLook | null>(null);
  if (view) {
    const at = new Map(view.floor.pieces.map((p) => [p.id, p.square]));
    const { cols } = view.floor;
    const beside = (a: number, b: number) => (Math.abs(a - b) === 1 && Math.floor(a / cols) === Math.floor(b / cols)) || Math.abs(a - b) === cols;
    floorLook.current = {
      cols,
      rows: view.floor.rows,
      pieces: view.floor.pieces.map((p) => ({ id: p.id, square: p.square, fixed: p.fixed, empty: p.empty })),
      holding,
      // A rule in effect joins the two things it is about, wherever they now stand side by side.
      links: view.floor.rules
        .filter((r) => r.active)
        .flatMap((r) => {
          const rule = DELBIES_FLOOR_RULES.find((x) => x.id === r.id);
          const a = rule && at.get(rule.a);
          if (!rule || a === undefined) return [];
          return rule.b.flatMap((id) => {
            const b = at.get(id);
            return b !== undefined && beside(a, b) ? [{ a, b, good: r.good }] : [];
          });
        }),
      drivers: view.crew
        .filter((c) => c.role === "driver" && here(c))
        .map((c) => c.id)
        .slice(view.network.hotshot.outSeconds > 0 ? 1 : 0),
      who: Object.fromEntries(DELBIES_PIECES.filter((p) => p.crew).map((p) => [p.id, p.crew!])),
      away: view.crew.filter((c) => c.hired && !here(c)).map((c) => c.id),
      hungry: view.breakroom.brice && view.breakroom.hungry,
      cinnamon: view.breakroom.cinnamon,
      shocked: view.breakroom.plutoShocked > 0,
      inspector: view.inspector?.here ? { passing: view.inspector.checks.filter((c) => c.ok).length, of: view.inspector.checks.length } : null,
    };
  }
  const ready = !!view;
  useEffect(() => {
    const el = roomCanvas.current;
    const grid = roomGrid.current;
    if (!three || !ready || !el || !grid) return setRoomUp(false);
    let alive = true;
    let raf = 0;
    const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      const r = room.current;
      if (!r || !floorLook.current || document.hidden) return;
      // The camera is set by the grid's width on the page, in the scene and in the CSS alike.
      grid.parentElement?.style.setProperty("--board-s", `${grid.clientWidth}px`);
      setRoomUp(r.render(floorLook.current, time, el.clientWidth, el.clientHeight, grid.clientWidth, Math.min(2, window.devicePixelRatio || 1), still));
    };
    loadFloor3d(el).then((r) => {
      if (!alive || !r) return r?.dispose();
      room.current = r;
      raf = requestAnimationFrame(draw);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      room.current?.dispose();
      room.current = null;
      setRoomUp(false);
    };
  }, [three, ready]);
  useEffect(() => {
    const el = sceneCanvas.current;
    if (!three || !ready || !el) return setSceneUp(false);
    let alive = true;
    let raf = 0;
    const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      const s = scene.current;
      if (!s || !look.current || document.hidden) return;
      // Until it has drawn once the canvas takes no room: it is sized from the button it will sit in.
      const width = el.clientWidth || Math.max(0, (el.parentElement?.clientWidth ?? 0) - 16);
      setSceneUp(s.render(look.current, time, width, el.clientHeight || Math.round(width / 2.3), Math.min(2, window.devicePixelRatio || 1), still));
    };
    loadCounter3d(el).then((s) => {
      if (!alive || !s) return s?.dispose();
      scene.current = s;
      raf = requestAnimationFrame(draw);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      scene.current?.dispose();
      scene.current = null;
      setSceneUp(false);
    };
  }, [three, ready]);

  const refresh = () => {
    const s = state_.current;
    if (!s) return;
    const told = game.advance(s, clockNow());
    if (told.lines.length) setReport(told);
    setView(game.view(s, clockNow()));
  };

  useEffect(() => {
    const clock = clockNow();
    state_.current = (game.load(loadIdle(id)) as DelbiesState | null) ?? (game.newGame(Math.floor(Math.random() * 2 ** 31), clock) as DelbiesState);
    refresh();
    const tick = setInterval(refresh, 250);
    const save = () => state_.current && saveIdle(id, state_.current);
    const keep = setInterval(save, 5000);
    // Back from another tab: catch up at once, and say what happened if it was a while.
    const seen = () => (document.hidden ? save() : refresh());
    document.addEventListener("visibilitychange", seen);
    addEventListener("pagehide", save);
    return () => {
      clearInterval(tick);
      clearInterval(keep);
      document.removeEventListener("visibilitychange", seen);
      removeEventListener("pagehide", save);
      save();
    };
  }, [id]);

  function act(command: DelbiesCommand, quiet = false) {
    const s = state_.current;
    if (!s) return;
    wakeArcadeSound();
    const result = game.act(s, command, clockNow());
    if (result.message) setToast({ text: result.message, key: Date.now() });
    if (!quiet) {
      if (result.ok) notes(command.cmd === "hire" ? [440, 554, 659] : [520, 700], 60, 0.08);
      else if (result.message) blip(140, 0.12, "square", 0.04);
    }
    setView(game.view(s, clockNow()));
    return result;
  }
  function hustle() {
    const result = act({ cmd: "hustle" }, true);
    if (result?.ok) {
      scene.current?.ring();
      if (result.message) notes([523, 659, 784, 1046], 70, 0.12);
      else blip(600 + Math.random() * 140, 0.04, "triangle", 0.03, -200);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement) return;
      if (e.key === " ") {
        e.preventDefault();
        if (!e.repeat) hustle();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const gone = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(gone);
  }, [toast]);

  if (!view) return <main className="delbies" />;
  // The same thing happening again and again is said once, newest first: by its first few words, since the sums differ.
  const told: { at: number; text: string; times: number }[] = [];
  for (const entry of [...view.log].reverse()) {
    const same = told.find((t) => t.text.slice(0, 18) === entry.text.slice(0, 18));
    if (same) same.times++;
    else told.push({ ...entry, times: 1 });
  }
  const owed = view.tabCeiling ? Math.min(100, (view.tabs * 100) / view.tabCeiling) : 0;

  return (
    <main className="delbies">
      <header className="delbies-top">
        <button type="button" className="delbies-back" onClick={onHome}>
          ← All games
        </button>
        <h1>
          <span aria-hidden="true">{game.emoji}</span> {game.name}
        </h1>
        <div className="delbies-till">
          <div>
            <small>In the till</small>
            <b className="cash">{dollars(view.cash)}</b>
          </div>
          <div>
            <small>A second</small>
            <b>{dollars(view.perSecond)}</b>
          </div>
          <div>
            <small>The store's name</small>
            <b>Level {view.repLevel}</b>
          </div>
        </div>
      </header>

      <div className="delbies-floor">
        <section className="delbies-desk" aria-label="Delbie">
          <button type="button" className={`delbies-delbie ${view.fever > 0 ? "dream" : ""} ${view.vacation > 0 ? "away" : ""} ${sceneUp ? "scened" : ""}`} onClick={hustle}>
            {three && <canvas ref={sceneCanvas} className={`delbies-scene${sceneUp ? " up" : ""}`} aria-hidden="true" />}
            {sceneUp && caption && (
              <span key={caption.key} className="delbies-caption" aria-hidden="true">
                {caption.text}
              </span>
            )}
            {!sceneUp && (
              <span className="face" aria-hidden="true">
                {view.vacation > 0 ? "🎣" : view.fever > 0 ? "😁" : view.chaos >= 500 ? "😤" : "🙂"}
              </span>
            )}
            <span className="shout">{view.shout}</span>
            <small>
              {view.vacation > 0 ? `Back in ${minutesAndSeconds(view.vacation)}. The store is doing fine.` : `Hustle: ${dollars(view.perClick)} a click${view.fever > 0 ? ` · ${view.fever}s of the dream left` : ""}`}
            </small>
          </button>

          <div className="delbies-meters">
            <Meter label="Counter chaos" value={view.chaos} tone={view.chaos >= 500 ? "bad" : "ok"} note={view.chaos >= 500 ? "Eating into the takings. Get on it." : "Under control"} />
            <Meter label="Wound up" value={view.fever > 0 ? 1000 : view.stress} tone="dream" note={view.fever > 0 ? "Living that dream" : "Full, and Delbie outworks the building"} />
            {view.actions.some((a) => a.key === "forklift") && <Meter label="Back room" value={view.clutter} tone={view.clutter >= 1000 ? "bad" : "ok"} note={view.clutter >= 1000 ? "Gridlocked: 30% off the takings" : "Filling up"} />}
          </div>

          <div className={`delbies-tabs ${view.panic ? "panic" : ""}`}>
            <div className="row">
              <small>Owed on account</small>
              <b>
                {dollars(view.tabs)} <span>of {dollars(view.tabCeiling)}</span>
              </b>
            </div>
            <div className="bar" role="img" aria-label={`Tabs: ${Math.round(owed)}% of what the books can take`}>
              <i style={{ width: `${owed}%` }} />
            </div>
            <p>
              {view.panic
                ? "Payroll panic: the books are full and everything is halved until some of it is paid."
                : view.desk.hired
                  ? view.desk.on
                    ? `Two-Thirty is chasing it down. She clocks out in ${hoursAndMinutes(view.desk.minutes)}.`
                    : `Two-Thirty is gone. Back at 6:30, in ${hoursAndMinutes(view.desk.minutes)}.`
                  : "Some of them do pay Friday. Nobody is chasing the rest."}
            </p>
          </div>

          {view.request && (
            <div className="delbies-ask" role="group" aria-label="A customer is asking">
              <p>
                A customer wants <b>{dollars(view.request.amount)}</b> of parts on account. <span>{view.request.secondsLeft}s</span>
              </p>
              <div className="row">
                <button type="button" className="yes" onClick={() => act({ cmd: "tab", approve: true })}>
                  Put it on the tab
                </button>
                <button type="button" onClick={() => act({ cmd: "tab", approve: false })}>
                  Not today
                </button>
              </div>
            </div>
          )}

          {view.radio && (
            <div className="delbies-ask radio" role="group" aria-label="Ears is on the radio">
              <p>
                📻 Ears, on the radio: <b>{view.radio.heard}</b> <span>{view.radio.secondsLeft}s</span>
              </p>
              <p className="fine">Which garage was he at?</p>
              <div className="col">
                {view.radio.options.map((garage, pick) => (
                  <button key={garage} type="button" onClick={() => act({ cmd: "radio", pick })}>
                    {garage}
                  </button>
                ))}
                {view.crew.some((c) => c.id === "tommy" && c.hired) && (
                  <button type="button" className="yes" disabled={!view.radio.rescue} onClick={() => act({ cmd: "rescue" })}>
                    {view.radio.rescue ? "Let Tommy answer it" : `Tommy is busy for ${minutesAndSeconds(view.radio.rescueInSeconds)}`}
                  </button>
                )}
              </div>
            </div>
          )}

          {view.inspector && (
            <div className={`delbies-ask inspector${view.inspector.here ? " here" : ""}`} role="group" aria-label="The inspector">
              <p>
                📋 {view.inspector.here ? <b>The inspector is on the floor.</b> : <b>The inspector is on the way.</b>}{" "}
                <span>{view.inspector.here ? `Done in ${view.inspector.seconds}s` : `Here in ${view.inspector.seconds}s`}</span>
              </p>
              <ul>
                {view.inspector.checks.map((c) => (
                  <li key={c.key} className={c.ok ? "ok" : "off"}>
                    <i aria-hidden="true">{c.ok ? "✓" : "✗"}</i>
                    <span>
                      {c.label}
                      {!c.ok && <small>{c.fix}</small>}
                    </span>
                    <span className="sr-only">{c.ok ? "fine" : "not right"}</span>
                  </li>
                ))}
              </ul>
              <p className="fine">Everything right when the visit ends is a clean sheet: a sticker, and more through the door while it's fresh. Two things wrong is a fine.</p>
            </div>
          )}

          {(view.breakroom.brice || view.breakroom.cinnamon) && (
            <div className="delbies-tabs breakroom">
              <div className="row">
                <small>The breakroom</small>
                {view.breakroom.brice && (
                  <small>
                    In the fridge: <b>{view.breakroom.fridge}</b> for {minutesAndSeconds(view.breakroom.fridgeChangesIn)}
                  </small>
                )}
              </div>
              {view.breakroom.brice && (
                <>
                  <p>
                    {view.breakroom.hungry ? "B-Rice has not eaten. Nobody is keeping the counter calm." : `B-Rice is fed for another ${hoursAndMinutes(Math.ceil(view.breakroom.hungryInSeconds / 60))}.`}
                    {view.breakroom.plutoShocked > 0 && ` Pluto is still in shock (${minutesAndSeconds(view.breakroom.plutoShocked)}).`}
                  </p>
                  <button type="button" className={view.breakroom.fridge === "pasta" ? "yes" : ""} onClick={() => act({ cmd: "feed" })}>
                    Give B-Rice the {view.breakroom.fridge}
                  </button>
                </>
              )}
              {view.breakroom.cinnamon && (
                <>
                  <p>There is a cinnamon roll on the table. Ricky Barry will not come near the counter.</p>
                  <button type="button" className="yes" onClick={() => act({ cmd: "toss" })}>
                    Throw it out
                  </button>
                </>
              )}
            </div>
          )}

          <p className="delbies-payroll">
            Payroll: <b>{dollars(view.payroll.due)}</b> in {minutesAndSeconds(view.payroll.inSeconds)}
            {view.sticker > 0 && ` · ✅ Passed inspection: +10% for ${minutesAndSeconds(view.sticker)}`}
            {view.sheets > 0 && ` · ${view.sheets} clean ${view.sheets === 1 ? "sheet" : "sheets"}`}
            {view.belt > 0 && ` · Delbie's belt: ${view.belt} ${view.belt === 1 ? "notch" : "notches"} tighter`}
          </p>

          {view.actions.length > 0 && (
            <div className="delbies-actions">
              {view.actions.map((a) => (
                <button key={a.key} type="button" disabled={!a.can} title={a.hint} onClick={() => act({ cmd: a.key })}>
                  <b>{a.label}</b>
                  <small>{a.waitSeconds > 0 ? `Ready in ${minutesAndSeconds(a.waitSeconds)}` : a.cost > 0 ? dollars(a.cost) : a.hint}</small>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="delbies-crew" aria-label="The crew">
          {GROUPS.map(([role, name, about]) => {
            const members = view.crew.filter((c) => c.role === role);
            if (!members.length) return null;
            return (
              <div key={role}>
                <h2>
                  {name} <small>{about}</small>
                </h2>
                {members.map((c) => (
                  <article key={c.id} className={c.hired ? "hired" : ""}>
                    <div className="who">
                      <h3>
                        {c.name} <small>{c.title}</small>
                      </h3>
                      <p>{c.hired ? c.quirk : c.blurb}</p>
                      <p className="numbers">
                        {c.hired && <span>Level {c.level}</span>}
                        {c.perSecond > 0 && <span>{dollars(c.perSecond)} a second</span>}
                        {c.status && <span className={`delbies-status ${c.status === "On the clock" ? "" : "away"}`}>{c.status}</span>}
                      </p>
                    </div>
                    <button type="button" disabled={!c.can} onClick={() => act({ cmd: c.hired ? "train" : "hire", who: c.id })}>
                      <b>{c.maxed ? "Knows it all" : c.hired ? "Train" : "Hire"}</b>
                      {!c.maxed && <small>{dollars(c.cost)}</small>}
                    </button>
                  </article>
                ))}
              </div>
            );
          })}
        </section>

        <section className="delbies-floorplan" aria-label="The floor plan">
          <h2>
            The counter <small>{holding ? "Now tap where it goes, in the same row." : "Tap somebody, then tap the place they take. Who sits next to whom, and in front of what, matters."}</small>
          </h2>
          <div className={`delbies-room${roomUp ? " up" : ""}`}>
          {three && <canvas ref={roomCanvas} className="delbies-room-gl" aria-hidden="true" />}
          <div ref={roomGrid} className="delbies-grid" style={{ gridTemplateColumns: `repeat(${view.floor.cols}, 1fr)`, ...(roomUp ? { transform: BOARD_TRANSFORM } : {}) }}>
            {Array.from({ length: view.floor.cols * view.floor.rows }, (_, square) => {
              const piece = view.floor.pieces.find((p) => p.square === square);
              const held = piece && piece.id === holding;
              const back = square < view.floor.cols;
              // What is picked up only goes along its own row: the counter, or the wall behind it.
              const holdingBack = holding ? (view.floor.pieces.find((p) => p.id === holding)?.square ?? 0) < view.floor.cols : back;
              const no = !!holding && (holdingBack !== back || !!piece?.fixed);
              return (
                <button
                  key={square}
                  type="button"
                  className={`${piece ? "piece" : ""} ${piece?.fixed ? "fixed" : ""} ${piece?.empty ? "empty" : ""} ${held ? "held" : ""} ${back ? "back" : ""} ${no ? "no" : ""}`}
                  aria-label={piece ? `${piece.label}${piece.fixed ? ", part of the building" : ""}${held ? ", picked up" : ""}` : `Empty place ${(square % view.floor.cols) + 1} ${back ? "on the back wall" : "at the counter"}`}
                  aria-pressed={held || undefined}
                  onClick={() => {
                    if (holding) {
                      if (!held) act({ cmd: "place", piece: holding, square });
                      setHolding(null);
                    } else if (piece && !piece.fixed) setHolding(piece.id);
                    else if (piece) act({ cmd: "place", piece: piece.id, square });
                  }}
                >
                  {piece && (
                    <>
                      <span aria-hidden="true">{piece.emoji}</span>
                      <small>{SHORT[piece.id] ?? piece.label.replace("'s terminal", "").replace("' terminal", "")}</small>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          </div>
          <ul className="delbies-rules">
            {view.floor.rules.map((r) => (
              <li key={r.id} className={`${r.active ? "on" : ""} ${r.good ? "good" : "bad"}`}>
                <b>{r.label}</b>
                <span>{r.active ? r.does : `${r.hint}. ${r.does}`}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="delbies-log" aria-label="Incident log">
          <h2>Incident log</h2>
          {view.log.length === 0 ? (
            <p className="empty">Nothing yet. Give it a minute.</p>
          ) : (
            <ul>
              {told.map((entry, i) => (
                <li key={`${entry.at}-${i}`}>
                  {entry.text}
                  {entry.times > 1 && <small> (and {entry.times - 1} more like it)</small>}
                </li>
              ))}
            </ul>
          )}
          <h2>The Parts Network</h2>
          {house ? (
            <div className="delbies-network">
              <p>
                This store is kept in <b>{house.name}</b>. Open it on any device you are in that house on.
              </p>
              {standings.length > 0 && (
                <ol>
                  {standings.map((st) => (
                    <li key={st.id} className={st.me ? "mine" : ""}>
                      <b>{st.me ? `${st.name} (you)` : st.name}</b>
                      <span>
                        {dollars(st.score * 100)} taken in · {dollars(st.perSecond)} a second · {st.crew} on the payroll{st.moves > 0 ? ` · ${st.moves} ${st.moves === 1 ? "move" : "moves"}` : ""}
                      </span>
                      {!st.me && view.network.hotshot.hasDriver && (
                        <button type="button" disabled={busy || !view.network.hotshot.can || (net?.hotshotWait ?? 0) > 0} onClick={() => void sendHotshot(st)}>
                          Send a hotshot
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              <div className="delbies-hotshot">
                <b>Hotshot Delivery Board</b>
                {!view.network.hotshot.hasDriver ? (
                  <span>Hire a driver and you can send him to a housemate's store with the part they are short of.</span>
                ) : view.network.hotshot.outSeconds > 0 ? (
                  <span>
                    A driver is out. Back in {minutesAndSeconds(view.network.hotshot.outSeconds)} with {dollars(view.network.hotshot.pays)}.
                  </span>
                ) : view.network.hotshot.waitSeconds > 0 ? (
                  <span>The truck can go again in {minutesAndSeconds(view.network.hotshot.waitSeconds)}.</span>
                ) : standings.some((st) => !st.me) ? (
                  <span>
                    Send a driver to a housemate: {dollars(view.network.hotshot.cost)} in gas, {dollars(view.network.hotshot.pays)} when he is back in five minutes. They get a sale and a calmer counter.
                  </span>
                ) : (
                  <span>Nobody else in {house.name} keeps a store here yet.</span>
                )}
              </div>
              <div className="delbies-hotshot">
                <b>Tabs for sale</b>
                {view.network.tabs.collecting > 0 && <span>Collecting on tabs you bought: {dollars(view.network.tabs.collecting)} still to come.</span>}
                {view.network.tabs.listed > 0 ? (
                  <>
                    <span>
                      Your {dollars(view.network.tabs.listed)} of tabs are up for sale. A housemate who buys them puts {dollars(view.network.tabs.sellsFor)} in your till.
                    </span>
                    <button type="button" disabled={busy} onClick={() => void unlistTabs()}>
                      Take them back
                    </button>
                  </>
                ) : (
                  <>
                    <span>
                      {view.network.tabs.canList
                        ? `Put the ${dollars(view.tabs)} you are owed up for sale: it comes off your books now, and you get ${dollars(view.network.tabs.sellsFor)} when a housemate buys it.`
                        : `Once you are owed ${dollars(view.network.tabs.listAtLeast)} or more, you can put it up for a housemate to buy.`}
                    </span>
                    {view.network.tabs.canList && (
                      <button type="button" disabled={busy} onClick={() => void listTabs()}>
                        Put my tabs up for sale
                      </button>
                    )}
                  </>
                )}
                {(net?.listings ?? [])
                  .filter((lot) => !lot.mine)
                  .map((lot) => (
                    <button key={lot.id} type="button" disabled={busy || !view.network.tabs.canBuy} onClick={() => void buyTabs(lot)}>
                      Buy {lot.name}'s tabs: {dollars(view.network.tabs.buyCost)} now, {dollars(view.network.tabs.buyPays)} back over ten minutes
                    </button>
                  ))}
              </div>
              <button type="button" className="delbies-reset" onClick={() => keep(null)}>
                Keep it only in this browser
              </button>
            </div>
          ) : myHouses.length > 0 ? (
            <div className="delbies-network">
              <p>This store is only in this browser. Keep it in one of your houses to open it on any device, and to see how the rest of the house is doing.</p>
              <div className="col">
                {myHouses.map((h) => (
                  <button key={h.slug} type="button" onClick={() => void join(h.slug)}>
                    Keep it in {h.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="empty">This store is only in this browser. Join or start a house from the front page, and you can keep it there and see the rest of the house's stores.</p>
          )}

          <h2>Lost &amp; Found</h2>
          <ul className="delbies-relics">
            {view.relics.map((r) => (
              <li key={r.id} className={r.found ? "found" : ""}>
                <b>{r.found ? r.name : "???"}</b>
                <span>{r.found ? r.does : `${r.how}: ${r.done} of ${r.needs}`}</span>
              </li>
            ))}
          </ul>

          <h2>The Store Move</h2>
          <div className="delbies-tabs">
            <div className="row">
              <small>{view.move.moves === 0 ? "This building" : `Building #${view.move.moves + 1}`}</small>
              <b>
                {dollars(view.move.here)} <span>of {dollars(view.move.needs)}</span>
              </b>
            </div>
            <div className="bar" role="img" aria-label={`Towards the next move: ${Math.min(100, Math.round((view.move.here * 100) / view.move.needs))}%`}>
              <i style={{ width: `${Math.min(100, (view.move.here * 100) / view.move.needs)}%` }} />
            </div>
            <p>
              {view.move.moves > 0 && `Everything brings in ${view.move.bonusPercent}% more. Departments: ${view.move.departments.join(", ")}. `}
              Next door down the road has a {view.move.nextDepartment}.
            </p>
            <button type="button" className="yes" disabled={!view.move.can} onClick={() => setMoving(true)}>
              Move the store
            </button>
          </div>

          <button type="button" className="delbies-reset" onClick={() => setAsking(true)}>
            Close the store and start again
          </button>
        </section>
      </div>

      {toast && (
        <div className="delbies-toast" key={toast.key} role="status">
          {toast.text}
        </div>
      )}

      {report && (
        <div className="delbies-sheet" role="dialog" aria-label="While you were out">
          <div>
            <h2>The incident report</h2>
            <ul>
              {report.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {report.skipped > 0 && <p className="fine">The store only keeps going for twelve hours without you. The rest of the time, nothing happened.</p>}
            <button type="button" className="yes" autoFocus onClick={() => setReport(null)}>
              Back to work
            </button>
          </div>
        </div>
      )}

      {clash && (
        <div className="delbies-sheet" role="dialog" aria-label="Which store?">
          <div>
            <h2>{clash.name} already has a store of yours</h2>
            <p>
              The one there has taken in {dollars(game.score(clash.state) * 100)}. The one here has taken in {dollars(view.earned)}. Only one can be kept.
            </p>
            <div className="row">
              <button
                type="button"
                className="yes"
                autoFocus
                onClick={() => {
                  adopt(clash.state, clash.rev, clash);
                  setClash(null);
                }}
              >
                Use the one in {clash.name}
              </button>
              <button
                type="button"
                onClick={() => {
                  keep({ slug: clash.slug, name: clash.name, rev: clash.rev });
                  setClash(null);
                  void sync();
                }}
              >
                Replace it with this one
              </button>
              <button type="button" onClick={() => setClash(null)}>
                Never mind
              </button>
            </div>
          </div>
        </div>
      )}

      {moving && (
        <div className="delbies-sheet" role="dialog" aria-label="Move the store?">
          <div>
            <h2>Store Move #{view.move.moves + 1}</h2>
            <p>
              Pack everyone up and move down the road. The till, the crew, the tabs and the store's name all start again. You keep what is in the Lost &amp; Found, everything brings in 50% more for good, Pluto gets an Old Timer badge, and the new building has a{" "}
              {view.move.nextDepartment}.
            </p>
            <div className="row">
              <button
                type="button"
                className="yes"
                onClick={() => {
                  act({ cmd: "move" });
                  setMoving(false);
                }}
              >
                Load the truck
              </button>
              <button type="button" autoFocus onClick={() => setMoving(false)}>
                Not yet
              </button>
            </div>
          </div>
        </div>
      )}

      {asking && (
        <div className="delbies-sheet" role="dialog" aria-label="Start again?">
          <div>
            <h2>Close the store?</h2>
            <p>Everything goes: the till, the crew, the tabs. This cannot be undone.</p>
            <div className="row">
              <button
                type="button"
                onClick={() => {
                  state_.current = game.newGame(Math.floor(Math.random() * 2 ** 31), clockNow()) as DelbiesState;
                  saveIdle(id, state_.current);
                  setAsking(false);
                  refresh();
                }}
              >
                Close it and start again
              </button>
              <button type="button" className="yes" autoFocus onClick={() => setAsking(false)}>
                Keep the store
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Meter({ label, value, tone, note }: { label: string; value: number; tone: "ok" | "bad" | "dream"; note: string }) {
  return (
    <div className={`delbies-meter ${tone}`}>
      <div className="row">
        <small>{label}</small>
        <small>{note}</small>
      </div>
      <div className="bar" role="img" aria-label={`${label}: ${Math.round(value / 10)}%`}>
        <i style={{ width: `${Math.min(100, value / 10)}%` }} />
      </div>
    </div>
  );
}
