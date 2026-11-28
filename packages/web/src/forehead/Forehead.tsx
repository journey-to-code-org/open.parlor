// Forehead: a guessing game on a video call. Everyone has a card on their forehead that the others
// can read and they can't, and works out what it says from how the room treats them. The host of
// the round holds a buzzer for anyone who says a card out loud.
//
// The server deals and never sends a player their own card (packages/server/src/foreheads.ts); the
// call is browser to browser (room.ts). This is the screen: the tiles with their cards, the guess,
// the clock and the buzzer.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ShareQr } from "../ShareQr";
import { loadName, saveName } from "../storage";
import { stayAwake } from "../wifi/link";
import { buzzLine, clock, placed } from "./words";
import { ForeheadRoom, hasSeat, joinLink, type Buzz, type RoomView, type Rules, type SeatView } from "./room";
import "./forehead.css";

function Video({ stream, muted = false, mirror = false, label }: { stream: MediaStream | null; muted?: boolean; mirror?: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video || video.srcObject === stream) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => {});
  }, [stream]);
  return <video ref={ref} className={`fh-video${mirror ? " fh-mirror" : ""}`} autoPlay playsInline muted={muted} aria-label={label} />;
}

/** The buzzer's sound: two low, rude notes. */
function soundBuzzer() {
  try {
    const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;
    const audio = new Audio();
    const gain = audio.createGain();
    gain.connect(audio.destination);
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + 0.02);
    gain.gain.setValueAtTime(0.25, audio.currentTime + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.6);
    for (const hz of [110, 147]) {
      const tone = audio.createOscillator();
      tone.type = "sawtooth";
      tone.frequency.value = hz;
      tone.connect(gain);
      tone.start();
      tone.stop(audio.currentTime + 0.62);
    }
    setTimeout(() => void audio.close().catch(() => {}), 900);
  } catch {}
}

function useRoom(room: ForeheadRoom | null) {
  const [view, setView] = useState<RoomView | null>(room?.view ?? null);
  const [streams, setStreams] = useState<Map<number, MediaStream>>(new Map());
  const [ended, setEnded] = useState<string | null>(room?.ended ?? null);
  useEffect(() => {
    if (!room) return;
    setView(room.view);
    setStreams(new Map(room.streams));
    setEnded(room.ended);
    const offs = [room.on("view", setView), room.on("streams", (s) => setStreams(new Map(s))), room.on("ended", setEnded)];
    return () => offs.forEach((off) => off());
  }, [room]);
  return { view, streams, ended };
}

/** How long is left in the round, counted against the server's clock. */
function useTimeLeft(view: RoomView | null): number {
  const [, tick] = useState(0);
  const offset = useRef(0);
  const stamp = view?.now;
  useEffect(() => {
    if (stamp !== undefined) offset.current = stamp - Date.now();
  }, [stamp]);
  const running = view?.game?.phase === "playing";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, [running]);
  return view?.game ? Math.max(0, view.game.endsAt - (Date.now() + offset.current)) : 0;
}

