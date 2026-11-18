// Road to the Shootout's pack: the host publishes one from the admin app, and takes it back.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { createPacks, MOST_BYTES, readPack } from "../src/packs.js";

const TOKEN = "let-grammi-in";

/** A pack file from named pieces. */
function pack(files: Record<string, string | Uint8Array>): Uint8Array {
  const words = new TextEncoder();
  const parts: number[] = [...words.encode("WPK1"), ...new Uint8Array(new Uint32Array([Object.keys(files).length]).buffer)];
  for (const [name, data] of Object.entries(files)) {
    const bytes = typeof data === "string" ? words.encode(data) : data;
    parts.push(...new Uint8Array(new Uint16Array([name.length]).buffer), ...words.encode(name), ...new Uint8Array(new Uint32Array([bytes.length]).buffer), ...bytes);
  }
  return new Uint8Array(parts);
}
const good = (name = "My Town") => pack({ "garage.pic": new Uint8Array([1, 0, 1, 0, 1, 0, 5, 0]), "pack.json": JSON.stringify({ name, start: { cash: 1, place: "a" }, cars: {}, places: {} }) });

let dirs: string[] = [];
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((c) => c.close());
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }));
  [open, dirs] = [[], []];
});

describe("telling a pack from something else", () => {
  it("reads the name a pack gives itself", () => {
    expect(readPack(good())).toEqual({ name: "My Town" });
    expect(readPack(good("<b>Road</b> to the Shootout!"))).toEqual({ name: "bRoadb to the Shootout!" });
  });
  it("says what is wrong with anything else", () => {
    const problem = (bytes: Uint8Array) => (readPack(bytes) as { problem: string }).problem;
    expect(problem(new Uint8Array([1, 2, 3]))).toMatch(/not a pack/);
    expect(problem(new TextEncoder().encode("WPK1 and then nothing much"))).toMatch(/ends early/);
    expect(problem(good().slice(0, -5))).toMatch(/ends early/);
    expect(problem(pack({ "readme.txt": "hello" }))).toMatch(/no pack\.json/);
    expect(problem(pack({ "pack.json": "{ not json" }))).toMatch(/not JSON/);
    expect(problem(pack({ "pack.json": JSON.stringify({ name: "Half", cars: {} }) }))).toMatch(/missing/);
    expect(problem(new Uint8Array(MOST_BYTES + 1))).toMatch(/MB/);
  });
});

describe("keeping the published pack", () => {
  it("keeps it on disk across a restart, and forgets it when asked", () => {
    const dir = mkdtempSync(join(tmpdir(), "packs-"));
    dirs.push(dir);
    const file = join(dir, "data", "shootout.pack");
    const packs = createPacks({ file, now: () => 5 });
    expect(packs.get()).toBeNull();
    expect(packs.set(new Uint8Array([9]))).toMatch(/not a pack/);
    expect(packs.get()).toBeNull();
    expect(packs.set(good())).toBeNull();
    expect(packs.get()).toMatchObject({ name: "My Town", at: 5 });
    expect(new Uint8Array(readFileSync(file))).toEqual(good());
    const again = createPacks({ file });
    expect(again.get()?.name).toBe("My Town");
    expect(again.get()?.bytes).toEqual(good());
    again.clear();
    expect(createPacks({ file }).get()).toBeNull();
  });
});

describe("the admin publishes a pack", () => {
  function setup() {
    const packs = createPacks();
    const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 1, talk: false, adminToken: TOKEN, packs });
    open.push(app);
    const admin = async (path: string, body?: Uint8Array | null, token: string | null = TOKEN) => {
      const r = (await app.fetch(new Request(`http://test/moderation${path}`, { method: body !== undefined ? "POST" : "GET", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/octet-stream" } : {}) }, body: body ?? undefined })))!;
      return { status: r.status, body: (await r.json()) as { published?: { name: string; size: number; at: number } | null; error?: string; log?: { action: string; target: string }[] } };
    };
    return { packs, admin };
  }

  it("says there is none, takes one, and goes back", async () => {
    const { packs, admin } = setup();
    expect((await admin("/shootout")).body).toEqual({ published: null });
    const sent = await admin("/shootout/pack", good());
    expect(sent.status).toBe(200);
    expect(sent.body.published).toMatchObject({ name: "My Town", size: good().length });
    expect(packs.get()?.bytes).toEqual(good());
    expect((await admin("/shootout")).body.published?.name).toBe("My Town");
    expect((await admin("/shootout/reset", null)).body).toEqual({ published: null });
    expect(packs.get()).toBeNull();
    const log = (await admin("/log")).body.log!.map((entry) => `${entry.action}: ${entry.target}`);
    expect(log).toEqual(["Went back to the built-in Road to the Shootout: My Town", "Published a Road to the Shootout pack: My Town"]);
  });

  it("turns away what is not a pack, and anyone who is not the admin", async () => {
    const { packs, admin } = setup();
    const bad = await admin("/shootout/pack", new TextEncoder().encode("nope"));
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/not a pack/);
    expect((await admin("/shootout/pack", good(), "guess")).status).toBe(401);
    expect((await admin("/shootout/pack", good(), null)).status).toBe(401);
    expect((await admin("/shootout", undefined, null)).status).toBe(401);
    expect(packs.get()).toBeNull();
    expect((await admin("/shootout/elsewhere", null)).status).toBe(404);
  });
});
