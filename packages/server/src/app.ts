// The parlor as one handler: houses, rooms, card designs, moderation and the sync log. index.ts
// serves it with the web app, the card designer and the admin app.
import type { IncomingMessage, ServerResponse } from "node:http";
import { createSyncServer, memoryLog, type Log } from "@zubra/sync/server";
import { createRooms, type RoomDoc } from "@journey-to-code/rooms/server";
import { createCatalogue } from "./catalogue.js";
import { createTunables } from "./tunables.js";
import { createPromote, type PromoteOptions } from "./promote.js";
import { createAssistant } from "./assistant.js";
import { createGithubLogin, type GithubLoginOptions } from "./github-login.js";
import { PAGE_MOUNTS, createPages, publicOrigin } from "./pages.js";
import { createChallenges } from "./challenges.js";
import { createDevices } from "./devices.js";
import { createSpectate } from "./spectate.js";
import type { Backups } from "./backup.js";
import { createCourses } from "./courses.js";
import { createDesigns } from "./designs.js";
import { BLOCKED_MESSAGE, createModeration } from "./moderation.js";
import type { Packs } from "./packs.js";
import { createHouses } from "./houses.js";
import { createParlorChat } from "./chat.js";
import { createTableChat } from "./tablechat.js";
import { createAi, type AiOptions } from "./ai.js";
import { personaFor } from "@journey-to-code/rules";
import { createBugs, REPORT_LIMIT, type BugOptions } from "./bugs.js";
import { createNews } from "./news.js";
import { createLobby, type LobbyOptions } from "./lobby.js";
import { createBots, type BotOptions } from "./bots.js";
import { createPush, type PushOptions } from "./push.js";
import { playerOf } from "@journey-to-code/rooms/server";
import { gameName, gameOfOptions, tableRoom, talk, type GameId, type Remark } from "./games.js";
import { createFlights, isFlight, type Flights, type FlightState, type Flyer } from "./flight.js";
import { secondAllowed, secondCookie, secondPath, secondSearch } from "./second.js";

