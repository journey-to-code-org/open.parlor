// Pass the Picture: the drawing game of telephone, made for a whole family round a table, or round
// several tables in several houses. Every screen asks one thing, in big friendly words, with one big
// button to press: write something, draw this, say what that is. Then the chains are turned over
// one step at a time, like pages of a picture book, by whoever started them.
//
// It has a table of its own, rather than the word table's: there is nothing here to spell or tap
// out, and a six-year-old and her great-grandmother should both know at a glance what to do.
import { PASS_IDEAS, type WordChain, type WordStroke, type WordView } from "@journey-to-code/games";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bubble, TableChat, useBubbles } from "../Chat";
import { Confetti } from "../Confetti";
import { loadFeedbackSettings, play, saveFeedbackSettings } from "../feedback/sounds";
import { HowToButton } from "../HowToPlay";
import { named } from "../kit/named";
import { PlayAgain } from "../kit/PlayAgain";
import { SoundButton } from "../SoundButton";
import { TableSettingsButton } from "../TableSettings";
import { Canvas } from "./WordPieces";
import type { WordTableProps } from "./WordTable";

const LEAVES = ["🍁", "🍂", "🦃", "🥧", "🌽"];
const IDEAS = [...PASS_IDEAS.thanksgiving, ...PASS_IDEAS.anything];
const STEP_ICON = { write: "✏️", draw: "🎨", guess: "🤔" } as const;
type Kind = keyof typeof STEP_ICON;
const kindOfStep = (i: number): Kind => (i === 0 ? "write" : i % 2 === 1 ? "draw" : "guess");

/** "Step 2 of 6", from the table's facts. */
function stepOf(info: string[]): { at: number; of: number } | null {
  for (const line of info) {
    const m = /^Step (\d+) of (\d+)$/.exec(line);
    if (m) return { at: Number(m[1]), of: Number(m[2]) };
  }
  return null;
}

/** "Grammi", "Grammi and Pappy", "Grammi, Pappy and Lou". */
const together = (list: string[]) => (list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);

export function PassTable({ view, names, act, onLeave, banner, chat, settings, watching, onHelp, onAgain }: WordTableProps) {
  const me = view.me;
  const nameOf = (seat: number) => (seat === me && !watching ? "You" : (names[seat] ?? `Player ${seat + 1}`));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(() => loadFeedbackSettings().sound);
  const bubbles = useBubbles(chat?.messages ?? []);
  const step = stepOf(view.info);
  const form = watching ? null : (view.form ?? null);
  const drawing = !watching && !!view.canvas?.draw;
  const guessing = !watching && !!view.canvas && !view.canvas.draw && !!form;
  const writing = !!form && form.type === "write";
  const waiting = view.phase === "play" && !form && !drawing;
  const chain = view.chain ?? null;

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
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(t);
  }, [error]);

  // Something new to do (the next step reaching this phone) has a sound, as a turn does.
  const task = writing ? "write" : drawing ? `draw:${view.question}` : guessing ? `guess:${view.canvas?.strokes.length}` : waiting ? "wait" : view.phase;
  const lastTask = useRef(task);
  useEffect(() => {
    if (task !== lastTask.current && (drawing || guessing)) play("yourTurn");
    lastTask.current = task;
  }, [task]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    saveFeedbackSettings({ ...loadFeedbackSettings(), sound: next });
  };

  return (
    <main className={`table kit ptp ptp-${view.phase}`}>
      <div className="ptp-leaves" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} style={{ "--i": i } as React.CSSProperties}>
            {["🍁", "🍂", "🍁"][i % 3]}
          </span>
        ))}
      </div>
      <header className="palace-bar kit-bar ptp-bar">
        <button type="button" className="leave" aria-label="Leave game" onClick={() => (view.over || confirm("Leave this game?")) && onLeave()}>
          ←
        </button>
        <span className="ptp-title">
          <span aria-hidden>📞</span> Pass the Picture
        </span>
        <span className="bar-buttons">
          {onHelp && <HowToButton onClick={onHelp} />}
          {settings && <TableSettingsButton settings={settings.value} onChange={settings.change} cards={false} />}
          <SoundButton on={soundOn} toggle={toggleSound} inline />
        </span>
      </header>
      {banner}

      <div className="ptp-body">
        {step && view.phase === "play" && <Trail at={step.at} of={step.of} />}
        <Seats view={view} names={names} nameOf={nameOf} />

        {view.phase === "play" && writing && <Write key={`write-${step?.at}`} onSend={(text) => send({ type: "write", text })} busy={busy} />}
        {view.phase === "play" && drawing && <Draw key={`draw-${step?.at}`} view={view} busy={busy} send={send} />}
        {view.phase === "play" && guessing && <Guess key={`guess-${step?.at}`} strokes={view.canvas!.strokes} busy={busy} onSend={(text) => send({ type: "guess", text })} />}
        {view.phase === "play" && (waiting || watching) && <Waiting view={view} names={names} me={me} watching={!!watching} />}

        {chain && <Story key={chain.owner} chain={chain} names={names} nameOf={nameOf} me={me} watching={!!watching} view={view} busy={busy} send={send} />}

        {view.over && (
          <section className="ptp-card ptp-end">
            <Confetti count={30} pieces={LEAVES} />
            <p className="ptp-big">🦃 That's every chain!</p>
            <p className="ptp-say">Happy Thanksgiving! Same again, with new words?</p>
            <PlayAgain onAgain={onAgain} onLeave={onLeave} />
          </section>
        )}

        {error && (
          <p className="ptp-error" role="alert">
            {error}
          </p>
        )}
        {view.narration && view.phase !== "play" && !view.over && <p className="ptp-narration">{named(view.narration, names)}</p>}
      </div>

      {chat && <TableChat {...chat} />}
      {[...bubbles.entries()].map(([s, m]) => (
        <Bubble key={`${s}-${m.at}`} message={m} seat={s} />
      ))}
    </main>
  );
}

