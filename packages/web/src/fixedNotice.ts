// "The problem you reported was fixed": the page's half. Each report this browser sends is
// remembered by its issue number; now and then the page asks the server which of them have been
// closed as fixed (GET /bugs/fixed, server/src/bugs.ts), and says so once for each.
//
// Kept in this browser only, like everything else about a player here: the server knows an issue
// was asked about, not who asked.

const KEY = "parlor.reported";
/** A report not fixed in this long is let go: it's unlikely the person is still waiting to hear. */
export const REPORT_KEPT_MS = 180 * 24 * 60 * 60_000;
/** The most asked about at once (the server takes ten). */
const ASKED = 10;

interface Reported {
  /** The issue's number. */
  n: number;
  /** When it was sent (ms). */
  at: number;
}

function load(now = Date.now()): Reported[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((r): r is Reported => !!r && Number.isInteger(r.n) && r.n > 0 && typeof r.at === "number" && now - r.at < REPORT_KEPT_MS);
  } catch {
    return [];
  }
}
function save(list: Reported[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: they won't hear about the fix, which is how it was before */
  }
}

/** Remember a report this browser sent, to hear when it's fixed. */
export function rememberReport(number: number, now = Date.now()) {
  if (!Number.isInteger(number) || number <= 0) return;
  save([...load(now).filter((r) => r.n !== number), { n: number, at: now }]);
}

/** The reports still waiting to hear about, newest first. */
export const waiting = (now = Date.now()): number[] => load(now).sort((a, b) => b.at - a.at).map((r) => r.n);

/** Told about these: they're let go. */
export function told(numbers: number[], now = Date.now()) {
  const done = new Set(numbers);
  save(load(now).filter((r) => !done.has(r.n)));
}

export interface Fixed {
  number: number;
  title: string;
}

/**
 * Which of this browser's reports have been fixed. An empty list when there are none waiting, when
 * this copy of the parlor has no server (GitHub Pages), or when it can't be reached: it's asked again
 * next time.
 */
export async function lookForFixes(get: typeof fetch = fetch): Promise<Fixed[]> {
  const asked = waiting().slice(0, ASKED);
  if (!asked.length) return [];
  try {
    const answer = await get(`/bugs/fixed?n=${asked.join(",")}`, { credentials: "same-origin" });
    if (!answer.ok) return [];
    const { fixed } = (await answer.json()) as { fixed?: Fixed[] };
    return Array.isArray(fixed) ? fixed.filter((f) => asked.includes(f.number) && typeof f.title === "string") : [];
  } catch {
    return [];
  }
}
