// Choosing which kinds of game are kept for playing offline: the build sorts the app's files into
// a core and a pack for each kind (scripts/packs.mjs), and the service worker (public/sw.js) keeps
// the core and whichever packs the person has chosen. Until they choose, everything is kept.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error a build script, in plain JavaScript
import { closure, keptOffline, sortFiles } from "../scripts/packs.mjs";
import { PACKS, bytesKept, megabytes } from "../src/offline/choice";
import packs from "../src/offline/packs.json";

/** A small build: the page, a shared chunk, two tables, a 3-D scene one of them fetches, and a worker. */
const manifest = {
  "index.html": { file: "assets/index.js", isEntry: true, imports: ["_rules.js"], dynamicImports: ["src/a/ATable.tsx", "src/b/BTable.tsx", "src/home/Home.tsx"], css: ["assets/index.css"], assets: ["assets/bot.worker.js"] },
  "_rules.js": { file: "assets/rules.js" },
  "_shared.js": { file: "assets/shared.js", imports: ["_rules.js"] },
  "src/a/ATable.tsx": { file: "assets/ATable.js", isDynamicEntry: true, imports: ["_rules.js", "_shared.js"], css: ["assets/ATable.css"] },
  "src/b/BTable.tsx": { file: "assets/BTable.js", isDynamicEntry: true, imports: ["_shared.js"], dynamicImports: ["src/b/scene-gl.ts"], assets: ["assets/play.worker.js"] },
  "src/b/scene-gl.ts": { file: "assets/scene-gl.js", isDynamicEntry: true, imports: ["_three.js"] },
  "_three.js": { file: "assets/three.js" },
  "src/home/Home.tsx": { file: "assets/Home.js", isDynamicEntry: true, imports: ["_rules.js"] },
};
const files = ["index.html", "icons/icon.png", "assets/index.js", "assets/index.css", "assets/bot.worker.js", "assets/rules.js", "assets/shared.js", "assets/ATable.js", "assets/ATable.css", "assets/BTable.js", "assets/play.worker.js", "assets/scene-gl.js", "assets/three.js", "assets/Home.js", "assets/stray.js"];
const config = [
  { id: "a", entries: ["src/a/ATable.tsx"] },
  { id: "b", entries: ["src/b/BTable.tsx"] },
  { id: "3d", match: "-gl\\.ts$" },
];

describe("sorting the build into a core and packs", () => {
  it("follows what a chunk imports outright, with its styles and workers, and not what it fetches later", () => {
    expect(closure(manifest, "src/b/BTable.tsx").sort()).toEqual(["assets/BTable.js", "assets/play.worker.js", "assets/rules.js", "assets/shared.js"]);
    expect(closure(manifest, "nothing")).toEqual([]);
  });

  it("puts each screen's own files in its pack, what packs share in each of them, and everything else in the core", () => {
    const sorted = sortFiles(manifest, config, files);
    expect(sorted.packs.a).toEqual(["assets/ATable.css", "assets/ATable.js", "assets/shared.js"]);
    expect(sorted.packs.b).toEqual(["assets/BTable.js", "assets/play.worker.js", "assets/shared.js"]);
    expect(sorted.packs["3d"]).toEqual(["assets/scene-gl.js", "assets/three.js"]);
    // The page, the rules it imports, its worker, a screen no pack claims, files that aren't chunks, and a file nobody knows.
    expect(sorted.core).toEqual(["assets/Home.js", "assets/bot.worker.js", "assets/index.css", "assets/index.js", "assets/rules.js", "assets/stray.js", "icons/icon.png", "index.html"]);
    // Every file is somewhere, and nothing in the core is also in a pack.
    const packed = new Set(Object.values(sorted.packs).flat());
    expect(new Set([...sorted.core, ...packed])).toEqual(new Set(files));
    expect(sorted.core.filter((file: string) => packed.has(file))).toEqual([]);
  });

  it("refuses a pack that names a screen the build doesn't have, or has nothing in it", () => {
    expect(() => sortFiles(manifest, [{ id: "gone", entries: ["src/gone/Gone.tsx"] }], files)).toThrow(/gone/);
    expect(() => sortFiles(manifest, [{ id: "none", match: "nothing-like-this" }], files)).toThrow(/nothing in it/);
  });

  it("has a pack list whose every screen is a file in the app", () => {
    expect(new Set(packs.map((p) => p.id)).size).toBe(packs.length);
    for (const pack of packs) {
      expect(pack.name && pack.blurb, pack.id).toBeTruthy();
      for (const entry of (pack as { entries?: string[] }).entries ?? []) expect(() => readFileSync(new URL(`../${entry}`, import.meta.url)), entry).not.toThrow();
    }
    expect(PACKS.map((p) => p.id)).toEqual(packs.map((p) => p.id));
  });
});