/** The steps of a chain, as a trail of stepping stones: done, now, still to come. */
function Trail({ at, of }: { at: number; of: number }) {
  const words: Record<Kind, string> = { write: "Write", draw: "Draw", guess: "Guess" };
  return (
    <ol className="ptp-trail" aria-label={`Step ${at} of ${of}`}>
      {Array.from({ length: of }, (_, i) => {
        const kind = kindOfStep(i);
        const state = i + 1 < at ? "done" : i + 1 === at ? "now" : "later";
        return (
          <li key={i} className={`ptp-stone ${state}`} aria-current={state === "now" ? "step" : undefined}>
            <span aria-hidden>{state === "done" ? "✓" : STEP_ICON[kind]}</span>
            <small>{words[kind]}</small>
          </li>
        );
      })}
    </ol>
  );
}

/** Everyone at the table, and who has passed theirs on. */
function Seats({ view, names, nameOf }: { view: WordView; names: string[]; nameOf: (seat: number) => string }) {
  return (
    <ul className="ptp-seats" aria-label="Players">
      {view.players.map((p, i) => (
        <li key={i} className={`${p.done ? "done" : ""}${i === view.me ? " ptp-mine" : ""}`}>
          <span className="ptp-face" style={{ "--hue": (i * 47) % 360 } as React.CSSProperties} aria-hidden>
            {(names[i] ?? "?").slice(0, 1).toUpperCase()}
            {p.done && <b>✓</b>}
          </span>
          <span className="ptp-name">{nameOf(i)}</span>
          {p.line && <small>{p.line}</small>}
        </li>
      ))}
    </ul>
  );
}

