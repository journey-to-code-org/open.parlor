// The same player on another device (server: devices.ts). A player is a cookie, so a new phone
// starts as a stranger: this screen hands the cookie over with a code, shown on the device that
// has it and typed (or scanned) on the one that doesn't. No account, no password.
import { useState } from "react";
import { OFFLINE_LINE, useOnline } from "./offline";
import { loadMyHouses, loadName, rememberHouse, saveName } from "./storage";
import { QrCode } from "./wifi/qr";

interface Moved {
  same: boolean;
  name: string;
  houses: { slug: string; name: string }[];
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach the parlor. Try again in a minute.");
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Couldn't reach the parlor. Try again in a minute.");
  return data;
}

/** "abcd-efgh": easier to read across a room, and to type. */
const spaced = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;
/** The code in the address, when this screen was opened from the other device's QR code. */
const codeInUrl = () => decodeURIComponent(location.hash.slice(1)).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 12);
const moveLink = (code: string) => `${new URL(import.meta.env.BASE_URL, location.origin).href}?me=move#${code}`;

export function MoveDevice({ onLeave, onOpenHouse }: { onLeave: () => void; onOpenHouse: (slug: string) => void }) {
  const online = useOnline();
  const [arrived] = useState(codeInUrl);
  const [typed, setTyped] = useState(arrived);
  const [code, setCode] = useState<{ code: string; minutes: number } | null>(null);
  const [moved, setMoved] = useState<Moved | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [here] = useState(loadMyHouses);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };
  const give = () => run(async () => setCode(await post<{ code: string; minutes: number }>("me/move", { name: loadName() })));
  const take = () =>
    run(async () => {
      const result = await post<Moved>(`me/move/${encodeURIComponent(typed.trim())}`, {});
      if (!result.same) {
        if (result.name) saveName(result.name);
        // Oldest first, so the list ends up in the order the server gave.
        for (const house of [...result.houses].reverse()) rememberHouse(house);
      }
      setMoved(result);
    });

  const bring = (
    <section className="wifi-step" aria-label="Bring me to this device">
      <h2>{arrived ? "Bring me to this device" : "This is the new device"}</h2>
      <p className="fine">Type the code the other device shows. This one becomes the same player: your houses, your standing, and what you've made.</p>
      <form
        className="wifi-paste"
        onSubmit={(event) => {
          event.preventDefault();
          void take();
        }}
      >
        <label>
          <span className="fine">The code</span>
          <input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="abcd-efgh" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={12} aria-label="The code from the other device" />
        </label>
        <button type="submit" className="primary" disabled={busy || !online || typed.replace(/[^a-zA-Z0-9]/g, "").length < 8}>
          Bring me over
        </button>
      </form>
      {here.length > 0 && <p className="fine">This device is already in {here.length === 1 ? here[0]!.name : `${here.length} houses`} as someone else. That player stays behind: bring them over from here first if you want to keep them.</p>}
    </section>
  );
  const send = (
    <section className="wifi-step" aria-label="Take me to another device">
      <h2>From this device to another</h2>
      {code ? (
        <>
          <p className="move-code" aria-label={`The code is ${code.code.split("").join(" ")}`}>
            {spaced(code.code)}
          </p>
          <QrCode text={moveLink(code.code)} label="A QR code that opens this screen on the other device" />
          <p className="fine">On the other device, scan this, or open the parlor and choose “Use the parlor on another device”. Good once, for {code.minutes} minutes. Anyone with the code becomes you, so don't post it.</p>
        </>
      ) : (
        <>
          <p className="fine">A new phone or browser starts as a stranger. A code from this one makes it you there too, and this device stays you.</p>
          <button type="button" className="secondary" disabled={busy || !online} onClick={() => void give()}>
            Get a code
          </button>
        </>
      )}
    </section>
  );

  return (
    <main className="setup wifi">
      <header className="setup-head">
        <div className="suits" aria-hidden>
          📱
        </div>
        <h1>Use the parlor on another device</h1>
        <p>You are whoever this browser remembers. Take that with you, with no account and no password.</p>
      </header>
      <button type="button" className="link" onClick={onLeave}>
        ← All games
      </button>
      {moved ? (
        <section className="wifi-step" role="status">
          <h2>{moved.same ? "That's this device" : `Welcome back${moved.name ? `, ${moved.name}` : ""}`}</h2>
          {moved.same ? (
            <p className="fine">The code came from here. Type it on the other device.</p>
          ) : moved.houses.length ? (
            <>
              <p className="fine">This device is you now. Your houses:</p>
              <ul className="wifi-seats">
                {moved.houses.map((house) => (
                  <li key={house.slug}>
                    <button type="button" className="link" onClick={() => onOpenHouse(house.slug)}>
                      🏠 {house.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="fine">This device is you now.</p>
          )}
          <button type="button" className="primary" onClick={onLeave}>
            All games
          </button>
        </section>
      ) : (
        <>
          {arrived ? bring : send}
          {arrived ? send : bring}
        </>
      )}
      {!online && <p className="fine">{OFFLINE_LINE}</p>}
      {problem && <p className="error">{problem}</p>}
    </main>
  );
}
