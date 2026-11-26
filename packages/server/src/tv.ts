// A television as the table, and the phones in the room as the controllers (docs/TV.md).
//
// A television can't run the web app: a Roku has no browser, only its own language for drawing
// screens. So it doesn't sit at a table. It opens one, shows a QR code for the phones to join by,
// and then follows the table's watch view over plain HTTP, the only thing every television can do.
// The phones play at the table exactly as they would anywhere else: the link is the table's own.
//
//   GET  /tv/games                  → the games a television can show, with their rules and seats
//   POST /tv/tables {game,seats,rules} → a new table: { id, token, code, join }
//   GET  /tv/tables/:id?token&after → the table as the television draws it; waits until it isn't `after`
//   GET  /tv/tables/:id/qr.png      → the join link as a QR code
//   POST /tv/tables/:id/start {token,fill} → deal, with computer players in the empty seats if `fill`
//   GET  /tv/ABCD                   → a phone typing the short code is sent to the table
//
// What the television sees is the watch view (nobody's hand, nobody's answer before it is shown),
// read here on the server, so the host switching watching off for people's tables doesn't blank a
// television that opened its own. The token proves it did; it is kept in a collection pages can't read.
import { kitGame } from "@journey-to-code/games";
import { pickPersonas } from "@journey-to-code/rules";
import type { RoomDoc } from "@journey-to-code/rooms/server";
import { loadQr } from "@journey-to-code/symbology";
import { createHash, randomBytes } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import type { Catalogue } from "./catalogue.js";
import { gameEmoji, gameName, type GameId } from "./games.js";
import { kitOptions } from "./kit.js";
import { standing } from "./spectate.js";
import { Picture, rgb } from "./paint.js";
import { CANVAS_COLORS, CANVAS_SIZES } from "@journey-to-code/games";

interface Docs {
  get(collection: string, key: string): Record<string, unknown> | undefined;
}
interface Rooms {
  sync: { documents(): Promise<Docs>; write(collection: string, key: string, fields: Record<string, unknown>): Promise<unknown> };
  create(options: unknown, settings?: unknown): Promise<string>;
  room(id: string): Promise<RoomDoc<unknown> | undefined>;
  holders(id: string): Promise<(string | null)[]>;
  seatBot(id: string, seat: number, name: string): Promise<void>;
  start(id: string): Promise<string | null>;
}

/** The games a television can show, each with the way its board is drawn there. */
export const TV_GAMES: GameId[] = ["readtheroom", "telephone"] as GameId[];

/** Letters nobody misreads across a room: no vowels (no words), no I, O or 0. */
const LETTERS = "BCDFGHJKLMNPQRSTVWXZ";
const LONG_POLL_MS = 20_000;
const POLL_STEP_MS = 150;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// ---------------------------------------------------------------------------------------------
// What the television draws. A television's language is slow at reshaping JSON, so the server
// hands it the screen almost as it is drawn: names in place of {seat}, one list of players.

type Any = Record<string, unknown>;
const named = (text: unknown, names: string[]) => String(text ?? "").replace(/\{(\d+)\}/g, (_, seat) => names[Number(seat)] ?? `Player ${Number(seat) + 1}`);
const seatScores = (view: Any, seats: number): number[] => {
  const out = Array.from({ length: seats }, () => 0);
  for (const side of (view.scores as { seats: number[]; value: number }[] | undefined) ?? []) for (const s of side.seats) out[s] = side.value;
  return out;
};

export interface TvScreen {
  /** Which of the television's layouts: waiting for players, a question, the room's answer, the end, a plain scoreboard, or Pass the Picture's. */
  layout: "lobby" | "question" | "room" | "over" | "scores" | "pass";
  title: string;
  count: string;
  question: string;
  players: { name: string; done: boolean; score: number; gained: number; bot: boolean }[];
  headline: string;
  bars: { label: string; value: number; best: boolean }[];
  /** The bars' full length: 100 for a scale, else the biggest bar. */
  max: number;
  unit: string;
  narration: string;
  /** Pass the Picture: where the chains are, and the one being turned over. */
  pass?: PassScreen;
}