/** Step one: something for someone else to draw. */
function Write({ onSend, busy }: { onSend: (text: string) => Promise<boolean>; busy: boolean }) {
  const [text, setText] = useState("");
  const [hint, setHint] = useState(() => IDEAS[Math.floor(Math.random() * IDEAS.length)]!);
  // The example in the empty box changes every few seconds, for anyone stuck for an idea.
  useEffect(() => {
    const t = setInterval(() => setHint(IDEAS[Math.floor(Math.random() * IDEAS.length)]!), 3500);
    return () => clearInterval(t);
  }, []);
  const idea = () => setText(IDEAS[Math.floor(Math.random() * IDEAS.length)]!);
  const ready = text.trim().length > 0 && !busy;
  return (
    <section className="ptp-card ptp-write">
      <p className="ptp-big">
        <span aria-hidden>✏️</span> Write something silly for someone to draw
      </p>
      <textarea className="ptp-input" value={text} maxLength={60} rows={2} placeholder={`like “${hint}”`} aria-label="Something to draw" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), ready && void onSend(text))} />
      <p className="ptp-fine">{text.length ? `${60 - text.length} letters to spare` : "Keep it short. Someone has to draw it!"}</p>
      <div className="ptp-actions">
        <button type="button" className="secondary ptp-idea" onClick={idea}>
          <span aria-hidden>🎲</span> Give me an idea
        </button>
        <button type="button" className="primary ptp-go" disabled={!ready} onClick={() => void onSend(text)}>
          Pass it on <span aria-hidden>➜</span>
        </button>
      </div>
    </section>
  );
}

/** A drawing step: what to draw, big, over the page and the pens. */
function Draw({ view, busy, send }: { view: WordView; busy: boolean; send: (move: Record<string, unknown>) => Promise<boolean> }) {
  const what = /“(.*)”/.exec(view.question ?? "")?.[1] ?? view.question ?? "";
  const drawn = view.canvas!.strokes.length;
  return (
    <section className="ptp-card ptp-draw">
      <p className="ptp-label">
        <span aria-hidden>🎨</span> Draw this:
      </p>
      <p className="ptp-prompt">“{what}”</p>
      <Canvas canvas={view.canvas!} onStroke={(stroke: WordStroke) => send({ type: "stroke", stroke })} />
      <p className="ptp-fine">No letters or numbers! Just draw it. 😉</p>
      <div className="ptp-actions">
        <button type="button" className="secondary" disabled={!drawn || busy} onClick={() => void send({ type: "undo" })}>
          <span aria-hidden>↶</span> Undo
        </button>
        <button type="button" className="secondary" disabled={!drawn || busy} onClick={() => confirm("Rub out the whole drawing?") && void send({ type: "clear" })}>
          Start over
        </button>
        <button type="button" className="primary ptp-go" disabled={!drawn || busy} onClick={() => void send({ type: "done" })}>
          Pass it on <span aria-hidden>➜</span>
        </button>
      </div>
    </section>
  );
}

/** A guessing step: the drawing someone made, and a box to say what it is. */
function Guess({ strokes, busy, onSend }: { strokes: WordStroke[]; busy: boolean; onSend: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const ready = text.trim().length > 0 && !busy;
  return (
    <section className="ptp-card ptp-guess">
      <p className="ptp-big">
        <span aria-hidden>🤔</span> What's this a picture of?
      </p>
      <Picture strokes={strokes} label="The drawing you were passed" />
      <textarea className="ptp-input" value={text} maxLength={60} rows={2} placeholder="It's…" aria-label="What it is" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), ready && void onSend(text))} />
      <p className="ptp-fine">Your best guess. Wrong is funnier!</p>
      <div className="ptp-actions">
        <button type="button" className="primary ptp-go" disabled={!ready} onClick={() => void onSend(text)}>
          Pass it on <span aria-hidden>➜</span>
        </button>
      </div>
    </section>
  );
}

/** A drawing to look at: no pens. */
function Picture({ strokes, label }: { strokes: WordStroke[]; label: string }) {
  const canvas = useMemo(() => ({ strokes, draw: null }), [strokes]);
  return (
    <div className="ptp-picture" aria-label={label}>
      <Canvas canvas={canvas} onStroke={() => Promise.resolve(false)} />
    </div>
  );
}

