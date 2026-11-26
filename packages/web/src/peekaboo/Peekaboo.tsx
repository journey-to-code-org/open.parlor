// Peekaboo: a game for a baby (about one year old) and a grown-up to play together. Tap anywhere and
// a picture pops up and is named; lift the blanket to find what's under it; find the one asked for.
// It can be played in a video call too: one parent with the baby, the other on their own phone,
// seeing the baby, sharing the board and playing peekaboo with their own face.
//
// The grown-ups' controls are behind a button that has to be held (a baby's slap opens nothing).
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ShareQr } from "../ShareQr";
import { stayAwake } from "../wifi/link";
import { apply, emptyBoard, hint, type BoardEvent, type BoardState, type Heard } from "./board";
import { joinLink, PeekabooCall, type CallState } from "./call";
import { CATEGORIES, createBag, familyThings, findRound, inPlay, placeAt, randomFrom, THINGS, type Category, type Mode, type Person, type Settings, type Thing } from "./things";
import { dropRecording, keepRecording, loadFamily, loadSettings, quiet, record, recordedKeys, saveFamily, saveSettings, say, smallPhoto, sounds, tidyFamily } from "./voice";
import "./peekaboo.css";

/** A tap closer than this to the one before is the same slap: babies hit the screen with a whole hand, again and again. */
const TAP_GAP_MS = 650;
const POP_LIFE_MS = 5000;
const PEEK_SHOW_MS = 3500;
const FOUND_SHOW_MS = 2800;
const FACE_HIDE_MS = 1800;
const HOLD_MS = 1500;

type Wire = BoardEvent | { t: "sync"; settings: Settings; family: Person[]; board: BoardState };

const MODES: { id: Mode; name: string; emoji: string; what: string }[] = [
  { id: "tap", name: "Tap", emoji: "👆", what: "Tap anywhere: a picture pops up and is named." },
  { id: "peek", name: "Peekaboo", emoji: "🙈", what: "Something is under the blanket: tap to find it." },
  { id: "find", name: "Where's the…?", emoji: "🔎", what: "Two pictures: tap the one asked for." },
];

/**
 * The game, on either end. `speaks`: this device plays the voice and sounds (the one with the baby).
 * `leads`: this device moves the game on by itself (the next question, the blanket back on); in a
 * call only the baby's device does, so the two never both do.
 */
function useGame({ settings, family, speaks, leads, send }: { settings: Settings; family: Person[]; speaks: boolean; leads: boolean; send: (w: Wire) => void }) {
  const [board, setBoard] = useState<BoardState>(() => emptyBoard(settings.mode));
  const [face, setFace] = useState(false);
  const boardRef = useRef(board);
  boardRef.current = board;
  const all = useMemo(() => new Map([...THINGS, ...familyThings(family)].map((th) => [th.id, th])), [family]);
  const thing = useCallback((id: string) => all.get(id), [all]);
  const playing = useMemo(() => inPlay(settings, family, randomFrom(Date.now())), [settings, family]);
  const bag = useMemo(() => createBag(playing, randomFrom(Date.now() ^ 0x5bd1e995)), [playing]);
  const lastTap = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const hear = useCallback(
    (heard: Heard | null) => {
      if (!heard || !speaks) return;
      if (heard.sound) sounds[heard.sound]();
      void say(heard.text, heard.key);
    },
    [speaks],
  );

  /** Apply an event here; `share` sends it to the other end as well. */
  const run = useCallback(
    (event: BoardEvent, share: boolean) => {
      if (event.t === "face") {
        setFace(true);
        setTimeout(() => {
          setFace(false);
          hear(apply(boardRef.current, event, thing, settingsRef.current).heard);
        }, FACE_HIDE_MS);
      } else {
        const { state, heard } = apply(boardRef.current, event, thing, settingsRef.current);
        boardRef.current = state;
        setBoard(state);
        hear(heard);
      }
      if (share) send(event);
    },
    [thing, hear, send],
  );

  // A new mode starts on an empty board.
  useEffect(() => {
    if (boardRef.current.mode !== settings.mode) {
      const state = emptyBoard(settings.mode);
      boardRef.current = state;
      setBoard(state);
    }
  }, [settings.mode]);

  // Pictures that popped up fade away by themselves (here only: each end fades its own).
  useEffect(() => {
    if (!board.popped.length) return;
    const oldest = board.popped[0]!;
    const timer = setTimeout(() => setBoard((b) => ({ ...b, popped: b.popped.filter((p) => p.key !== oldest.key) })), POP_LIFE_MS);
    return () => clearTimeout(timer);
  }, [board.popped]);

  // The device that leads moves the game along: a new picture under the blanket, the next question.
  useEffect(() => {
    if (!leads || !playing.length) return;
    if (board.mode === "peek" && (!board.hidden || board.hidden.open)) {
      const timer = setTimeout(() => run({ t: "hide", id: bag.next().id }, true), board.hidden ? PEEK_SHOW_MS : 200);
      return () => clearTimeout(timer);
    }
    if (board.mode === "find" && (!board.round || board.round.found) && playing.length >= 2) {
      const timer = setTimeout(() => run({ t: "ask", ...findRound(playing, settings.choices, Math.random, board.round?.target) }, true), board.round ? FOUND_SHOW_MS : 400);
      return () => clearTimeout(timer);
    }
  }, [leads, board.mode, board.hidden, board.round, playing, bag, run, settings.choices]);

  /** A tap on the board (x and y as fractions of it), or on a picture. */
  const tap = useCallback(
    (x: number, y: number, on?: string) => {
      const now = performance.now();
      if (now - lastTap.current < TAP_GAP_MS) return;
      lastTap.current = now;
      const b = boardRef.current;
      if (b.mode === "tap" && playing.length) run({ t: "pop", id: bag.next().id, ...placeAt(x, y), key: Math.floor(Math.random() * 2 ** 31) }, true);
      else if (b.mode === "peek" && b.hidden && !b.hidden.open) run({ t: "peek" }, true);
      else if (b.mode === "find" && b.round && !b.round.found) run(on ? { t: "pick", id: on } : { t: "again" }, true);
    },
    [playing, bag, run],
  );

  return { board, setBoard, boardRef, face, thing, run, tap, playing };
}

