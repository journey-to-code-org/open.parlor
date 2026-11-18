// The "Offline games" sheet: which kinds of game are kept on this device for playing with no
// connection. Opened from the foot of the front page. The switches are Zubra components.
//
// Until someone chooses, everything is kept, as it always was. Choosing takes effect at once: the
// service worker fetches what was added and drops what was taken away (offline/choice.ts).
import SegmentedControl from "@open-parlor/ui/zubra-ui/segmented-control.zb";
import ToggleSwitch from "@open-parlor/ui/zubra-ui/toggle-switch.zb";
import { useEffect, useState } from "react";
import { useOnline } from "../offline";
import { PACKS, bytesKept, chooseOffline, megabytes, offlineStatus, type OfflineChoice, type OfflineStatus } from "./choice";

/** Ask for the sheet from anywhere (the front page is another framework's): it listens for this. */
export const OPEN_OFFLINE_GAMES = "parlor:offline-games";

export function OfflineGames() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<OfflineStatus | null | "asking">("asking");
  const [busy, setBusy] = useState(false);
  const online = useOnline();

  useEffect(() => {
    const show = () => setOpen(true);
    addEventListener(OPEN_OFFLINE_GAMES, show);
    return () => removeEventListener(OPEN_OFFLINE_GAMES, show);
  }, []);
  useEffect(() => {
    if (!open) return;
    setStatus("asking");
    let gone = false;
    void offlineStatus().then((answer) => !gone && setStatus(answer));
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", escape);
    return () => {
      gone = true;
      removeEventListener("keydown", escape);
    };
  }, [open]);
  if (!open) return null;

  const ready = status !== "asking" && status?.available ? status : null;
  const choice = ready?.choice ?? { all: true, packs: [] };
  const keep = async (next: OfflineChoice) => {
    if (!ready || busy) return;
    setBusy(true);
    // Shown as chosen at once; what is really on the device follows when the worker answers.
    setStatus({ ...ready, choice: next });
    const answer = await chooseOffline(next);
    setStatus(answer ?? { ...ready, choice: next });
    setBusy(false);
  };
  const everything = bytesKept(ready ?? { core: { bytes: 0, kept: false }, sizes: {}, files: {} }, { all: true, packs: [] });

  return (
    <div className="offline-games" role="dialog" aria-modal="true" aria-labelledby="offline-games-title" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="offline-games-sheet">
        <h2 id="offline-games-title">Offline games</h2>
        {status === "asking" ? (
          <p role="status">Looking at what's kept here…</p>
        ) : !ready ? (
          <p>Nothing is kept on this device from this copy of the parlor. Games are kept once it is opened from its own address, over a secure connection.</p>
        ) : (
          <>
            <p>Games kept on this device play with no internet. Keep them all, or only the kinds you play.</p>
            <SegmentedControl
              label="Keep on this device"
              value={choice.all ? "all" : "some"}
              options={[
                { value: "all", label: `Everything · ${megabytes(everything)}` },
                { value: "some", label: "Let me choose" },
              ]}
              onValueChange={(e: CustomEvent<string>) => void keep(e.detail === "all" ? { all: true, packs: [] } : { all: false, packs: choice.all ? PACKS.map((p) => p.id) : choice.packs })}
            />
            <p className="offline-games-core">
              <strong>Always kept · {megabytes(ready.core.bytes)}</strong>
              The parlor itself, every game's rules, and the computer players.
            </p>
            <div className="offline-games-list" role="group" aria-label="Kinds of game">
              {PACKS.filter((pack) => ready.packs[pack.id]).map((pack) => {
                const part = ready.packs[pack.id]!;
                const on = choice.all || choice.packs.includes(pack.id);
                return (
                  <ToggleSwitch
                    key={pack.id}
                    label={`${pack.name} · ${megabytes(part.bytes)}`}
                    description={`${pack.blurb}.${on && !part.kept ? (online ? " Fetching…" : " It will be fetched when there is a connection.") : ""}`}
                    checked={on}
                    disabled={choice.all || busy}
                    onCheckedChange={(e: CustomEvent<boolean>) => void keep({ all: false, packs: PACKS.map((p) => p.id).filter((id) => (id === pack.id ? e.detail : choice.packs.includes(id))) })}
                  />
                );
              })}
            </div>
            <p className="offline-games-total" role="status">
              {busy ? "Sorting that out… " : ""}
              This choice keeps <strong>{megabytes(bytesKept(ready, choice))}</strong> of {megabytes(everything)} on this device.
              {!online && " You're offline: anything you add is fetched when the connection is back."}
            </p>
            <p className="offline-games-note">A game that isn't kept still plays whenever there is a connection. Tables with other people always need one.</p>
          </>
        )}
        <button type="button" className="primary" onClick={() => setOpen(false)}>
          Done
        </button>
      </div>
    </div>
  );
}
