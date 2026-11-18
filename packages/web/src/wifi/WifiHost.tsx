// A table on this wifi, hosted by this device. Nothing here needs the internet or the parlor's
// server: each guest is joined by two QR codes (ours for them to scan, theirs for us), and then
// this page runs the game for everyone (kit/LocalKit.tsx).
//
// The session is wifi/hosting.ts, with no framework; the screen before the game is Solid
// (solid/wifi/HostSteps.tsx); the game is this React app's table. It is a first version, to find out
// how well it holds up on real phones and real routers:
// - a guest who drops off is let back in to the same seat from the table (solid/wifi/Rejoin.tsx);
// - the game ends if this device leaves (the screen is kept awake while it runs).
import { kitGame, type KitGameId } from "@journey-to-code/games";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LocalKit } from "../kit/LocalKit";
import { personName } from "../kit/sameDevice";
import { mountHostSteps } from "../solid/wifi/HostSteps";
import { createHosting } from "./hosting";
import { SolidIsland } from "./island";
import { stayAwake } from "./link";

export function WifiHost({ game: id, name, others, rules, seats, seed, onLeave }: { game: KitGameId; name: string; /** The other people at this device: they share its screen, in the seats after the host's. */ others?: string[]; rules: unknown; seats: number; seed: number; onLeave: () => void }) {
  const game = kitGame(id)!;
  const [hosting] = useState(() => createHosting([personName(name === "You" ? "" : name, 0), ...(others ?? []).slice(0, Math.max(0, seats - 2)).map((n, i) => personName(n, i + 1))], seats));
  const state = useSyncExternalStore(hosting.subscribe, hosting.get);
  // Leaving the screen, however it happens, lets everyone go.
  useEffect(() => () => hosting.close(), [hosting]);
  useEffect(() => (state.playing ? stayAwake() : undefined), [state.playing]);

  if (state.playing) return <LocalKit game={id} name={name} others={state.here.slice(1)} guests={state.guests} rules={rules} seats={seats} seed={seed} onLeave={onLeave} />;
  return <SolidIsland mount={mountHostSteps} props={{ hosting, game: { name: game.name, emoji: game.emoji }, onLeave }} />;
}
