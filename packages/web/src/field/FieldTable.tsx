// The table for a field game (Over the Hill): whatever a `FieldView` says is on the field, drawn
// side on, on a canvas, the way SportTable draws every table sport from above.
//
// - The field: a sky, far hills, the land, a tank for each player, and while a shot is in the
//   air, the shot. The view carries the last shot and the field it was fired over; this screen
//   flies it again (field/play.ts) and ends on the field the view shows.
// - Everything that is only for show (field/fx.ts): the gun's flash and kick, fire, sparks and
//   flying earth where a shell lands, smoke that hangs about, the shake of the screen, a tank
//   dropping into the hole under it or rolling along when it drives.
// - Aiming, three ways that all set the same two numbers: drag on the field away from your tank
//   (the barrel follows, and further is harder), the two sliders with a nudge either side, or the
//   arrow keys with the field in focus. A few dots show how the shot would set off.
// - The controls under the field are Zubra components: the shells in a `segmented-control`, the
//   angle and the power each a `range-slider`, Fire an `action-button`, and when shells are chosen
//   before the game, `choice-cards`.
import { BARREL, FIELD_TICKS, PIECE_UP, fieldWorld, flyField, kitGame, landAt, type FieldEvent, type FieldShell, type FieldView } from "@journey-to-code/games";
import { type TableSettings } from "@journey-to-code/rules";
import ActionButton from "@open-parlor/ui/zubra-ui/action-button.zb";
import ChoiceCards from "@open-parlor/ui/zubra-ui/choice-cards.zb";
import RangeSlider from "@open-parlor/ui/zubra-ui/range-slider.zb";
import SegmentedControl from "@open-parlor/ui/zubra-ui/segmented-control.zb";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bubble, TableChat, useBubbles, type ChatProps } from "../Chat";
import { Confetti } from "../Confetti";
import { loadFeedbackSettings, play, saveFeedbackSettings } from "../feedback/sounds";
import { useOverSound } from "../feedback/useKitSounds";
import { HowToButton } from "../HowToPlay";
import { named, ResultTable, sideName } from "../kit/KitTable";
import { PlayAgain } from "../kit/PlayAgain";
import { reducedMotion } from "../motion";
import { SoundButton } from "../SoundButton";
import { toneColour } from "../sport/draw";
import { TableSettingsButton } from "../TableSettings";
import { Painter, fitField, type Actor, type Scene } from "./draw";
import { Fx } from "./fx";
import { lookOf } from "./looks";
import { beginPlayback, eventsBetween, frameAt, playbackOver, type Playback } from "./play";

export interface FieldTableProps {
  view: FieldView;
  names: string[];
  /** Resolves to an error message when the move is refused. */
  act: (move: Record<string, unknown>) => Promise<string | null>;
  onLeave: () => void;
  banner?: React.ReactNode;
  chat?: ChatProps;
  settings?: { value: TableSettings; change: (next: TableSettings) => Promise<void> | void };
  /** Nobody's playing `view.me` from here: the table is being watched. */
  watching?: boolean;
  /** Several people share this screen and take turns at it. */
  together?: boolean;
  /** Open how to play (HowToPlay.tsx): the "?" in the top bar. */
  onHelp?: () => void;
  /** The same game again at once (a practice table): without it, "Play again" goes back to the game's page. */
  onAgain?: () => void;
}

/** A flight is played a little faster than it was flown: nobody minds a shell that hurries. */
const SPEED = 1.15;
/** Dragging this far from the tank (as a share of the field's width) is full power. */
const FULL_PULL = 0.4;
/** The shell whose first moments are drawn as dots while aiming: nothing about it matters but how it flies. */
const DOT_SHELL: FieldShell = { id: "dots", name: "", blurb: "", blast: 1, damage: 0 };
/** How fast a tank is shown driving, in the field's units a tick; further than `LEAP` in one go and it wasn't driving. */
const ROLL = 4;
const LEAP = 200;

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

/** Where a piece is on the screen this instant, which lags where the game has it: it drives there, or drops. */
interface Body {
  x: number;
  y: number;
  /** How fast it is dropping. */
  drop: number;
  recoil: number;
  struck: number;
  rolled: number;
}

