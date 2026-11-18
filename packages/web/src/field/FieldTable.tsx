// The table for a field game (Over the Hill): whatever a `FieldView` says is on the field, drawn
// side on, on a canvas, the way SportTable draws every table sport from above.
//
// - The field: sky, land, a tank for each player, and while a shot is in the air, the shot. The
//   view carries the last shot and the field it was fired over; this screen flies it again
//   (field/play.ts) and ends on the field the view shows.
// - Aiming, three ways that all set the same two numbers: drag on the field away from your tank
//   (the barrel follows, and further is harder), the two sliders with a nudge either side, or the
//   arrow keys with the field in focus. A few dots show how the shot would set off.
// - The controls under the field are Zubra components: the shells in a `segmented-control`, the
//   angle and the power each a `range-slider`, Fire an `action-button`, and when shells are chosen
//   before the game, `choice-cards`.
import { FIELD_TICKS, PIECE_UP, fieldWorld, flyField, kitGame, type FieldPieceLook, type FieldShell, type FieldView } from "@journey-to-code/games";
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
import { drawField, fitField, type Scene } from "./draw";
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
const SPEED = 1.2;
/** Dragging this far from the tank (as a share of the field's width) is full power. */
const FULL_PULL = 0.4;
/** The shell whose first moments are drawn as dots while aiming: nothing about it matters but that it flies. */
const DOT_SHELL: FieldShell = { id: "dots", name: "", blurb: "", blast: 1, damage: 0 };

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

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
  const me = shown.me;
  useOverSound(shown.over, me, watching || together);

  // ---- Shots: each new one is flown before its view is shown --------------------------------
  const begin = (next: FieldView) => {
    const n = next.last?.n ?? 0;
    const fresh = n > played.current;
    played.current = n;
    const flight = fresh && !reducedMotion() ? beginPlayback(next) : null;
    if (!flight) {
      playback.current = null;
      setFlying(false);
      setShown(next);
      return;
    }
    playback.current = flight;
    setFlying(true);
    play("putt");
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

  // The first of the shot's path, as dots: flown for real, so the wind and the hill in front show.
  const dots = useMemo(() => {
    if (!aim) return [];
    const points = flyField(fieldWorld(shown), { piece: aim.piece, shell: DOT_SHELL, angle, power }).tracks[0]?.points ?? [];
    return points.slice(1, -1).filter((_, i) => i % 2 === 1).slice(0, 12);
  }, [aim?.piece, angle, power, shown.field.land, shown.field.pieces, shown.field.wind]);

  // ---- Drawing -------------------------------------------------------------------------------
  const sceneOf = (): Scene => {
    const p = playback.current;
    const frame = p ? frameAt(p) : null;
    const base = p ? p.target : shown;
    const pieces: FieldPieceLook[] = base.field.pieces.map((piece) => {
      // In flight, a piece is where the flight has it; the one that fired keeps the barrel it fired with.
      const at = frame?.pieces.find((x) => x.id === piece.id);
      return { ...piece, ...(at ? { x: at.x, y: at.y } : {}), ...(p && p.target.last!.piece === piece.id ? { angle: p.target.last!.angle } : {}) };
    });
    return {
      width: base.field.width,
      height: base.field.height,
      step: base.field.step,
      land: frame ? frame.land : shown.field.land,
      pieces,
      names,
      turn: p ? p.target.last!.seat : shown.over ? null : shown.turn,
      aim: !p && aim ? { piece: aim.piece, angle, dots } : null,
      frame,
    };
  };
  const paint = () => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || !size.w) return;
    drawField(ctx, size.w, size.h, el.width / size.w, sceneOf());
  };
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fitCanvas = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
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
  // At rest, the field is painted when something on it changes.
  useEffect(() => {
    if (!flying) paint();
  }, [flying, shown, angle, dots, size, names.join("|"), !!aim]);
  // In flight, every frame: the clock moves, things that happen make their sound, and when it is over the view is shown.
  useEffect(() => {
    if (!flying) return;
    let frame = 0;
    let before = performance.now();
    const loop = (now: number) => {
      const p = playback.current;
      if (!p) return;
      const was = p.tick;
      p.tick += (Math.min(100, now - before) / 1000) * FIELD_TICKS * SPEED;
      before = now;
      for (const e of eventsBetween(p, was, p.tick)) {
        if (e.hits.length) play("capture");
        else if (e.kind === "burst") play(e.r >= 100 ? "pins" : "knock");
        else if (e.kind === "heap") play("stone");
        else if (e.kind === "skip" || e.kind === "split") play("piece");
      }
      if (playbackOver(p)) {
        // Whatever the table has sent meanwhile is next: another shot to fly, or simply the field as it is.
        playback.current = null;
        begin(latest.current);
        if (!playback.current) return;
        before = now;
      }
      paint();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [flying]);

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
  const shellOf = (id: string) => shown.shells.find((s) => s.id === id);
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
  const picture = `${shown.field.name}. ${shown.field.pieces.map((p) => `${names[p.owner] ?? `Player ${p.owner + 1}`}'s tank is ${Math.round((p.x / shown.field.width) * 100)}% of the way across.`).join(" ")}`;
  const current = shellOf(shell);
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
