// What is kept on this device for playing offline, and choosing it. The service worker
// (public/sw.js) does the keeping: the core of the app always, and a pack for each kind of game
// (offline/packs.json), which the person can keep or leave. This is the page's side: asking the
// worker what is kept, and telling it what to keep.
import PACK_LIST from "./packs.json";

export interface Pack {
  id: string;
  name: string;
  blurb: string;
}
/** The packs, in the order they are offered. */
export const PACKS: Pack[] = PACK_LIST.map(({ id, name, blurb }) => ({ id, name, blurb }));

/** What to keep: everything, or the core and these packs. */
export interface OfflineChoice {
  all: boolean;
  packs: string[];
}

export interface OfflineStatus {
  /** False where no copy is kept at all (the dev server, a page not served over https). */
  available: boolean;
  choice: OfflineChoice;
  /** The size of the core and of each pack, and whether all of it is on this device now. */
  core: { bytes: number; kept: boolean };
  packs: Record<string, { bytes: number; kept: boolean }>;
  /** Every file's size, and which files each pack is made of: packs can share a file. */
  sizes: Record<string, number>;
  files: Record<string, string[]>;
}

/** Say something to the service worker and wait for what it says is kept. Null where there is no worker, or it doesn't answer. */
async function ask(message: unknown, wait: number): Promise<OfflineStatus | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const registration = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))]);
  const worker = registration?.active;
  if (!worker) return null;
  return new Promise((resolve) => {
    const done = (answer: OfflineStatus | null) => {
      navigator.serviceWorker.removeEventListener("message", heard);
      clearTimeout(timer);
      resolve(answer);
    };
    const heard = (event: MessageEvent) => {
      if (event.data && typeof event.data.offlineStatus === "object") done(event.data.offlineStatus as OfflineStatus);
    };
    const timer = setTimeout(() => done(null), wait);
    navigator.serviceWorker.addEventListener("message", heard);
    worker.postMessage(message);
  });
}

/** What is kept on this device now. */
export const offlineStatus = () => ask("offline-status?", 4000);
/** Keep this and no more. It answers once the worker has fetched what was added (which can take a while on a slow connection). */
export const chooseOffline = (choice: OfflineChoice) => ask({ type: "offline-choice", ...choice }, 120_000);

/** How much a choice keeps on the device: the core, and each chosen pack's files counted once however many packs share them. */
export function bytesKept(status: Pick<OfflineStatus, "core" | "sizes" | "files">, choice: OfflineChoice): number {
  const files = new Set<string>();
  for (const [id, list] of Object.entries(status.files)) if (choice.all || choice.packs.includes(id)) for (const file of list) files.add(file);
  let bytes = status.core.bytes;
  for (const file of files) bytes += status.sizes[file] ?? 0;
  return bytes;
}

/** "4.2 MB", or for something small, "80 KB". */
export const megabytes = (bytes: number) => (bytes < 95_000 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