export function FieldTable({ view, names, act, onLeave, banner, chat, settings, watching, together, onHelp, onAgain }: FieldTableProps) {
  const game = kitGame(view.game)!;
  /** The view on the screen: it lags the table's while a shot is in the air. */
  const [shown, setShown] = useState(view);
  const [flying, setFlying] = useState(false);
  const [angle, setAngle] = useState(view.aim?.angle ?? 60);
  const [power, setPower] = useState(view.aim?.power ?? 60);
  const [shell, setShell] = useState(view.aim?.shells[0]?.shell ?? "");
  const [picked, setPicked] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [soundOn, setSoundOn] = useState(() => loadFeedbackSettings().sound);
  const bubbles = useBubbles(chat?.messages ?? []);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const playback = useRef<Playback | null>(null);
  /** The newest view from the table, which may be ahead of the one on the screen. */
  const latest = useRef(view);
  /** The last shot played (or seen already when the table opened): each is played once. */
  const played = useRef(view.last?.n ?? 0);
  /** The shell each player here had chosen, so it is still chosen when the screen comes back to them. */
  const chosen = useRef<Record<number, string>>({});
  /** The show: the painter with its kept pictures, the sparks and smoke, and where each tank is drawn. */
  const painter = useRef<Painter | null>(null);
  painter.current ??= new Painter();
  const fx = useRef<Fx | null>(null);
  fx.current ??= new Fx();
  const bodies = useRef(new Map<string, Body>());
  /** Tanks knocked out in the flight now playing, from the moment the shot that did it lands. */
  const wrecked = useRef(new Set<string>());
  /** Where shells have gone off this game: the earth stays burnt there. */
  const scorches = useRef<{ x: number; y: number; r: number }[]>([]);
  /** What the frame loop reads: always the newest of everything, without being set up again. */
  const live = useRef({ shown, angle, power, dots: [] as [number, number][], aimPiece: null as string | null, size, names });
  const still = useMemo(() => reducedMotion(), []);
  const me = shown.me;
  useOverSound(shown.over, me, watching || together);

  // ---- Shots: each new one is flown before its view is shown --------------------------------
  const begin = (next: FieldView) => {
    const n = next.last?.n ?? 0;
    const fresh = n > played.current;
    played.current = n;
    wrecked.current.clear();
    const flight = fresh && !still ? beginPlayback(next) : null;
    if (!flight) {
      playback.current = null;
      setFlying(false);
      setShown(next);
      return;
    }
    playback.current = flight;
    setFlying(true);
    // The gun goes off: a flash and smoke at the muzzle, and the barrel kicks back.
    const last = next.last!;
    const gun = last.from.pieces.find((p) => p.id === last.piece);
    if (gun) {
      const rad = (last.angle * Math.PI) / 180;
      fx.current!.muzzle(gun.x + Math.cos(rad) * BARREL, gun.y + PIECE_UP + 4 + Math.sin(rad) * BARREL, last.angle);
      const body = bodies.current.get(gun.id);
      if (body) body.recoil = 1;
    }
    play(flight.shell?.carry || flight.shell?.weight === 0 ? "zap" : "cannon");
  };
  useEffect(() => {
    latest.current = view;
    // A shot in the air is finished first; the view waits its turn (see the loop below).
    if (!playback.current) begin(view);
  }, [view]);

  const skip = () => {
    if (playback.current) playback.current.tick = playback.current.flight.ticks + 1e6;
  };

  // ---- Aiming --------------------------------------------------------------------------------
  const aim = watching || flying ? null : shown.aim;
  const pick = watching || flying ? null : shown.pick;
  const aimKey = aim ? `${me}/${shown.field.key}` : "";
  useEffect(() => {
    if (!aim) return;
    setAngle(aim.angle);
    setPower(aim.power);
  }, [aimKey]);
  // The shell stays the one this player last chose, while they have any of it.
  const held = aim?.shells ?? [];
  const heldKey = `${aimKey}:${held.map((s) => `${s.shell}${s.left}`).join()}`;
  useEffect(() => {
    if (!held.length) return;
    const keep = chosen.current[me];
    setShell(held.some((s) => s.shell === keep) ? keep! : held[0]!.shell);
  }, [heldKey]);
  const choose = (id: string) => {
    chosen.current[me] = id;
    setShell(id);
  };
  useEffect(() => setPicked(""), [shown.pool?.map((s) => `${s.shell}${s.left}`).join(), !!pick]);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(timer);
  }, [error]);

  const send = async (move: Record<string, unknown>) => {
    if (busy) return false;
    setBusy(true);
    try {
      const refused = await act(move);
      if (refused) {
        setError(named(refused, names));
        play("nope");
        return false;
      }
      setError(null);
      return true;
    } finally {
      setBusy(false);
    }
  };
  const fire = () => aim && shell && void send({ type: "fire", shell, angle, power });
  const turnBarrel = (by: number) => aim && setAngle((a) => clamp(a + by, aim.minAngle, aim.maxAngle));
  const push = (by: number) => aim && setPower((p) => clamp(p + by, aim.minPower, aim.maxPower));

  const shellOf = (id: string) => shown.shells.find((s) => s.id === id);
  const current = shellOf(shell);
  // The first of the shot's path, as dots: flown for real, so the wind, the hill in front and the
  // way this shell flies (dead straight, or hardly falling) all show.
  const dots = useMemo(() => {
    if (!aim) return [];
    const like = { ...DOT_SHELL, weight: current?.weight, seek: current?.seek };
    const points = flyField(fieldWorld(shown), { piece: aim.piece, shell: like, angle, power }).tracks[0]?.points ?? [];
    return points.slice(1, -1).filter((_, i) => i % 2 === 1).slice(0, 14);
  }, [aim?.piece, angle, power, shown.field.land, shown.field.pieces, shown.field.wind, current?.weight, current?.seek]);
  live.current = { shown, angle, power, dots, aimPiece: aim?.piece ?? null, size, names };

  // ---- Drawing: one loop, for as long as the table is open ------------------------------------
  /** What a thing that happened in a flight sounds and looks like. */
  const happen = (p: Playback, e: FieldEvent) => {
    const target = p.target;
    const earth = lookOf(target.field.scene).earth;
    fx.current!.event(e, earth);
    if ((e.kind === "burst" && e.r >= 12) || e.kind === "fire") {
      scorches.current.push({ x: e.x, y: e.y, r: e.kind === "fire" ? e.r * 0.7 : e.r });
      if (scorches.current.length > 120) scorches.current.shift();
    }
    if (e.kind === "burst") play(e.r >= 150 ? "bigBoom" : e.r >= 12 ? "boom" : "piece");
    else if (e.kind === "fire") play("sizzle");
    else if (e.kind === "heap") play("thud");
    else if (e.kind === "skip" || e.kind === "split") play("knock");
    else if (e.kind === "carry") play("zap");
    const most = Math.max(p.shell?.damage ?? 0, p.shell?.split?.damage ?? 0, p.shell?.walk?.damage ?? 0, 1);
    for (const hit of e.hits) {
      const body = bodies.current.get(hit.piece);
      if (body) body.struck = 1;
      const struck = target.field.pieces.find((piece) => piece.id === hit.piece);
      if (!struck) continue;
      const own = hit.piece === target.last!.piece;
      const mine = struck.owner === target.me && !watching && !together;
      // Knocked out by this shot: it goes up with the last thing that hit it.
      const lastHit = !p.flight.events.some((later) => later.tick > e.tick && later.hits.some((h) => h.piece === hit.piece));
      if (struck.out && lastHit && !wrecked.current.has(hit.piece)) {
        wrecked.current.add(hit.piece);
        fx.current!.wreck(hit.piece, struck.x, e.y, earth);
        fx.current!.say("Knocked out!", struck.x, struck.y, mine ? "bad" : "good");
        play("bigBoom");
      } else if (own) fx.current!.say("Whoops!", struck.x, struck.y, "bad");
      else if (hit.damage >= most * 0.85) fx.current!.say("Direct hit!", struck.x, struck.y, mine ? "bad" : "good");
    }
    if (e.hits.length) play("capture");
  };

  useEffect(() => {
    let frame = 0;
    let before = performance.now();
    let puff = 0;
    const started = before;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const gap = Math.min(100, now - before);
      const p = playback.current;
      const show = fx.current!;
      // With nothing in the air and nothing settling, half the frames are plenty for clouds.
      if (!p && !show.busy && now - before < 30) return;
      before = now;
      if (document.hidden) return;
      const ticks = (gap / 1000) * FIELD_TICKS;
      const { shown: at, size: box } = live.current;

      if (p) {
        const was = p.tick;
        p.tick += ticks * SPEED;
        for (const e of eventsBetween(p, was, p.tick)) happen(p, e);
        if (playbackOver(p)) {
          // Whatever the table has sent meanwhile is next: another shot to fly, or simply the field as it is.
          playback.current = null;
          begin(latest.current);
        }
      }
      const now_ = playback.current;
      const flight = now_ ? frameAt(now_) : null;
      const base = now_ ? now_.target : at;
      const land = flight ? flight.land : at.field.land;
      const ground = { width: base.field.width, step: base.field.step, heights: land };

      // Smoke behind whatever is flying.
      puff += ticks;
      if (flight && puff >= 2) {
        puff = 0;
        for (const s of flight.shells) show.trail(s.x, s.y, s.look, s.small);
      }

      // Each tank is drawn where it has got to: driving to where the game has it, or dropping there.
      const actors: Actor[] = base.field.pieces.map((piece) => {
        const where = flight?.pieces.find((x) => x.id === piece.id) ?? (now_ ? null : piece);
        // A tank already out when the shot was fired is where the view has it; one put out by this shot is a tank until it goes up.
        const goal = where ?? piece;
        let body = bodies.current.get(piece.id);
        if (!body) bodies.current.set(piece.id, (body = { x: goal.x, y: goal.y, drop: 0, recoil: 0, struck: 0, rolled: 0 }));
        const far = goal.x - body.x;
        if (Math.abs(far) > LEAP || still) {
          // Not driven: set down somewhere new, in a ring of light at each end.
          if (Math.abs(far) > LEAP && !still) {
            show.warp(body.x, body.y + 20);
            show.warp(goal.x, goal.y + 20);
          }
          Object.assign(body, { x: goal.x, y: goal.y, drop: 0 });
        } else if (far) {
          const step = Math.sign(far) * Math.min(Math.abs(far), ROLL * ticks);
          body.x += step;
          body.rolled += step;
          body.y = landAt(ground, body.x);
        } else if (body.y > goal.y + 0.5) {
          // The ground has gone from under it: it drops, faster as it goes, and lands in a puff of dust.
          body.drop += 0.5 * ticks;
          body.y -= body.drop * ticks;
          if (body.y <= goal.y) {
            if (body.drop > 3) show.event({ tick: 0, kind: "skip", x: body.x, y: goal.y, r: 0, hits: [] }, lookOf(base.field.scene).earth);
            Object.assign(body, { y: goal.y, drop: 0 });
          }
        } else {
          // Lifted (earth has landed under it), or already there.
          body.y += (goal.y - body.y) * Math.min(1, 0.3 * ticks);
          body.drop = 0;
        }
        body.recoil *= Math.pow(0.86, ticks);
        body.struck *= Math.pow(0.88, ticks);
        if (body.recoil < 0.01) body.recoil = 0;
        if (body.struck < 0.01) body.struck = 0;
        const out = !!piece.out && (!now_ || wrecked.current.has(piece.id) || !now_.target.last!.from.pieces.some((x) => x.id === piece.id));
        if (out) show.smoulder(piece.id, body.x, body.y);
        // In flight, the tank that fired keeps the barrel it fired with, and armour is as it was until the shot is over.
        const firing = now_ && now_.target.last!.piece === piece.id;
        const before_ = now_ ? at.field.pieces.find((x) => x.id === piece.id) : null;
        return { ...piece, x: body.x, y: body.y, out, angle: firing ? now_.target.last!.angle : piece.angle, armour: before_ && !out ? before_.armour : piece.armour, recoil: body.recoil, struck: body.struck, rolled: body.rolled };
      });

      show.step(ticks, base.field.wind, base.field.gravity, (x) => landAt(ground, x));

      const el = canvas.current;
      const ctx = el?.getContext("2d");
      if (!el || !ctx || !box.w) return;
      const aiming = !now_ && live.current.aimPiece;
      const scene: Scene = {
        scene: base.field.scene,
        width: base.field.width,
        height: base.field.height,
        step: base.field.step,
        land,
        wind: base.field.wind,
        pieces: actors,
        names: live.current.names,
        turn: now_ ? now_.target.last!.seat : at.over ? null : at.turn,
        aim: aiming ? { piece: aiming, angle: live.current.angle, power: live.current.power, dots: live.current.dots } : null,
        frame: flight,
        fx: show,
        time: still ? 0 : (now - started) / 1000,
        firing: now_ ? toneColour(now_.target.players[now_.target.last!.seat]?.tone) : undefined,
        scorches: scorches.current,
      };
      painter.current!.draw(ctx, box.w, box.h, el.width / box.w, scene);
      // With motion turned down, the field is painted when it changes and not between.
      if (still) cancelAnimationFrame(frame);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, still ? [shown, angle, power, dots, size, names.join("|"), !!aim] : []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fitCanvas = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      if (canvas.current) {
        canvas.current.width = Math.round(w * dpr);
        canvas.current.height = Math.round(h * dpr);
      }
      setSize({ w, h });
    };
    fitCanvas();
    const watch = new ResizeObserver(fitCanvas);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  // A new field (the next game): nothing of the last one is left hanging in the air.
  useEffect(() => {
    fx.current!.clear();
    bodies.current.clear();
    scorches.current = [];
  }, [view.field.key, (view.last?.n ?? 0) === 0]);

  // ---- The pointer and the keyboard ----------------------------------------------------------
  const aimAt = (e: React.PointerEvent) => {
    if (!aim) return;
    const tank = shown.field.pieces.find((p) => p.id === aim.piece);
    const box = stage.current?.getBoundingClientRect();
    if (!tank || !box) return;
    const [x, y] = fitField(shown.field, box.width, box.height).back(e.clientX - box.left, e.clientY - box.top);
    const dx = x - tank.x;
    const dy = Math.max(0, y - (tank.y + PIECE_UP));
    const far = Math.hypot(dx, dy);
    // Too near the tank to mean anything: a tap on it changes nothing.
    if (far < shown.field.width * 0.02) return;
    setAngle(clamp(Math.round((Math.atan2(dy, dx) * 180) / Math.PI), aim.minAngle, aim.maxAngle));
    setPower(clamp(Math.round((far / (shown.field.width * FULL_PULL)) * 100), aim.minPower, aim.maxPower));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!aim) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    aimAt(e);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!aim) return;
    const by = e.shiftKey ? 5 : 1;
    if (e.key === "ArrowLeft") turnBarrel(by);
    else if (e.key === "ArrowRight") turnBarrel(-by);
    else if (e.key === "ArrowUp") push(by);
    else if (e.key === "ArrowDown") push(-by);
    else if (e.key === "Enter" || e.key === " ") fire();
    else return;
    e.preventDefault();
  };

  const toggleSound = () => {
    const next = { ...loadFeedbackSettings(), sound: !soundOn };
    saveFeedbackSettings(next);
    setSoundOn(next.sound);
  };

  // ---- Words ---------------------------------------------------------------------------------
  const draw = !!shown.over && shown.over.winners.length === shown.seats;
  const won = !!shown.over && !draw && shown.over.winners.includes(me);
  const who = shown.turn === null ? "" : (names[shown.turn] ?? `Player ${shown.turn + 1}`);
  const mine = shown.turn === me && !watching;
  const drafting = shown.phase === "draft";
  const status = shown.over
    ? ""
    : flying
      ? ""
      : mine
        ? drafting
          ? together
            ? `${who}: choose a shell.`
            : "Your pick: choose a shell."
          : together
            ? `${who}: choose a shell, aim and fire.`
            : "Your turn: choose a shell, aim and fire."
        : drafting
          ? `${who} is choosing…`
          : `${who} is aiming…`;
  const turnSeen = useRef(shown.turn);
  useEffect(() => {
    if (shown.turn === me && turnSeen.current !== me && !shown.over && !watching && !together) play("yourTurn");
    turnSeen.current = shown.turn;
  }, [shown.turn]);
  const picture = `${shown.field.name}. ${shown.field.pieces.map((p) => `${names[p.owner] ?? `Player ${p.owner + 1}`}'s tank is ${p.out ? "out" : `${Math.round((p.x / shown.field.width) * 100)}% of the way across`}.`).join(" ")}`;
  const pool = shown.pool ?? [];

  return (
    <main className={`table kit field field-${shown.game}`}>
      <header className="palace-bar kit-bar">
        <button type="button" className="leave" aria-label="Leave game" onClick={() => (shown.over || confirm("Leave this game?")) && onLeave()}>
          ←
        </button>
        <div role="group" className="kit-scores" aria-label="Scores">
          {shown.scores.map((s, i) => (
            <span key={i} className={`kit-score${s.seats.includes(me) ? " us" : ""}`}>
              <small>
                <span className="sport-dot" style={{ background: toneColour(shown.players[s.seats[0]!]?.tone) }} aria-hidden /> {sideName(s.seats, names)}
              </small>
              <strong>{s.value}</strong>
            </span>
          ))}
        </div>
        <span className="bar-buttons">
          {onHelp && <HowToButton onClick={onHelp} />}
          {settings && <TableSettingsButton settings={settings.value} onChange={settings.change} cards={false} />}
          <SoundButton on={soundOn} toggle={toggleSound} inline />
        </span>
      </header>
      {banner}

      <div className="felt field-felt">
        <div className="field-view">
          <div
            ref={stage}
            className={`field-stage${aim ? " can" : ""}${dragging ? " pulling" : ""}`}
            style={{ aspectRatio: `${shown.field.width} / ${shown.field.height}` }}
            tabIndex={0}
            role="group"
            aria-label={`${picture}${aim ? " Left and right turn the barrel, up and down set the power, Enter fires." : ""}`}
            onPointerDown={onPointerDown}
            onPointerMove={(e) => dragging && aimAt(e)}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            onKeyDown={onKeyDown}
          >
            <canvas ref={canvas} aria-hidden />
            {shown.info.length > 0 && (
              <p className="field-info">
                {shown.info.map((line, i) => (
                  <span key={i}>{line}</span>
                ))}
              </p>
            )}
            {flying && (
              <button type="button" className="sport-skip" onClick={skip} onPointerDown={(e) => e.stopPropagation()}>
                Skip ⏭
              </button>
            )}
          </div>
        </div>

        <div className="field-side">
          <ul className="field-seats" aria-label="Players">
            {shown.players.map((p, seat) => (
              <li key={seat} className={`field-seat${shown.turn === seat && !shown.over ? " active" : ""}${p.done ? " done" : ""}`} aria-current={shown.turn === seat && !shown.over ? "true" : undefined}>
                <span className="sport-dot" style={{ background: toneColour(p.tone) }} aria-hidden />
                <strong>{names[seat] ?? `Player ${seat + 1}`}</strong>
                <span>{p.line}</span>
              </li>
            ))}
          </ul>
          <p className="narration field-narration" aria-live="polite">
            {shown.narration ? named(shown.narration, names) : null}
          </p>
          <div className="field-status" role="status">
            {status}
          </div>

          {/* Choosing shells before the game: the table's shells as cards, and a button to take the one chosen. */}
          {drafting && !shown.over && (
            <div className="field-panel field-draft" inert={!pick}>
              <ChoiceCards
                label="The shells on the table"
                value={picked}
                items={pool.map((s) => ({ id: s.shell, title: shellOf(s.shell)?.name ?? s.shell, detail: shellOf(s.shell)?.blurb ?? "", note: `${s.left} left`, disabled: !pick }))}
                onValueChange={(e: CustomEvent<string>) => setPicked(e.detail)}
              />
              {pick && (
                <ActionButton disabled={!picked || busy} onClick={() => picked && void send({ type: "pick", shell: picked })}>
                  {picked ? `Take the ${shellOf(picked)?.name ?? "shell"}` : pick.prompt}
                </ActionButton>
              )}
            </div>
          )}

          {/* Aiming. Kept in place (hidden) while a shot flies or someone else aims, so the table doesn't change size between shots. */}
          {!drafting && !shown.over && !watching && (
            <div className={`field-panel field-controls${aim ? "" : " idle"}`} role="group" aria-label="Shell, angle and power" aria-hidden={!aim} inert={!aim}>
              <SegmentedControl label="Shell" value={shell} options={held.map((s) => ({ value: s.shell, label: `${shellOf(s.shell)?.name ?? s.shell} ×${s.left}` }))} onValueChange={(e: CustomEvent<string>) => choose(e.detail)} />
              <p className="field-blurb">{current?.blurb ?? " "}</p>
              <div className="field-dial">
                <button type="button" aria-label="Turn the barrel a degree to the right" onClick={() => turnBarrel(-1)}>
                  −
                </button>
                <RangeSlider label="Angle" unit="°" min={aim?.minAngle ?? 0} max={aim?.maxAngle ?? 180} step={1} value={angle} onValueChange={(e: CustomEvent<number>) => setAngle(e.detail)} />
                <button type="button" aria-label="Turn the barrel a degree to the left" onClick={() => turnBarrel(1)}>
                  +
                </button>
              </div>
              <div className="field-dial">
                <button type="button" aria-label="A little less power" onClick={() => push(-1)}>
                  −
                </button>
                <RangeSlider label="Power" min={aim?.minPower ?? 1} max={aim?.maxPower ?? 100} step={1} value={power} onValueChange={(e: CustomEvent<number>) => setPower(e.detail)} />
                <button type="button" aria-label="A little more power" onClick={() => push(1)}>
                  +
                </button>
              </div>
              <div className="field-actions">
                {aim?.move && (
                  <span className="field-drive" role="group" aria-label={`Drive: ${aim.move.left} ${aim.move.left === 1 ? "move" : "moves"} left`}>
                    <ActionButton variant="outline" size="sm" label="Drive left" disabled={busy || !aim.move.ways.includes(-1)} onClick={() => void send({ type: "move", way: -1 })}>
                      ◀
                    </ActionButton>
                    <small>
                      {aim.move.left} {aim.move.left === 1 ? "move" : "moves"}
                    </small>
                    <ActionButton variant="outline" size="sm" label="Drive right" disabled={busy || !aim.move.ways.includes(1)} onClick={() => void send({ type: "move", way: 1 })}>
                      ▶
                    </ActionButton>
                  </span>
                )}
                <ActionButton disabled={busy || !aim || !shell} onClick={fire}>
                  Fire{current ? ` the ${current.name}` : ""}
                </ActionButton>
              </div>
            </div>
          )}
          {error && (
            <p className="error field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>

      <section className="me" data-seat={me}>
        {chat && <TableChat {...chat} />}
      </section>

      <div className="bubble-layer" aria-live="polite">
        {[...bubbles.entries()].map(([s, m]) => (
          <Bubble key={`${s}-${m.at}`} message={m} seat={s} />
        ))}
      </div>

      {won && !together && <Confetti />}
      {shown.over && (
        <div className="sheet won-sheet">
          <h2>{won && !together ? "You won! 🏆" : named(shown.over.title, names)}</h2>
          {won && !together && <p className="won-line">{named(shown.over.title, names)}</p>}
          {shown.result && <ResultTable result={shown.result} names={names} me={me} untitled />}
          <PlayAgain onAgain={onAgain} onLeave={onLeave} />
        </div>
      )}
      <h1 className="sr-only">{game.name}</h1>
    </main>
  );
}
