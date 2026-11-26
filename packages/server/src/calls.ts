// A video call between two browsers, for Peekaboo (the baby game): one parent with the baby, the
// other somewhere else. The pictures, the sound and the shared board go browser to browser over
// WebRTC; this only carries their handshake (the offer, the answer and the ICE candidates) from one
// to the other, as two little mailboxes.
//
//   POST /calls                   start a call: its code, this side's token, and the ICE servers
//   POST /calls/<code>/join       the other side: its token, and the ICE servers
//   POST /calls/<code>/say        { side, token, message }: into the other side's box
//   GET  /calls/<code>/hear       ?side=a|b&token=…&after=n: what is in this side's box after n,
//                                 waiting up to a while for something to arrive
//
// The side that started is "a" and makes the offers; "b" answers. A second join (the other parent
// reloaded, or opened the link on another phone) takes b's place and tells a, which offers again.
// Calls live in memory and are forgotten an hour after both sides stop asking.
const LETTERS = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 8;
const IDLE_MS = 60 * 60_000;
const BOX_LIMIT = 200;
const MESSAGE_LIMIT = 16_000;
const MAX_CALLS = 2000;
/** Wrong codes one address may try in ten minutes. */
export const WRONG_TRIES = 12;
const TRY_WINDOW_MS = 10 * 60_000;
const DEFAULT_ICE: RTCIceServerLike[] = [{ urls: "stun:stun.l.google.com:19302" }];

export interface RTCIceServerLike {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface CallOptions {
  /** The ICE servers both browsers are given: a STUN server by default; add a TURN server for networks that won't connect directly. */
  ice?: RTCIceServerLike[];
  /** How long `hear` waits for something to arrive. */
  longPoll?: number;
  now?: () => number;
}

type Side = "a" | "b";
interface Box {
  messages: { n: number; message: unknown }[];
  next: number;
  waiting: Set<() => void>;
}
interface Call {
  tokens: Record<Side, string | null>;
  boxes: Record<Side, Box>;
  touched: number;
}

const random = (n: number, letters = LETTERS) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => letters[b % letters.length]).join("");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const box = (): Box => ({ messages: [], next: 1, waiting: new Set() });
export const tidyCallCode = (typed: unknown) => String(typed ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function createCalls({ ice = DEFAULT_ICE, longPoll = 20_000, now = Date.now }: CallOptions = {}) {
  const calls = new Map<string, Call>();
  const wrong = new Map<string, number[]>();
  const sweep = () => {
    for (const [code, call] of calls) if (now() - call.touched > IDLE_MS) calls.delete(code);
    for (const [who, times] of wrong) if (!times.some((t) => now() - t < TRY_WINDOW_MS)) wrong.delete(who);
  };
  const post = (to: Box, message: unknown) => {
    to.messages.push({ n: to.next++, message });
    if (to.messages.length > BOX_LIMIT) to.messages.splice(0, to.messages.length - BOX_LIMIT);
    for (const wake of to.waiting) wake();
    to.waiting.clear();
  };
  const other = (side: Side): Side => (side === "a" ? "b" : "a");

  return {
    get size() {
      return calls.size;
    },
    /** Answers /calls requests; null for anything else. */
    async fetch(request: Request): Promise<Response | null> {
      const url = new URL(request.url);
      const { pathname } = url;
      if (pathname !== "/calls" && !pathname.startsWith("/calls/")) return null;
      sweep();

      if (pathname === "/calls") {
        if (request.method !== "POST") return json({ error: "Not found" }, 404);
        if (calls.size >= MAX_CALLS) return json({ error: "Too many calls are open right now. Try again in a little while." }, 503);
        let code = random(CODE_LENGTH);
        while (calls.has(code)) code = random(CODE_LENGTH);
        const token = random(24);
        calls.set(code, { tokens: { a: token, b: null }, boxes: { a: box(), b: box() }, touched: now() });
        return json({ code, side: "a", token, ice }, 201);
      }

      const [, , rawCode, action] = pathname.split("/");
      const code = tidyCallCode(rawCode);
      const call = calls.get(code);
      const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "someone";
      const tries = (wrong.get(address) ?? []).filter((t) => now() - t < TRY_WINDOW_MS);
      if (!call) {
        if (tries.length >= WRONG_TRIES) return json({ error: "Too many wrong call codes. Wait ten minutes and ask for a new link." }, 429);
        wrong.set(address, [...tries, now()]);
        return json({ error: "That call has ended, or the link isn't right. Ask for a new one." }, 404);
      }
      call.touched = now();

      if (action === "join" && request.method === "POST") {
        const token = random(24);
        const rejoin = call.tokens.b !== null;
        call.tokens.b = token;
        // The new b starts with an empty box; a hears that someone (new) is there, and offers again.
        call.boxes.b = box();
        post(call.boxes.a, { type: "joined", rejoin });
        return json({ code, side: "b", token, ice });
      }

      const sideOf = (s: unknown, t: unknown): Side | null => ((s === "a" || s === "b") && typeof t === "string" && t && call.tokens[s] === t ? s : null);

      if (action === "say" && request.method === "POST") {
        const text = await request.text();
        if (text.length > MESSAGE_LIMIT) return json({ error: "Too long" }, 413);
        let input: Record<string, unknown>;
        try {
          input = JSON.parse(text) ?? {};
        } catch {
          return json({ error: "Not JSON" }, 400);
        }
        const side = sideOf(input.side, input.token);
        if (!side) return json({ error: "Not your call" }, 403);
        if (input.message === undefined) return json({ error: "Nothing to say" }, 400);
        post(call.boxes[other(side)], input.message);
        return json({ ok: true });
      }

      if (action === "hear" && request.method === "GET") {
        const side = sideOf(url.searchParams.get("side"), url.searchParams.get("token"));
        if (!side) return json({ error: "Not your call" }, 403);
        const after = Number(url.searchParams.get("after")) || 0;
        const mine = () => call.boxes[side];
        const since = () => mine().messages.filter((m) => m.n > after);
        if (!since().length) {
          await new Promise<void>((done) => {
            const wake = () => {
              clearTimeout(timer);
              done();
            };
            const timer = setTimeout(() => {
              mine().waiting.delete(wake);
              done();
            }, longPoll);
            mine().waiting.add(wake);
            request.signal?.addEventListener("abort", wake, { once: true });
          });
        }
        // A token replaced while this side waited (b joined again elsewhere) hears nothing more.
        if (call.tokens[side] !== url.searchParams.get("token")) return json({ error: "Not your call" }, 403);
        const got = since();
        return json({ messages: got.map((m) => m.message), next: got.length ? got[got.length - 1]!.n : after });
      }

      if (action === "end" && request.method === "POST") {
        const input = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
        const side = sideOf(input.side, input.token);
        if (!side) return json({ error: "Not your call" }, 403);
        post(call.boxes[other(side)], { type: "bye" });
        if (side === "a") calls.delete(code);
        else call.tokens.b = null;
        return json({ ok: true });
      }

      return json({ error: "Not found" }, 404);
    },
  };
}