function Door({ code, onRoom, onLeave }: { code: string | null; onRoom: (room: ForeheadRoom) => void; onLeave: () => void }) {
  const [name, setName] = useState(loadName);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const enter = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setProblem(null);
    if (name.trim()) saveName(name.trim());
    try {
      onRoom(await (code ? ForeheadRoom.join(code, name) : ForeheadRoom.open(name)));
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  };
  // A reload comes straight back to the seat this tab had.
  const back = useRef(code !== null && hasSeat(code));
  useEffect(() => {
    if (!back.current) return;
    // Once: in development React runs this twice, and two pages in one seat would talk over each other.
    back.current = false;
    void enter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <main className="fh-door">
      <h1>
        <span aria-hidden="true">🏷️</span> Forehead
      </h1>
      <p>
        {code
          ? "You've been asked to a game on a video call. Everyone gets a card on their forehead that the others can read and they can't. Work out what yours says from how they treat you."
          : "A guessing game on a video call, for three to six. Everyone gets a card on their forehead that the others can read and they can't. Treat each other as your cards say, and guess your own."}
      </p>
      <form onSubmit={(e) => void enter(e)}>
        <label>
          Your name
          <input value={name} maxLength={20} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="fh-go" disabled={busy}>
          {busy ? "One moment…" : code ? "📞 Join with camera" : "📞 Start a call"}
        </button>
      </form>
      <p className="fine">Your browser will ask to use the camera and microphone. The pictures and sound go straight between the players' browsers, not through the parlor.</p>
      {problem && (
        <p className="fh-problem" role="alert">
          {problem}
        </p>
      )}
      <button type="button" className="secondary" onClick={onLeave}>
        Go to the parlor
      </button>
    </main>
  );
}

function Invite({ code }: { code: string }) {
  const link = joinLink(code);
  const [copied, setCopied] = useState(false);
  const share = async () => {
    try {
      if (navigator.share) return await navigator.share({ title: "Forehead", text: "Come and play Forehead with me", url: link });
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };
  return (
    <div className="fh-invite">
      <button type="button" className="fh-go" onClick={() => void share()}>
        {copied ? "Link copied" : "Send the link"}
      </button>
      <ShareQr url={link} label="A QR code of the link to this game" what="Point a phone's camera here to join" />
    </div>
  );
}

const RULE_CHOICES: { key: keyof Rules; label: string; choices: [number, string][] }[] = [
  { key: "rounds", label: "Rounds", choices: [1, 2, 3, 4, 5, 6, 8, 10].map((n) => [n, String(n)]) },
  { key: "seconds", label: "Each round lasts", choices: [60, 120, 180, 240, 300, 600].map((n) => [n, `${n / 60} min`]) },
  { key: "guesses", label: "Guesses each", choices: [1, 2, 3, 4, 5].map((n) => [n, String(n)]) },
];

function RulesForm({ rules, mine, onChange }: { rules: Rules; mine: boolean; onChange: (rules: Partial<Rules>) => void }) {
  return (
    <div className="fh-rules">
      {RULE_CHOICES.map(({ key, label, choices }) => (
        <label key={key}>
          {label}
          <select value={rules[key]} disabled={!mine} onChange={(e) => onChange({ [key]: Number(e.target.value) })}>
            {choices.map(([value, words]) => (
              <option key={value} value={value}>
                {words}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

/** The host's buzzer for one player: who said a card, and (if the host says) whose it was. */
function BuzzPad({ who, others, whose, onBuzz, onClose }: { who: string; others: SeatView[]; whose: (seat: number) => string; onBuzz: (spoiled: number | null) => void; onClose: () => void }) {
  return (
    <div className="fh-pad" role="dialog" aria-label={`Buzz ${who}`}>
      <p>
        <strong>Buzz {who}</strong> for breaking the round's rule: they lose a point. If they gave a card away, whose was it? Its wearer is dealt a new one.
      </p>
      <div className="fh-pad-choices">
        {others.map((p) => (
          <button key={p.seat} type="button" onClick={() => onBuzz(p.seat)}>
            {whose(p.seat)}
          </button>
        ))}
        <button type="button" onClick={() => onBuzz(null)}>
          Just buzz
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          Never mind
        </button>
      </div>
    </div>
  );
}

function Table({ room, onLeave }: { room: ForeheadRoom; onLeave: () => void }) {
  const { view, streams, ended } = useRoom(room);
  const left = useTimeLeft(view);
  const [problem, setProblem] = useState<string | null>(room.note);
  const [guess, setGuess] = useState("");
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [pad, setPad] = useState<number | null>(null);
  const [buzzed, setBuzzed] = useState<Buzz | null>(null);
  const lastBuzz = useRef<number | null>(null);
  useEffect(() => stayAwake(), []);
  // Going back to the parlor hangs up here but keeps the seat, to come back to from the link.
  // (A moment later, not at once: in development React mounts a screen twice, and the first isn't leaving.)
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (closing.current) clearTimeout(closing.current);
    return () => {
      closing.current = setTimeout(() => room.close(), 0);
    };
  }, [room]);

  // A new buzz: the sound, and the offender's tile shaking, on everyone's screen.
  const latest = view?.game?.buzzes[view.game.buzzes.length - 1] ?? null;
  useEffect(() => {
    const n = latest?.n ?? 0;
    if (lastBuzz.current === null) {
      lastBuzz.current = n;
      return;
    }
    if (n === lastBuzz.current) return;
    const fresh = n > lastBuzz.current;
    lastBuzz.current = n;
    if (!fresh || !latest) return;
    soundBuzzer();
    setBuzzed(latest);
    const timer = setTimeout(() => setBuzzed(null), 5000);
    return () => clearTimeout(timer);
  }, [latest]);

  if (ended || !view) {
    return (
      <main className="fh-door">
        <h1>
          <span aria-hidden="true">🏷️</span> Forehead
        </h1>
        <p>{ended ?? "One moment…"}</p>
        <button type="button" className="secondary" onClick={onLeave}>
          Go to the parlor
        </button>
      </main>
    );
  }

  const game = view.game;
  const me = room.seat;
  const hosting = view.host === me;
  const name = (seat: number) => (seat === me ? "You" : (view.players.find((p) => p.seat === seat)?.name ?? "Someone"));
  const theirName = (seat: number) => view.players.find((p) => p.seat === seat)?.name ?? "Someone";
  const mine = game?.players.find((p) => p.seat === me) ?? null;
  const playing = game?.phase === "playing";
  const act = async (action: string, more?: Record<string, unknown>) => setProblem(await room.act(action, more));
  const sendGuess = async (e: FormEvent) => {
    e.preventDefault();
    if (!guess.trim()) return;
    const said = guess;
    setGuess("");
    await act("guess", { text: said });
  };
  const seats = game ? view.players.filter((p) => game.players.some((g) => g.seat === p.seat)) : view.players;
  const ranked = game ? placed(game.players) : [];

  return (
    <main className={`fh-root fh-count-${Math.min(6, seats.length)}`}>
      <header className="fh-bar">
        <strong>
          <span aria-hidden="true">🏷️</span> Forehead
        </strong>
        {game ? (
          <span>
            Round {game.round} of {game.rounds}
            {game.mode && game.phase !== "over" && ` · ${game.mode.emoji} ${game.mode.name}`}
            {playing && <b className={`fh-clock${left < 15_000 ? " fh-low" : ""}`}>{clock(left)}</b>}
          </span>
        ) : (
          <span>Waiting for players</span>
        )}
        <span className="fh-host">{hosting ? "You're the host" : `${theirName(view.host)} is the host`}</span>
      </header>

      <section className="fh-tiles" aria-label="The call">
        {seats.map((p) => {
          const g = game?.players.find((x) => x.seat === p.seat) ?? null;
          const self = p.seat === me;
          const stream = self ? room.local : (streams.get(p.seat) ?? null);
          const hasPicture = !!stream?.getVideoTracks().length;
          return (
            <article key={p.seat} className={`fh-tile${buzzed?.seat === p.seat ? " fh-buzzed" : ""}${game?.asker === p.seat ? " fh-asking" : ""}${g?.won != null ? " fh-won" : ""}${p.here ? "" : " fh-away"}`}>
              <Video stream={stream} muted={self} mirror={self} label={self ? "You" : p.name} />
              {!hasPicture && (
                <span className="fh-face" aria-hidden="true">
                  {p.here ? "🙂" : "💤"}
                </span>
              )}
              {game?.asker === p.seat && <span className="fh-turn">{self ? "Your turn to ask" : "Asking"}</span>}
              {g?.wearing && (
                <div className={`fh-card${g.card === null ? " fh-hidden" : ""}`}>
                  {g.card === null ? (
                    <>
                      <span className="fh-card-name">?</span>
                      {self && <span className="fh-card-hint">{g.hint}</span>}
                    </>
                  ) : (
                    <span className="fh-card-name">{g.card}</span>
                  )}
                </div>
              )}
              <footer>
                <span className="fh-name">
                  {view.host === p.seat && <span title="The host">🔔 </span>}
                  {self ? `${p.name} (you)` : p.name}
                  {!p.here && " · away"}
                </span>
                {g && (
                  <span className="fh-score">
                    {g.won != null && "✓ "}
                    {g.score}
                  </span>
                )}
              </footer>
              {g && !self && g.guesses.length > 0 && playing && <p className="fh-said">Guessed: {g.guesses.map((x) => x.text).join(", ")}</p>}
              {playing && hosting && !self && (
                <button type="button" className="fh-buzz" onClick={() => setPad(p.seat)} aria-label={`Buzz ${p.name}`}>
                  Buzz
                </button>
              )}
            </article>
          );
        })}
      </section>

      {buzzed && (
        <p className="fh-buzz-line" role="status">
          <span aria-hidden="true">🚨</span> {buzzLine(buzzed, me, theirName)}
        </p>
      )}
      {pad !== null && game && playing && hosting && (
        <BuzzPad
          others={game.players.filter((p) => p.seat !== pad && p.wearing && p.won === null)}
          who={theirName(pad)}
          whose={(seat) => (seat === me ? "My own" : `${theirName(seat)}'s`)}
          onBuzz={(spoiled) => {
            const target = pad;
            setPad(null);
            void act("buzz", { player: target, ...(spoiled === null ? {} : { spoiled }) });
          }}
          onClose={() => setPad(null)}
        />
      )}

      <section className="fh-panel">
        {!game && (
          <>
            <p>
              {view.players.length < 3 ? `It takes three to play. ${view.players.length === 1 ? "Send the link to the others." : "One more."}` : hosting ? "Everyone here? Start when you're ready." : `Waiting for ${theirName(view.host)} to start.`}
            </p>
            <Invite code={view.code} />
            <RulesForm rules={view.rules} mine={hosting} onChange={(rules) => void act("rules", { rules })} />
            {hosting && (
              <button type="button" className="fh-go" disabled={!view.canStart} onClick={() => void act("start")}>
                Deal the cards
              </button>
            )}
          </>
        )}

        {game && game.phase === "picking" && (
          <>
            <p>
              <strong>Round {game.round}.</strong> {hosting ? "You're the host: pick this round's game." : `${theirName(view.host)} is picking this round's game.`}
            </p>
            <ul className="fh-modes">
              {game.modes.map((m) => (
                <li key={m.id}>
                  {hosting ? (
                    <button type="button" onClick={() => void act("pick", { mode: m.id })}>
                      <b>
                        <span aria-hidden="true">{m.emoji}</span> {m.name}
                      </b>
                      <span>{m.rule}</span>
                    </button>
                  ) : (
                    <div>
                      <b>
                        <span aria-hidden="true">{m.emoji}</span> {m.name}
                      </b>
                      <span>{m.rule}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {game && playing && mine && (
          <>
            {game.mode && (
              <p className="fh-rule">
                <b>
                  <span aria-hidden="true">{game.mode.emoji}</span> {game.mode.name}.
                </b>{" "}
                {game.mode.rule}
              </p>
            )}
            {game.asker !== null && (
              <div className="fh-asker">
                <span>{game.asker === me ? "It's your turn: ask the room one yes-or-no question about yourself." : `It's ${theirName(game.asker)}'s turn to ask. Answer yes, no or sort of.`}</span>
                {(game.asker === me || hosting) && (
                  <button type="button" className="secondary" onClick={() => void act("pass")}>
                    {game.asker === me ? "I've asked" : "Move the turn on"}
                  </button>
                )}
              </div>
            )}
            {!mine.wearing ? (
              <p>You're the room this round: play up to the card you can see.</p>
            ) : mine.won != null ? (
              <p>
                <strong>You got it: {mine.card}.</strong> Worth {mine.won}. Keep playing up to the others' cards.
              </p>
            ) : mine.guessesLeft > 0 ? (
              <form className="fh-guess" onSubmit={(e) => void sendGuess(e)}>
                <label>
                  Who or what are you? <span className="fine">({mine.hint.toLowerCase()}; {mine.guessesLeft} {mine.guessesLeft === 1 ? "guess" : "guesses"} left)</span>
                  <input value={guess} maxLength={60} autoComplete="off" autoCapitalize="off" onChange={(e) => setGuess(e.target.value)} placeholder="I think I'm…" />
                </label>
                <button type="submit" className="fh-go" disabled={!guess.trim()}>
                  Guess
                </button>
              </form>
            ) : (
              <p>You're out of guesses this round. Your card turns over when the round ends.</p>
            )}
            {mine.guesses.some((g) => !g.right) && <p className="fine">Not: {mine.guesses.filter((g) => !g.right).map((g) => g.text).join(", ")}</p>}
            <p className="fine">{hosting ? "You hold the buzzer: press Buzz on anyone who breaks the rule or says a card out loud." : `${theirName(view.host)} holds the buzzer, for anyone who breaks the rule or says a card out loud.`}</p>
            {hosting && (
              <button type="button" className="secondary" onClick={() => void act("reveal")}>
                End the round now
              </button>
            )}
          </>
        )}

        {game && game.phase === "reveal" && (
          <>
            <p>
              <strong>The cards are turned over.</strong> {mine?.wearing && (mine.won != null ? `You got yours for ${mine.won}.` : `You were: ${mine.card}.`)}
            </p>
            {hosting ? (
              <button type="button" className="fh-go" onClick={() => void act("next")}>
                {game.round >= game.rounds ? "The final scores" : "Next round"}
              </button>
            ) : (
              <p className="fine">Waiting for {theirName(view.host)} to move on. The next host picks the next game.</p>
            )}
          </>
        )}

        {game && game.phase === "over" && (
          <>
            <p>
              <strong>{game.winners.length > 1 ? `A tie: ${game.winners.map(name).join(" and ")}.` : `${name(game.winners[0]!)} ${game.winners[0] === me ? "win" : "wins"}.`}</strong>
            </p>
            <ol className="fh-scores">
              {ranked.map((p) => (
                <li key={p.seat}>
                  {p.place}. {theirName(p.seat)} <b>{p.score}</b>
                </li>
              ))}
            </ol>
            {hosting ? (
              <button type="button" className="fh-go" disabled={view.players.filter((p) => p.here).length < 3} onClick={() => void act("again")}>
                Play again
              </button>
            ) : (
              <p className="fine">{theirName(view.host)} can deal another game.</p>
            )}
            <Invite code={view.code} />
          </>
        )}

        {problem && (
          <p className="fh-problem" role="alert">
            {problem}
          </p>
        )}
      </section>

      <nav className="fh-controls" aria-label="The call">
        <button
          type="button"
          className="secondary"
          aria-pressed={!mic}
          disabled={!!game?.silent}
          onClick={() => {
            room.setMicrophone(!mic);
            setMic(!mic);
          }}
        >
          {game?.silent ? "🤫 Microphones are off" : mic ? "🎙️ Mute" : "🔇 Unmute"}
        </button>
        <button
          type="button"
          className="secondary"
          aria-pressed={!cam}
          onClick={() => {
            room.setCamera(!cam);
            setCam(!cam);
          }}
        >
          {cam ? "📷 Camera off" : "🚫 Camera on"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            void room.leave();
            onLeave();
          }}
        >
          Leave
        </button>
      </nav>
    </main>
  );
}

export function Forehead({ onLeave }: { onLeave: () => void }) {
  const joining = new URLSearchParams(location.search).get("forehead") === "join";
  const code = joining ? decodeURIComponent(location.hash.slice(1)) || null : null;
  const [room, setRoom] = useState<ForeheadRoom | null>(null);
  const enter = (r: ForeheadRoom) => {
    // The address becomes the room's own link, so a reload comes back to it (and to this seat).
    history.replaceState(null, "", joinLink(r.code));
    setRoom(r);
  };
  return room ? <Table room={room} onLeave={onLeave} /> : <Door code={code} onRoom={enter} onLeave={onLeave} />;
}
