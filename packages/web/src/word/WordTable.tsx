// The table for a word game (Secret Word, Anagrams, Hangman): whatever a `WordView` says is on it,
// drawn the one way, the way BoardTable draws every board game.
//
// - Rows of letter tiles (`boards`): your guesses, the word being uncovered. The row you are typing
//   into shows what you have typed so far.
// - A `rack` of letters, tapped to spell a word from them.
// - A keyboard, coloured by what is known of each letter (`keys`). It types a word when the view
//   has an `entry`, and names a letter when it has a `pick`. A real keyboard does the same.
// - How the others' guesses went (`players[].marks`): coloured squares, never their letters.
// - The words that have been played, the result of a round, and the end of the game.
//
// Three games' moves aren't typed (word/WordPieces.tsx): a word traced on a square of letters
// (Word Hunt), tiles put on a board from your hand (Criss-Crosswords), and a drawing (Draw & Guess).
//
// A typed word can't be checked here (that needs the word list, which is the engine's): anything of
// the right shape is sent, and a refusal comes back in words.
import { useOverSound } from "../feedback/useKitSounds";
import { PlayAgain } from "../kit/PlayAgain";
import { HowToButton } from "../HowToPlay";
import { kitGame, type Choice, type PlacedTile, type WordBoard, type WordStroke, type WordTile, type WordTone, type WordView } from "@journey-to-code/games";
import { type TableSettings } from "@journey-to-code/rules";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bubble, TableChat, useBubbles, type ChatProps } from "../Chat";
import { Confetti } from "../Confetti";
import { loadFeedbackSettings, play, saveFeedbackSettings } from "../feedback/sounds";
import { named } from "../kit/named";
import { ResultTable, sideName } from "../kit/result";
import { RoomPanel } from "../room/RoomPanel";
import { SoundButton } from "../SoundButton";
import { TableSettingsButton } from "../TableSettings";
import { Canvas, PlaceBoard, TraceGrid, type TraceFlash } from "./WordPieces";

export { PassTable } from "./PassTable";

export interface WordTableProps {
  /** The same game again at once (a practice table): without it, "Play again" goes back to the game's page. */
  onAgain?: () => void;
  /** Open how to play (HowToPlay.tsx): the "?" in the top bar. */
  onHelp?: () => void;
  view: WordView;
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
}

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const TONE_WORDS: Record<WordTone, string> = { hit: "in the right place", near: "in the word, somewhere else", miss: "not in the word" };

/** "3 misses left" from the table's facts: how a gallows knows how far along it is. */
const missesLeft = (info: string[]) => {
  for (const line of info) {
    const found = /^(\d+) miss/.exec(line);
    if (found) return Number(found[1]);
  }
  return null;
};