export function createCardRoom(
  options: { log?: Log; botDelay?: number; talk?: boolean; push?: PushOptions; ai?: AiOptions; lobby?: LobbyOptions; /** Turns moderation on (see moderation.ts). */ adminToken?: string; /** Signing in to the admin app with GitHub (see github-login.ts). */ github?: GithubLoginOptions; /** Opening pull requests for tuned numbers (see promote.ts). */ promote?: PromoteOptions; bugs?: BugOptions; /** Copies of the database (see backup.ts), for the admin app to report and hand out. */ backups?: Backups; /** Road to the Shootout's published pack (see packs.ts), for the admin app to set. */ packs?: Packs; /** Worker threads for the computer players' thinking (see bots.ts). Without it they think on the main thread. */ bots?: BotOptions; /** The games flown live (see flight.ts): one a caller made, for tests that play them by hand. Without it they play by the clock. */ flights?: Flights; /** The clock, for tests. */ spectate?: { now?: () => number } } = {},
) {
  const talking = options.talk ?? true;
  const flights = options.flights ?? createFlights({ every: 16 });
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const lastWord = new Map<string, number>();
  let closed = false;

  const castOf = (room: RoomDoc<unknown>) => ({
    bots: room.seats.flatMap((s, i) => (s.bot ? [{ seat: i, name: s.name ?? "Bot" }] : [])),
  });
  const gameOfRoom = (room: RoomDoc<unknown>): GameId => gameOfOptions(room.info ?? room.summary);

  /**
   * A remark in the words of the house's model, when the table's house has connected one; null for the
   * bot's own line. The model gets only what the whole table can see.
   */
  async function inModelWords(id: string, r: Remark, said?: { name: string; text: string }): Promise<string | null> {
    const connected = await houses.aiFor(id);
    const room = connected && (await rooms.room(id));
    if (!connected || !room) return null;
    const bot = room.seats[r.seat]?.name ?? "Bot";
    return ai.line(
      connected.who,
      connected.ai,
      {
        house: connected.name,
        game: gameName(gameOfRoom(room)),
        bot,
        character: personaFor(bot).blurb,
        players: room.seats.flatMap((s) => (s.name ? [{ name: s.name, bot: s.bot }] : [])),
        summary: room.summary,
        chat: await tables.recent(id),
        gist: r.text || undefined,
        replyingTo: said,
      },
      connected.limit,
    );
  }

  /**
   * Say each remark after its delay, unless another bot spoke a moment ago (no talking over each other).
   * At a house with a model connected the line is asked for meanwhile, and said in the model's words.
   */
  function speak(id: string, remarks: Remark[], always = false, said?: { name: string; text: string }) {
    if (!talking) return;
    for (const r of remarks) {
      const written = inModelWords(id, r, said).catch(() => null);
      const timer = setTimeout(async () => {
        timers.delete(timer);
        const text = (await written) ?? r.text;
        if (closed || !text) return;
        const now = Date.now();
        if (!always && now - (lastWord.get(id) ?? 0) < 1200) return;
        lastWord.set(id, now);
        void tables.say(id, r.seat, text);
      }, r.delay);
      timer.unref?.();
      timers.add(timer);
    }
  }

  /**
   * Someone spoke to the table. The bots' own replies cover a handful of things (thanks, good luck…);
   * with a model connected, a bot also answers a question or its own name.
   */
  async function answer(id: string, message: { text: string; seat: number; name: string }, room: RoomDoc<unknown>) {
    const cast = castOf(room);
    const said = { name: message.name, text: message.text };
    const scripted = talk.reply(gameOfRoom(room), message.text, message.seat, cast);
    if (scripted.length || !cast.bots.length) return speak(id, scripted, true, said);
    const named = cast.bots.find((b) => message.text.toLowerCase().includes(b.name.toLowerCase()));
    if (!named && !message.text.includes("?")) return;
    if (!(await houses.aiFor(id))) return;
    const bot = named ?? cast.bots[Math.floor(Math.random() * cast.bots.length)]!;
    speak(id, [{ seat: bot.seat, text: "", delay: 900 + Math.random() * 1300 }], true, said);
  }

  // With `bots`, a computer player's heavy think (a search, a simulation) happens in a worker thread
  // and the rooms wait for the answer; without, every think is a call to the game's bot, as ever.
  const bots = options.bots ? createBots({ ...options.bots, courseFor: (id) => courses.courseNow(id) }) : null;
  // One log for the whole parlor: the rooms' Sync server and the houses' chats' (below) both keep it,
  // each in collections of its own, so one database (and one backup) holds everything.
  const log = options.log ?? memoryLog({ keep: "latest" });
  // Every conversation in the parlor (open.chat, chat.ts): the houses' and the tables', followed live
  // by the pages at /_zb/chat. A Sync server of its own, since the rooms' decides only what the rooms
  // kit knows; one for all of them, so a page needs one connection. Only the server writes them.
  const chatSync = createSyncServer({ mount: "/_zb/chat", log, device: "chat", authorize: (from) => parlorChat.authorize(from), warn: false });
  const parlorChat = createParlorChat(chatSync, { blockedWords: options.lobby?.blockedNames });
  const tables = createTableChat(parlorChat, { room: (id) => rooms.room(id), holders: (id) => rooms.holders(id) }, {
    // At a table that is or was open to everyone: muted players can't chat, and crude words are covered.
    beforeSay: (id, seat, text) => lobby.beforeSay(id, seat, text),
    // Someone spoke to the table: an answer is never dropped for being close to other talk.
    onSay: (id, message) =>
      void rooms
        .room(id)
        .then((room) => room && answer(id, message, room))
        .catch((e) => console.error("talk", e)),
  });
  const rooms = createRooms(bots ? { ...tableRoom, think: bots.think } : tableRoom, {
    log,
    botDelay: options.botDelay,
    // A game the host has switched off takes no new tables.
    // Whether people's tables can be watched is the host's call.
    spectators: () => catalogue.watching(),
    allow: async (given) =>
      (await catalogue.isOn(gameOfOptions(given)))
        ? // A Mini Golf course or bowling lane people made has to be one we have, and still up.
          ((await courses.refuse((given as { rules?: { course?: unknown } } | null)?.rules?.course)) ??
          (await courses.refuse((given as { rules?: { lane?: unknown } } | null)?.rules?.lane, "bowling")))
        : `${gameName(gameOfOptions(given))} is switched off in this parlor.`,
    onStart: ({ id, state, room }) => {
      // A game that is flown starts flying.
      if (isFlight((state as { game?: unknown }).game)) flights.start(id, state as FlightState, room.seats, room.settings as never);
      speak(id, talk.greet(state, castOf(room)));
      lobby.started(id);
    },
    // An open table deals itself when its last seat is taken.
    onSeats: ({ id }) => lobby.seatsChanged(id),
    onMove: ({ id, before, after, room }) => {
      speak(id, talk.react(before, after, castOf(room)), talk.finished(after));
      // A tournament match that just ended moves its winner on.
      if (talk.finished(after) && !talk.finished(before)) void houses.tableFinished(id, tableRoom.summary!(after)).catch((e) => console.error("tournament", e));
      if (talk.finished(after)) lobby.finished(id);
    },
    // A table's chat is the parlor's (tablechat.ts): the rooms kit's own takes nothing more.
    beforeSay: () => ({ error: "Update the page to talk at this table." }),
  });
  // Mini Golf courses people make, and every version of them where the game finds it.
  const courses = createCourses(rooms.sync, { blockedWords: options.lobby?.blockedNames });
  const push = createPush(rooms.sync, options.push);
  const ai = createAi(options.ai);
  const catalogue = createCatalogue(rooms.sync);
  const tunables = createTunables(rooms.sync);
  const promote = createPromote(rooms.sync, options.promote);
  const assistant = createAssistant(ai, tunables, promote);
  const github = createGithubLogin({ origin: (request) => publicOrigin(Object.fromEntries(request.headers)) || new URL(request.url).origin, ...options.github });
  // "Ask for a game" on the server's own page goes the way the app's does: past the block list, to the relay.
  const pages = createPages(catalogue, { tunables, asking: () => bugs.enabled, ask: async (request) => (await refusal(request)) ?? (await bugs.fetch(request)) });
  const designs = createDesigns(rooms.sync, { tables: rooms });
  const houses = createHouses(rooms, { push, ai, gameOn: catalogue.isOn, deckFor: designs.deckFor, chat: parlorChat });
  const challenges = createChallenges(rooms, push, { gameOn: catalogue.isOn, say: tables.say });
  // The same player on another device: the houses they are told about are the ones they belong to.
  const devices = createDevices({ housesOf: async (player) => (await houses.all()).filter((h) => h.members.some((m) => m.player === player)).map((h) => ({ slug: h.slug, name: h.name })) });
  const lobby = createLobby(rooms, { push, gameOn: catalogue.isOn, ...options.lobby });
  const spectate = createSpectate(rooms, catalogue, options.spectate);
  const moderation = createModeration(rooms, designs, { tableChat: tables, token: options.adminToken, github, houses, catalogue, tunables, promote, assistant, backups: options.backups, packs: options.packs, bots: bots ? () => bots.stats() : undefined, courses });
  // "Report a problem": a player's report becomes an issue on GitHub.
  // With the parlor's own AI key, a report or request can be tidied before it's sent.
  const bugs = createBugs(rooms, { ...(ai.shared ? { tidy: (input) => ai.tidy(input) } : {}), ...options.bugs });
  // "What's new" on the front page: the pull requests merged lately, from the repository reports go to.
  const news = createNews({ repo: bugs.repo, token: options.bugs?.token, fetch: options.bugs?.fetch, now: options.bugs?.now });

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  /** /push: the public key, and saying yes (or no) to notifications on this phone. */
  async function pushRoutes(request: Request): Promise<Response | null> {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/push/")) return null;
    if (pathname === "/push/key" && request.method === "GET") return json({ enabled: push.enabled, publicKey: push.publicKey });
    const player = playerOf(request);
    if (!player) return json({ error: "Join a house, sit at a table or make a challenge link first." }, 403);
    const input = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    if (pathname === "/push/subscribe" && request.method === "POST") {
      const problem = await push.subscribe(player, input.subscription);
      return problem ? json({ error: problem }, push.enabled ? 400 : 503) : json({ ok: true });
    }
    if (pathname === "/push/unsubscribe" && request.method === "POST") {
      await push.unsubscribe(player, String(input.endpoint ?? ""));
      return json({ ok: true });
    }
    if (pathname === "/push/test" && request.method === "POST") {
      const n = await push.notify(player, { title: "open.parlor 🃏", body: "Notifications are on. You'll hear about challenges and new tables.", url: "/", tag: "test" });
      return json({ delivered: n });
    }
    return json({ error: "Not found" }, 404);
  }

  /** Everything a blocked player may not do: sit, move, talk, make houses, challenges or designs. Reading is left alone. */
  const ACTS = ["/rooms", "/houses", "/_zb/chat", "/challenges", "/lobby", "/designs", "/courses", "/push", "/spectate", "/bugs", "/me"];
  /** A table's chat (tablechat.ts): the parlor's, under the rooms kit's address. */
  const TABLE_CHAT = /^\/rooms\/[^/]+\/(chat|say)$/;
  const under = (pathname: string, mounts: string[]) => mounts.some((m) => pathname === m || pathname.startsWith(`${m}/`));
  async function refusal(request: Request): Promise<Response | null> {
    if (request.method === "GET" || request.method === "HEAD" || !under(new URL(request.url).pathname, ACTS)) return null;
    return (await moderation.blocked(request)) ? json({ error: BLOCKED_MESSAGE }, 403) : null;
  }
  /** The routes that aren't the rooms kit's own. */
  const ours = async (request: Request) =>
    (await refusal(request)) ?? (await github.fetch(request)) ?? (await moderation.fetch(request)) ?? (await pushRoutes(request)) ?? (await bugs.fetch(request)) ?? (await news.fetch(request)) ?? (await designs.fetch(request)) ?? (await courses.fetch(request)) ?? (await catalogue.fetch(request)) ?? (await tunables.fetch(request)) ?? (await pages.fetch(request)) ?? (await spectate.fetch(request)) ?? (await challenges.fetch(request)) ?? (await devices.fetch(request)) ?? (await lobby.fetch(request)) ?? (await tables.fetch(request)) ?? (await houses.fetch(request));

  return {
    rooms,
    /** The tables' chats (tablechat.ts). */
    tables,
    houses,
    lobby,
    designs,
    /** Mini Golf courses people make. */
    courses,
    moderation,
    catalogue,
    tunables,
    bugs,
    push,
    /** The computer players' thinking: its counters, and when its workers are up. Null when they think on the main thread. */
    bots,
    /**
     * Put a page on a table's live game (flight.ts): `player` is the browser's own id (its cookie),
     * which says which seat it flies, if any. Null when the table has no game in the air.
     */
    async fly(id: string, player: string | null, flyer: Flyer) {
      if (!flights.has(id)) return null;
      const seat = player ? (await rooms.holders(id)).indexOf(player) : -1;
      return flights.join(id, seat >= 0 ? seat : null, flyer);
    },
    /** Answers houses, designs, moderation, rooms and sync requests; null for anything else. */
    async fetch(request: Request): Promise<Response | null> {
      // A second person at the same device (second.ts): the same request, made as somebody else.
      const url = new URL(request.url);
      const second = secondPath(url.pathname);
      if (second) {
        if (!secondAllowed(second)) return json({ error: "Not found" }, 404);
        // Someone the parlor has blocked is blocked whoever they say is sitting beside them.
        const blocked = await refusal(new Request(new URL(second.path + url.search, url), { method: request.method === "GET" || request.method === "HEAD" ? "GET" : "POST", headers: request.headers }));
        if (blocked) return blocked;
        const as = secondCookie(request.headers.get("cookie") ?? "", second.n, request);
        const headers = new Headers(request.headers);
        headers.set("cookie", as.cookie);
        const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
        const response = await this.fetch(new Request(new URL(second.path + secondSearch(url.search, second.n), url), { method: request.method, headers, body }));
        if (!response || !as.setCookie) return response;
        const answered = new Response(response.body, response);
        answered.headers.append("set-cookie", as.setCookie);
        return answered;
      }
      return (await ours(request)) ?? (await chatSync.fetch(request)) ?? (await rooms.fetch(request));
    },
    /** For Node's http: answers and resolves true, or resolves false for anything else. */
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      const url = new URL(req.url ?? "/", "http://localhost");
      const headers = req.headers as Record<string, string>;
      const answer = (response: Response) => {
        res.writeHead(response.status, Object.fromEntries(response.headers));
        return response.arrayBuffer().then((body) => (res.end(Buffer.from(body)), true));
      };
      // A second person at the same device (second.ts): the same request, made as somebody else.
      const second = secondPath(url.pathname);
      if (second) {
        if (!secondAllowed(second)) return answer(json({ error: "Not found" }, 404));
        const path = second.path + secondSearch(url.search, second.n);
        // Someone the parlor has blocked is blocked whoever they say is sitting beside them.
        const refused = await refusal(new Request(new URL(path, url), { method: req.method === "GET" || req.method === "HEAD" ? "GET" : "POST", headers }));
        if (refused) return answer(refused);
        const as = secondCookie(req.headers.cookie ?? "", second.n, new Request(url, { headers }));
        if (as.setCookie) res.setHeader("set-cookie", as.setCookie);
        req.url = path;
        req.headers.cookie = as.cookie;
        return this.handle(req, res);
      }
      if (TABLE_CHAT.test(url.pathname) || under(url.pathname, ["/houses", "/challenges", "/lobby", "/push", "/designs", "/courses", "/moderation", "/catalogue", "/tunables", "/spectate", "/bugs", "/news", "/me", ...PAGE_MOUNTS])) {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          // Nothing here is bigger than a bug report with its screenshot; stop reading anything that is.
          if ((size += (chunk as Buffer).length) > REPORT_LIMIT) {
            res.writeHead(413, { "content-type": "application/json", connection: "close" });
            res.end(JSON.stringify({ error: "That's too big to send." }));
            return true;
          }
          chunks.push(chunk as Buffer);
        }
        // The server's own pages check a form's post against the address the browser used, and send it back there.
        const at = under(url.pathname, PAGE_MOUNTS) ? new URL(req.url ?? "/", publicOrigin(req.headers) || url.origin) : url;
        const request = new Request(at, {
          method: req.method,
          headers,
          body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
        });
        const response = await ours(request);
        // Only the server's own pages can pass: when they are off, /games is the app's address again.
        return response ? answer(response) : false;
      }
      // The rooms kit and the parlor's chat read the request themselves; a blocked player is turned away before they do.
      const blocked = await refusal(new Request(url, { method: req.method === "GET" || req.method === "HEAD" ? "GET" : "POST", headers }));
      if (blocked) return answer(blocked);
      if (under(url.pathname, ["/_zb/chat"])) return chatSync.handle(req, res);
      return rooms.handle(req, res);
    },
    close: () => {
      closed = true;
      for (const t of timers) clearTimeout(t);
      flights.close();
      rooms.close();
      // Resolves once the worker threads have stopped.
      return bots?.close() ?? Promise.resolve();
    },
  };
}