/** One step of a chain on the television: words, or a drawing the server paints (its picture's address). */
export interface PassItem {
  who: string;
  verb: string;
  text: string;
  img: string;
}
export interface PassScreen {
  phase: "play" | "reveal" | "over";
  step: number;
  steps: number;
  /** "Write", "Draw" or "Guess", for each step of a chain. */
  kinds: string[];
  chain: null | { owner: string; index: number; of: number; length: number; shown: number; done: boolean; prev: PassItem | null; last: PassItem | null; first: string; end: string };
}

/** Pass the Picture's watch view, as the television draws it. Nothing secret is in it: what each phone is drawing or guessing stays on the phone. */
function passThePicture(view: Any, names: string[], seats: RoomDoc<unknown>["seats"], drawing: (owner: number, k: number) => string): TvScreen {
  const info = (view.info as string[] | undefined) ?? [];
  const at = info.map((l) => /^Step (\d+) of (\d+)$/.exec(l)).find(Boolean);
  const chain = (view.chain as { owner: number; index: number; of: number; length: number; steps: { by: number; text?: string; strokes?: unknown[] }[] } | null | undefined) ?? null;
  const steps = at ? Number(at[2]) : (chain?.length ?? 0);
  const item = (k: number): PassItem | null => {
    const st = chain?.steps[k];
    if (!chain || !st) return null;
    const who = names[st.by] ?? `Player ${st.by + 1}`;
    if (st.text !== undefined) return { who, verb: k === 0 ? "wrote" : "thought it was", text: st.text, img: "" };
    return { who, verb: "drew", text: "", img: drawing(chain.owner, k) };
  };
  const shown = chain?.steps.length ?? 0;
  const texts = (chain?.steps ?? []).filter((x) => x.text !== undefined).map((x) => x.text!);
  const phase = view.over ? "over" : chain ? "reveal" : "play";
  return {
    layout: "pass",
    title: gameName("telephone" as GameId),
    count: phase === "play" && at ? `Step ${at[1]} of ${at[2]}` : chain ? `Chain ${chain.index} of ${chain.of}` : "",
    question: "",
    players: ((view.players as { done?: boolean; line?: string }[] | undefined) ?? []).map((p, seat) => ({ name: names[seat] ?? `Player ${seat + 1}`, done: !!p.done, score: 0, gained: 0, bot: !!seats[seat]?.bot })),
    headline: "",
    bars: [],
    max: 1,
    unit: "",
    narration: named(view.narration, names),
    pass: {
      phase,
      step: at ? Number(at[1]) : 0,
      steps,
      kinds: Array.from({ length: steps }, (_, i) => (i === 0 ? "Write" : i % 2 === 1 ? "Draw" : "Guess")),
      chain: chain
        ? { owner: names[chain.owner] ?? `Player ${chain.owner + 1}`, index: chain.index, of: chain.of, length: chain.length, shown, done: shown >= chain.length, prev: item(shown - 2), last: item(shown - 1), first: texts[0] ?? "", end: texts[texts.length - 1] ?? "" }
        : null,
    },
  };
}

