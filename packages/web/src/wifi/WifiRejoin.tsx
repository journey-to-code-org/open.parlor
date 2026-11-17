// Letting a guest who dropped off the wifi back into the same seat. The host makes a fresh offer for
// that seat and shows it as a QR code; the guest scans it (from "The table has closed", or Join a
// game on this wifi) and shows theirs back, as when they first joined. The game carries on from
// where it is: the seat, its hand and its score were never given away.
import { useEffect, useState } from "react";
import { offerSeat, type PeerLink } from "./link";
import { QrCode, QrScanner } from "./qr";
import { codeIn, joinLink } from "./signal";

export function WifiRejoin({ name, onLinked, onCancel }: { name: string; onLinked: (link: PeerLink) => void; onCancel: () => void }) {
  const [seat, setSeat] = useState<Awaited<ReturnType<typeof offerSeat>> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (seat) return;
    let dropped = false;
    offerSeat().then(
      (made) => (dropped ? made.cancel() : setSeat(made)),
      () => setProblem("Couldn't get the seat ready. Is this device on the wifi?"),
    );
    return () => {
      dropped = true;
    };
  }, [seat]);

  const accept = async (text: string): Promise<boolean> => {
    if (!seat || busy) return false;
    setBusy(true);
    setProblem(null);
    try {
      const link = await seat.answered(codeIn(text));
      onLinked(link);
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn't work. Try the code again.");
      if (e instanceof Error && !/isn't a code|isn't on a network/.test(e.message)) {
        seat.cancel();
        setSeat(null);
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="howto-backdrop" onClick={onCancel}>
      <section className="howto wifi-rejoin" role="dialog" aria-modal="true" aria-labelledby="rejoin-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="rejoin-title">Let {name} back in</h2>
        <p className="howto-tagline">Their seat is kept as they left it.</p>
        <h3>1. They scan this</h3>
        {seat ? <QrCode text={joinLink(seat.code)} label={`A QR code that lets ${name} back in`} /> : <p className="fine">Getting the seat ready…</p>}
        <p className="fine">With their camera, or “Scan the host's new code” on their screen.</p>
        {seat && (
          <label className="wifi-paste">
            <span className="fine">or send them this link (AirDrop, Quick Share)</span>
            <input readOnly value={joinLink(seat.code)} onFocus={(event) => event.target.select()} aria-label="The link that lets them back in" />
          </label>
        )}
        <h3>2. You scan theirs</h3>
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
        {problem && <p className="error">{problem}</p>}
        <button type="button" className="link" onClick={onCancel}>
          Not now
        </button>
      </section>
    </div>
  );
}
