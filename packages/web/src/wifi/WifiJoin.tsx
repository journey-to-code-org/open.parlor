// Joining a table on this wifi from another device. The host's QR code is a link to this screen
// with their offer after the `#`: opened from this device's kept copy of the app, with no
// connection needed. This device answers with a QR code of its own for the host to scan, and from
// then on it is sent its seat's view and sends its moves, as it would to the parlor's server.
import type { BoardView, KitView, SportView } from "@journey-to-code/games";
import { useEffect, useMemo, useRef, useState } from "react";
import { TableTime } from "../board/SeatClock";
import { GameTable } from "../kit/GameTable";
import { loadName, saveName } from "../storage";
import { canLink, stayAwake, takeSeat, type PeerLink } from "./link";
import { QrCode, QrScanner } from "./qr";
import { codeIn } from "./signal";

type Step =
  | { at: "scan" }
  | { at: "answer"; code: string }
  | { at: "seated"; names: string[] }
  | { at: "playing"; view: KitView | BoardView | SportView; names: string[]; since: number }
  | { at: "gone" };

/** The offer in the address, if this screen was opened from a host's QR code. */
const offerInUrl = () => (location.hash.length > 1 ? codeIn(location.hash) : "");

export function WifiJoin({ onLeave }: { onLeave: () => void }) {
  const [step, setStep] = useState<Step>({ at: "scan" });
  const [problem, setProblem] = useState<string | null>(canLink() ? null : "This browser can't connect to other devices directly.");
  const [typed, setTyped] = useState("");
  // Who to be at the table: asked while the host is scanning, and said the moment the channel opens.
  const [name, setName] = useState(loadName);
  const nameNow = useRef(name);
  nameNow.current = name;
  const link = useRef<PeerLink | null>(null);
  const seat = useRef<{ cancel(): void } | null>(null);
  const waiting = useRef(new Map<number, (error: string | null) => void>());
  const nextId = useRef(1);

  /** The host's code, from the address, the camera or the box. */
  const join = async (text: string): Promise<boolean> => {
    setProblem(null);
    try {
      const taken = await takeSeat(codeIn(text));
      seat.current = taken;
      setStep({ at: "answer", code: taken.code });
      taken.joined.then(
        (joined) => {
          link.current = joined;
          saveName(nameNow.current);
          joined.send({ t: "hello", name: nameNow.current.trim() });
          setStep((now) => (now.at === "answer" ? { at: "seated", names: [] } : now));
          joined.listen((message) => {
            if (message.t === "seated") setStep((now) => (now.at === "playing" ? now : { at: "seated", names: message.names }));
            else if (message.t === "view") setStep({ at: "playing", view: message.view as KitView, names: message.names, since: Date.now() });
            else if (message.t === "ack") {
              waiting.current.get(message.id)?.(message.error);
              waiting.current.delete(message.id);
            }
          });
          joined.closed(() => {
            for (const answer of waiting.current.values()) answer("The host has gone.");
            waiting.current.clear();
            setStep({ at: "gone" });
          });
        },
        (e) => {
          setProblem(e instanceof Error ? e.message : "Couldn't connect.");
          setStep({ at: "scan" });
        },
      );
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That code didn't work.");
      return false;
    }
  };

  useEffect(() => {
    const offer = offerInUrl();
    if (offer && canLink()) void join(offer);
    return () => {
      link.current?.close();
      seat.current?.cancel();
    };
  }, []);
  const playing = step.at === "playing";
  useEffect(() => (playing ? stayAwake() : undefined), [playing]);

  const act = async (move: Record<string, unknown>) => {
    const joined = link.current;
    if (!joined?.open) return "The host has gone.";
    const id = nextId.current++;
    return new Promise<string | null>((done) => {
      const timer = setTimeout(() => {
        waiting.current.delete(id);
        done("The host didn't answer. Try again.");
      }, 10_000);
      waiting.current.set(id, (error) => {
        clearTimeout(timer);
        done(error);
      });
      joined.send({ t: "move", id, move });
    });
  };
  const since = step.at === "playing" ? step.since : null;
  const time = useMemo(() => ({ since, now: Date.now }), [since]);

  if (step.at === "playing") {
    return (
      <TableTime.Provider value={time}>
        <GameTable view={step.view} names={step.names} act={act} onLeave={onLeave} />
      </TableTime.Provider>
    );
  }
  return (
    <main className="setup wifi">
      <header className="setup-head">
        <div className="suits" aria-hidden>
          📶
        </div>
        <h1>Join a table on this wifi</h1>
        <p>No internet needed: you and the host only have to be on the same wifi.</p>
      </header>
      <button type="button" className="link" onClick={onLeave}>
        ← All games
      </button>
      {step.at === "scan" && (
        <section className="wifi-step" aria-label="Scan the host's code">
          <h2>Scan the host's code</h2>
          <p className="fine">The host picks a game and taps “Play on this wifi”. Point this device at the code on their screen.</p>
          {canLink() && <QrScanner onRead={join} />}
          <form
            className="wifi-paste"
            onSubmit={(event) => {
              event.preventDefault();
              void join(typed);
            }}
          >
            <label>
              <span className="fine">or paste their link</span>
              <input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="The host's link" />
            </label>
            <button type="submit" className="secondary" disabled={!typed.trim()}>
              Join
            </button>
          </form>
        </section>
      )}
      {step.at === "answer" && (
        <section className="wifi-step" aria-label="Show this to the host">
          <h2>Now show this to the host</h2>
          <QrCode text={step.code} label="A QR code for the host to scan" />
          <p className="fine">They tap “Scan their code” and point their device at this one. Keep this screen open.</p>
          <label className="wifi-paste">
            <span className="fine">Your name at the table</span>
            <input value={name} maxLength={20} onChange={(event) => setName(event.target.value)} autoComplete="given-name" aria-label="Your name" />
          </label>
          <label className="wifi-paste">
            <span className="fine">or send them this code</span>
            <input readOnly value={step.code} onFocus={(event) => event.target.select()} aria-label="Your code" />
          </label>
        </section>
      )}
      {step.at === "seated" && (
        <section className="wifi-step" role="status">
          <h2>You're in</h2>
          {step.names.length > 0 && <p>At the table: {step.names.join(", ")}.</p>}
          <p className="fine">Waiting for the host to start the game.</p>
        </section>
      )}
      {step.at === "gone" && (
        <section className="wifi-step" role="status">
          <h2>The table has closed</h2>
          <p className="fine">The host left, or one of you dropped off the wifi. If it was you, the host can let you back in to the same seat: they tap “Let … back in” under the table and show you a new code.</p>
          <button
            type="button"
            className="primary"
            onClick={() => {
              link.current = null;
              seat.current = null;
              setProblem(null);
              setStep({ at: "scan" });
            }}
          >
            📷 Scan the host's new code
          </button>
          <button type="button" className="secondary" onClick={onLeave}>
            All games
          </button>
        </section>
      )}
      {problem && <p className="error">{problem}</p>}
    </main>
  );
}