/** Handed in: who it's waiting for, and a page to doodle on meanwhile that goes nowhere. */
function Waiting({ view, names, me, watching }: { view: WordView; names: string[]; me: number; watching: boolean }) {
  const left = view.players.flatMap((p, i) => (p.done || (i === me && !watching) ? [] : [names[i] ?? `Player ${i + 1}`]));
  const [doodle, setDoodle] = useState<WordStroke[]>([]);
  const pad = useMemo(() => ({ strokes: doodle, draw: { type: "doodle", prompt: "Doodle while you wait" } }), [doodle]);
  return (
    <section className="ptp-card ptp-wait">
      <p className="ptp-big">{watching ? "👀 Everyone's busy" : <>📨 Passed it on!</>}</p>
      <p className="ptp-say">
        {left.length ? (
          <>
            Waiting for <strong>{together(left)}</strong>
            <span className="ptp-dots" aria-hidden>
              <i>.</i>
              <i>.</i>
              <i>.</i>
            </span>
          </>
        ) : (
          "Passing everything on…"
        )}
      </p>
      {!watching && (
        <details className="ptp-doodle">
          <summary>🖍️ Doodle while you wait (nobody else sees it)</summary>
          <Canvas canvas={pad} onStroke={(s: WordStroke) => (setDoodle((d) => [...d, s]), Promise.resolve(true))} />
          {doodle.length > 0 && (
            <button type="button" className="link" onClick={() => setDoodle([])}>
              Clear the doodle
            </button>
          )}
        </details>
      )}
    </section>
  );
}

/** A chain, turned over a page at a time: words and drawings in turn, the newest sliding in. */
function Story({ chain, names, nameOf, me, watching, view, busy, send }: { chain: WordChain; names: string[]; nameOf: (seat: number) => string; me: number; watching: boolean; view: WordView; busy: boolean; send: (move: Record<string, unknown>) => Promise<boolean> }) {
  const owner = chain.owner === me && !watching ? "Your" : `${names[chain.owner] ?? "Someone"}'s`;
  const done = chain.steps.length >= chain.length;
  const first = chain.steps[0]?.text ?? "";
  const last = [...chain.steps].reverse().find((s) => s.text !== undefined)?.text ?? "";
  const button = view.choices?.options[0];
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [chain.steps.length]);
  useEffect(() => {
    if (chain.steps.length > 1) play(done ? "won" : "card");
  }, [chain.steps.length]);
  return (
    <section className="ptp-card ptp-story" aria-label={`${owner} chain`}>
      <p className="ptp-label">
        Chain {chain.index} of {chain.of}
      </p>
      <p className="ptp-big">
        <span aria-hidden>📖</span> {owner} chain
      </p>
      <ol className="ptp-steps">
        {chain.steps.map((s, i) => (
          <li key={i} ref={i === chain.steps.length - 1 ? end : undefined} className={`ptp-step ${s.text !== undefined ? "words" : "drawing"}`}>
            <span className="ptp-who">
              {nameOf(s.by)} {i === 0 ? "wrote" : s.text !== undefined ? "thought it was" : "drew"}
            </span>
            {s.text !== undefined ? <p className="ptp-bubble">“{s.text}”</p> : <Picture strokes={s.strokes ?? []} label={`${nameOf(s.by)}'s drawing`} />}
          </li>
        ))}
        {!done && (
          <li className="ptp-step later" aria-label={`${chain.length - chain.steps.length} more to come`}>
            <span className="ptp-later">
              {Array.from({ length: chain.length - chain.steps.length }, (_, i) => (
                <i key={i}>?</i>
              ))}
            </span>
          </li>
        )}
      </ol>
      {done && chain.steps.length > 1 && (
        <>
          <Confetti count={22} pieces={LEAVES} />
          <p className="ptp-arc">
            From <strong>“{first}”</strong> to <strong>“{last}”</strong>!
          </p>
        </>
      )}
      {view.over ? null : !watching && button ? (
        <button type="button" className="primary ptp-go ptp-show" disabled={busy} onClick={() => void send(button.move)}>
          {named(button.label, names)} <span aria-hidden>{done ? "➜" : "▶"}</span>
        </button>
      ) : (
        <p className="ptp-say">
          {chain.owner === me && !watching ? "" : `${names[chain.owner] ?? "They"} turns the pages`}
          <span className="ptp-dots" aria-hidden>
            <i>.</i>
            <i>.</i>
            <i>.</i>
          </span>
        </p>
      )}
    </section>
  );
}
