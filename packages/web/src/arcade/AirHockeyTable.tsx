// Air hockey, played in this browser: against the house, or two people at one screen with an end
// each. The engine is open.games' `airHockey`; a seat's controls are simply where it wants its
// mallet, so a finger on the table is the whole control.
//
// It has a table of its own, apart from the arcade table, because of what is different about it:
// two fingers can be down at once, one for each end, and the screen is read from both ends (the
// far end's score is drawn the other way up when someone is sitting there). Nothing here needs
// the network.
import { AIRHOCKEY_MALLET_SPEED, airHockey, type AirHockeyInput, type AirHockeyRules, type ArcadeRink, type ArcadeView } from "@journey-to-code/games";
import { useEffect, useRef, useState } from "react";
import { loadFeedbackSettings, saveFeedbackSettings } from "../feedback/sounds";
import type { ArcadeRules } from "../storage";
import { blip, notes, setArcadeSound, wakeArcadeSound } from "./sounds";

interface Props {
  rules: ArcadeRules;
  /** One: against the house. Two: two people at this screen, the second at the far end. */
  seats: number;
  seed: number;
  /** Back to the game's setup screen. */
  onLeave: () => void;
}

interface Ending {
  winner: number;
  goals: [number, number];
  time: string;
}

/** The colours of the two ends: the near end's, then the far end's. */
const ENDS = ["#5aa9ff", "#ff6b6b"];
const clock = (ticks: number, rate: number) => `${Math.floor(ticks / rate / 60)}:${String(Math.floor(ticks / rate) % 60).padStart(2, "0")}`;
/** The keys that move each end's mallet: left, right, up, down. The far end has WASD when someone is sitting there. */
const KEYS = [
  ["arrowleft", "arrowright", "arrowup", "arrowdown"],
  ["a", "d", "w", "s"],
] as const;
/** How far a held key moves a mallet's target in a tick, in field units. */
const KEY_PACE = Math.round(AIRHOCKEY_MALLET_SPEED * 0.6);

/** Which end a spot on the field belongs to: the near end has the bottom half. With one seat it is all the near end's. */
export const endAt = (y: number, height: number, seats: number) => (seats > 1 && y < height / 2 ? 1 : 0);

/** Who won, in words, for the end of the game. */
export function airHockeyResult(winner: number, seats: number): string {
  if (winner === 2) return "A draw";
  if (seats > 1) return winner === 0 ? "Blue wins" : "Red wins";
  return winner === 0 ? "You win" : "The house wins";
}