/** A video element showing a stream. */
function Video({ stream, muted, mirror, className, label }: { stream: MediaStream | null; muted?: boolean; mirror?: boolean; className?: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => {});
    }
  }, [stream]);
  return <video ref={ref} className={`${className ?? ""}${mirror ? " pk-mirror" : ""}`} autoPlay playsInline muted={muted} aria-label={label} />;
}

function Picture({ thing, className }: { thing: Thing; className?: string }) {
  return (
    <div className={`pk-picture ${className ?? ""}`}>
      {thing.photo ? <img src={thing.photo} alt="" draggable={false} /> : <span className="pk-emoji" aria-hidden="true">{thing.emoji}</span>}
      <span className="pk-word">{thing.word}</span>
    </div>
  );
}

/** The board: what the baby sees and taps. */
function Board({ game, children }: { game: ReturnType<typeof useGame>; children?: React.ReactNode }) {
  const { board, thing, tap } = game;
  const el = useRef<HTMLDivElement>(null);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = el.current!.getBoundingClientRect();
    const on = (e.target as HTMLElement).closest<HTMLElement>("[data-thing]")?.dataset.thing;
    tap((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height, on);
  };
  const target = board.round ? thing(board.round.target) : undefined;
  const hidden = board.hidden ? thing(board.hidden.id) : undefined;
  return (
    <div ref={el} className={`pk-board pk-${board.mode}`} onPointerDown={down} role="application" aria-label="The baby's board: tap anywhere">
      {board.mode === "tap" && !board.popped.length && <p className="pk-invite" aria-hidden="true">👋</p>}
      {board.popped.map((p) => {
        const th = thing(p.id);
        return th ? (
          <div key={p.key} className="pk-pop" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
            <Picture thing={th} />
          </div>
        ) : null;
      })}
      {board.mode === "peek" && hidden && (
        <div className={`pk-peek${board.hidden!.open ? " pk-open" : ""}`}>
          <Picture thing={hidden} />
          <div className="pk-blanket" aria-hidden="true" />
        </div>
      )}
      {board.mode === "find" && board.round && target && (
        <>
          <p className="pk-question">{target.category === "family" ? `Where's ${target.word}?` : `Where's the ${target.word.toLowerCase()}?`}</p>
          <div className="pk-choices">
            {board.round.choices.map((id) => {
              const th = thing(id);
              if (!th) return null;
              const state = board.round!.found ? (id === board.round!.target ? "pk-found" : "pk-faded") : id === board.round!.wrong ? "pk-wiggle" : hint(board) && id === board.round!.target ? "pk-hint" : "";
              return (
                <button key={`${board.round!.target}:${id}`} type="button" data-thing={id} className={`pk-choice ${state}`} aria-label={th.word}>
                  <Picture thing={th} />
                </button>
              );
            })}
          </div>
          {board.round.found && <div className="pk-stars" aria-hidden="true">{"⭐".repeat(7).split("").map((s, i) => <span key={i} style={{ ["--i" as string]: i }}>{s}</span>)}</div>}
        </>
      )}
      {children}
    </div>
  );
}

