// One table for every game on the board kit, as KitTable is for the card games. The engine's view
// says everything: the grid and what is on it, which cells a tap plays, which pieces can be picked
// up and where each can go, the buttons, the scores. This only lays it out and sends what the view
// offers: the other players above, the board in the middle, you below.
//
// A game with dice has them drawn by `Dice`, and a game scored on a sheet has it drawn by `Sheet`;
// a game of dice and a scorecard (Yacht) has no grid at all, and the sheet takes the board's place.
//
// Every cell is a button with a spoken name ("centre: X, yours"), the arrow keys walk the board,
// and what just happened is read out, so the board can be played without seeing it.
//
// A piece that moves (the view's `select`) is played by tapping it and then where it goes: tapping
// another piece picks that one up instead, tapping it again or anywhere else (or Escape) puts it
// down. It can be dragged there too. From the keyboard it is the same two presses of Enter, and
// each cell says whether its piece "can move" and, once one is picked up, where it "can go".
//
// A game with a set of its own (Chess) has its pieces drawn from it (pieces.tsx) instead of as
// text. A move that needs one more thing said (what a pawn becomes) asks on the square itself. A
// game that keeps a record has its moves listed under the board, and they can be stepped through:
// the board then shows that earlier position, and nothing can be moved on it.
// A grid of crossings (the view's `points`: Go) is drawn as lines with the pieces where they cross.
// The cells are the same buttons, each centred on its crossing. On the full board on a phone the
// crossings are closer together than a finger is wide, so there a stone takes two taps: the first
// shows it (and it can be nudged with the arrows under the board), the second, or "Play", puts it
// down. When that happens is this device's choice (⚙︎: see `Placing` in display.ts).
import { cellName, cellsAfter, colOf, kitGame, rowOf, type BoardGrid, type BoardPiece, type BoardReserve, type BoardView, type Choice } from "@journey-to-code/games";
import { type TableSettings } from "@journey-to-code/rules";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bubble, TableChat, useBubbles, type ChatProps } from "../Chat";
import { Confetti } from "../Confetti";
import { placingSetting } from "../display";
import { loadFeedbackSettings, play, saveFeedbackSettings } from "../feedback/sounds";
import { named, ResultTable, sideName } from "../kit/KitTable";
import { motionScale, useCardFlip } from "../motion";
import { TableSettingsButton } from "../TableSettings";
import { OfferBanner, OffersMenu } from "./Offers";
import { PieceSet, usePieceArt } from "./pieces";
import { RecordStrip } from "./Record";
import { SeatClock } from "./SeatClock";
import { Dice } from "./Dice";
import { Sheet } from "./Sheet";
import { isPointsTrack, Track } from "./Track";
import { SoundButton } from "../SoundButton";

export interface BoardTableProps {
  view: BoardView;
  names: string[];
  /** Resolves to an error message when the move is refused. */
  act: (move: Record<string, unknown>) => Promise<string | null>;
  onLeave: () => void;
  banner?: React.ReactNode;
  /** Looking on without a seat: nothing to press, offers included. */
  watching?: boolean;
  chat?: ChatProps;
  settings?: {
    value: TableSettings;
    change: (next: TableSettings) => Promise<void> | void;
  };
}

/** Something picked up, waiting for where it goes: a cell of a grid, or a kind of piece in your reserve. */
interface Picked {
  grid: string;
  from: number | string;
}

/**
 * The source a tap on `cell` picks up: the piece there, or (for a piece that covers several cells,
 * all with one `span`) the piece that cell is part of.
 */
function sourceAt(grid: BoardGrid, cell: number) {
  const sources = grid.select?.sources ?? [];
  const span = grid.cells[cell]?.span;
  return sources.find((s) => s.from === cell) ?? (span ? sources.find((s) => typeof s.from === "number" && grid.cells[s.from]?.span === span) : undefined);
}

/** A piece's colour: its own, or its owner's (the first seat's, the second's…). */
const SEAT_TONES = ["red", "blue", "green", "gold", "dark", "light"];
const toneOf = (piece: BoardPiece) => piece.tone ?? (piece.owner === null ? "dark" : SEAT_TONES[piece.owner % SEAT_TONES.length]!);

function Piece({ piece, small }: { piece: BoardPiece; small?: boolean }) {
  // Drawn from the game's own set when it has one; otherwise the engine's glyph, as text.
  const art = usePieceArt(piece);
  return (
    <span className={`piece tone-${toneOf(piece)} kind-${piece.kind}${art ? " art" : ""}${piece.faded ? " faded" : ""}${small ? " small" : ""}${!small && piece.id ? " slides" : ""}`} data-flip={small ? undefined : piece.id} aria-hidden>
      {art ?? piece.glyph}
    </span>
  );
}

/** A move waiting for one more thing to be said: which piece the pawn becomes. */
interface Asking {
  grid: string;
  from: number | string;
  to: number;
  key: string;
  options: BoardPiece[];
}

