// The arcade table: any arcade game, played in this browser. You fly seat 0 and computer pilots fly
// the rest. The game runs at its own rate whatever the screen's (a fixed step, caught up a few ticks
// at a time), is drawn from its view on a canvas, and stops while the page is hidden or paused.
import { arcadeGame, points, type ArcadeGameId, type ArcadeView } from "@journey-to-code/games";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadFeedbackSettings, saveFeedbackSettings } from "../feedback/sounds";
import { loadArcadeBest, saveArcadeBest, type ArcadeRules } from "../storage";
import { controlsFor } from "./controls";
import { createArcadeScreen } from "./screen";
import { notes, setArcadeSound, wakeArcadeSound } from "./sounds";

interface Props {
  game: ArcadeGameId;
  rules: ArcadeRules;
  seats: number;
  seed: number;
  autofire: boolean;
  /** Back to the game's setup screen. */
  onLeave: () => void;
}

/** What the corners show. The score is written straight to the page, as it changes most ticks. */
interface Hud {
  stage: string;
  lives: number;
  stats: ArcadeView["pilots"][number]["stats"];
}
interface Ending {
  score: number;
  best: number;
  isBest: boolean;
  stage: string;
  time: string;
  scores: number[];
}

/** The computer wingmen: steady, and not quite perfect. */
const WINGMAN = { skill: 0.75, sloppy: 0.04 };
const clock = (ticks: number, rate: number) => `${Math.floor(ticks / rate / 60)}:${String(Math.floor(ticks / rate) % 60).padStart(2, "0")}`;