describe("how much a choice keeps", () => {
  const status = { core: { bytes: 1000, kept: true }, sizes: { x: 100, y: 200, shared: 50 }, files: { a: ["x", "shared"], b: ["y", "shared"] } };
  it("counts the core, and a file two packs share once", () => {
    expect(bytesKept(status, { all: true, packs: [] })).toBe(1350);
    expect(bytesKept(status, { all: false, packs: [] })).toBe(1000);
    expect(bytesKept(status, { all: false, packs: ["a"] })).toBe(1150);
    expect(bytesKept(status, { all: false, packs: ["a", "b"] })).toBe(1350);
  });
  it("is said in megabytes, or kilobytes when it is small", () => {
    expect(megabytes(4.2 * 1024 * 1024)).toBe("4.2 MB");
    expect(megabytes(40 * 1024)).toBe("40 KB");
    expect(megabytes(10)).toBe("1 KB");
  });
});

// ---- The service worker, run here with a cache and a network of its own -----------------------
function worker(precache: object, network = true) {
  const stores = new Map<string, Map<string, Response>>();
  const fetched: string[] = [];
  const store = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name)!;
    const url = (r: Request | string) => (typeof r === "string" ? r : r.url);
    const add = async (r: Request | string) => {
      const reply = await fetch_(r);
      if (!reply.ok) throw new Error("not found");
      map.set(url(r), reply);
    };
    return { match: async (r: Request | string) => map.get(url(r))?.clone(), put: async (r: Request | string, reply: Response) => void map.set(url(r), reply), add, addAll: async (rs: (Request | string)[]) => void (await Promise.all(rs.map(add))), keys: async () => [...map.keys()].map((u) => ({ url: u })), delete: async (r: Request | string) => map.delete(url(r)) };
  };
  const state = { on: network };
  const fetch_ = async (r: Request | string) => {
    if (!state.on) throw new TypeError("offline");
    fetched.push(typeof r === "string" ? r : r.url);
    // A reply from the page's own address, as the worker expects of the app's files.
    const reply = new Response("file", { status: 200 });
    Object.defineProperty(reply, "type", { value: "basic" });
    reply.clone = () => reply;
    return reply;
  };
  const caches = { open: async (name: string) => store(name), keys: async () => [...stores.keys()], match: async (r: string) => [...stores.values()].map((m) => m.get(r)).find(Boolean)?.clone(), delete: async (name: string) => stores.delete(name) };
  const handlers: Record<string, ((event: any) => void)[]> = {};
  const self = { registration: { scope: "https://parlor.test/" }, addEventListener: (type: string, fn: (event: any) => void) => (handlers[type] ??= []).push(fn), skipWaiting: () => {}, clients: { claim: async () => {} } };
  const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8").replace(/^const PRECACHE = .*$/m, `const PRECACHE = ${JSON.stringify(precache)};`);
  new Function("self", "caches", "fetch", "location", "Response", "Request", "URL", source)(self, caches, fetch_, { origin: "https://parlor.test" }, Response, Request, URL);
  /** Fire an event at the worker and wait for everything it said it would do. */
  const fire = async (type: string, event: object = {}) => {
    const waits: Promise<unknown>[] = [];
    for (const fn of handlers[type] ?? []) fn({ waitUntil: (p: Promise<unknown>) => waits.push(p), ...event });
    await Promise.all(waits);
  };
  const say = async (data: unknown) => {
    const heard: any[] = [];
    await fire("message", { data, source: { postMessage: (m: unknown) => heard.push(m) } });
    return heard.at(-1)?.offlineStatus;
  };
  const kept = (name = `open-parlor-${(precache as { version: string }).version}`) => [...(stores.get(name)?.keys() ?? [])].map((u) => u.replace("https://parlor.test/", "")).sort();
  return { fire, say, kept, stores, fetched, state };
}

const build = { version: "v1", files: ["index.html", "assets/core.js", "assets/a.js", "assets/shared.js", "assets/b.js"], core: ["index.html", "assets/core.js"], packs: { a: ["assets/a.js", "assets/shared.js"], b: ["assets/b.js", "assets/shared.js"] }, sizes: { "index.html": 10, "assets/core.js": 1000, "assets/a.js": 100, "assets/shared.js": 50, "assets/b.js": 200 } };

