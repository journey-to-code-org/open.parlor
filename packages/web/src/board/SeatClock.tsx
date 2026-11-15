// A clock that is part of the game (a chess clock), shown at each seat. The engine's view says how
// much time each side had when the last move was made and which clock is running; the table knows
// when that move was made, by the server's clock, and counts the running one down from there. So
// two phones, each with its own idea of the time of day, show the same clocks.
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { clockWords } from "../TurnClock";

/**
 * When the last move at this table was made, and what time it is now, both by the clock of
 * whoever keeps the game's time (the server for a family table, this browser in practice). `since`
 * is null when that isn't known (yet): a running clock then holds still instead of guessing.
 */
export const TableTime = createContext<{ since: number | null; now: () => number }>({ since: null, now: Date.now });

/** "1:30", "0:07.4" in the last ten seconds, "1:05:00", "23h" for a correspondence game. */
export function seatClockText(ms: number): string {
  if (ms >= 2 * 3_600_000) return `${Math.ceil(ms / 3_600_000)}h`;
  if (ms < 10_000) return `0:0${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}`;
  const s = Math.ceil(ms / 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`;
}

export function SeatClock({ clock, mine }: { clock: { ms: number; running: boolean }; mine: boolean }) {
  const { since, now } = useContext(TableTime);
  const left = () => (clock.running && since !== null ? Math.max(0, clock.ms - Math.max(0, now() - since)) : null);
  // What was last shown, to hold on to while it isn't known when the running clock started.
  const shown = useRef(clock.ms);
  const [, tick] = useState(0);
  const value = clock.running ? (left() ?? Math.min(shown.current, clock.ms)) : clock.ms;
  shown.current = value;
  useEffect(() => {
    if (!clock.running || since === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const again = () => {
      tick((n) => n + 1);
      const ms = left() ?? 0;
      // Tenths in the last ten seconds, and otherwise on the second as it turns.
      if (ms > 0) timer = setTimeout(again, ms < 10_000 ? 100 : ms > 2 * 3_600_000 ? 60_000 : (ms % 1000) + 20);
    };
    again();
    return () => clearTimeout(timer);
  }, [clock.running, clock.ms, since, now]);
  const low = value < 20_000;
  return (
    <span
      className={`seat-clock${clock.running ? " running" : ""}${low ? " low" : ""}`}
      // When this clock runs out, for the table's own countdown to know it needn't draw a second one.
      data-until={clock.running && since !== null ? Math.round(since + clock.ms) : undefined}
      role="timer"
      aria-label={`${mine ? "Your clock" : "Their clock"}: ${clockWords(value)}${clock.running ? ", running" : ""}`}
    >
      {seatClockText(value)}
    </span>
  );
}