/** The grown-ups' way in: held for a moment and a half. A baby's slap does nothing. */
function HoldButton({ onOpen }: { onOpen: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    if (timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onOpen();
    }, HOLD_MS);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  return (
    <button
      type="button"
      className={`pk-hold${holding ? " pk-holding" : ""}`}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !e.repeat && start(e)}
      onKeyUp={stop}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Grown-ups: press and hold for the settings"
    >
      <span aria-hidden="true">🔒</span>
      <small>Hold</small>
    </button>
  );
}

function ModePicker({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  return (
    <div className="pk-modes" role="radiogroup" aria-label="What to play">
      {MODES.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={mode === m.id ? "pk-on" : ""} onClick={() => onMode(m.id)} title={m.what}>
          <span aria-hidden="true">{m.emoji}</span> {m.name}
        </button>
      ))}
    </div>
  );
}

/** Record a grown-up's own voice for a picture: a baby knows Mama's voice better than any other. */
function Voices({ things }: { things: Thing[] }) {
  const [have, setHave] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<{ id: string; stop(): Promise<Blob> } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => void recordedKeys().then((keys) => setHave(new Set(keys))), []);
  const begin = async (id: string) => {
    setProblem(null);
    try {
      const r = await record();
      setBusy({ id, stop: r.stop });
    } catch {
      setProblem("Couldn't use the microphone. Allow it for this page, and try again.");
    }
  };
  const end = async () => {
    if (!busy) return;
    const clip = await busy.stop();
    setBusy(null);
    if (clip.size) {
      await keepRecording(busy.id, clip).catch(() => setProblem("Couldn't keep that recording on this device."));
      setHave((h) => new Set(h).add(busy.id));
      void say("", busy.id);
    }
  };
  return (
    <section className="pk-section">
      <h3>Your voices</h3>
      <p className="fine">Record yourself saying each one ("Cow! Moo!"). Your voice is played in place of the computer's. Recordings stay on this device.</p>
      {problem && <p className="fine pk-problem">{problem}</p>}
      <ul className="pk-voices">
        {things.map((th) => (
          <li key={th.id}>
            <span className="pk-voice-name">
              {th.photo ? <img src={th.photo} alt="" /> : <span aria-hidden="true">{th.emoji}</span>} {th.word}
            </span>
            {busy?.id === th.id ? (
              <button type="button" className="pk-recording" onClick={() => void end()}>
                ⏹ Stop
              </button>
            ) : (
              <button type="button" className="secondary" disabled={!!busy} onClick={() => void begin(th.id)}>
                🎙 {have.has(th.id) ? "Again" : "Record"}
              </button>
            )}
            {have.has(th.id) && busy?.id !== th.id && (
              <>
                <button type="button" className="secondary" aria-label={`Play ${th.word}`} onClick={() => void say(th.say, th.id)}>
                  ▶
                </button>
                <button
                  type="button"
                  className="secondary"
                  aria-label={`Remove your recording of ${th.word}`}
                  onClick={() =>
                    void dropRecording(th.id).then(() =>
                      setHave((h) => {
                        const next = new Set(h);
                        next.delete(th.id);
                        return next;
                      }),
                    )
                  }
                >
                  ✕
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Family({ family, onChange }: { family: Person[]; onChange: (f: Person[]) => void }) {
  const set = (i: number, p: Partial<Person>) => onChange(family.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <section className="pk-section">
      <h3>Family</h3>
      <p className="fine">Names and photos of the people he knows. Photos stay on this device (and go to the other phone during a call).</p>
      <ul className="pk-family">
        {family.map((p, i) => (
          <li key={i}>
            <label className="pk-photo">
              {p.photo ? <img src={p.photo} alt={`${p.name}'s photo`} /> : <span aria-hidden="true">{p.emoji}</span>}
              <input type="file" accept="image/*" onChange={async (e) => e.target.files?.[0] && set(i, { photo: await smallPhoto(e.target.files[0]).catch(() => undefined) })} aria-label={`A photo of ${p.name || "this person"}`} />
            </label>
            <input type="text" value={p.name} maxLength={24} placeholder="Name" onChange={(e) => set(i, { name: e.target.value })} aria-label="Name" />
            {p.photo && (
              <button type="button" className="secondary" onClick={() => set(i, { photo: undefined })}>
                No photo
              </button>
            )}
            <button type="button" className="secondary" aria-label={`Remove ${p.name || "this person"}`} onClick={() => onChange(family.filter((_, j) => j !== i))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {family.length < 8 && (
        <button type="button" className="secondary" onClick={() => onChange([...family, { name: "", emoji: "🙂" }])}>
          + Someone else
        </button>
      )}
    </section>
  );
}

const STATE_WORDS: Record<CallState, string> = {
  waiting: "Waiting for them to open the link…",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  ended: "The call has ended.",
};

/** The device with the baby (or the only device, with no call). */
function WithBaby({ onLeave }: { onLeave: () => void }) {
  const [settings, setSettings] = useState(loadSettings);
  const [family, setFamily] = useState(loadFamily);
  const [started, setStarted] = useState(false);
  const [panel, setPanel] = useState(false);
  const [call, setCall] = useState<PeekabooCall<Wire> | null>(null);
  const [callState, setCallState] = useState<CallState | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [callProblem, setCallProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const callRef = useRef(call);
  callRef.current = call;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const familyRef = useRef(family);
  familyRef.current = family;
  const send = useCallback((w: Wire) => callRef.current?.send(w), []);
  const game = useGame({ settings, family, speaks: true, leads: true, send });

  const changeSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
    send({ t: "settings", settings: next });
  };
  const changeFamily = (next: Person[]) => {
    setFamily(next);
    saveFamily(next);
    send({ t: "family", family: next });
  };

  // What the other parent does arrives here.
  useEffect(() => {
    if (!call) return;
    const offs = [
      call.on("state", setCallState),
      call.on("remote", setRemote),
      // The other phone starts from what this one has: the settings, the family and the board.
      call.on("open", () => call.send({ t: "sync", settings: settingsRef.current, family: familyRef.current, board: game.boardRef.current })),
      call.on("message", (w) => {
        if (w.t === "sync" || w.t === "family") return; // the family and the board are this device's to say
        if (w.t === "settings") {
          const next = { ...settingsRef.current, ...w.settings };
          setSettings(next);
          saveSettings(next);
          return;
        }
        game.run(w, false);
      }),
    ];
    setCallState(call.state);
    return () => offs.forEach((off) => off());
  }, [call, game.run, game.boardRef]);
  useEffect(() => (started ? stayAwake() : undefined), [started]);
  useEffect(() => () => void callRef.current?.hangUp(), []);

  const start = () => {
    // A grown-up's tap: the one that lets the page make sounds and go full screen.
    sounds.pop();
    void say("Hi!");
    void document.documentElement.requestFullscreen?.().catch(() => {});
    setStarted(true);
    setPanel(false);
  };
  const leave = () => {
    quiet();
    void call?.hangUp();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    onLeave();
  };
  const startCall = async () => {
    setCallProblem(null);
    try {
      const c = await PeekabooCall.start<Wire>();
      setCall(c);
      if (c.note) setCallProblem(c.note);
    } catch (e) {
      setCallProblem((e as Error).message);
    }
  };
  const hangUp = () => {
    void call?.hangUp();
    setCall(null);
    setCallState(null);
    setRemote(null);
  };
  const link = call ? joinLink(call.code) : "";
  const shareLink = async () => {
    if (typeof navigator.share === "function") return void navigator.share({ title: "Peekaboo", text: "Come play Peekaboo with us", url: link }).catch(() => {});
    await navigator.clipboard?.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const toggle = (c: Category) => {
    const has = settings.categories.includes(c);
    const categories = has ? settings.categories.filter((x) => x !== c) : [...settings.categories, c];
    if (categories.length) changeSettings({ ...settings, categories });
  };

  const live = call && callState !== "ended";
  return (
    <main className="pk-root" onContextMenu={(e) => e.preventDefault()}>
      <Board game={game}>
        {live && (
          <div className={`pk-face${game.face ? " pk-face-hidden" : ""}`} aria-hidden={!remote}>
            {remote ? <Video stream={remote} label="The other parent, on the call" className="pk-face-video" /> : <span className="pk-face-wait">📞</span>}
            <div className="pk-blanket" aria-hidden="true" />
          </div>
        )}
      </Board>
      {started && !panel && <HoldButton onOpen={() => setPanel(true)} />}

      {(!started || panel) && (
        <div className="pk-panel" role="dialog" aria-modal="true" aria-labelledby="pk-title">
          <div className="pk-panel-inner">
            <h2 id="pk-title">
              <span aria-hidden="true">🙈</span> Peekaboo
            </h2>
            <p className="fine">For a baby and a grown-up, together. Say the words with him, point, and wait for him to tap. To get back here during play, hold the 🔒 in the corner.</p>
            <button type="button" className="pk-go" onClick={start}>
              {started ? "Back to the game" : "Start"}
            </button>

            <section className="pk-section">
              <h3>What to play</h3>
              <ModePicker mode={settings.mode} onMode={(mode) => changeSettings({ ...settings, mode })} />
              <p className="fine">{MODES.find((m) => m.id === settings.mode)!.what}</p>
              <div className="pk-kinds">
                {CATEGORIES.map((c) => (
                  <label key={c.id} className="pk-check">
                    <input type="checkbox" checked={settings.categories.includes(c.id)} onChange={() => toggle(c.id)} /> <span aria-hidden="true">{c.emoji}</span> {c.name}
                  </label>
                ))}
              </div>
              <label className="pk-check">
                <input type="checkbox" checked={settings.few} onChange={(e) => changeSettings({ ...settings, few: e.target.checked })} /> A few pictures, over and over (how words are learned)
              </label>
              <label className="pk-check">
                <input type="checkbox" checked={settings.sounds} onChange={(e) => changeSettings({ ...settings, sounds: e.target.checked })} /> Say the sound too ("Cow! Moo!")
              </label>
              {settings.mode === "find" && (
                <label className="pk-check">
                  <input type="checkbox" checked={settings.choices === 3} onChange={(e) => changeSettings({ ...settings, choices: e.target.checked ? 3 : 2 })} /> Three to choose from (harder)
                </label>
              )}
            </section>

            <section className="pk-section">
              <h3>Video call</h3>
              {!call ? (
                <>
                  <p className="fine">Call the other parent (or a grandparent): they see him and the board, can tap pictures onto his screen, and play peekaboo with their own face.</p>
                  <button type="button" className="secondary" onClick={() => void startCall()}>
                    📞 Start a call
                  </button>
                </>
              ) : (
                <>
                  <p className="pk-call-state">{STATE_WORDS[callState ?? call.state]}</p>
                  {callState !== "connected" && callState !== "ended" && (
                    <>
                      <p className="fine">Send them this link:</p>
                      <input className="pk-link" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="The link to join the call" />
                      <div className="pk-row">
                        <button type="button" className="secondary" onClick={() => void shareLink()}>
                          {copied ? "Copied" : typeof navigator.share === "function" ? "Share the link" : "Copy the link"}
                        </button>
                        <ShareQr url={link} label="A QR code for joining the call" what="Point their phone's camera at it" />
                      </div>
                    </>
                  )}
                  <button type="button" className="secondary" onClick={hangUp}>
                    {callState === "ended" ? "Close" : "Hang up"}
                  </button>
                </>
              )}
              {callProblem && <p className="fine pk-problem">{callProblem}</p>}
            </section>

            {settings.categories.includes("family") && <Family family={family} onChange={changeFamily} />}
            <Voices things={[...THINGS, ...familyThings(family)].filter((th) => settings.categories.includes(th.category))} />

            <button type="button" className="secondary" onClick={leave}>
              Leave Peekaboo
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/** The other parent's phone: the baby on the call, the same board, and buttons to play along. */
function JoinCall({ code, onLeave }: { code: string; onLeave: () => void }) {
  const [call, setCall] = useState<PeekabooCall<Wire> | null>(null);
  const [state, setState] = useState<CallState | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [family, setFamily] = useState<Person[]>([]);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const callRef = useRef(call);
  callRef.current = call;
  const send = useCallback((w: Wire) => callRef.current?.send(w), []);
  // The baby's device speaks and leads; this one only taps, and hears it all through the call.
  const game = useGame({ settings, family, speaks: false, leads: false, send });

  useEffect(() => {
    if (!call) return;
    const offs = [
      call.on("state", setState),
      call.on("remote", setRemote),
      call.on("message", (w) => {
        if (w.t === "sync") {
          setSettings(w.settings);
          setFamily(tidyFamily(w.family));
          game.boardRef.current = w.board;
          game.setBoard(w.board);
          return;
        }
        if (w.t === "settings") return setSettings(w.settings);
        if (w.t === "family") return setFamily(tidyFamily(w.family));
        game.run(w, false);
      }),
    ];
    setState(call.state);
    return () => offs.forEach((off) => off());
  }, [call, game.run, game.boardRef, game.setBoard]);
  useEffect(() => (call ? stayAwake() : undefined), [call]);
  useEffect(() => () => void callRef.current?.hangUp(), []);

  const join = async () => {
    setJoining(true);
    setProblem(null);
    try {
      const c = await PeekabooCall.join<Wire>(code);
      setCall(c);
      if (c.note) setProblem(c.note);
    } catch (e) {
      setProblem((e as Error).message);
    }
    setJoining(false);
  };
  const leave = () => {
    void call?.hangUp();
    onLeave();
  };
  const setMode = (mode: Mode) => {
    const next = { ...settings, mode };
    setSettings(next);
    send({ t: "settings", settings: next });
  };

  if (!call || state === "ended") {
    return (
      <main className="pk-join">
        <h1>
          <span aria-hidden="true">🙈</span> Peekaboo
        </h1>
        {state === "ended" ? (
          <p>The call has ended. Ask for a new link to call again.</p>
        ) : (
          <>
            <p>You've been asked to play Peekaboo on a video call. You'll see the baby and the game, and can tap pictures onto their screen.</p>
            <button type="button" className="pk-go" disabled={joining || !code} onClick={() => void join()}>
              {joining ? "Joining…" : "📞 Join with camera"}
            </button>
          </>
        )}
        {problem && <p className="pk-problem">{problem}</p>}
        <button type="button" className="secondary" onClick={leave}>
          Go to the parlor
        </button>
      </main>
    );
  }

  return (
    <main className="pk-root pk-remote">
      <div className="pk-stage">
        {remote ? <Video stream={remote} label="The baby, on the call" className="pk-baby" /> : <p className="pk-call-state">{STATE_WORDS[state ?? call.state]}</p>}
        <div className={`pk-self${game.face ? " pk-face-hidden" : ""}`}>
          <Video stream={call.local} muted mirror label="You" className="pk-self-video" />
          <div className="pk-blanket" aria-hidden="true" />
        </div>
        {state !== "connected" && remote && <p className="pk-call-state pk-over">{STATE_WORDS[state ?? call.state]}</p>}
      </div>
      <Board game={game} />
      <div className="pk-controls">
        <ModePicker mode={settings.mode} onMode={setMode} />
        <div className="pk-row">
          <button type="button" className="pk-peekaboo" disabled={game.face} onClick={() => game.run({ t: "face" }, true)}>
            🙈 Peekaboo!
          </button>
          <button
            type="button"
            className="secondary"
            aria-pressed={!mic}
            onClick={() => {
              call.setMicrophone(!mic);
              setMic(!mic);
            }}
          >
            {mic ? "🎙 Mute" : "🔇 Unmute"}
          </button>
          <button
            type="button"
            className="secondary"
            aria-pressed={!cam}
            onClick={() => {
              call.setCamera(!cam);
              setCam(!cam);
            }}
          >
            {cam ? "📷 Camera off" : "📷 Camera on"}
          </button>
          <button type="button" className="pk-hangup" onClick={leave}>
            Hang up
          </button>
        </div>
      </div>
    </main>
  );
}

export function Peekaboo({ onLeave }: { onLeave: () => void }) {
  const q = new URLSearchParams(location.search);
  if (q.get("peekaboo") === "join") return <JoinCall code={decodeURIComponent(location.hash.slice(1))} onLeave={onLeave} />;
  return <WithBaby onLeave={onLeave} />;
}