export function WordTable({ view, names, act, onLeave, banner, chat, settings, watching, together, onHelp, onAgain}: WordTableProps) {
  const game = kitGame(view.game)!;
  const me = view.me;
  useOverSound(view.over, me, watching || together);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Choice | null>(null);
  /** The rack in the order this player likes it: shuffled here, never sent. */
  const [order, setOrder] = useState<number[] | null>(null);
  /** A word being traced on the square: the tiles, in order. */
  const [path, setPath] = useState<number[]>([]);
  /** The word just traced and sent, left on the square for a moment in green or red. */
  const [flash, setFlash] = useState<TraceFlash | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFlash = (next: TraceFlash) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(next);
    flashTimer.current = setTimeout(() => setFlash(null), next.kind === "good" ? 650 : 900);
  };
  useEffect(() => () => void (flashTimer.current && clearTimeout(flashTimer.current)), []);
  /** Tiles put on the board this turn, not yet played; and the hand tile chosen to put next. */
  const [pending, setPending] = useState<PlacedTile[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [handOrder, setHandOrder] = useState<number[] | null>(null);
  const [soundOn, setSoundOn] = useState(() => loadFeedbackSettings().sound);
  const bubbles = useBubbles(chat?.messages ?? []);
  const entry = watching ? null : view.entry;
  const pick = watching ? null : view.pick;
  const draw = !!view.over && view.over.winners.length === view.seats && view.seats > 1;
  const won = !!view.over && !draw && view.over.winners.includes(me);

  // A new rack, a new round, a word handed in: what was being typed is gone.
  const rackKey = (view.rack ?? []).join("");
  const entryKey = entry ? `${entry.type}/${entry.prompt}/${entry.min}/${entry.max}` : "";
  useEffect(() => setTyped(""), [entryKey, rackKey, view.phase]);
  useEffect(() => setOrder(null), [rackKey]);
  useEffect(() => setPath([]), [entryKey, view.phase]);
  // A new hand, or the turn moving on: tiles not played go back.
  const handKey = (view.hand ?? []).join("");
  const placing = watching ? null : (view.place ?? null);
  useEffect(() => {
    setPending([]);
    setChosen(null);
  }, [handKey, !!placing]);
  useEffect(() => setHandOrder(null), [handKey]);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(timer);
  }, [error]);

  // The end of the game, and a letter landing or a guess coming right, have a sound.
  const overSeen = useRef(!!view.over);
  useEffect(() => {
    if (view.over && !overSeen.current) play(draw ? "handDone" : won ? "won" : "lost");
    overSeen.current = !!view.over;
  }, [view.over, draw, won]);
  const turnSeen = useRef(view.turn);
  useEffect(() => {
    if (view.turn === me && turnSeen.current !== me && !view.over && !watching && view.seats > 1) play("yourTurn");
    turnSeen.current = view.turn;
  }, [view.turn]);

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

  // The rack as shown, and which of its tiles the typed word has used up (left to right).
  const rack = view.rack ?? [];
  const shownRack = order && order.length === rack.length ? order.map((i) => rack[i]!) : rack;
  const used = useMemo(() => {
    const taken = new Set<number>();
    for (const letter of typed) {
      const at = shownRack.findIndex((l, i) => l === letter && !taken.has(i));
      if (at >= 0) taken.add(at);
    }
    return taken;
  }, [typed, shownRack]);
  const pool = entry?.pool ?? null;

  const add = (letter: string) => {
    if (!entry) return;
    if (typed.length >= entry.max) return;
    if (pool) {
      // A letter not on the rack, or used up, can't be typed.
      const left = [...pool];
      for (const l of typed) left.splice(left.indexOf(l), 1);
      if (!left.includes(letter)) return;
    }
    setTyped(typed + letter);
    setError(null);
  };
  const back = () => setTyped((t) => t.slice(0, -1));
  const submit = async () => {
    if (!entry) return;
    if (typed.length < entry.min) {
      setError(entry.min === entry.max ? `The word has ${entry.min} letters.` : `At least ${entry.min} letters.`);
      play("nope");
      return;
    }
    if (await send({ type: entry.type, word: typed })) setTyped("");
  };
  const name = (letter: string) => {
    if (!pick || !pick.letters.includes(letter)) return;
    void send({ type: pick.type, letter });
  };

  // Tracing a word on the square: the path spells what is typed.
  const traceBoard = view.boards.find((b) => b.trace) ?? null;
  const traceLetters = traceBoard ? traceBoard.rows.flat().map((t) => t.letter) : [];
  const onPath = (next: number[]) => {
    setPath(next);
    setTyped(next.map((i) => traceLetters[i]).join(""));
    setError(null);
  };
  /** What a word of this seat's scored, once the table says so. */
  const foundPoints = (word: string) => view.words.find((w) => w.by === me && w.word === word)?.points;
  const sendPath = async (p: number[]) => {
    if (!entry) return;
    const word = p.map((i) => traceLetters[i]).join("");
    if (word.length < entry.min) {
      onPath([]);
      setError(`At least ${entry.min} letters.`);
      play("nope");
      showFlash({ path: p, kind: "bad", word });
      return;
    }
    const ok = await send({ type: entry.type, word });
    setPath([]);
    setTyped("");
    showFlash({ path: p, kind: ok ? "good" : "bad", word });
    if (ok) play("piece");
  };

  // Putting tiles on the board from your hand.
  const hand = view.hand ?? [];
  const shownHand = handOrder && handOrder.length === hand.length ? handOrder.map((i) => hand[i]!) : hand;
  /** Which of the shown hand's tiles are on the board: matched left to right, as the rack's are. */
  const onBoard = useMemo(() => {
    const taken = new Set<number>();
    for (const t of pending) {
      const at = shownHand.findIndex((l, i) => l === t.letter && !taken.has(i));
      if (at >= 0) taken.add(at);
    }
    return taken;
  }, [pending, shownHand]);
  const onSquare = (row: number, col: number) => {
    const there = pending.findIndex((t) => t.row === row && t.col === col);
    if (there >= 0) {
      setPending(pending.filter((_, i) => i !== there));
      return;
    }
    if (chosen === null || onBoard.has(chosen)) return;
    setPending([...pending, { row, col, letter: shownHand[chosen]! }]);
    setChosen(null);
    setError(null);
  };
  const playTiles = async () => {
    if (!placing || !pending.length) return;
    if (await send({ type: placing.type, tiles: pending })) {
      setPending([]);
      setChosen(null);
    }
  };
  const sendStroke = (stroke: WordStroke) => send({ type: view.canvas!.draw!.type, stroke });

  // A real keyboard: letters, Backspace and Enter, unless someone is typing in the chat.
  const keys = useRef({ add, back, submit, name });
  keys.current = { add, back, submit, name };
  useEffect(() => {
    if (!entry && !pick) return;
    const press = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const there = e.target as HTMLElement | null;
      if (there && (there.tagName === "INPUT" || there.tagName === "TEXTAREA" || there.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (/^[a-z]$/.test(key)) {
        e.preventDefault();
        if (entry) {
          setPath([]);
          keys.current.add(key);
        }
        else keys.current.name(key);
      } else if (entry && e.key === "Backspace") {
        e.preventDefault();
        keys.current.back();
      } else if (entry && e.key === "Enter") {
        e.preventDefault();
        void keys.current.submit();
      }
    };
    addEventListener("keydown", press);
    return () => removeEventListener("keydown", press);
  }, [!!entry, !!pick]);

  const toggleSound = () => {
    const next = { ...loadFeedbackSettings(), sound: !soundOn };
    saveFeedbackSettings(next);
    setSoundOn(next.sound);
  };
  const others = Array.from({ length: view.seats }, (_, i) => i).filter((i) => i !== me);
  const turnName = view.turn === null ? null : view.turn === me && !together ? "Your turn" : `${names[view.turn] ?? "Someone"}'s turn`;
  const missLeft = missesLeft(view.info);
  const missed = Object.values(view.keys).filter((tone) => tone === "miss").length;
  const gallows = view.game === "hangman" && missLeft !== null ? { shown: missed, of: missed + missLeft } : null;
  // The board you type into: your own (Secret Word's guesses), its first empty row.
  const typingInto = entry && !pool ? view.boards.find((b) => b.owner === me) ?? null : null;

  return (
    <main className={`table kit word word-${view.game}`}>
      <header className="palace-bar kit-bar">
        <button type="button" className="leave" aria-label="Leave game" onClick={() => (view.over || confirm("Leave this game?")) && onLeave()}>
          ←
        </button>
        <div role="group" className="kit-scores" aria-label="Scores">
          {view.scores.map((s, i) => (
            <span key={i} className={`kit-score${s.seats.includes(me) ? " us" : ""}`}>
              <small>{sideName(s.seats, names)}</small>
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
      {view.game === "readtheroom" && <RoomPanel view={view} names={names} watching={!!watching} busy={busy} send={(move) => void send(move)} />}

      <div className="felt word-felt">
        {others.length > 0 && (
          <div role="group" className="word-others" aria-label="The other players">
            {others.map((seat) => (
              <WordSeat key={seat} view={view} seat={seat} name={names[seat] ?? `Player ${seat + 1}`} />
            ))}
          </div>
        )}

        <div className="word-middle">
          {view.info.length > 0 && (
            <p className="word-info">
              {view.info.map((line, i) => (
                <span key={i}>{named(line, names)}</span>
              ))}
            </p>
          )}
          {gallows && <Gallows shown={gallows.shown} of={gallows.of} />}
          {view.canvas && <Canvas canvas={watching ? { ...view.canvas, draw: null } : view.canvas} onStroke={sendStroke} />}
          {view.boards.map((board) =>
            board.trace ? (
              <div key={board.id} className="trace-area">
                {/* The word as it is traced, over the square where a finger doesn't hide it; then whether it counted. */}
                {entry && !flash && !typed && view.words.length > 0 ? (
                  // Between words, the same place shows what has been found: one row, newest first, to slide along.
                  <ul className="word-found" aria-label={`Words found: ${view.words.length}`}>
                    <li className="count">{view.words.length} found</li>
                    {view.words.map((w, i) => (
                      <li key={`${w.word}-${i}`} className={w.by === me ? "mine" : ""}>
                        {w.word}
                        {w.points !== undefined && <strong>+{w.points}</strong>}
                      </li>
                    ))}
                  </ul>
                ) : entry && (
                  <p className={`trace-word${flash ? ` is-${flash.kind}` : typed ? " is-typing" : ""}`} aria-live="polite" aria-label={flash ? `${flash.word}: ${flash.kind === "good" ? "found" : (error ?? "no")}` : typed ? `Your word: ${typed}` : "Your word: nothing yet"}>
                    {flash ? (
                      <>
                        <b>{flash.word}</b>
                        <span>{flash.kind === "good" ? (foundPoints(flash.word) !== undefined ? `+${foundPoints(flash.word)}` : "✓") : (error ?? "No")}</span>
                      </>
                    ) : typed ? (
                      <>
                        <b>{typed}</b>
                        {typed.length < entry.min && <span>{entry.min - typed.length} more</span>}
                      </>
                    ) : (
                      <span>Drag across the letters, or tap them in turn</span>
                    )}
                  </p>
                )}
                <TraceGrid board={board} path={path} flash={flash} onPath={onPath} onSend={(p) => void sendPath(p)} disabled={!entry || busy} />
              </div>
            ) : view.place?.board === board.id || (view.hand && board.cols > 9) ? (
              <PlaceBoard key={board.id} board={board} pending={pending} values={view.values ?? {}} canPlace={!!placing && chosen !== null && !busy} onSquare={onSquare} />
            ) : (
              <Board key={board.id} board={board} label={view.boards.length > 1 || board.owner === undefined} typing={typingInto?.id === board.id ? typed : null} />
            ),
          )}
          {/* While hunting, the words found are shown over the square instead, small enough to take in at a glance. */}
          {!(traceBoard && entry) && view.words.length > 0 && (
            <ul className="word-played" aria-label="Words">
              {view.words.map((w, i) => (
                <li key={i} className={w.by === null ? "answer" : w.by === me ? "mine" : ""}>
                  <span className="word-tiles small" aria-label={w.word}>
                    {[...w.word].map((letter, j) => (
                      <span key={j} className={`word-tile${w.by === null ? " word-answer" : " word-said"}`} aria-hidden>
                        {letter}
                      </span>
                    ))}
                  </span>
                  <span className="word-who">
                    {w.by === null ? "" : w.by === me && !together ? "You" : (names[w.by] ?? "")}
                    {w.note ? <small> {named(w.note, names)}</small> : null}
                  </span>
                  {w.points !== undefined && <strong>+{w.points}</strong>}
                </li>
              ))}
            </ul>
          )}
          <p className="word-narration" aria-live="polite">
            {turnName && !view.over && <strong className={view.turn === me ? "mine" : ""}>{turnName}. </strong>}
            {view.narration ? named(view.narration, names) : null}
          </p>
        </div>

        {/* Spelling from a rack: what has been typed, then the rack, its used tiles dimmed. */}
        {view.rack && (
          <div className="word-rack-area">
            {pool && (
              <div role="group" className="word-tiles typed" aria-label={typed ? `Your word: ${typed}` : "Your word: nothing yet"} aria-live="polite">
                {Array.from({ length: Math.max(entry!.max, 1) }, (_, i) => (
                  <span key={i} className={`word-tile${typed[i] ? " filled" : " empty"}`} aria-hidden>
                    {typed[i] ?? ""}
                  </span>
                ))}
              </div>
            )}
            <div className="word-tiles rack" role="group" aria-label="The letters">
              {shownRack.map((letter, i) =>
                pool ? (
                  <button key={i} type="button" className={`word-tile rack-tile${used.has(i) ? " used" : ""}`} disabled={used.has(i) || busy} aria-label={letter.toUpperCase()} onClick={() => add(letter)}>
                    {letter}
                  </button>
                ) : (
                  <span key={i} className="word-tile rack-tile" aria-label={letter.toUpperCase()}>
                    {letter}
                  </span>
                ),
              )}
            </div>
            {pool && (
              <div className="word-actions">
                <button type="button" className="secondary" onClick={() => setOrder(shuffle(rack.length))} aria-label="Shuffle the letters">
                  🔀 Shuffle
                </button>
                <button type="button" className="secondary" disabled={!typed} onClick={back} aria-label="Take back a letter">
                  ⌫
                </button>
                <button type="button" className="secondary" disabled={!typed} onClick={() => setTyped("")}>
                  Clear
                </button>
                <button type="button" className="primary" disabled={busy || typed.length < entry!.min} onClick={() => void submit()}>
                  {entry!.prompt.startsWith("Your") ? "Hand it in" : "Enter"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* What has been traced, and the buttons to send it or start again. */}
        {traceBoard && entry && (
          <div className="word-rack-area">
            <div className="word-actions">
              <button type="button" className="secondary" disabled={!typed} onClick={() => onPath([])}>
                Clear
              </button>
              <button type="button" className="primary" disabled={busy || typed.length < entry.min} onClick={() => void (path.length ? sendPath(path) : submit())}>
                Enter
              </button>
            </div>

          </div>
        )}

        {/* Your own tiles: choose one, then a square. */}
        {view.hand && view.hand.length > 0 && !watching && (
          <div className="word-rack-area">
            <div className="word-tiles rack word-hand" role="group" aria-label={placing ? "Your tiles: choose one, then a square on the board" : "Your tiles"}>
              {shownHand.map((letter, i) => (
                <button
                  key={i}
                  type="button"
                  className={`word-tile rack-tile${onBoard.has(i) ? " used" : ""}${chosen === i ? " chosen" : ""}`}
                  disabled={!placing || onBoard.has(i) || busy}
                  aria-pressed={chosen === i}
                  aria-label={`${letter.toUpperCase()}, worth ${view.values?.[letter] ?? 0}`}
                  onClick={() => setChosen(chosen === i ? null : i)}
                >
                  {letter}
                  {view.values && <small className="tile-value" aria-hidden>{view.values[letter]}</small>}
                </button>
              ))}
            </div>
            <div className="word-actions">
              <button type="button" className="secondary" disabled={!!pending.length} onClick={() => setHandOrder(shuffle(hand.length))} aria-label="Shuffle your tiles">
                🔀
              </button>
              {placing && (
                <>
                  <button type="button" className="secondary" disabled={!pending.length} onClick={() => setPending([])}>
                    Take back
                  </button>
                  <button type="button" className="primary" disabled={busy || !pending.length} onClick={() => void playTiles()}>
                    Play {pending.length ? `${pending.length} ${pending.length === 1 ? "tile" : "tiles"}` : ""}
                  </button>
                </>
              )}
            </div>
            {placing && <p className="word-prompt">{placing.prompt}</p>}
          </div>
        )}

        {/* A keyboard, for typing a word anywhere, or naming one letter. */}
        {((entry && !pool && !traceBoard) || pick) && (
          <div className="word-keyboard" role="group" aria-label={pick ? pick.prompt : entry!.prompt}>
            <p className="word-prompt">{pick ? pick.prompt : entry!.prompt}</p>
            {ROWS.map((row, r) => (
              <div key={r} className="word-key-row">
                {entry && r === 2 && (
                  <button type="button" className="word-key wide" onClick={() => void submit()} disabled={busy}>
                    Enter
                  </button>
                )}
                {[...row].map((letter) => {
                  const tone = view.keys[letter];
                  const open = pick ? pick.letters.includes(letter) : true;
                  return (
                    <button
                      key={letter}
                      type="button"
                      className={`word-key${tone ? ` tone-${tone}` : ""}`}
                      disabled={!open || busy}
                      aria-label={`${letter.toUpperCase()}${tone ? `, ${TONE_WORDS[tone]}` : ""}`}
                      onClick={() => (entry ? add(letter) : name(letter))}
                    >
                      {letter}
                    </button>
                  );
                })}
                {entry && r === 2 && (
                  <button type="button" className="word-key wide" onClick={back} aria-label="Delete a letter">
                    ⌫
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Buttons that aren't moving on to the next round: "No word". */}
        {!watching && view.choices && !view.result && (
          <div className="word-choices">
            {view.choices.options.map((o, i) => (
              <button key={i} type="button" className={o.primary ? "primary" : "secondary"} disabled={busy} onClick={() => (o.confirm ? setConfirming(o) : void send(o.move))}>
                {named(o.label, names)}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p className="error word-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <section className="me" data-seat={me}>
        {chat && <TableChat {...chat} />}
        <div className="me-badge">
          <WordSeat view={view} seat={me} name={names[me] ?? "You"} row />
        </div>
      </section>

      <div className="bubble-layer" aria-live="polite">
        {[...bubbles.entries()].map(([s, m]) => (
          <Bubble key={`${s}-${m.at}`} message={m} seat={s} />
        ))}
      </div>

      {confirming && (
        <div className="sheet">
          <p>{named(confirming.confirm ?? "", names)}</p>
          <button
            type="button"
            className="primary"
            onClick={() => {
              const move = confirming.move;
              setConfirming(null);
              void send(move);
            }}
          >
            {named(confirming.label, names)}
          </button>
          <button type="button" className="secondary" onClick={() => setConfirming(null)}>
            Keep thinking
          </button>
        </div>
      )}

      {view.result && !view.over && (
        <div className="sheet">
          <ResultTable result={view.result} names={names} me={me} />
          {!watching && view.choices ? (
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
      {view.over && (
        <div className="sheet won-sheet">
          <h2>{won && view.seats > 1 && !together ? "You won! 🏆" : named(view.over.title, names)}</h2>
          {won && view.seats > 1 && !together && <p className="won-line">{named(view.over.title, names)}</p>}
          {/* The one answer of a game that had one (Secret Word, Hangman, the last drawing): not Word Hunt's words nobody found. */}
          {view.words.some((w) => w.by === null && (w.note === "The word" || w.note === "It was")) && (
            <p className="won-line">
              The word was <strong>{view.words.find((w) => w.by === null && (w.note === "The word" || w.note === "It was"))!.word.toUpperCase()}</strong>.
            </p>
          )}
          {view.result && <ResultTable result={view.result} names={names} me={me} untitled />}
          <PlayAgain onAgain={onAgain} onLeave={onLeave} />
        </div>
      )}
      <h1 className="sr-only">{game.name}</h1>
    </main>
  );
}

/** A board of tile rows. The row being typed into shows the letters typed so far. */
function Board({ board, label, typing }: { board: WordBoard; label: boolean; typing: string | null }) {
  const firstEmpty = typing === null ? -1 : board.rows.findIndex((row) => row.every((t) => !t.letter && !t.hidden));
  return (
    <section className={`word-board cols-${board.cols}`} aria-label={board.label} style={{ "--cols": board.cols } as React.CSSProperties}>
      {label && <h3 className="word-board-label">{board.label}</h3>}
      {board.rows.map((row, r) => {
        const live = r === firstEmpty;
        return (
          <div role="group" key={r} className={`word-tiles row${live ? " typing" : ""}`} aria-label={live ? `Typing: ${typing || "nothing yet"}` : describeRow(row)}>
            {row.map((tile, i) => {
              const letter = live ? (typing![i] ?? "") : tile.letter;
              return (
                <span key={i} className={`word-tile${tile.tone && !live ? ` tone-${tile.tone}` : ""}${tile.hidden ? " hidden" : ""}${letter ? " filled" : " empty"}`} style={{ "--i": i } as React.CSSProperties} aria-hidden>
                  {letter}
                </span>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

const describeRow = (row: WordTile[]) => {
  if (row.every((t) => !t.letter && !t.hidden)) return "Empty";
  return row.map((t) => (t.hidden ? "hidden letter" : t.letter ? `${t.letter.toUpperCase()}${t.tone ? `, ${TONE_WORDS[t.tone]}` : ""}` : "blank")).join("; ");
};

/** A player: their name, their line, and how their guesses went as coloured squares. */
function WordSeat({ view, seat, name, row }: { view: WordView; seat: number; name: string; row?: boolean }) {
  const p = view.players[seat]!;
  const active = view.turn === seat && !view.over;
  return (
    <div className={`kit-seat word-seat${active ? " active" : ""}${p.done ? " done" : ""}${row ? " row" : ""}`} aria-current={active ? "true" : undefined}>
      <strong>{name}</strong>
      {p.line && <span>{p.line}</span>}
      {p.badge && <em>{p.badge}</em>}
      {p.marks && p.marks.length > 0 && seat !== view.me && (
        <span className="word-marks" role="img" aria-label={`${p.marks.length} ${p.marks.length === 1 ? "guess" : "guesses"}: ${p.marks.map((m) => `${m.filter((t) => t === "hit").length} in place`).join(", ")}`}>
          {p.marks.map((marks, r) => (
            <span key={r} className="word-mark-row">
              {marks.map((tone, i) => (
                <span key={i} className={`word-mark tone-${tone}`} />
              ))}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/** Hangman's gallows: a part of the figure for each miss, spread over however many there are. */
function Gallows({ shown, of }: { shown: number; of: number }) {
  const PARTS = 6;
  const parts = of > 0 ? Math.round((Math.min(shown, of) / of) * PARTS) : 0;
  return (
    <svg className="gallows" viewBox="0 0 120 120" role="img" aria-label={`${shown} of ${of} misses`}>
      <path className="frame" d="M14 112 H74 M30 112 V10 H84 V24 M30 34 L52 10" />
      {parts > 0 && <circle className="figure" cx="84" cy="34" r="10" />}
      {parts > 1 && <path className="figure" d="M84 44 V74" />}
      {parts > 2 && <path className="figure" d="M84 52 L70 64" />}
      {parts > 3 && <path className="figure" d="M84 52 L98 64" />}
      {parts > 4 && <path className="figure" d="M84 74 L72 94" />}
      {parts > 5 && <path className="figure" d="M84 74 L96 94" />}
    </svg>
  );
}

/** A new order for the rack's tiles: shuffled on this screen alone. */
function shuffle(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}