export function AirHockeyTable({ rules, seats, seed, onLeave }: Props) {
  const game = airHockey;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [ending, setEnding] = useState<Ending | null>(null);
  const [hud, setHud] = useState({ goals: [0, 0], time: "", overtime: false });
  const [sound, setSound] = useState(() => loadFeedbackSettings().sound);
  const two = seats > 1;

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const normal = game.normalize(rules) as AirHockeyRules;
    const state = game.newGame(normal, seats, run === 0 ? seed : Math.floor(Math.random() * 2 ** 31));
    const field = game.view(state).field;
    const { width: W, height: H } = field;
    /** Where each end wants its mallet, or null to leave it where it is. */
    const targets: (AirHockeyInput | null)[] = [null, null];
    /** The fingers that are down, and the end each is steering. */
    const fingers = new Map<number, number>();
    const keys = new Set<string>();
    /** Where the puck has just been, for a streak behind it. */
    const trail: [number, number][] = [];
    /** A ring that spreads from a strike or a goal: where, how old, how big it gets, its colour. */
    let rings: { x: number; y: number; age: number; size: number; tone: string }[] = [];
    let over = false;
    let last = performance.now();
    let owed = 0;
    let raf = 0;
    let hudKey = "";
    let px = 1;
    const stepMs = 1000 / game.rate;
    setEnding(null);
    setPaused(false);

    /** Fit the table in the room it has, three wide to four tall, and sharp on a dense screen. */
    function resize() {
      const room = el.parentElement!.getBoundingClientRect();
      const w = Math.max(60, Math.floor(Math.min(room.width, (room.height * W) / H)));
      const h = Math.floor((w * H) / W);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      px = el.width / W;
    }

    function hear(view: ArcadeView) {
      for (const e of view.events) {
        if (e.kind === "hit") {
          blip(300 + Math.min(500, (e.amount ?? 0) * 2), 0.05, "square", 0.045);
          rings.push({ x: e.x, y: e.y, age: 0, size: 260, tone: "#ffffff" });
        } else if (e.kind === "wall") blip(190, 0.03, "triangle", 0.035);
        else if (e.kind === "goal") {
          // A goal for the near end rises; one against it falls. With two at the screen every goal is somebody's.
          notes(e.seat === 0 || two ? [523, 659, 784] : [392, 330, 262]);
          rings.push({ x: e.x, y: e.y, age: 0, size: 1500, tone: ENDS[e.y === 0 ? 0 : 1]! });
        } else if (e.kind === "slow") blip(150, 0.25, "sawtooth", 0.04, -60);
        else if (e.kind === "overtime") notes([440, 440, 660]);
      }
    }

    function tick() {
      // Held keys walk a mallet's target along from wherever the mallet is.
      for (let end = 0; end < seats; end++) {
        const [left, right, up, down] = KEYS[end]!;
        const dx = (keys.has(right) ? 1 : 0) - (keys.has(left) ? 1 : 0);
        const dy = (keys.has(down) ? 1 : 0) - (keys.has(up) ? 1 : 0);
        if (!dx && !dy) continue;
        const at = game.view(state).rink!.ends[end]!;
        targets[end] = { x: Math.max(0, Math.min(W, at.x + dx * KEY_PACE)), y: Math.max(0, Math.min(H, at.y + dy * KEY_PACE)) };
      }
      game.step(state, [targets[0], two ? targets[1] : null]);
      // A key's nudge is used up by the tick it was for.
      for (let end = 0; end < seats; end++) if (KEYS[end]!.some((k) => keys.has(k))) targets[end] = null;
      const view = game.view(state);
      hear(view);
      const puck = view.rink!.puck;
      if (puck) trail.push([puck.x, puck.y]);
      else trail.length = 0;
      if (trail.length > 7) trail.shift();
      rings = rings.filter((r) => ++r.age < 22);
      if (view.over && !over) {
        over = true;
        const rink = view.rink!;
        notes(rink.winner === 0 || two ? [523, 659, 784, 1046] : [330, 294, 262]);
        setEnding({ winner: rink.winner ?? 2, goals: [...rink.goals], time: clock(view.tick, view.rate) });
      }
    }

    function draw(view: ArcadeView) {
      const rink = view.rink!;
      const u = (n: number) => n * px;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      // The table.
      ctx.fillStyle = "#0d1f3f";
      ctx.fillRect(0, 0, el.width, el.height);
      ctx.lineWidth = u(34);
      ctx.strokeStyle = "rgba(125, 211, 252, 0.34)";
      ctx.beginPath();
      ctx.moveTo(0, u(H / 2));
      ctx.lineTo(u(W), u(H / 2));
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(u(W / 2), u(H / 2), u(760), 0, Math.PI * 2);
      ctx.stroke();
      // A crease in front of each goal, and the goal itself: a gap in the wall, lit in the colour of the end that guards it.
      for (const end of [0, 1]) {
        const y = end === 0 ? H : 0;
        ctx.strokeStyle = "rgba(125, 211, 252, 0.34)";
        ctx.beginPath();
        ctx.arc(u(W / 2), u(y), u(rink.goalHalf + 260), end === 0 ? Math.PI : 0, end === 0 ? Math.PI * 2 : Math.PI);
        ctx.stroke();
        ctx.fillStyle = ENDS[end]!;
        ctx.shadowColor = ENDS[end]!;
        ctx.shadowBlur = u(160);
        ctx.fillRect(u(W / 2 - rink.goalHalf), end === 0 ? el.height - u(70) : 0, u(rink.goalHalf * 2), u(70));
        ctx.shadowBlur = 0;
      }
      // The walls.
      ctx.lineWidth = u(60);
      ctx.strokeStyle = "#9fb4dd";
      for (const end of [0, 1]) {
        const y = end === 0 ? el.height - u(30) : u(30);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(u(W / 2 - rink.goalHalf), y);
        ctx.moveTo(u(W / 2 + rink.goalHalf), y);
        ctx.lineTo(u(W), y);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(u(30), 0);
      ctx.lineTo(u(30), u(H));
      ctx.moveTo(u(W - 30), 0);
      ctx.lineTo(u(W - 30), u(H));
      ctx.stroke();
      // Each end's goals, big and faint in its own half. The far end's are the other way up when someone sits there.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${u(1300)}px system-ui, sans-serif`;
      for (const end of [0, 1]) {
        ctx.save();
        ctx.translate(u(W / 2), u(end === 0 ? (H * 3) / 4 - 250 : H / 4 + 250));
        if (end === 1 && two) ctx.rotate(Math.PI);
        ctx.fillStyle = end === 0 ? "rgba(90, 169, 255, 0.2)" : "rgba(255, 107, 107, 0.2)";
        ctx.fillText(String(rink.goals[end]), 0, 0);
        ctx.restore();
      }
      // The side that is sitting on the puck is counted down for its last three seconds.
      if (rink.slow && rink.slow.ticksLeft <= view.rate * 3 && !view.over) {
        const end = rink.slow.end;
        ctx.save();
        ctx.translate(u(W / 2), u(end === 0 ? H / 2 + 420 : H / 2 - 420));
        if (end === 1 && two) ctx.rotate(Math.PI);
        ctx.font = `700 ${u(330)}px system-ui, sans-serif`;
        ctx.fillStyle = "#ffd166";
        ctx.fillText(`Move it: ${Math.ceil(rink.slow.ticksLeft / view.rate)}`, 0, 0);
        ctx.restore();
      }
      for (const r of rings) {
        ctx.globalAlpha = 1 - r.age / 22;
        ctx.strokeStyle = r.tone;
        ctx.lineWidth = u(40);
        ctx.beginPath();
        ctx.arc(u(r.x), u(r.y), u(120 + (r.size * r.age) / 22), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const t of view.things) {
        if (t.kind === "puck") {
          trail.forEach(([x, y], i) => {
            ctx.globalAlpha = ((i + 1) / trail.length) * 0.22;
            ctx.fillStyle = "#ffd166";
            ctx.beginPath();
            ctx.arc(u(x), u(y), u(t.r), 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#ffd166";
          ctx.shadowColor = "#ffd166";
          ctx.shadowBlur = u(120);
          ctx.beginPath();
          ctx.arc(u(t.x), u(t.y), u(t.r), 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = "#8a6a1a";
          ctx.lineWidth = u(30);
          ctx.beginPath();
          ctx.arc(u(t.x), u(t.y), u(t.r * 0.6), 0, Math.PI * 2);
          ctx.stroke();
        } else if (t.kind === "mallet") {
          const tone = ENDS[t.id === 10 ? 0 : 1]!;
          ctx.fillStyle = tone;
          ctx.beginPath();
          ctx.arc(u(t.x), u(t.y), u(t.r), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
          ctx.beginPath();
          ctx.arc(u(t.x), u(t.y), u(t.r * 0.72), 0, Math.PI * 2);
          ctx.fill();
          // The knob in the middle.
          ctx.fillStyle = tone;
          ctx.beginPath();
          ctx.arc(u(t.x), u(t.y), u(t.r * 0.42), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (view.banner && !view.over) {
        ctx.font = `700 ${u(700)}px system-ui, sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#000000";
        ctx.shadowBlur = u(120);
        const lines = two ? [0, Math.PI] : [0];
        for (const turn of lines) {
          ctx.save();
          ctx.translate(u(W / 2), u(two ? (turn ? H / 2 - 560 : H / 2 + 560) : H / 2));
          ctx.rotate(turn);
          ctx.fillText(view.banner, 0, 0);
          ctx.restore();
        }
        ctx.shadowBlur = 0;
      }
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(100, now - last);
      last = now;
      if (!pausedRef.current && !over) {
        owed += dt;
        let steps = 0;
        while (owed >= stepMs && steps++ < 5 && !over) {
          tick();
          owed -= stepMs;
        }
        if (owed > stepMs * 5) owed = 0;
      }
      const view = game.view(state);
      draw(view);
      const rink: ArcadeRink = view.rink!;
      const time = clock(rink.ticksLeft + view.rate - 1, view.rate);
      const key = `${rink.goals.join("-")}|${time}|${rink.overtime}`;
      if (key !== hudKey) {
        hudKey = key;
        setHud({ goals: [...rink.goals], time, overtime: rink.overtime });
      }
    }

    /** A pointer's place on the field, in field units. */
    const spot = (e: PointerEvent): AirHockeyInput => {
      const box = el.getBoundingClientRect();
      return {
        x: Math.round(Math.max(0, Math.min(1, (e.clientX - box.left) / Math.max(1, box.width))) * W),
        y: Math.round(Math.max(0, Math.min(1, (e.clientY - box.top) / Math.max(1, box.height))) * H),
      };
    };
    const down = (e: PointerEvent) => {
      wakeArcadeSound();
      e.preventDefault();
      const at = spot(e);
      const end = endAt(at.y, H, seats);
      // One finger an end: a new one takes over from the old.
      for (const [id, held] of fingers) if (held === end) fingers.delete(id);
      fingers.set(e.pointerId, end);
      targets[end] = at;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* a pointer that can't be captured still steers while it is over the table */
      }
    };
    const move = (e: PointerEvent) => {
      const at = spot(e);
      const held = fingers.get(e.pointerId);
      if (held !== undefined) targets[held] = at;
      // A mouse steers without being pressed: whichever end it is over.
      else if (e.pointerType === "mouse") {
        const end = endAt(at.y, H, seats);
        if (![...fingers.values()].includes(end)) targets[end] = at;
      }
    };
    const up = (e: PointerEvent) => {
      const held = fingers.get(e.pointerId);
      fingers.delete(e.pointerId);
      // A lifted finger leaves the mallet where it is. A mouse goes on steering.
      if (held !== undefined && e.pointerType !== "mouse") targets[held] = null;
    };
    const pause = () => !over && setPaused(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      const isDown = e.type === "keydown";
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) e.preventDefault();
      if (isDown) wakeArcadeSound();
      if (isDown && !e.repeat && over && key === "enter") return setRun((n) => n + 1);
      if (isDown && !e.repeat && !over && (key === "p" || key === "escape")) return setPaused((p) => !p);
      if (isDown) keys.add(key);
      else keys.delete(key);
    };
    const onBlur = () => {
      keys.clear();
      pause();
    };
    const onHide = () => document.hidden && pause();
    resize();
    raf = requestAnimationFrame(loop);
    addEventListener("keydown", onKey);
    addEventListener("keyup", onKey);
    addEventListener("blur", onBlur);
    addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onHide);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    const watcher = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    if (el.parentElement) watcher?.observe(el.parentElement);
    wakeArcadeSound();
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("keydown", onKey);
      removeEventListener("keyup", onKey);
      removeEventListener("blur", onBlur);
      removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onHide);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      watcher?.disconnect();
    };
  }, [run]);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    saveFeedbackSettings({ ...loadFeedbackSettings(), sound: next });
    setArcadeSound(next);
    if (next) wakeArcadeSound();
  }

  const names = two ? ["Blue", "Red"] : ["You", "The house"];
  return (
    <main className="arcade">
      <div className="arcade-cabinet">
        <div className="arcade-rail">
          <div className="arcade-cell">
            <small>{names[0]}</small>
            <b className="arcade-score" style={{ color: ENDS[0] }}>
              {hud.goals[0]}
            </b>
          </div>
          <span className="arcade-grow" />
          <div className="arcade-cell" style={{ alignItems: "center" }}>
            <small>{hud.overtime ? "Next goal wins" : `First to ${String(game.normalize(rules).goals)}`}</small>
            <b>{hud.time}</b>
          </div>
          <span className="arcade-grow" />
          <div className="arcade-cell right">
            <small>{names[1]}</small>
            <b className="arcade-score" style={{ color: ENDS[1] }}>
              {hud.goals[1]}
            </b>
          </div>
        </div>
        <div className="arcade-stage">
          <canvas ref={canvas} tabIndex={0} aria-label={`Air Hockey: the table. ${names[0]} ${hud.goals[0]}, ${names[1]} ${hud.goals[1]}.`} />
          {paused && !ending && (
            <section className="arcade-sheet" aria-label="Paused">
              <div className="arcade-card">
                <h2>Paused</h2>
                <ul className="arcade-controls">
                  {game.controls.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                  <li>{two ? "On a keyboard: the arrow keys for blue, WASD for red." : "On a keyboard: the arrow keys."}</li>
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
                <h2>{airHockeyResult(ending.winner, seats)}</h2>
                <div className="arcade-final">
                  {ending.goals[0]}–{ending.goals[1]}
                </div>
                <dl className="arcade-stats">
                  <dt>{names[0]}</dt>
                  <dd>{ending.goals[0]}</dd>
                  <dt>{names[1]}</dt>
                  <dd>{ending.goals[1]}</dd>
                  <dt>Time</dt>
                  <dd>{ending.time}</dd>
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
            <small>Air Hockey</small>
            <b>{two ? "Two at this screen" : "Against the house"}</b>
          </div>
          <span className="arcade-grow" />
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
