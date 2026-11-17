// A table on this wifi, hosted by this device. Nothing here needs the internet or the parlor's
// server: each guest is joined by two QR codes (ours for them to scan, theirs for us), and then
// this page runs the game for everyone (kit/LocalKit.tsx).
//
// It is a first version, to find out how well it holds up on real phones and real routers:
// - a guest who drops off is let back in to the same seat from the table (wifi/WifiRejoin.tsx);
// - the game ends if this device leaves (the screen is kept awake while it runs).
import { kitGame, type KitGameId } from "@journey-to-code/games";
import { useEffect, useRef, useState } from "react";
import { LocalKit } from "../kit/LocalKit";
import { personName } from "../kit/sameDevice";
import { canLink, offerSeat, stayAwake, type PeerLink } from "./link";
import { QrCode, QrScanner } from "./qr";
import { codeIn, joinLink } from "./signal";

interface Guest {
  name: string;
  link: PeerLink;
}

export function WifiHost({ game: id, name, rules, seats, seed, onLeave }: { game: KitGameId; name: string; rules: unknown; seats: number; seed: number; onLeave: () => void }) {
  const game = kitGame(id)!;
  const [guests, setGuests] = useState<Guest[]>([]);
  const [playing, setPlaying] = useState(false);
  /** The seat on offer: a code to show, and what to do with the one shown back. */
  const [seat, setSeat] = useState<Awaited<ReturnType<typeof offerSeat>> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(canLink() ? null : "This browser can't connect to other devices directly.");
  const all = useRef<Guest[]>([]);
  all.current = guests;
  const full = guests.length >= seats - 1;

  // One seat on offer at a time, until the table is full or the game starts.
  useEffect(() => {
    if (playing || full || seat || !canLink()) return;
    let dropped = false;
    offerSeat().then(
      (made) => (dropped ? made.cancel() : setSeat(made)),
      () => setProblem("Couldn't get a seat ready. Is this device on the wifi?"),
    );
    return () => {
      dropped = true;
    };
  }, [playing, full, seat]);
  useEffect(() => {
    if (playing) seat?.cancel();
  }, [playing]);
  // Leaving the screen, however it happens, lets everyone go.
  useEffect(
    () => () => {
      for (const guest of all.current) guest.link.close();
    },
    [],
  );
  useEffect(() => (playing ? stayAwake() : undefined), [playing]);

  /** Their code, scanned or typed: the channel opens, and they say who they are. */
  const accept = async (text: string): Promise<boolean> => {
    if (!seat || busy) return false;
    setBusy(true);
    setProblem(null);
    try {
      const link = await seat.answered(codeIn(text));
      const said = await new Promise<string>((done) => {
        const timer = setTimeout(() => done(""), 3000);
        const stop = link.listen((message) => {
          if (message.t !== "hello") return;
          clearTimeout(timer);
          stop();
          done(String(message.name ?? ""));
        });
      });
      const joined = [...all.current, { name: personName(said, all.current.length + 1), link }];
      link.closed(() => setGuests((now) => (playingNow.current ? now : now.filter((g) => g.link !== link))));
      setGuests(joined);
      for (const guest of joined) guest.link.send({ t: "seated", names: [personName(name === "You" ? "" : name, 0), ...joined.map((g) => g.name)] });
      setSeat(null);
      setScanning(false);
      setTyped("");
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn't work. Try the code again.");
      // A seat that failed to connect can't be offered twice: make a fresh one.
      if (e instanceof Error && !/isn't a code|isn't on a network/.test(e.message)) {
        seat.cancel();
        setSeat(null);
      }
      return false;
    } finally {
      setBusy(false);
    }
  };
  const playingNow = useRef(playing);
  playingNow.current = playing;

  if (playing) return <LocalKit game={id} name={name} guests={guests} rules={rules} seats={seats} seed={seed} onLeave={onLeave} />;

  const left = seats - 1 - guests.length;
  return (
    <main className="setup wifi">
      <header className="setup-head">
        <div className="suits" aria-hidden>
          {game.emoji}
        </div>
        <h1>{game.name} on this wifi</h1>
        <p>No internet needed. Everyone has to be on the same wifi (or this phone's hotspot), and to have opened the parlor on their device before.</p>
      </header>
      <button type="button" className="link" onClick={onLeave}>
        ← Back
      </button>

      {guests.length > 0 && (
        <section className="wifi-step" aria-label="At the table">
          <h2>At the table</h2>
          <ul className="wifi-seats">
            <li>{personName(name === "You" ? "" : name, 0)} (you)</li>
            {guests.map((guest) => (
              <li key={guest.name}>{guest.name}</li>
            ))}
          </ul>
        </section>
      )}

      {!full && (
        <section className="wifi-step" aria-label="Add a player">
          <h2>{guests.length ? "Add another player" : "1. They scan this"}</h2>
          {seat ? <QrCode text={joinLink(seat.code)} label="A QR code that joins this table" /> : <p className="fine">Getting a seat ready…</p>}
          <p className="fine">With their phone's camera, or with “Join on this wifi” on the parlor's front page.</p>
          {seat && (
            <label className="wifi-paste">
              <span className="fine">or send them this link (AirDrop, Quick Share)</span>
              <input readOnly value={joinLink(seat.code)} onFocus={(event) => event.target.select()} aria-label="The link that joins this table" />
            </label>
          )}
          <h2>{guests.length ? "Then scan theirs" : "2. You scan theirs"}</h2>
          <p className="fine">Their screen shows a code back. Point this device at it.</p>
          {scanning ? (
            <QrScanner onRead={accept} />
          ) : (
            <button type="button" className="secondary" disabled={!seat || busy} onClick={() => setScanning(true)}>
              📷 Scan their code
            </button>
          )}
          <form
            className="wifi-paste"
            onSubmit={(event) => {
              event.preventDefault();
              void accept(typed);
            }}
          >
            <label>
              <span className="fine">or paste their code</span>
              <input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="Their code" />
            </label>
            <button type="submit" className="secondary" disabled={!seat || busy || !typed.trim()}>
              {busy ? "Connecting…" : "Connect"}
            </button>
          </form>
        </section>
      )}
      {problem && <p className="error">{problem}</p>}

      <section className="wifi-step">
        <button type="button" className="primary deal" disabled={guests.length === 0} onClick={() => setPlaying(true)}>
          {guests.length === 0 ? "Waiting for someone to join" : left > 0 ? `Start with ${left} computer player${left === 1 ? "" : "s"}` : "Start the game"}
        </button>
      </section>
    </main>
  );
}