/** Read the Room's watch view, as the television draws it. */
function readTheRoom(view: Any, names: string[], seats: RoomDoc<unknown>["seats"]): TvScreen {
  const room = (view.room as Any | null | undefined) ?? null;
  const over = view.over as { winners: number[]; title: string } | null;
  const scores = seatScores(view, names.length);
  const gained = (room?.gained as number[] | undefined) ?? [];
  const bars = ((room?.bars as { label: string; value: number; best?: boolean }[] | undefined) ?? []).map((b) => ({ label: named(b.label, names), value: b.value, best: !!b.best }));
  const kind = String(room?.kind ?? "");
  return {
    layout: over ? "over" : room ? "room" : "question",
    title: over ? named(over.title, names) : gameName("readtheroom" as GameId),
    count: String((view.info as string[] | undefined)?.[0] ?? ""),
    question: String(view.question ?? room?.prompt ?? ""),
    players: ((view.players as { done?: boolean }[] | undefined) ?? []).map((p, seat) => ({ name: names[seat] ?? `Player ${seat + 1}`, done: !!p.done, score: scores[seat] ?? 0, gained: gained[seat] ?? 0, bot: !!seats[seat]?.bot })),
    headline: named(room?.headline, names),
    bars,
    max: kind === "scale" ? 100 : Math.max(1, ...bars.map((b) => b.value)),
    unit: kind === "caption" ? " ★" : kind === "vote" ? " voted" : kind === "scale" ? "" : " said so",
    narration: named(view.narration, names),
  };
}

/** The screen for any game, from its watch view: its own layout where it has one, else the scores. */
export function tvScreen(game: GameId, view: unknown, room: RoomDoc<unknown>, drawing: (owner: number, k: number) => string = () => ""): TvScreen {
  const names = room.seats.map((s, i) => s.name ?? `Player ${i + 1}`);
  const base: TvScreen = { layout: "lobby", title: gameName(game), count: "", question: "", players: room.seats.map((s, i) => ({ name: s.name ?? "", done: !!s.name, score: 0, gained: 0, bot: s.bot })), headline: "", bars: [], max: 1, unit: "", narration: "" };
  if (!room.started || !view) return base;
  if (game === "readtheroom") return readTheRoom(view as Any, names, room.seats);
  if (game === "telephone") return passThePicture(view as Any, names, room.seats, drawing);
  const v = view as Any;
  const scores = seatScores(v, names.length);
  return { ...base, layout: v.over ? "over" : "scores", count: standing(room.summary, names), players: names.map((name, i) => ({ name, done: false, score: scores[i] ?? 0, gained: 0, bot: !!room.seats[i]?.bot })), narration: named(v.narration, names) };
}

/** A drawing from a drawing game (points 0 to 1000 across a square page), painted `px` pixels a side. */
export function paintDrawing(strokes: { points: number[]; color: number; size: number }[], px: number): Picture {
  const pic = new Picture(px, px, [255, 255, 255]);
  const k = px / 1000;
  for (const st of strokes) {
    const c = rgb(CANVAS_COLORS[st.color] ?? "#1d1a16");
    const w = Math.max(2, (CANVAS_SIZES[st.size] ?? 10) * k);
    const p = st.points;
    if (p.length === 2) pic.circle(p[0]! * k, p[1]! * k, w / 2, c);
    for (let i = 2; i + 1 < p.length; i += 2) pic.line(p[i - 2]! * k, p[i - 1]! * k, p[i]! * k, p[i + 1]! * k, w, c);
  }
  return pic;
}

// ---------------------------------------------------------------------------------------------
// A QR code as a PNG: black and white, eight bits a pixel, a few pixels a module. The television
// shows it as a picture it fetches like any other.

const qr = await loadQr();

