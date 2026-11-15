import { sqliteLog } from "@zubra/sync/sqlite";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { createBackups } from "../src/backup.js";

const BASE = "http://test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((c) => c.close());
  open = [];
});

async function setup(options: { keep?: number; hours?: number } = {}) {
  const folder = mkdtempSync(join(tmpdir(), "cardroom-backup-"));
  const db = join(folder, "spades.db");
  let at = Date.UTC(2026, 10, 14, 9, 30, 0);
  const clock = { now: () => at, forward: (hours: number) => (at += hours * 3_600_000) };
  const backups = createBackups({ db, now: clock.now, ...options });
  const app = createCardRoom({ log: await sqliteLog(db, { keep: "latest" }), botDelay: 5, adminToken: "host-token", backups });
  open.push(app);
  const send = async (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined })))!;
  const admin = (path: string) => send(`/moderation${path}`, undefined, { authorization: "Bearer host-token" });
  return { folder, db, backups, clock, send, admin };
}

/** What a copy holds, read as its own database. */
async function housesIn(file: string): Promise<string> {
  const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
  const copy = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = copy.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[];
    return JSON.stringify(tables.map((t) => copy.prepare(`select * from "${t.name}"`).all()));
  } finally {
    copy.close();
  }
}

describe("backups", () => {
  it("a copy is a whole database of its own, taken while the card room is open", async () => {
    const { folder, backups, send } = await setup();
    await send("/houses", { name: "Grammi's House", you: "brokennil" });
    expect(backups.list()).toEqual([]);
    const file = await backups.make();
    expect(file).toMatchObject({ name: "cardroom-2026-11-14T09-30-00.db", at: Date.UTC(2026, 10, 14, 9, 30, 0) });
    expect(file.size).toBeGreaterThan(1000);
    expect(readdirSync(join(folder, "backups"))).toEqual([file.name]);
    expect(await housesIn(join(folder, "backups", file.name))).toContain("Grammi's House");
    // What happens afterwards isn't in it.
    await send("/houses", { name: "Rick's Garage", you: "Pappy" });
    expect(await housesIn(join(folder, "backups", file.name))).not.toContain("Rick's Garage");
  });

  it("one is made when the newest is old enough, and only the newest few are kept", async () => {
    const { folder, backups, clock } = await setup({ keep: 3, hours: 24 });
    expect((await backups.due())?.name).toBe("cardroom-2026-11-14T09-30-00.db");
    clock.forward(23);
    expect(await backups.due()).toBeNull();
    for (let day = 0; day < 4; day++) {
      clock.forward(24);
      expect(await backups.due()).not.toBeNull();
    }
    expect(backups.list().map((f) => f.name)).toEqual(["cardroom-2026-11-19T08-30-00.db", "cardroom-2026-11-18T08-30-00.db", "cardroom-2026-11-17T08-30-00.db"]);
    // Other files in the folder are nobody's backup: never listed, read or deleted.
    writeFileSync(join(folder, "backups", "notes.txt"), "mine");
    writeFileSync(join(folder, "backups", "cardroom-2026-11-20T08-30-00.db.partial"), "cut short");
    expect(backups.list()).toHaveLength(3);
    expect(backups.read("notes.txt")).toBeUndefined();
    expect(backups.read("../spades.db")).toBeUndefined();
    clock.forward(24);
    await backups.due();
    expect(readdirSync(join(folder, "backups"))).toContain("notes.txt");
  });

  it("the host sees when the last one was made, and takes a fresh one away", async () => {
    const { backups, send, admin } = await setup();
    await send("/houses", { name: "Grammi's House", you: "brokennil" });
    expect((await (await admin("/overview")).json()).backups).toEqual({ latest: null, kept: 0, keep: 7, hours: 24 });
    expect((await send("/moderation/backup")).status).toBe(401);

    const response = await admin("/backup");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="cardroom-2026-11-14T09-30-00.db"');
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 15).toString()).toBe("SQLite format 3");
    const taken = join(mkdtempSync(join(tmpdir(), "cardroom-taken-")), "copy.db");
    writeFileSync(taken, bytes);
    expect(await housesIn(taken)).toContain("Grammi's House");

    const overview = await (await admin("/overview")).json();
    expect(overview.backups).toMatchObject({ kept: 1, latest: { name: "cardroom-2026-11-14T09-30-00.db", size: bytes.length } });
    expect((await (await admin("/log")).json()).log[0]).toMatchObject({ action: "Downloaded a backup", target: "cardroom-2026-11-14T09-30-00.db" });
    expect(backups.list()).toHaveLength(1);
  });

  it("a card room that keeps nothing on disk has nothing to copy", async () => {
    const app = createCardRoom({ adminToken: "host-token" });
    open.push(app);
    const admin = async (path: string) => (await app.fetch(new Request(`${BASE}/moderation${path}`, { headers: { authorization: "Bearer host-token" } })))!;
    expect((await (await admin("/overview")).json()).backups).toBeNull();
    expect((await admin("/backup")).status).toBe(404);
  });
});
