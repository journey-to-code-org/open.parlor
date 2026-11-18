// Joining a table on this wifi from another device. The host's QR code is a link to this screen
// with their offer after the `#`: opened from this device's kept copy of the app, with no
// connection needed. This device answers with a QR code of its own for the host to scan, and from
// then on it is sent its seat's view and sends its moves, as it would to the parlor's server.
//
// The session is wifi/joining.ts, with no framework; the steps before the game are Solid
// (solid/wifi/JoinSteps.tsx); the game is this React app's table.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { TableTime } from "../board/SeatClock";
import { GameTable } from "../kit/GameTable";
import { mountJoinSteps } from "../solid/wifi/JoinSteps";
import { SolidIsland } from "./island";
import { createJoining, offerInUrl } from "./joining";
import { canLink, stayAwake } from "./link";

export function WifiJoin({ onLeave }: { onLeave: () => void }) {
  const [joining] = useState(createJoining);
  const { step } = useSyncExternalStore(joining.subscribe, joining.get);
  useEffect(() => {
    const offer = offerInUrl();
    if (offer && canLink()) void joining.join(offer);
    return () => joining.close();
  }, [joining]);
  const playing = step.at === "playing";
  useEffect(() => (playing ? stayAwake() : undefined), [playing]);
  const since = step.at === "playing" ? step.since : null;
  const time = useMemo(() => ({ since, now: Date.now }), [since]);

  if (step.at === "playing") {
    return (
      <TableTime.Provider value={time}>
        <GameTable view={step.view} names={step.names} act={joining.act} onLeave={onLeave} />
      </TableTime.Provider>
    );
  }
  return <SolidIsland mount={mountJoinSteps} props={{ joining, onLeave }} />;
}