describe("the service worker", () => {
  it("keeps everything until someone chooses, as it always did", async () => {
    const sw = worker(build);
    await sw.fire("install");
    expect(sw.kept()).toEqual([...build.files].sort());
    const status = await sw.say("offline-status?");
    expect(status.available).toBe(true);
    expect(status.choice).toEqual({ all: true, packs: [] });
    expect(status.core).toEqual({ bytes: 1010, kept: true });
    expect(status.packs).toEqual({ a: { bytes: 150, kept: true }, b: { bytes: 250, kept: true } });
  });

  it("drops what a choice leaves out, keeps what two packs share while either is kept, and fetches what is added back", async () => {
    const sw = worker(build);
    await sw.fire("install");
    let status = await sw.say({ type: "offline-choice", all: false, packs: ["a"] });
    expect(sw.kept()).toEqual(["assets/a.js", "assets/core.js", "assets/shared.js", "index.html"]);
    expect(status.choice).toEqual({ all: false, packs: ["a"] });
    expect(status.packs.b.kept).toBe(false);
    status = await sw.say({ type: "offline-choice", all: false, packs: [] });
    expect(sw.kept()).toEqual(["assets/core.js", "index.html"]);
    sw.fetched.length = 0;
    status = await sw.say({ type: "offline-choice", all: false, packs: ["b", "no such pack"] });
    expect(sw.kept()).toEqual(["assets/b.js", "assets/core.js", "assets/shared.js", "index.html"]);
    expect(sw.fetched.map((u) => u.replace("https://parlor.test/", "")).sort()).toEqual(["assets/b.js", "assets/shared.js"]);
    expect(status.choice.packs).toEqual(["b"]);
    status = await sw.say({ type: "offline-choice", all: true, packs: [] });
    expect(sw.kept()).toEqual([...build.files].sort());
  });

  it("remembers the choice for the next copy of the app, and takes it out of the older copy too", async () => {
    const old = worker(build);
    await old.fire("install");
    await old.say({ type: "offline-choice", all: false, packs: ["b"] });
    // A new build arrives: the same device, so the same caches.
    const next = { ...build, version: "v2" };
    const sw = worker(next);
    for (const [name, map] of old.stores) sw.stores.set(name, map);
    await sw.fire("install");
    expect(sw.kept("open-parlor-v2")).toEqual(["assets/b.js", "assets/core.js", "assets/shared.js", "index.html"]);
    await sw.say({ type: "offline-choice", all: false, packs: [] });
    expect(sw.kept("open-parlor-v2")).toEqual(["assets/core.js", "index.html"]);
    expect(sw.kept("open-parlor-v1")).toEqual(["assets/core.js", "index.html"]);
  });

  it("with no connection, drops at once and fetches what was added when it is next asked for", async () => {
    const sw = worker(build);
    await sw.fire("install");
    await sw.say({ type: "offline-choice", all: false, packs: [] });
    sw.state.on = false;
    const status = await sw.say({ type: "offline-choice", all: false, packs: ["a"] });
    expect(status.choice.packs).toEqual(["a"]);
    expect(status.packs.a.kept).toBe(false);
    expect(sw.kept()).toEqual(["assets/core.js", "index.html"]);
  });

  it("keeps a file it is asked for only if the choice wants it", async () => {
    const sw = worker(build);
    await sw.fire("install");
    await sw.say({ type: "offline-choice", all: false, packs: ["a"] });
    const ask = async (file: string) => {
      let reply: Promise<Response> | undefined;
      await sw.fire("fetch", { request: new Request(`https://parlor.test/${file}`), respondWith: (r: Promise<Response>) => (reply = r) });
      expect((await reply)?.ok).toBe(true);
      await new Promise((r) => setTimeout(r, 5));
    };
    // A game of a kind that isn't kept still plays while there is a connection, and isn't kept for it.
    await ask("assets/b.js");
    expect(sw.kept()).not.toContain("assets/b.js");
    // A file of the app the build's list doesn't have (an older page's) is kept, as before.
    await ask("assets/older.js");
    expect(sw.kept()).toContain("assets/older.js");
  });

  it("says nothing is to be had where no copy is kept at all", async () => {
    const sw = worker({ version: "dev", files: [], core: [], packs: {}, sizes: {} });
    await sw.fire("install");
    expect((await sw.say("offline-status?")).available).toBe(false);
    expect(await sw.say({ type: "offline-choice", all: false, packs: [] })).toBeUndefined();
  });
});

describe("what is never kept offline", () => {
  it("leaves out Forehead's face detector, which only an online game uses", () => {
    expect(["assets/vision_wasm_internal-Ab12.wasm", "assets/vision_wasm_internal-Cd34.js", "assets/vision_wasm_nosimd_internal-X.wasm", "assets/blaze-face-short-range-Ef56.tflite"].filter(keptOffline)).toEqual([]);
    expect(["assets/Forehead-Gh78.js", "assets/vision-Ij90.js", "index.html", "assets/quest.wasm"].filter(keptOffline)).toHaveLength(4);
  });
});