export function ArcadeTable({ game: id, rules, seats, seed, autofire, onLeave }: Props) {
  const game = arcadeGame(id)!;
  const canvas = useRef<HTMLCanvasElement>(null);
  const scoreEl = useRef<HTMLElement>(null);
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ending, setEnding] = useState<Ending | null>(null);
  const [hud, setHud] = useState<Hud>({ stage: "", lives: 0, stats: [] });
  const [sound, setSound] = useState(() => loadFeedbackSettings().sound);
  const [best, setBest] = useState(() => loadArcadeBest(id, rules, seats));
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const controls = useMemo(() => controlsFor(id, { autofire: () => autofire }), [id, autofire]);

  useEffect(() => {
    const el = canvas.current!;
    const normal = game.normalize(rules);
    // Play again: a new game from a new seed.
    const state = game.newGame(normal, seats, run === 0 ? seed : Math.floor(Math.random() * 2 ** 31));
    const screen = createArcadeScreen(el, game.view(state).field);
    screen.resize();
    controls.clear();
    setEnding(null);
    setPaused(false);
    let over = false;
    let frame = 0;
    let last = performance.now();
    let owed = 0;
    let hudKey = "";
    let raf = 0;
    const stepMs = 1000 / game.rate;

    function tick() {
      const inputs: unknown[] = [controls.read()];
      for (let seat = 1; seat < seats; seat++) inputs.push(game.bot(state, seat, WINGMAN));
      game.step(state, inputs);
      const view = game.view(state);
      screen.hear(view.events, false, 0);
      screen.settle();
      if (view.over) {
        over = true;
        const sum = game.summary(state);
        const isBest = saveArcadeBest(id, rules, seats, sum.score);
        const now = loadArcadeBest(id, rules, seats);
        setBest(now);
        setEnding({ score: sum.score, best: now, isBest, stage: view.stage, time: clock(sum.ticks, game.rate), scores: sum.scores });
        if (isBest && sum.score > 0) notes([523, 659, 784, 1046, 1318]);
      }
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(100, now - last);
      last = now;
      if (!pausedRef.current && !over) {
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
        frame++;
      }
      const view = game.view(state);
      screen.draw(view, frame);
      const me = view.pilots[0];
      if (scoreEl.current) scoreEl.current.textContent = points(view.score);
      if (me) {
        const key = `${view.stage}|${me.lives}|${me.stats.map((s) => (s.max && s.max >= 100 ? Math.round((s.value * 20) / s.max) : s.value)).join(",")}`;
        if (key !== hudKey) {
          hudKey = key;
          setHud({ stage: view.stage, lives: me.lives, stats: me.stats });
        }
      }
    }
    raf = requestAnimationFrame(loop);

    const pause = () => !over && setPaused(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      const down = e.type === "keydown";
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) e.preventDefault();
      if (down) wakeArcadeSound();
      if (down && !e.repeat && over && key === "enter") return setRun((n) => n + 1);
      if (down && !e.repeat && !over && (key === "p" || key === "escape")) return setPaused((p) => !p);
      controls.key(key, down);
    };
    const onBlur = () => {
      controls.clear();
      pause();
    };
    const onHide = () => document.hidden && pause();
    const onResize = () => screen.resize();
    const scale = () => game.view(state).field.width / Math.max(1, el.getBoundingClientRect().width);
    const down = (e: PointerEvent) => {
      wakeArcadeSound();
      controls.pointerDown(e.pointerId, e.clientX, e.clientY);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* a pointer that can't be captured still moves the ship while it is over the field */
      }
    };
    const move = (e: PointerEvent) => controls.pointerMove(e.pointerId, e.clientX, e.clientY, scale());
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

  // A stat that is a meter (a timer running down) is drawn as a bar under the number before it,
  // which is what it belongs to: the chain's timer under the multiplier.
  const cells: { stat: Hud["stats"][number]; meter?: Hud["stats"][number] }[] = [];
  for (const stat of hud.stats) {
    const before = cells[cells.length - 1];
    const isMeter = (stat.max ?? 0) >= 100;
    if (isMeter && before && !before.meter) before.meter = stat;
    else if (!isMeter) cells.push({ stat });
  }

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
            <b className="arcade-best">{points(best)}</b>
          </div>
          <span className="arcade-grow" />
          <div className="arcade-cell right">
            <small>{game.name}</small>
            <b>{hud.stage}</b>
          </div>
        </div>
        <div className="arcade-stage">
          <canvas ref={canvas} tabIndex={0} aria-label={`${game.name}: the field`} />
          {paused && !ending && (
            <section className="arcade-sheet" aria-label="Paused">
              <div className="arcade-card">
                <h2>Paused</h2>
                <ul className="arcade-controls">
                  {game.controls.map((line) => (
                    <li key={line}>{line}</li>
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
                <p>{ending.isBest ? "A new best on this device." : `Your best: ${points(ending.best)}`}</p>
                <dl className="arcade-stats">
                  <dt>Reached</dt>
                  <dd>{ending.stage}</dd>
                  <dt>Time</dt>
                  <dd>{ending.time}</dd>
                  {ending.scores.length > 1 &&
                    ending.scores.map((n, seat) => (
                      <div key={seat} className="arcade-pair">
                        <dt>{seat === 0 ? "You" : `Wingman ${seat}`}</dt>
                        <dd>{points(n)}</dd>
                      </div>
                    ))}
                </dl>
                <div className="arcade-row">
                  <button type="button" className="primary" autoFocus onClick={() => setRun((n) => n + 1)}>
                    Play again
                  </button>
                  <button type="button" className="secondary" onClick={onLeave}>
                    Change the rules
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
        <div className="arcade-rail low">
          <div className="arcade-cell">
            <small>Ships</small>
            <b className="arcade-lives">{"▲".repeat(Math.max(0, hud.lives - 1)) || "–"}</b>
          </div>
          {cells.map(({ stat: s, meter }) => (
            <div className="arcade-cell" key={s.key}>
              <small>{s.label}</small>
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
          <button type="button" className="arcade-btn special" onPointerDown={(e) => (e.preventDefault(), controls.special())}>
            {controls.specialLabel}
          </button>
          <button type="button" className="arcade-btn" onClick={() => !ending && setPaused((p) => !p)}>
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
