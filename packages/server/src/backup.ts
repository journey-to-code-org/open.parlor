// Backups: copies of the card room's database (tables, houses, designs, everything in the sync
// log), made on a timer and kept beside it.
//
//   <dir>/cardroom-2026-11-14T09-30-00.db   one whole database, openable as it is
//
// A copy is SQLite's own (`VACUUM INTO`): a consistent snapshot taken while the server keeps
// playing, through a connection of its own. The newest few are kept and older ones deleted.
// To go back to one: stop the server, put the copy where CARDROOM_DB points, start it again.
//
// Copies kept on the same disk survive a bad deploy or a mistake, not the loss of the disk: the
// admin app (and `GET /moderation/backup`) hands one out to keep somewhere else.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

// Node's own SQLite, asked for by name at run time (bundlers and test runners that don't know the module yet leave this alone).
const sqlite = () => createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export interface BackupFile {
  name: string;
  /** Bytes. */
  size: number;
  /** When it was made. */
  at: number;
}

export interface BackupOptions {
  /** The database file (CARDROOM_DB). */
  db: string;
  /** Where the copies go. Default: `backups` beside the database. */
  dir?: string;
  /** How many copies to keep. Default 7. */
  keep?: number;
  /** Hours between copies. Default 24. */
  hours?: number;
  now?: () => number;
}

const NAME = /^cardroom-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})\.db$/;
const stamp = (at: number) => new Date(at).toISOString().slice(0, 19).replaceAll(":", "-");
const made = (name: string) => {
  const m = NAME.exec(name);
  return m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) : null;
};

export function createBackups({ db, dir = join(dirname(resolve(db)), "backups"), keep = 7, hours = 24, now = () => Date.now() }: BackupOptions) {
  const every = Math.max(1, hours) * 3_600_000;
  const kept = Math.max(1, Math.floor(keep));
  let timer: ReturnType<typeof setInterval> | null = null;
  let making: Promise<BackupFile> | null = null;

  /** The copies there are, newest first. */
  function list(): BackupFile[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .flatMap((name) => {
        const at = made(name);
        return at === null ? [] : [{ name, size: statSync(join(dir, name)).size, at }];
      })
      .sort((a, b) => b.at - a.at);
  }

  async function copy(): Promise<BackupFile> {
    mkdirSync(dir, { recursive: true });
    const at = now();
    const name = `cardroom-${stamp(at)}.db`;
    const target = join(dir, name);
    // Written under another name first: a copy cut short by a restart is never mistaken for a whole one.
    const partial = `${target}.partial`;
    rmSync(partial, { force: true });
    const { DatabaseSync } = sqlite();
    const source = new DatabaseSync(resolve(db), { readOnly: true });
    try {
      source.exec(`VACUUM INTO '${partial.replaceAll("'", "''")}'`);
    } finally {
      source.close();
    }
    rmSync(target, { force: true });
    renameSync(partial, target);
    for (const old of list().slice(kept)) rmSync(join(dir, old.name), { force: true });
    return { name, size: statSync(target).size, at };
  }

  /** Make a copy now (one at a time: a second ask while one is being made gets the same one). */
  function make(): Promise<BackupFile> {
    making ??= copy().finally(() => (making = null));
    return making;
  }

  /** Make a copy if the newest is older than the gap between them. */
  async function due(): Promise<BackupFile | null> {
    const newest = list()[0];
    if (newest && now() - newest.at < every) return null;
    return make();
  }

  return {
    dir,
    keep: kept,
    hours: every / 3_600_000,
    list,
    make,
    due,
    /** A copy's bytes, by its name in `list()`. */
    read: (name: string): Buffer | undefined => (NAME.test(name) && existsSync(join(dir, name)) ? readFileSync(join(dir, name)) : undefined),
    /** Keep making copies: one now if one is due, then whenever the next is. */
    start(report: (message: string) => void = console.log) {
      const attempt = () =>
        void due()
          .then((file) => file && report(`backup: ${file.name} (${Math.ceil(file.size / 1024)} KB) in ${dir}`))
          .catch((error) => report(`backup failed: ${(error as Error).message}`));
      attempt();
      // Looked at more often than copies are made, so a server that was off at the hour still catches up.
      timer = setInterval(attempt, Math.min(every, 3_600_000));
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

export type Backups = ReturnType<typeof createBackups>;
