// What a house's table is up to, in a line: for the house page's list of tables.
import { isKitGame } from "@journey-to-code/games";
import { isLiveArcade } from "../arcade/live";
import { ARCADE_LIST, GAME_LIST } from "../GamePicker";
import type { HouseTable } from "../housesApi";

export function tableTitle(t: HouseTable): string {
  if (isLiveArcade(t.game)) {
    const emoji = ARCADE_LIST.find((g) => g.id === (t.game as string))?.emoji ?? "🕹️";
    const s = t.summary as { over?: boolean; score?: number; stage?: string } | null;
    if (s?.over) return `${emoji} Finished · ${(s.score ?? 0).toLocaleString()} · ${s.stage ?? ""}`;
    if (t.started) return `${emoji} Playing · ${s?.stage ?? ""}`;
    const seated = t.seats.filter((x) => x.name).length;
    return seated === 0 ? `${emoji} Waiting for players` : `${emoji} ${seated} of ${t.seats.length} seated`;
  }
  if (isKitGame(t.game)) {
    const emoji = GAME_LIST.find((g) => g.id === t.game)?.emoji ?? "🃏";
    const s = t.summary as { over?: boolean; scoreLine?: string; hand?: number } | null;
    if (s?.over) return `${emoji} Finished · ${s.scoreLine}`;
    if (t.started) return `${emoji} Hand ${s?.hand ?? 1} · ${s?.scoreLine ?? ""}`;
    const seated = t.seats.filter((x) => x.name).length;
    return seated === 0 ? `${emoji} Waiting for players` : `${emoji} ${seated} of ${t.seats.length} seated`;
  }
  if (t.game === "palace") {
    const s = t.summary;
    if (s?.phase === "finished") return `🏰 Finished · ${t.seats[s.finished?.[0] ?? 0]?.name ?? "Someone"} went out first`;
    if (t.started) return `🏰 Playing · ${s?.finished?.length ?? 0} out so far`;
    const seated = t.seats.filter((x) => x.name).length;
    return seated === 0 ? "🏰 Waiting for players" : `🏰 ${seated} of ${t.seats.length} seated`;
  }
  if (t.summary?.phase === "finished" && t.summary.scores) {
    const [a, b] = t.summary.scores;
    return `Finished · ${a?.points} to ${b?.points}`;
  }
  if (t.started && t.summary?.scores) {
    const [a, b] = t.summary.scores;
    return `Hand ${t.summary.hand} · ${a?.points} to ${b?.points}`;
  }
  const seated = t.seats.filter((s) => s.name).length;
  return seated === 0 ? "Waiting for players" : `${seated} of 4 seated`;
}

/** What a table's button says: see a finished one, sit at one people are waiting at, or open it. */
export const tableAction = (t: HouseTable) => (t.summary?.phase === "finished" ? "See it" : t.seats.some((s) => s.name) && !t.started ? "Sit down" : "Open");