export function BoardTable({ view, names, act, onLeave, banner, watching, chat, settings }: BoardTableProps) {
  const game = kitGame(view.game)!;
  const me = view.me;
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  /** A button that asks before it is sent (the view's `confirm`), waiting for its answer. */
  const [confirming, setConfirming] = useState<Choice | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);
  // Looking back through the record: how many of its moves the board shows. Null is the game as it stands.
  const [back, setBack] = useState<number | null>(null);
  const [lookingOver, setLookingOver] = useState(false);
  const moves = view.record?.moves ?? [];
  const looking = back !== null && back < moves.length;
  // A new game has a new record: whatever was being looked at is gone.
  useEffect(() => {
    if (back !== null && back >= moves.length) setBack(null);
  }, [back, moves.length]);
  const [soundOn, setSoundOn] = useState(() => loadFeedbackSettings().sound);
  // While thrown dice are in the air the sheet doesn't say what they'll score.
  const [tumbling, setTumbling] = useState(false);
  const bubbles = useBubbles(chat?.messages ?? []);
  const root = useRef<HTMLElement>(null);
  // Pieces that keep an id from move to move slide to where they went, the way cards do.
  useCardFlip(root, motionScale(settings?.value.pace));
  const others = Array.from({ length: view.seats - 1 }, (_, i) => (me + 1 + i) % view.seats);
  const draw = !!view.over && view.over.winners.length === view.seats && view.seats > 1;
  const won = !!view.over && !draw && view.over.winners.includes(me);

  // Whatever was picked up is put down when the board moves on, unless it can still be picked up
  // (a ship in your hand stays there while you press the button that turns it), or the view says a
  // piece is still in hand (the middle of a run of jumps): then that one is picked up already.
  const offered = (p: Picked) => !!view.grids.find((g) => g.id === p.grid)?.select?.sources.some((s) => s.from === p.from);
  const selectKey = JSON.stringify(view.grids.map((g) => g.select ?? null));
  useEffect(() => {
    const inHand = view.grids.find((g) => g.select?.held !== undefined);
    setPicked((p) => (inHand ? { grid: inHand.id, from: inHand.select!.held! } : p && offered(p) ? p : null));
    setAsking(null);
  }, [selectKey]);
  // With nothing picked up, you hold what the view suggests (the next ship to place), if anything.
  const suggesting = view.grids.find((g) => g.select?.suggest !== undefined);
  const held: Picked | null = picked ?? (suggesting ? { grid: suggesting.id, from: suggesting.select!.suggest! } : null);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 2500);
    return () => clearTimeout(t);
  }, [error]);

  // Sounds: a piece landing, your turn, the end.
  const boardKey = JSON.stringify(view.grids.map((g) => g.cells.map((p) => (p ? [p.owner, p.kind, p.count ?? 1] : 0))));
  const pieces = view.grids.reduce((n, g) => n + g.cells.filter(Boolean).length, 0);
  // Stones on crossings click like stones, and stones taken off rattle into the lid.
  const stones = view.grids.some((g) => g.points);
  const taken = view.reserves.reduce((n, r) => n + r.pieces.reduce((m, p) => m + p.count, 0), 0);
  const seen = useRef<string | null>(null);
  const takenSeen = useRef(taken);
  useEffect(() => {
    // A board swept clean for the next game makes no sound.
    if (seen.current !== null && seen.current !== boardKey && pieces > 0) play(!stones ? "piece" : taken > takenSeen.current ? "capture" : "stone");
    seen.current = boardKey;
    takenSeen.current = taken;
  }, [boardKey]);
  // A question about a button goes away when the table moves on.
  const choiceKey = JSON.stringify(view.choices?.options.map((o) => o.move) ?? null);
  useEffect(() => setConfirming(null), [choiceKey]);
  const turnSeen = useRef(false);
  useEffect(() => {
    if (view.turn === me && !turnSeen.current) play("yourTurn");
    turnSeen.current = view.turn === me;
  }, [view.turn, me]);
  // Alone at a table the score to beat is your own best, which this device remembers (one for each
  // kind of sheet a game has).
  const [best, setBest] = useState<{ was: number | null } | null>(null);
  useEffect(() => {
    if (!view.over || view.seats !== 1 || best) return;
    const key = `cardroom.best.${view.game}.${view.sheet?.columns.length ?? 0}`;
    const score = view.scores[0]?.value ?? 0;
    let was: number | null = null;
    try {
      const saved = localStorage.getItem(key);
      was = saved !== null && Number.isFinite(Number(saved)) ? Number(saved) : null;
      if (was === null || score > was) localStorage.setItem(key, String(score));
    } catch {
      /* storage unavailable: there's no best to show */
    }
    setBest({ was });
  }, [view.over]);
  const overSeen = useRef(!!view.over);
  useEffect(() => {
    if (view.over && !overSeen.current) play(draw ? "handDone" : won ? "won" : "lost");
    overSeen.current = !!view.over;
  }, [view.over, draw, won]);

  /** `keep` leaves what's picked up in your hand: for a button, which isn't a move of that piece. */
  const send = async (move: Record<string, unknown>, keep = false) => {
    if (!keep) setPicked(null);
    const refused = await act(move);
    if (refused) {
      setError(refused);
      play("nope");
    }
  };
  /** A view with two boards says which one a move is on. */
  const onGrid = (grid: BoardGrid) => (view.grids.length > 1 ? { grid: grid.id } : {});

  /** Put a picked-up piece down where it can go: at once, or after asking what the move leaves open. */
  function putDown(grid: BoardGrid, from: number | string, to: number) {
    const ask = grid.select?.choose?.find((c) => c.from === from && c.to === to);
    if (ask) return setAsking({ grid: grid.id, ...ask });
    void send({ type: grid.select!.type, from, to, ...onGrid(grid) });
  }

  function tapCell(grid: BoardGrid, cell: number) {
    const sources = grid.select?.sources ?? [];
    const holding = held?.grid === grid.id ? sources.find((s) => s.from === held.from) : undefined;
    if (holding?.to.includes(cell)) return putDown(grid, holding.from, cell);
    const source = sourceAt(grid, cell);
    // A table that doesn't show where a piece can go lets it be put anywhere, and the game says no.
    if (holding && grid.select?.quiet && !source && cell !== holding.from) return void send({ type: grid.select.type, from: holding.from, to: cell, ...onGrid(grid) });
    // One tap moves (a table setting): a piece with one place to go is played by tapping it.
    if (source && grid.select?.quick && source.to.length === 1 && !(picked?.grid === grid.id && picked.from === source.from)) return void send({ type: grid.select.type, from: source.from, to: source.to[0], ...onGrid(grid) });
    if (source) return setPicked(picked?.grid === grid.id && picked.from === source.from ? null : { grid: grid.id, from: source.from });
    if (grid.tap) {
      if (grid.tap.by === "col") {
        const col = colOf(grid.cols, cell);
        if (grid.tap.cells.some((c) => colOf(grid.cols, c) === col)) return void send({ type: grid.tap.type, col, ...onGrid(grid) });
      } else if (grid.tap.cells.includes(cell)) return void send({ type: grid.tap.type, cell, ...onGrid(grid) });
    }
    if (picked) return setPicked(null);
    if (grid.tap || sources.length) {
      // One of your own pieces that isn't on offer: say that, so it doesn't read as a missed tap.
      setError(sources.length && grid.cells[cell]?.owner === me ? "That piece can't move." : "You can't play there.");
      play("nope");
    }
  }

  function toggleSound() {
    const next = { ...loadFeedbackSettings(), sound: !soundOn };
    saveFeedbackSettings(next);
    setSoundOn(next.sound);
  }

  // Dice to keep, a box to fill in, or the dice to roll: all of them are a move to make.
  const canMove = view.grids.some((g) => g.tap?.cells.length || g.select?.sources.length) || !!view.dice?.tap?.dice.length || !!view.sheet?.pick?.cells.length || (!!view.dice && !!view.choices?.options.length);
  const status = error ? (
    <span className="error">{error}</span>
  ) : looking ? (
    <span>
      Looking back: {back === 0 ? "the start" : `move ${moves[back! - 1]!.turn}`}
      {!view.over && !watching && view.turn === me ? ", and it's your turn. " : ". "}
      <button type="button" className="link" onClick={() => setBack(null)}>
        {view.over ? "To the end" : "Back to the game"}
      </button>
    </span>
  ) : view.over || view.result ? null : asking ? (
    <span className="mine">Choose what it becomes</span>
  ) : held ? (
    // A piece whose only place to go is where it already is (a disc popped out of a rack) is tapped twice.
    <span className="mine">{view.grids.some((g) => g.id === held.grid && g.select?.sources.some((s) => s.from === held.from && s.to.length === 1 && s.to[0] === s.from)) ? "Tap it again to take it out" : "Now pick where it goes"}</span>
  ) : !watching && (view.turn === me || (view.turn === null && canMove)) ? (
    <span className="mine">Your turn</span>
  ) : view.turn !== null ? (
    `${names[view.turn] ?? "Someone"} is thinking…`
  ) : view.choices ? null : (
    "Waiting for everyone…"
  );

  const reserveOf = (seat: number) => view.reserves.filter((r) => r.owner === seat);
  // A piece in your reserve can be picked up when some grid lists its kind as a source.
  const reserveGrid = (kind: string) => view.grids.find((g) => g.select?.sources.some((s) => s.from === kind));

  // The board as it stood earlier in the record: the same pieces put back where they were, the
  // move that led there marked, and nothing to pick up or tap.
  const firstGrid = view.grids[0];
  const earlier: BoardGrid | null =
    looking && firstGrid && view.record
      ? {
          ...firstGrid,
          cells: cellsAfter(firstGrid.cells, view.record, back!),
          marks: back! > 0 ? [...(moves[back! - 1]!.changes.filter((c) => c.from !== null && c.to !== null).slice(-1).flatMap((c) => [{ cell: c.from!, mark: "from" as const }, { cell: c.to!, mark: "last" as const }])), ...(moves[back! - 1]!.threat !== undefined ? [{ cell: moves[back! - 1]!.threat!, mark: "threat" as const }] : [])] : [],
          select: null,
          tap: null,
        }
      : null;
  const step = (count: number | null) => {
    setPicked(null);
    setAsking(null);
    setBack(count);
  };

  // The others, the boards, the dice, the record and what's going on. With a score sheet on the table this is
  // one half of it and the sheet the other (side by side where there's room).
  const middle = (
    <>
      {others.length > 0 && (
        <div className="board-others">
          {others.map((seat) => (
            <div key={seat} className="opp top" data-seat={seat}>
              <BoardSeat view={view} seat={seat} name={names[seat] ?? `Seat ${seat + 1}`} />
              {reserveOf(seat).map((r, i) => (
                <Reserve key={i} reserve={r} names={names} />
              ))}
            </div>
          ))}
        </div>
      )}

      {view.grids.length > 0 && (
        <div className={`boards${view.grids.length > 1 ? " many" : ""}`}>
          {view.grids.map((given, i) => {
            const grid = i === 0 && earlier ? earlier : given;
            return isPointsTrack(grid) ? (
              // A track of points has its dice and its cube on the board itself.
              <Track
                key={grid.id}
                grid={grid}
                view={view}
                names={names}
                picked={looking ? null : held?.grid === grid.id ? held.from : null}
                onCell={(cell) => tapCell(grid, cell)}
                onPick={(cell) => setPicked({ grid: grid.id, from: cell })}
                onMove={(from, to) => putDown(grid, from, to)}
                dice={view.dice ?? null}
                cube={view.cube ?? null}
                still={motionScale(settings?.value.pace) === 0}
                onTumble={setTumbling}
              />
            ) : (
              <Grid
                key={grid.id}
                grid={grid}
                view={view}
                names={names}
                mine={watching ? undefined : view.players[me]?.piece}
                side={i > 0}
                titled={view.grids.length > 1}
                picked={looking ? null : held?.grid === grid.id ? held.from : null}
                asking={!looking && asking?.grid === grid.id ? asking : null}
                onChoose={(kind) => asking && void send({ type: grid.select!.type, from: asking.from, to: asking.to, [asking.key]: kind, ...onGrid(grid) })}
                onCancel={() => setAsking(null)}
                onCell={(cell) => tapCell(grid, cell)}
                onPick={(cell) => setPicked({ grid: grid.id, from: cell })}
                onMove={(from, to) => putDown(grid, from, to)}
              />
            );
          })}
        </div>
      )}
      {view.dice && !view.grids.some(isPointsTrack) && <Dice dice={view.dice} still={motionScale(settings?.value.pace) === 0} onTumble={setTumbling} onTap={(die) => void send({ type: view.dice!.tap!.type, die })} />}
      {view.record && <RecordStrip record={view.record} names={names} shown={looking ? back! : moves.length} onShow={step} />}

      <div className="center-info">
        {view.info.length > 0 && (
          <ul className="kit-info">
            {view.info.map((line, i) => (
              <li key={i}>{named(line, names)}</li>
            ))}
          </ul>
        )}
        <p className="narration" aria-live="polite">
          {view.narration ? named(view.narration, names) : null}
        </p>
        {view.offers && <OfferBanner offers={view.offers} names={names} me={me} watching={!!watching} onSend={(move) => void send(move, true)} />}
        <div className="status" role="status">
          {status}
        </div>
        {view.choices && !view.result && confirming && (
          // A button that is easy to press and hard to undo (the first pass of a game) asks first.
          <div className="felt-actions kit-choices asking" role="group" aria-label={named(confirming.label, names)}>
            <p>{named(confirming.confirm!, names)}</p>
            <button
              type="button"
              className="primary"
              autoFocus
              onClick={() => {
                setConfirming(null);
                void send(confirming.move, true);
              }}
            >
              {named(confirming.label, names)}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirming(null)}>
              Not yet
            </button>
          </div>
        )}
        {view.choices && !view.result && !confirming && (
          <div className={`felt-actions kit-choices ${view.choices.layout ?? ""}`}>
            {view.choices.prompt && <p>{named(view.choices.prompt, names)}</p>}
            {view.choices.options.map((o, i) => (
              <button key={i} type="button" className={o.primary ? "primary" : "secondary"} title={o.hint} onClick={() => (o.confirm ? setConfirming(o) : void send(o.move, true))}>
                {named(o.label, names)}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
  const main = view.sheet ? <div className="board-main">{middle}</div> : middle;

  return (
    <PieceSet.Provider value={view.game}>
    <main
      className={`table kit board board-${view.game}${looking ? " looking-back" : ""}`}
      ref={root}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        setPicked(null);
        setAsking(null);
      }}
    >
      <header className="palace-bar kit-bar">
        <button type="button" className="leave" aria-label="Leave game" onClick={() => (view.over || confirm("Leave this game?")) && onLeave()}>
          ←
        </button>
        <div className="kit-scores" aria-label="Scores">
          {view.scores.map((s, i) => (
            <span key={i} className={`kit-score${s.seats.includes(me) ? " us" : ""}`}>
              <small>{sideName(s.seats, names)}</small>
              <strong>{s.value}</strong>
            </span>
          ))}
        </div>
        <span className="bar-buttons">
          {/* Resign, offer a draw, ask to take a move back: whatever the view says this seat may do. */}
          {view.offers && !watching && <OffersMenu can={view.offers.can} onSend={(move) => void send(move, true)} />}
          {settings && <TableSettingsButton settings={settings.value} onChange={settings.change} stones={stones} />}
          <SoundButton on={soundOn} toggle={toggleSound} inline />
        </span>
      </header>
      {banner}

      <div className={`felt board-felt${view.sheet ? " with-sheet" : ""}`}>
        {main}
        {view.sheet && <Sheet sheet={view.sheet} names={names} me={me} waiting={tumbling} onPick={(type, cell) => void send({ type, cell })} />}
      </div>

      <section className="me" data-seat={me}>
        {chat && <TableChat {...chat} />}
        <div className="me-badge">
          <BoardSeat view={view} seat={me} name={names[me] ?? "You"} row />
        </div>
        {reserveOf(me).map((r, i) => (
          <Reserve
            key={i}
            reserve={r}
            names={names}
            picked={held && typeof held.from === "string" ? held.from : null}
            canPick={(kind) => !!reserveGrid(kind)}
            onPick={(kind) => {
              const grid = reserveGrid(kind);
              if (grid) setPicked(picked?.from === kind ? null : { grid: grid.id, from: kind });
            }}
          />
        ))}
      </section>

      <div className="bubble-layer" aria-live="polite">
        {[...bubbles.entries()].map(([s, m]) => (
          <Bubble key={`${s}-${m.at}`} message={m} seat={s} />
        ))}
      </div>

      {view.result && !view.over && (
        <div className="sheet">
          <ResultTable result={view.result} names={names} me={me} />
          {view.choices ? (
            view.choices.options.map((o, i) => (
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
      {view.over && !lookingOver && (
        <div className="sheet won-sheet board-over">
          {/* Alone at the table there was nobody to beat: the score is the news. */}
          <h2>{won && view.seats > 1 ? "You won! 🏆" : named(view.over.title, names)}</h2>
          {won && !view.result && !view.over.title.includes(`{${me}}`) && <p className="won-line">{named(view.over.title, names)}</p>}
          {best && <p className="won-line">{best.was === null ? "That's your score to beat." : (view.scores[0]?.value ?? 0) > best.was ? `A new best! It was ${best.was}.` : `Your best is ${best.was}.`}</p>}
          {view.result && <ResultTable result={view.result} names={names} me={me} untitled />}
          <button type="button" className="primary" onClick={onLeave}>
            Play again
          </button>
          {/* A game with a record can be gone back over once it's done: the sheet gets out of the way. */}
          {view.record && moves.length > 0 && (
            <button type="button" className="secondary" onClick={() => setLookingOver(true)}>
              Look over the game
            </button>
          )}
        </div>
      )}
      {view.over && lookingOver && (
        <div className="board-over-bar">
          <span>{named(view.over.title, names)}</span>
          <button type="button" className="primary" onClick={onLeave}>
            Play again
          </button>
        </div>
      )}
      <p className="sr-only">{game.name}</p>
    </main>
    </PieceSet.Provider>
  );
}

/** A player at the board: name, what they play as, their line, and whether it's their move. */
function BoardSeat({ view, seat, name, row }: { view: BoardView; seat: number; name: string; row?: boolean }) {
  const p = view.players[seat]!;
  const active = view.turn === seat && !view.over;
  const team = view.teams ? (seat % 2 === view.me % 2 ? "us" : "them") : "";
  return (
    <div className={`kit-seat board-seat ${team}${active ? " active" : ""}${p.out ? " out" : ""}${row ? " row" : ""}`} aria-current={active ? "true" : undefined}>
      <strong>
        {p.piece && <Piece piece={p.piece} small />}
        {name}
        {p.piece && <span className="sr-only"> plays {p.piece.label}</span>}
      </strong>
      {p.line && <span>{named(p.line, [])}</span>}
      {p.badge && <em>{p.badge}</em>}
      {p.clock && <SeatClock clock={p.clock} mine={seat === view.me} />}
    </div>
  );
}

/** Pieces off the board. Your own can be picked up when the view says where they can go. */
function Reserve({ reserve, names, picked, canPick, onPick }: { reserve: BoardReserve; names: string[]; picked?: string | null; canPick?: (kind: string) => boolean; onPick?: (kind: string) => void }) {
  const shown = reserve.pieces.filter((p) => p.count > 0);
  if (!shown.length) return null;
  return (
    <div className="board-reserve" role="group" aria-label={named(`${reserve.label}: {${reserve.owner}}`, names)}>
      <small>{reserve.label}</small>
      {shown.map(({ piece, count }) => {
        const body = (
          <>
            <Piece piece={piece} small />
            {count > 1 && <span className="count">×{count}</span>}
          </>
        );
        const label = `${piece.label}${count > 1 ? `, ${count}` : ""}`;
        return canPick?.(piece.kind) ? (
          <button key={piece.kind} type="button" className={`reserve-piece${picked === piece.kind ? " picked" : ""}`} aria-pressed={picked === piece.kind} aria-label={label} onClick={() => onPick?.(piece.kind)}>
            {body}
          </button>
        ) : (
          <span key={piece.kind} className="reserve-piece" role="img" aria-label={label}>
            {body}
          </span>
        );
      })}
    </div>
  );
}

const MARK_WORDS: Record<string, string> = { last: "last move", from: "moved from here", win: "winning line", threat: "under threat", flipped: "just flipped", hint: "you can move here", must: "has to move", barred: "can't be played this turn" };

interface GridProps {
  grid: BoardGrid;
  view: BoardView;
  names: string[];
  /** What this seat plays as, for the stone shown before it is put down. Nothing for someone watching. */
  mine?: BoardPiece;
  side: boolean;
  titled: boolean;
  picked: number | string | null;
  /** A move waiting to be told which piece it makes (a promotion): the chooser is drawn on its cell. */
  asking: Asking | null;
  onChoose: (kind: string) => void;
  onCancel: () => void;
  /** A tap (or Enter) on a cell. */
  onCell: (cell: number) => void;
  /** A piece pressed to drag it: pick it up, so the places it can go show. */
  onPick: (cell: number) => void;
  /** A piece dragged to one of the places it can go. */
  onMove: (from: number, to: number) => void;
}

/** A piece being dragged: where the press began, and whether it has moved far enough to be a drag and not a tap. */
interface Drag {
  cell: number;
  x: number;
  y: number;
  piece: HTMLElement | null;
  moved: boolean;
  /** The press picked the piece up, so the click that ends it mustn't put it down again. */
  pickedUp: boolean;
}

function Grid({ grid, view, names, mine, side, titled, picked, asking, onChoose, onCancel, onCell, onPick, onMove }: GridProps) {
  const me = view.me;
  const el = useRef<HTMLDivElement>(null);
  // Turned half round for a seat that plays from the far side: the cells are drawn last to first,
  // so the tab order, the arrow keys and the edges all follow what is on the screen.
  const flip = !!grid.flip;
  const size = grid.rows * grid.cols;
  // "rows" turns the board over (the last row at the top) without swapping left and right.
  const shown = (cell: number) => (grid.flip === "rows" ? (grid.rows - 1 - rowOf(grid.cols, cell)) * grid.cols + colOf(grid.cols, cell) : flip ? size - 1 - cell : cell);
  // One cell is in the tab order; the arrow keys move from it.
  const [focus, setFocus] = useState(flip ? size - 1 : 0);
  const marks = useMemo(() => {
    const at = new Map<number, string[]>();
    for (const m of grid.marks ?? []) at.set(m.cell, [...(at.get(m.cell) ?? []), m.mark]);
    return at;
  }, [grid.marks]);
  /** Cells counted as a side's own (territory), and whose. */
  const claims = useMemo(() => new Map((grid.marks ?? []).flatMap((m) => (m.mark === "claimed" && m.owner !== undefined ? [[m.cell, m.owner] as const] : []))), [grid.marks]);
  const seatTone = (seat: number) => toneOf(view.players[seat]?.piece ?? { owner: seat, kind: "", glyph: "", label: "" });
  const sources = grid.select?.sources ?? [];
  // Where the piece in hand can go; not pointed out at a table that has asked for that.
  const quiet = !!grid.select?.quiet;
  const targets = new Set(picked === null || quiet ? [] : (sources.find((s) => s.from === picked)?.to ?? []));
  const tapCols = grid.tap?.by === "col" ? new Set(grid.tap.cells.map((c) => colOf(grid.cols, c))) : null;
  // A picked-up piece that covers several cells is lit along its whole length.
  const pickedSpan = typeof picked === "number" ? grid.cells[picked]?.span : undefined;
  const isPicked = (cell: number) => picked === cell || (pickedSpan !== undefined && grid.cells[cell]?.span === pickedSpan);
  /** The cells of one long piece are joined: which of this cell's sides run on into the same piece. */
  const joins = (cell: number): string[] => {
    const span = grid.cells[cell]?.span;
    if (span === undefined) return [];
    const r = rowOf(grid.cols, cell);
    const c = colOf(grid.cols, cell);
    const same = (rr: number, cc: number) => rr >= 0 && rr < grid.rows && cc >= 0 && cc < grid.cols && grid.cells[rr * grid.cols + cc]?.span === span;
    return ["spanned", same(r - 1, c) ? "join-n" : "", same(r, c + 1) ? "join-e" : "", same(r + 1, c) ? "join-s" : "", same(r, c - 1) ? "join-w" : ""];
  };
  const canTap = (cell: number) => targets.has(cell) || (quiet && picked !== null) || !!sourceAt(grid, cell) || (tapCols ? tapCols.has(colOf(grid.cols, cell)) : !!grid.tap?.cells.includes(cell));

  // A stone shown where it would go, before it is put down (see the top of this file). It is
  // forgotten when the board moves on.
  const [ghost, setGhost] = useState<number | null>(null);
  const stonesDown = grid.cells.reduce((n, p) => n + (p ? 1 : 0), 0);
  useEffect(() => setGhost(null), [view.phase, view.turn, stonesDown, grid.tap?.type]);
  /** What the last press on the board was made with: a finger needs more care than a mouse. */
  const pointer = useRef("mouse");
  function careful(): boolean {
    const mode = placingSetting();
    if (mode !== "auto") return mode === "confirm";
    const pitch = el.current ? el.current.clientWidth / grid.cols : Infinity;
    return pointer.current !== "mouse" && pitch < 30;
  }
  /** A tap or Enter on a cell. Putting something on an empty crossing may take two. */
  function press(cell: number) {
    if (!grid.points || !grid.tap || grid.tap.by === "col" || grid.cells[cell] || !mine || !careful()) return onCell(cell);
    if (ghost === cell || !canTap(cell)) {
      // The second tap plays it. (Somewhere a stone can't go is sent as well: the table says why not.)
      setGhost(null);
      return onCell(cell);
    }
    setGhost(cell);
  }
  /** Move the stone one crossing over, as the board is drawn. */
  function nudge(dr: number, dc: number) {
    if (ghost === null) return;
    const at = shown(ghost);
    const r = rowOf(grid.cols, at) + dr;
    const c = colOf(grid.cols, at) + dc;
    if (r < 0 || r >= grid.rows || c < 0 || c >= grid.cols) return;
    setGhost(shown(r * grid.cols + c));
  }
  const ghostAt = ghost === null ? null : shown(ghost);
  // A drop game: the column under the pointer is lit, and the cell its piece would land in is marked.
  const [overCol, setOverCol] = useState<number | null>(null);
  const blocks = grid.blocks;
  const blockH = blocks ? grid.rows / blocks.rows : 0;
  const blockW = blocks ? grid.cols / blocks.cols : 0;
  /** A block someone has taken is drawn in the colour they play in. */
  const blockTone = (owner: number) => toneOf(view.players[owner]?.piece ?? { owner, kind: "", glyph: "", label: "" });
  const blockOf = (cell: number) => (blocks ? Math.floor(rowOf(grid.cols, cell) / blockH) * blocks.cols + Math.floor(colOf(grid.cols, cell) / blockW) : -1);

  function onKey(e: React.KeyboardEvent) {
    const step = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    // Worked out where the cells are on the screen, then turned back into a cell.
    const at = shown(focus);
    const r = rowOf(grid.cols, at);
    const c = colOf(grid.cols, at);
    let next: number | null = null;
    if (step) next = Math.min(grid.rows - 1, Math.max(0, r + step[0]!)) * grid.cols + Math.min(grid.cols - 1, Math.max(0, c + step[1]!));
    else if (e.key === "Home") next = r * grid.cols;
    else if (e.key === "End") next = r * grid.cols + grid.cols - 1;
    if (next === null) return;
    e.preventDefault();
    next = shown(next);
    setFocus(next);
    el.current?.querySelector<HTMLElement>(`[data-cell="${next}"]`)?.focus();
  }

  // Dragging a piece to where it goes. A press on a piece that can move picks it up (so the places
  // it can go light up) and the piece follows the pointer; letting go over one of those places
  // plays the move, and anywhere else leaves it picked up to be tapped instead. A press that never
  // moves is a tap, and the click that follows is handled as one.
  const drag = useRef<Drag | null>(null);
  const skipClick = useRef<{ cell: number; until: number } | null>(null);
  const dropped = useRef<{ piece: HTMLElement; id: string | undefined; timer: ReturnType<typeof setTimeout> } | null>(null);
  /** Put a piece that was dropped back as it was, if it is still there (the move was refused). */
  function settle() {
    const d = dropped.current;
    if (!d) return;
    clearTimeout(d.timer);
    dropped.current = null;
    d.piece.style.translate = "";
    d.piece.style.transition = "";
    if (d.id !== undefined) d.piece.dataset.flip = d.id;
    d.piece.closest(".cell")?.classList.remove("dragging");
  }
  useLayoutEffect(() => () => settle(), []);
  function onDown(e: React.PointerEvent<HTMLButtonElement>, cell: number) {
    if (e.button !== 0 || !sources.some((s) => s.from === cell)) return;
    settle();
    const pickedUp = picked !== cell;
    drag.current = { cell, x: e.clientX, y: e.clientY, piece: e.currentTarget.querySelector<HTMLElement>(".piece"), moved: false, pickedUp };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (pickedUp) onPick(cell);
  }
  function onDrag(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d?.piece) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    d.moved = true;
    e.currentTarget.classList.add("dragging");
    d.piece.style.translate = `${dx}px ${dy}px`;
  }
  function onUp(e: React.PointerEvent<HTMLButtonElement>, cancelled = false) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const cellEl = e.currentTarget;
    const back = () => {
      if (d.piece) d.piece.style.translate = "";
      cellEl.classList.remove("dragging");
    };
    if (cancelled) return back();
    // The click that follows this press: after a drag it isn't a tap at all, and after a press
    // that picked the piece up it would put it straight back down.
    if (d.moved || d.pickedUp) skipClick.current = { cell: d.cell, until: performance.now() + 120 };
    if (!d.moved) return;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-cell]");
    const to = over && el.current?.contains(over) ? Number(over.dataset.cell) : null;
    if (to === null || !d.piece || to === d.cell || !(quiet || sources.find((s) => s.from === d.cell)?.to.includes(to))) return back();
    // Leave it where it was dropped, squared up on the cell, until the board answers: the piece
    // that arrives there is a new element, so this one is taken out of the slide animation.
    const a = cellEl.getBoundingClientRect();
    const b = over!.getBoundingClientRect();
    d.piece.style.transition = "translate 90ms ease-out";
    d.piece.style.translate = `${b.left + b.width / 2 - (a.left + a.width / 2)}px ${b.top + b.height / 2 - (a.top + a.height / 2)}px`;
    const id = d.piece.dataset.flip;
    delete d.piece.dataset.flip;
    dropped.current = { piece: d.piece, id, timer: setTimeout(settle, 1500) };
    onMove(d.cell, to);
  }

  function shadeOf(cell: number): string {
    if (grid.shade === "checker") return (rowOf(grid.cols, cell) + colOf(grid.cols, cell)) % 2 === 0 ? "light" : "dark";
    return grid.shade?.[cell] ?? "plain";
  }

  function label(cell: number): string {
    const piece = grid.cells[cell];
    const whose = !piece || piece.owner === null ? "" : piece.owner === me ? ", yours" : `, ${names[piece.owner] ?? `Seat ${piece.owner + 1}`}'s`;
    const block = blocks?.states[blockOf(cell)]?.label;
    const claimed = claims.get(cell);
    const notes = [
      ...(marks.get(cell) ?? []).flatMap((m) => (m === "claimed" ? [] : [MARK_WORDS[m] ?? m])),
      ...(claimed === undefined ? [] : [claimed === me ? "your territory" : `${names[claimed] ?? `Seat ${claimed + 1}`}'s territory`]),
      ...(ghost === cell ? ["your stone is ready here: press again to play it"] : []),
      ...(block ? [`board ${block}`] : []),
      ...(isPicked(cell) ? ["picked up"] : sourceAt(grid, cell) ? ["can move"] : []),
      ...(targets.has(cell) ? ["can go here"] : []),
    ];
    return `${cellName(grid, cell)}: ${piece ? `${piece.label}${whose}` : "empty"}${notes.length ? `, ${notes.join(", ")}` : ""}`;
  }

  const style = { "--cols": grid.cols, "--rows": grid.rows } as React.CSSProperties;
  return (
    <div className={`board-wrap${side ? " side" : ""}${grid.coords ? " with-coords" : ""}`} style={style}>
      {titled && <h3 className="board-title">{named(grid.label, names)}</h3>}
      {grid.coords && (
        <div className="coords cols" aria-hidden>
          {(flip ? [...grid.coords.cols].reverse() : grid.coords.cols).map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
      )}
      {grid.coords && (
        <div className="coords rows" aria-hidden>
          {(flip ? [...grid.coords.rows].reverse() : grid.coords.rows).map((r, i) => (
            <span key={i}>{r}</span>
          ))}
        </div>
      )}
      <div
        ref={el}
        className={`board-grid${grid.points ? " points" : ""}${grid.gravity ? " gravity" : ""}${blocks ? " blocked" : ""}${grid.cols > 9 ? " fine-lines" : ""}${grid.points && mine && grid.tap ? ` plays-${toneOf(mine)}` : ""}`}
        role="group"
        aria-label={`${named(grid.label, names)}, ${grid.rows} by ${grid.cols}. Arrow keys move around it.`}
        onKeyDown={onKey}
        onPointerDownCapture={(e) => (pointer.current = e.pointerType || "mouse")}
        onPointerLeave={() => setOverCol(null)}
      >
        {grid.points && (
          // The lines, drawn once for the whole board so every one of them lands on whole pixels,
          // and the marked crossings (a Go board's star points). Everything is in cell widths.
          <svg className="board-lines" viewBox={`0 0 ${grid.cols} ${grid.rows}`} preserveAspectRatio="none" aria-hidden>
            {Array.from({ length: grid.rows }, (_, r) => (
              <line key={`r${r}`} x1={0.5} x2={grid.cols - 0.5} y1={r + 0.5} y2={r + 0.5} />
            ))}
            {Array.from({ length: grid.cols }, (_, c) => (
              <line key={`c${c}`} x1={c + 0.5} x2={c + 0.5} y1={0.5} y2={grid.rows - 0.5} />
            ))}
            {grid.cells.map((_, at) => (shadeOf(shown(at)) === "spot" ? <circle key={at} cx={colOf(grid.cols, at) + 0.5} cy={rowOf(grid.cols, at) + 0.5} r={grid.cols > 13 ? 0.14 : 0.1} /> : null))}
          </svg>
        )}
        {grid.cells.map((_, at) => {
          // `at` is the place on the screen, `cell` the cell drawn there.
          const cell = shown(at);
          const piece = grid.cells[cell];
          const r = rowOf(grid.cols, at);
          const c = colOf(grid.cols, at);
          const tappable = canTap(cell);
          const source = sources.some((s) => s.from === cell);
          const state = blocks?.states[blockOf(cell)];
          const cls = [
            "cell",
            `shade-${shadeOf(cell)}`,
            ...(marks.get(cell) ?? []).map((m) => `mark-${m}`),
            claims.has(cell) ? `claim-${seatTone(claims.get(cell)!)}` : "",
            ghost === cell ? "ghosted" : "",
            ghostAt !== null && rowOf(grid.cols, ghostAt) === r ? "aim-row" : "",
            ghostAt !== null && colOf(grid.cols, ghostAt) === c ? "aim-col" : "",
            tappable ? "can" : "",
            source ? "source" : "",
            isPicked(cell) ? "picked" : "",
            ...joins(cell),
            targets.has(cell) ? "target" : "",
            tapCols?.has(c) && overCol === c ? "col-over" : "",
            tapCols && grid.tap!.cells.includes(cell) ? "lands" : "",
            // Heavier lines where one block of cells ends and the next begins.
            blocks && (c + 1) % blockW === 0 && c + 1 < grid.cols ? "edge-r" : "",
            blocks && (r + 1) % blockH === 0 && r + 1 < grid.rows ? "edge-b" : "",
            state?.active ? "in-active" : "",
            state?.closed ? "in-closed" : "",
            r === 0 ? "row-first" : "",
            r === grid.rows - 1 ? "row-last" : "",
            c === 0 ? "col-first" : "",
            c === grid.cols - 1 ? "col-last" : "",
          ];
          return (
            <button
              key={cell}
              type="button"
              className={cls.filter(Boolean).join(" ")}
              data-cell={cell}
              tabIndex={cell === focus ? 0 : -1}
              // Not `disabled`: a cell you can't play in can still be walked to and read out.
              aria-disabled={!tappable}
              aria-pressed={isPicked(cell) ? true : undefined}
              aria-label={label(cell)}
              onFocus={() => setFocus(cell)}
              onPointerDown={(e) => onDown(e, cell)}
              onPointerMove={onDrag}
              onPointerUp={(e) => onUp(e)}
              onPointerCancel={(e) => onUp(e, true)}
              onClick={() => {
                const skip = skipClick.current;
                skipClick.current = null;
                if (skip?.cell === cell && performance.now() < skip.until) return;
                press(cell);
              }}
              onPointerEnter={tapCols ? (e) => e.pointerType === "mouse" && setOverCol(c) : undefined}
              // How far a piece falls to get here, for a board that stands on its edge.
              style={grid.gravity ? ({ "--row": r } as React.CSSProperties) : undefined}
            >
              {/* Keyed by whose it is: a piece that changes sides is drawn afresh, so its animation plays again. */}
              {piece && <Piece key={`${piece.owner}/${piece.tone ?? ""}`} piece={piece} />}
              {ghost === cell && mine && !piece && (
                <span className={`piece ghost tone-${toneOf(mine)} kind-${mine.kind}`} aria-hidden>
                  {mine.glyph}
                </span>
              )}
            </button>
          );
        })}
        {asking && <Chooser asking={asking} at={shown(asking.to)} grid={grid} onChoose={onChoose} onCancel={onCancel} />}
        {blocks && (
          <div className="board-blocks" aria-hidden style={{ "--block-cols": blocks.cols, "--block-rows": blocks.rows } as React.CSSProperties}>
            {(flip ? [...blocks.states].reverse() : blocks.states).map((b, i) => (
              <div key={i} className={`block${b.active ? " active" : ""}${b.closed ? " closed" : ""}${b.owner != null ? ` tone-${blockTone(b.owner)}` : ""}`}>
                {b.glyph}
              </div>
            ))}
          </div>
        )}
      </div>
      {ghost !== null && (
        // The stone is showing: nudge it a crossing at a time, then play it (or tap it again).
        <div className="board-aim" role="group" aria-label="Your stone">
          <span className="aim-arrows">
            <button type="button" aria-label="Move it left" onClick={() => nudge(0, -1)}>
              ←
            </button>
            <button type="button" aria-label="Move it up" onClick={() => nudge(-1, 0)}>
              ↑
            </button>
            <button type="button" aria-label="Move it down" onClick={() => nudge(1, 0)}>
              ↓
            </button>
            <button type="button" aria-label="Move it right" onClick={() => nudge(0, 1)}>
              →
            </button>
          </span>
          <button
            type="button"
            className="primary"
            disabled={!canTap(ghost)}
            onClick={() => {
              setGhost(null);
              onCell(ghost);
            }}
          >
            {canTap(ghost) ? `Play ${cellName(grid, ghost)}` : `Not ${cellName(grid, ghost)}`}
          </button>
          <button type="button" className="secondary" aria-label="Take the stone back" onClick={() => setGhost(null)}>
            ✕
          </button>
          <span className="sr-only" role="status">
            {canTap(ghost) ? `Your stone is ready at ${cellName(grid, ghost)}.` : `You can't play at ${cellName(grid, ghost)}.`}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The chooser for a move that asks a question (which piece a pawn becomes): a short column of
 * pieces on the board, starting on the square the move lands on, the usual choice first and
 * already in focus, so Enter takes it and Escape (or a tap anywhere else) calls the move off.
 */
function Chooser({ asking, at, grid, onChoose, onCancel }: { asking: Asking; at: number; grid: BoardGrid; onChoose: (kind: string) => void; onCancel: () => void }) {
  const r = rowOf(grid.cols, at);
  const c = colOf(grid.cols, at);
  const n = asking.options.length;
  // Down the board from a square in its top half, up from one in its bottom half.
  const down = r + n <= grid.rows;
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <>
      <div className="chooser-shade" onClick={onCancel} />
      <div className={`cell-chooser${down ? "" : " up"}`} role="dialog" aria-label={`${cellName(grid, asking.to)}: choose what it becomes`} style={{ left: `${(c / grid.cols) * 100}%`, top: `${((down ? r : r - n + 1) / grid.rows) * 100}%`, width: `${100 / grid.cols}%`, height: `${(n / grid.rows) * 100}%` }}>
        {asking.options.map((option, i) => (
          <button key={option.kind} ref={i === 0 ? first : undefined} type="button" aria-label={option.label} onClick={() => onChoose(option.kind)}>
            <Piece piece={option} small />
          </button>
        ))}
      </div>
    </>
  );
}
