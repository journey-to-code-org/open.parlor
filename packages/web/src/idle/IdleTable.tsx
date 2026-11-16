// The screen for an idle game. The game is kept in this browser: opened again, it is brought up to
// date from the clock, and if that was a while it says what happened. While the page is open it is
// brought up to date a few times a second, and saved every few seconds and whenever the page is
// put away.
import { dollars, idleGame, type DelbiesCommand, type DelbiesPieceId, type DelbiesState, type DelbiesView, type IdleClock, type IdleGameId, type IdleReport } from "@journey-to-code/games";
import { useEffect, useRef, useState } from "react";
import { blip, notes, wakeArcadeSound } from "../arcade/sounds";
import { useWants3d } from "../display";
import { loadIdle, saveIdle } from "../storage";
import { loadCounter3d, type Counter3d, type CounterLook } from "./counter3d";

/** The time, as the game wants it: the second, and the time of day on this device. */
export function clockNow(): IdleClock {
  const d = new Date();
  return { now: Math.floor(d.getTime() / 1000), minute: d.getHours() * 60 + d.getMinutes(), day: d.getDay() };
}

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
  const state = useRef<DelbiesState | null>(null);
  const [view, setView] = useState<DelbiesView | null>(null);
  const [report, setReport] = useState<IdleReport | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [asking, setAsking] = useState(false);
  const [moving, setMoving] = useState(false);
  // The floor plan: the piece picked up, waiting for a square to be put down on.
  const [holding, setHolding] = useState<DelbiesPieceId | null>(null);

  // The counter, drawn in 3-D in the big button where the face was (counter3d.ts): a picture of
  // what the numbers already say. Where it can't be drawn, or isn't wanted, the face is still there.
  const three = useWants3d(id);
  const sceneCanvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Counter3d | null>(null);
  const [sceneUp, setSceneUp] = useState(false);
  const look = useRef<CounterLook | null>(null);
  if (view) {
    const who = (name: string) => [...name].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
    look.current = {
      chaos: view.chaos / 1000,
      stress: view.stress / 1000,
      dream: view.fever > 0,
      away: view.vacation > 0,
      panic: view.panic,
      clutter: Math.min(1, view.clutter / 1000),
      asking: !!view.request,
      radio: !!view.radio,
      counter: view.crew.filter((c) => c.hired && c.role === "counter").map((c) => ({ who: who(c.id), level: c.level })),
      drivers: view.crew.filter((c) => c.hired && c.role === "driver").length,
      desk: view.desk.hired && view.desk.on,
      minute: clockNow().minute,
    };
  }
  const ready = !!view;
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
    const s = state.current;
    if (!s) return;
    const told = game.advance(s, clockNow());
    if (told.lines.length) setReport(told);
    setView(game.view(s, clockNow()));
  };

  useEffect(() => {
    const clock = clockNow();
    state.current = (game.load(loadIdle(id)) as DelbiesState | null) ?? (game.newGame(Math.floor(Math.random() * 2 ** 31), clock) as DelbiesState);
    refresh();
    const tick = setInterval(refresh, 250);
    const save = () => state.current && saveIdle(id, state.current);
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
    const s = state.current;
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
                  <p>There is a cinnamon roll on the table. Ricky Roost will not come near the counter.</p>
                  <button type="button" className="yes" onClick={() => act({ cmd: "toss" })}>
                    Throw it out
                  </button>
                </>
              )}
            </div>
          )}

          <p className="delbies-payroll">
            Payroll: <b>{dollars(view.payroll.due)}</b> in {minutesAndSeconds(view.payroll.inSeconds)}
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
            The floor plan <small>{holding ? "Now tap where it goes." : "Tap something, then tap where it goes. Who sits next to what matters."}</small>
          </h2>
          <div className="delbies-grid" style={{ gridTemplateColumns: `repeat(${view.floor.cols}, 1fr)` }}>
            {Array.from({ length: view.floor.cols * view.floor.rows }, (_, square) => {
              const piece = view.floor.pieces.find((p) => p.square === square);
              const held = piece && piece.id === holding;
              return (
                <button
                  key={square}
                  type="button"
                  className={`${piece ? "piece" : ""} ${piece?.fixed ? "fixed" : ""} ${piece?.empty ? "empty" : ""} ${held ? "held" : ""}`}
                  aria-label={piece ? `${piece.label}${piece.fixed ? ", part of the building" : ""}${held ? ", picked up" : ""}` : `Empty square ${square + 1}`}
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
                      <small>{piece.label.replace("'s terminal", "").replace("' terminal", "")}</small>
                    </>
                  )}
                </button>
              );
            })}
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
              {told.map((entry) => (
                <li key={entry.at}>
                  {entry.text}
                  {entry.times > 1 && <small> (and {entry.times - 1} more like it)</small>}
                </li>
              ))}
            </ul>
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
                  state.current = game.newGame(Math.floor(Math.random() * 2 ** 31), clockNow()) as DelbiesState;
                  saveIdle(id, state.current);
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
