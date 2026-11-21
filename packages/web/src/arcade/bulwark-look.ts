// How Tower of Ryan is drawn. None of this is the game: creeps still walk the road the game laid,
// and a shell still lands where it lands. The host can change the look from the admin app
// (packages/server/src/tunables.ts); what is saved there is laid over the numbers in bulwark-look.json.
import file from "./bulwark-look.json";

export type BlastStyle = "embers" | "blast" | "inferno";

export interface BulwarkLook {
  /** 0 keeps the road's square corners. 100 bends them and lets the edges wander. */
  roadBend: number;
  /** Puffs of smoke a blast leaves behind. */
  smokePuffs: number;
  /** embers is a few sparks. blast and inferno are fire, smoke and a ring of air. */
  blast: BlastStyle;
}

const BLASTS: readonly BlastStyle[] = ["embers", "blast", "inferno"];

function whole(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

/** The look shipped with the game, with `over` (what the host saved) laid on top. */
export function readBulwarkLook(over: unknown): BulwarkLook {
  const saved = over && typeof over === "object" ? (over as Record<string, unknown>) : {};
  const own = file as Record<string, unknown>;
  const blast = saved.blast ?? own.blast;
  return {
    roadBend: whole(saved.roadBend ?? own.roadBend, 72, 0, 100),
    smokePuffs: whole(saved.smokePuffs ?? own.smokePuffs, 6, 0, 12),
    blast: BLASTS.includes(blast as BlastStyle) ? (blast as BlastStyle) : "blast",
  };
}

let current = readBulwarkLook(undefined);
let loading: Promise<void> | null = null;

/** The look to draw with right now. */
export function bulwarkLook(): BulwarkLook {
  return current;
}

/** Ask the server what the host saved. Until it answers, the game uses its own look. */
export function loadBulwarkLook(): Promise<void> {
  if (typeof fetch !== "function") return Promise.resolve();
  loading ??= fetch("/tunables/bulwark", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { values?: unknown } | null) => {
      current = readBulwarkLook(body?.values);
    })
    .catch(() => undefined);
  return loading;
}