export function qrPng(text: string, scale = 10, quiet = 4): Buffer {
  const code = qr.encode(text);
  const side = (code.size + quiet * 2) * scale;
  const raw = Buffer.alloc((side + 1) * side, 255);
  for (let y = 0; y < side; y++) {
    raw[y * (side + 1)] = 0; // no filter on this row
    const row = Math.floor(y / scale) - quiet;
    for (let x = 0; x < side; x++) {
      const col = Math.floor(x / scale) - quiet;
      if (row >= 0 && col >= 0 && row < code.size && col < code.size && code.modules[row * code.size + col] === 1) raw[y * (side + 1) + 1 + x] = 0;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------------------------

/**
 * A post's fields, from its body, or from its address when the body is missing: a television that
 * was sent from http:// on to https:// can arrive with its body lost on the way.
 */
async function inputOf(request: Request, url: URL): Promise<Any> {
  const body = ((await request.json().catch(() => null)) ?? null) as Any | null;
  if (body && typeof body === "object" && Object.keys(body).length) return body;
  const query: Any = Object.fromEntries(url.searchParams);
  if (query.fill !== undefined) query.fill = query.fill === "1" || query.fill === "true";
  return query;
}

export function createTv(rooms: Rooms, catalogue: Catalogue, { origin, wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), longPoll = LONG_POLL_MS }: { origin: (request: Request) => string; wait?: (ms: number) => Promise<void>; longPoll?: number }) {
  const docs = rooms.sync.documents();

  const tvOf = async (id: string) => (await docs).get("tv", `table/${id}`) as { token: string; code: string; game: GameId } | undefined;
  const joinLink = (request: Request, id: string) => `${origin(request)}/?table=${encodeURIComponent(id)}`;

  async function newCode(id: string): Promise<string> {
    const view = await docs;
    for (let tries = 0; tries < 50; tries++) {
      const bytes = randomBytes(4);
      const code = Array.from(bytes, (b) => LETTERS[b % LETTERS.length]).join("");
      if (view.get("tv", `code/${code}`)) continue;
      await rooms.sync.write("tv", `code/${code}`, { id });
      return code;
    }
    throw new Error("No codes left.");
  }

  /** Where the table stands, in a few characters: it changes whenever the room or its watch view does. */
  async function stamp(id: string) {
    const view = await docs;
    return createHash("sha1").update(JSON.stringify([view.get("rooms", id) ?? null, view.get("views", `${id}/watch`) ?? null])).digest("base64url").slice(0, 12);
  }

  async function games() {
    const list = [];
    for (const id of TV_GAMES) {
      if (!(await catalogue.isOn(id))) continue;
      const game = kitGame(id)!;
      list.push({ id, name: gameName(id), emoji: gameEmoji(id), seats: game.seats, rules: game.presets.map((p) => ({ id: p.id, name: p.name })) });
    }
    return list;
  }

  async function handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // ["tv", ...]
    if (parts[0] !== "tv") return null;

    // Someone typing the address the television shows, before the code: the parlor itself.
    if (parts.length === 1 && request.method === "GET") return new Response(null, { status: 302, headers: { location: "/" } });

    if (parts.length === 2 && parts[1] === "games" && request.method === "GET") return json({ games: await games() });

    // A phone that typed the code the television shows.
    if (parts.length === 2 && /^[A-Za-z]{4}$/.test(parts[1]!) && request.method === "GET") {
      const found = (await docs).get("tv", `code/${parts[1]!.toUpperCase()}`) as { id?: string } | undefined;
      if (!found?.id) return new Response("No table has that code. Check the television.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
      return new Response(null, { status: 302, headers: { location: `/?table=${encodeURIComponent(found.id)}` } });
    }

    if (parts[1] !== "tables") return json({ error: "Not found" }, 404);

    // POST /tv/tables → a new table for the room
    if (parts.length === 2 && request.method === "POST") {
      const input = await inputOf(request, url);
      const game = String(input.game ?? "") as GameId;
      if (!TV_GAMES.includes(game) || !kitGame(game)) return json({ error: "That game isn't on the television yet." }, 400);
      if (!(await catalogue.isOn(game))) return json({ error: `${gameName(game)} is switched off in this parlor.` }, 403);
      const kit = kitGame(game)!;
      const preset = kit.presets.find((p) => p.id === input.rules) ?? kit.presets[0];
      const id = await rooms.create(kitOptions(kit, preset, input.seats));
      const token = randomBytes(18).toString("base64url");
      const code = await newCode(id);
      await rooms.sync.write("tv", `table/${id}`, { token, code, game });
      const host = origin(request);
      return json({ id, token, code, join: joinLink(request, id), short: `${host}/tv/${code}`, host: host.replace(/^https?:\/\//, "") }, 201);
    }

    const id = parts[2];
    if (!id) return json({ error: "Not found" }, 404);
    const tv = await tvOf(id);
    if (!tv) return json({ error: "No such table." }, 404);

    // The QR code is only the join link, which is for anyone in the room: no token needed.
    if (parts[3] === "qr.png" && request.method === "GET") {
      return new Response(new Uint8Array(qrPng(joinLink(request, id))), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
    }

    const input = request.method === "POST" ? await inputOf(request, url) : {};
    const token = input.token ?? url.searchParams.get("token");
    if (token !== tv.token) return json({ error: "This isn't your table." }, 403);

    // GET /tv/tables/:id/drawing.png?c&k → a drawing of the chain being turned over, painted for the television
    if (parts[3] === "drawing.png" && request.method === "GET") {
      const watch = (await docs).get("views", `${id}/watch`) as { view?: { chain?: { owner: number; steps: { strokes?: { points: number[]; color: number; size: number }[] }[] } | null } } | undefined;
      const chain = watch?.view?.chain;
      const k = Number(url.searchParams.get("k"));
      const strokes = chain && chain.owner === Number(url.searchParams.get("c")) ? chain.steps[k]?.strokes : undefined;
      if (!strokes) return json({ error: "No such drawing." }, 404);
      return new Response(new Uint8Array(paintDrawing(strokes, 640).png()), { headers: { "content-type": "image/png", "cache-control": "private, max-age=86400" } });
    }

    // GET /tv/tables/:id?after=<stamp> → the screen, once it differs from `after` (or after a while, as it is)
    if (parts.length === 3 && request.method === "GET") {
      const after = url.searchParams.get("after");
      const until = Date.now() + longPoll;
      let now = await stamp(id);
      while (now === after && Date.now() < until) {
        await wait(POLL_STEP_MS);
        now = await stamp(id);
      }
      const room = await rooms.room(id);
      if (!room) return json({ error: "No such table." }, 404);
      const watch = (await docs).get("views", `${id}/watch`) as { view?: unknown } | undefined;
      const host = origin(request);
      return json({
        stamp: now,
        started: room.started,
        closed: room.closed ?? null,
        code: tv.code,
        join: joinLink(request, id),
        short: `${host}/tv/${tv.code}`,
        host: host.replace(/^https?:\/\//, ""),
        free: room.seats.filter((s) => !s.name).length,
        screen: tvScreen(tv.game, room.started ? (watch?.view ?? null) : null, room, (owner, k) => `/tv/tables/${encodeURIComponent(id)}/drawing.png?token=${encodeURIComponent(tv.token)}&c=${owner}&k=${k}`),
      });
    }

    // POST /tv/tables/:id/start { fill } → deal; computer players take the seats nobody did, if asked
    if (parts[3] === "start" && request.method === "POST") {
      const room = await rooms.room(id);
      if (!room) return json({ error: "No such table." }, 404);
      if (room.started) return json({ ok: true });
      const holders = await rooms.holders(id);
      const empty = room.seats.flatMap((s, i) => (!s.bot && !holders[i] ? [i] : []));
      if (empty.length && !input.fill) return json({ error: `Waiting for ${empty.length} more.` }, 409);
      if (empty.length === room.seats.length) return json({ error: "Nobody has joined yet." }, 409);
      const taken = room.seats.flatMap((s) => (s.name ? [s.name] : []));
      const bots = pickPersonas(empty.length, Math.random, taken);
      for (const [n, seat] of empty.entries()) await rooms.seatBot(id, seat, bots[n]?.name ?? `Bot ${n + 1}`);
      const problem = await rooms.start(id);
      return problem ? json({ error: problem }, 409) : json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  }

  return { fetch: handle, games };
}
