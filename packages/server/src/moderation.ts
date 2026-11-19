// Moderation: what the person who runs this parlor can see and do about its tables and the
// people at them. The admin app (packages/admin, served at /admin/) is its only page.
//
// It's off until the server has an admin token (CARDROOM_ADMIN_TOKEN). Every request carries it as
// `Authorization: Bearer <token>`; there are no accounts.
//
// People here are player cookies, which are secrets: whoever holds one is that player. So the admin
// never sees them. A player is shown by a reference (a hash of the cookie) that's enough to pick
// them out and block them, and useless for being them.
//
//   moderation/bans   server only: one field per blocked player's reference
//   moderation/log    server only: what the admin did, one field per action
import { MOST_BYTES, type Packs } from "./packs.js";
import { createHash, timingSafeEqual } from "node:crypto";
import { playerOf, type RoomDoc } from "@journey-to-code/rooms/server";
import type { TableChat } from "./tablechat.js";
import type { Catalogue } from "./catalogue.js";
import type { Tunables } from "./tunables.js";
import { PromoteError, type Promote } from "./promote.js";
import type { GithubLogin } from "./github-login.js";
import type { Backups } from "./backup.js";
import type { Courses } from "./courses.js";
import type { Designs } from "./designs.js";
import type { HouseDoc } from "./houses.js";
import { gameName, gameOfOptions } from "./games.js";

interface Rooms {
  sync: {
    write(collection: string, key: string, fields: Record<string, unknown>): Promise<unknown>;
    documents(): Promise<{
      get(collection: string, key: string): Record<string, unknown> | undefined;
      all(collection: string, prefix?: string): Array<{ key: string } & Record<string, unknown>>;
    }>;
  };
  closeTable(id: string, reason: string): Promise<boolean>;
  removePlayer(id: string, seat: number, bot?: string): Promise<string | null>;
  /** Hold a game, let it go on, and play a seat's turn at a held one (see @journey-to-code/rooms). */
  pause(id: string, reason?: string): Promise<string | null>;
  resume(id: string): Promise<string | null>;
  botMoveFor(id: string, seat: number): Promise<string | null>;
}

/** The parts of the houses module moderation uses. */
interface Houses {
  all(): Promise<HouseDoc[]>;
  moderate(slug: string, change: { name?: unknown; removeMember?: string; owner?: string; delete?: true }): Promise<string | null>;
  /** A house's chat: every message, and taking one down. */
  chat?: { messages(slug: string): Promise<{ id: number; by: string; name: string; text: string; at: number; poll?: { options: string[]; votes: Record<string, number> } }[]>; redact(slug: string, id: number): Promise<{ name: string; text: string } | null> };
}

export interface Ban {
  reason: string;
  at: number;
  /** The name they went by when they were blocked, for the list. */
  name: string;
}

export interface LogEntry {
  at: number;
  action: string;
  /** What it was done to, in words. */
  target: string;
  note: string;
}

/** What everyone but the admin is told when a blocked player tries to do something. */
export const BLOCKED_MESSAGE = "This parlor's host has blocked you from playing here.";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const clean = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const digest = (text: string) => createHash("sha256").update(text).digest();

/** A player's reference: stable, safe to show the admin, and no use as a cookie. */
export const playerRef = (player: string) => digest(`cardroom-player:${player}`).toString("hex").slice(0, 16);

const finished = (summary: unknown) => {
  const s = summary as { phase?: string; over?: boolean } | null;
  return s?.phase === "finished" || s?.over === true;
};

/** How many wrong tokens a minute before everyone waits. */
const WRONG_TOKENS_PER_MINUTE = 20;

export function createModeration(rooms: Rooms, designs: Designs, { tableChat, token, github, houses, catalogue, tunables, promote, backups, bots, courses, packs, mount = "/moderation", now = () => Date.now() }: { /** The tables' chats (tablechat.ts): what's said at each, taking a message down, and telling a table. */ tableChat?: Pick<TableChat, "messages" | "redact" | "announce">; token?: string; /** Who may sign in with GitHub instead of the token (see github-login.ts). */ github?: Pick<GithubLogin, "enabled" | "valid">; houses?: Houses; catalogue?: Catalogue; /** The numbers a game lets its host change (see tunables.ts). */ tunables?: Tunables; /** Opens a pull request for them (see promote.ts). */ promote?: Promote; /** The pack Road to the Shootout plays, when the host has published one (see packs.ts). */ packs?: Packs; /** Mini Golf courses people make, to take out of the gallery. */ courses?: Courses; /** Copies of the database, when the parlor keeps one on disk. */ backups?: Backups; /** The computer players' thinking, in numbers (see bots.ts). */ bots?: () => unknown; mount?: string; now?: () => number } = {}) {
  const secret = token?.trim() ? digest(token.trim()) : null;
  const docs = rooms.sync.documents();
  let wrong: number[] = [];
  let logged: number | null = null;

  const bans = async () => {
    const doc = ((await docs).get("moderation", "bans") ?? {}) as Record<string, Ban | null>;
    return new Map(Object.entries(doc).filter((e): e is [string, Ban] => /^[0-9a-f]{16}$/.test(e[0]) && !!e[1] && typeof e[1] === "object"));
  };

  async function record(action: string, target: string, note = "") {
    const view = await docs;
    logged ??= Object.keys(view.get("moderation", "log") ?? {}).filter((k) => /^a\d+$/.test(k)).length;
    const entry: LogEntry = { at: now(), action, target, note };
    await rooms.sync.write("moderation", "log", { [`a${String(logged++).padStart(6, "0")}`]: entry });
  }

  /** Every table, with who's at it. Player ids stay in here: `tablesShown` is what a page gets. */
  async function tables() {
    const view = await docs;
    const blocked = await bans();
    const said = new Map(await Promise.all(view.all("rooms").map(async ({ key }) => [key, tableChat ? (await tableChat.messages(key)).length : 0] as const)));
    const houseOf = new Map<string, { slug: string; name: string }>();
    for (const house of view.all("houses") as unknown as { slug: string; name: string; tables?: { id: string }[] }[])
      for (const t of house.tables ?? []) houseOf.set(t.id, { slug: house.slug, name: house.name });
    return view.all("rooms").map((doc) => {
      const room = doc as unknown as RoomDoc<unknown> & { key: string };
      const game = view.get("games", room.key) as { options?: unknown; holders?: (string | null)[] } | undefined;
      const id = gameOfOptions(game?.options ?? room.info ?? room.summary);
      return {
        id: room.key,
        game: id,
        gameName: gameName(id),
        rules: String((room.info as { rules?: unknown } | null)?.rules ?? ""),
        label: room.label ?? "",
        house: houseOf.get(room.key) ?? null,
        started: !!room.started,
        finished: finished(room.summary),
        closed: room.closed ?? "",
        paused: room.paused ? { at: room.paused.at, reason: room.paused.reason } : null,
        messages: said.get(room.key) ?? 0,
        seats: (room.seats ?? []).map((seat, i) => {
          const holder = game?.holders?.[i] ?? null;
          const ref = holder ? playerRef(holder) : null;
          return { seat: i, name: seat.name, bot: !!seat.bot, holder, player: ref, blocked: ref !== null && blocked.has(ref) };
        }),
      };
    });
  }
  type Table = Awaited<ReturnType<typeof tables>>[number];
  const status = (t: Table) => (t.closed ? "closed" : t.finished ? "finished" : t.started ? "playing" : "open");
  const tableShown = (t: Table) => ({ ...t, status: status(t), seats: t.seats.map(({ holder: _secret, ...seat }) => seat) });

  /** Everyone this server knows: from seats, houses, challenge links and saved designs. */
  async function players() {
    const view = await docs;
    const blocked = await bans();
    const people = new Map<string, { player: string; names: Set<string>; tables: { id: string; game: string; seat: number; status: string }[]; houses: { slug: string; name: string; role: string }[]; designs: number; challenge: boolean }>();
    const person = (player: string, name?: string | null) => {
      let p = people.get(player);
      if (!p) people.set(player, (p = { player, names: new Set(), tables: [], houses: [], designs: 0, challenge: false }));
      if (name) p.names.add(name);
      return p;
    };
    for (const t of await tables()) for (const s of t.seats) if (s.holder) person(s.holder, s.name).tables.push({ id: t.id, game: t.gameName, seat: s.seat, status: status(t) });
    for (const house of view.all("houses") as unknown as { slug: string; name: string; members?: { player: string; name: string; role: string }[] }[])
      for (const m of house.members ?? []) person(m.player, m.name).houses.push({ slug: house.slug, name: house.name, role: m.role });
    for (const c of view.all("challenges") as unknown as { player?: string; name?: string }[]) if (c.player) person(c.player, c.name).challenge = true;
    for (const d of await designs.all()) person(d.owner, d.author).designs += 1;
    return [...people.values()].map((p) => {
      const ref = playerRef(p.player);
      return { ref, player: p.player, names: [...p.names], tables: p.tables, houses: p.houses, designs: p.designs, challenge: p.challenge, ban: blocked.get(ref) ?? null };
    });
  }
  type Person = Awaited<ReturnType<typeof players>>[number];
  const personShown = ({ player: _secret, ...p }: Person) => ({ ...p, name: p.names[0] ?? p.ban?.name ?? "Unnamed player", seated: p.tables.filter((t) => t.status === "open" || t.status === "playing").length });

  function allowed(request: Request): Response | null {
    if (!secret && !github?.enabled) return json({ error: "Moderation is off. Set CARDROOM_ADMIN_TOKEN on the server to turn it on." }, 503);
    const at = now();
    wrong = wrong.filter((t) => at - t < 60_000);
    if (wrong.length >= WRONG_TOKENS_PER_MINUTE) return json({ error: "Too many wrong tokens. Wait a minute." }, 429);
    const given = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (given && ((secret && timingSafeEqual(digest(given), secret)) || github?.valid(given))) return null;
    wrong.push(at);
    return json({ error: given ? "That isn't this parlor's admin token." : "Sign in with the admin token." }, 401);
  }

  async function handle(request: Request, path: string): Promise<Response> {
    const refused = allowed(request);
    if (refused) return refused;
    const parts = path.split("/").filter(Boolean);
    const [area = "", id = "", action = ""] = parts;
    const method = request.method;

    // Road to the Shootout's pack: the host makes one in the workshop and publishes it here.
    // This comes before the rest because what is posted is the pack itself, not JSON.
    if (area === "shootout") {
      if (!packs) return json({ error: "This parlor has nowhere to keep a pack." }, 404);
      const shown = () => {
        const now = packs.get();
        return { published: now ? { name: now.name, size: now.bytes.length, at: now.at } : null };
      };
      // GET /moderation/shootout → whether a pack of the host's own is being played
      if (!id && method === "GET") return json(shown());
      // POST /moderation/shootout/pack → publish the pack in the body
      if (id === "pack" && method === "POST") {
        if (Number(request.headers.get("content-length") ?? 0) > MOST_BYTES) return json({ error: `The most this parlor takes is ${MOST_BYTES / 1024 / 1024} MB.` }, 413);
        const problem = packs.set(new Uint8Array(await request.arrayBuffer()));
        if (problem) return json({ error: problem }, 400);
        await record("Published a Road to the Shootout pack", packs.get()!.name);
        return json(shown());
      }
      // POST /moderation/shootout/reset → back to the pack the game came with
      if (id === "reset" && method === "POST") {
        const was = packs.get();
        packs.clear();
        if (was) await record("Went back to the built-in Road to the Shootout", was.name);
        return json(shown());
      }
      return json({ error: "Not found" }, 404);
    }

    const input = method === "POST" ? (((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>) : {};
    const view = await docs;

    // GET /moderation/overview → the numbers on the front page
    if (area === "overview" && method === "GET") {
      const all = await tables();
      const count = (s: string) => all.filter((t) => status(t) === s).length;
      const made = await designs.all();
      return json({
        tables: { total: all.length, open: count("open"), playing: count("playing"), finished: count("finished"), closed: count("closed") },
        players: (await players()).length,
        blocked: (await bans()).size,
        houses: view.all("houses").length,
        designs: { total: made.length, shared: made.filter((d) => d.shared && !d.hidden).length, hidden: made.filter((d) => d.hidden).length },
        // Null when the parlor keeps nothing on disk (no CARDROOM_DB) or backups are off.
        backups: backups ? { latest: backups.list()[0] ?? null, kept: backups.list().length, keep: backups.keep, hours: backups.hours } : null,
        // How the computer players' thinking is going: null when it all happens on the main thread.
        bots: bots?.() ?? null,
      });
    }

    // GET /moderation/backup → a copy of the database, made now, to keep somewhere else
    if (area === "backup" && method === "GET") {
      if (!backups) return json({ error: "There's nothing to back up: this parlor keeps its tables in memory (set CARDROOM_DB)." }, 404);
      const file = await backups.make();
      const bytes = backups.read(file.name);
      if (!bytes) return json({ error: "The backup couldn't be read back. Try again." }, 500);
      await record("Downloaded a backup", file.name);
      return new Response(new Uint8Array(bytes), { headers: { "content-type": "application/vnd.sqlite3", "content-disposition": `attachment; filename="${file.name}"`, "content-length": String(bytes.length), "cache-control": "no-store" } });
    }

    // GET /moderation/log → what's been done, newest first
    if (area === "log" && method === "GET") {
      const entries = Object.entries(view.get("moderation", "log") ?? {})
        .filter(([k]) => /^a\d+$/.test(k))
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .slice(0, 200)
        .map(([key, entry]) => ({ id: key, ...(entry as LogEntry) }));
      return json({ log: entries });
    }

    if (area === "tables") {
      const all = await tables();
      // GET /moderation/tables → every table: the ones still going first, and the newest first among them
      if (!id && method === "GET") {
        const order = ["playing", "open", "finished", "closed"];
        // Rooms are stored in the order they were made, so the later of two is the newer.
        const shown = all.map((t, made) => ({ t: tableShown(t), made }));
        shown.sort((a, b) => order.indexOf(a.t.status) - order.indexOf(b.t.status) || b.made - a.made);
        return json({ tables: shown.map(({ t }) => t) });
      }
      const table = all.find((t) => t.id === id);
      if (!table) return json({ error: "There's no table with that code." }, 404);
      const name = `${table.gameName} table ${table.id}`;
      // GET /moderation/tables/:id → the table and its chat
      if (!action && method === "GET") {
        return json({ table: tableShown(table), chat: (await tableChat?.messages(id)) ?? [] });
      }
      if (method !== "POST") return json({ error: "Not found" }, 404);
      // POST /moderation/tables/:id/pause { reason } → nobody can move, no computer player plays and no clock runs; the table is told
      if (action === "pause") {
        const reason = clean(input.reason, 200);
        const problem = await rooms.pause(id, reason);
        if (problem) return json({ error: problem }, 409);
        await tableChat?.announce(id, reason ? `The host paused the game: ${reason}` : "The host paused the game.");
        await record("Paused a table", name, reason);
        return json({ ok: true });
      }
      // POST /moderation/tables/:id/resume → play goes on, the clocks with the time they had
      if (action === "resume") {
        const problem = await rooms.resume(id);
        if (problem) return json({ error: problem }, 409);
        await tableChat?.announce(id, "The host resumed the game.");
        await record("Resumed a table", name);
        return json({ ok: true });
      }
      // POST /moderation/tables/:id/play-for { seat } → at a paused table, the computer's move for that seat, as the host's
      if (action === "play-for") {
        const seat = Number(input.seat);
        const who = table.seats[seat]?.name ?? `Seat ${seat + 1}`;
        const problem = await rooms.botMoveFor(id, seat);
        if (problem) return json({ error: problem }, 409);
        await tableChat?.announce(id, `The host played a turn for ${who}.`);
        await record("Played a turn for a seat", `${who} at ${name}`);
        return json({ ok: true });
      }
      // POST /moderation/tables/:id/close { reason } → nobody can sit, move or talk there again
      if (action === "close") {
        if (table.closed) return json({ error: "That table is already closed." }, 409);
        const reason = clean(input.reason, 200) || "This table was closed by the parlor's host.";
        await rooms.closeTable(id, reason);
        await record("Closed a table", name, reason);
        return json({ ok: true });
      }
      // POST /moderation/tables/:id/unseat { seat } → out of the seat (a bot plays on if the game has started)
      if (action === "unseat") {
        const seat = Number(input.seat);
        const who = table.seats[seat]?.name ?? `Seat ${seat + 1}`;
        const problem = await rooms.removePlayer(id, seat);
        if (problem) return json({ error: problem }, 409);
        await record("Removed a player from a table", `${who} at ${name}`, clean(input.reason, 200));
        return json({ ok: true });
      }
      // POST /moderation/tables/:id/redact { id } → a chat message is gone, for everyone at the table
      if (action === "redact") {
        const message = tableChat && Number.isInteger(input.id) ? await tableChat.redact(id, input.id as number) : null;
        if (!message) return json({ error: "There's no such message." }, 404);
        await record("Removed a chat message", `${message.name || "Someone"} at ${name}`, clean(message.text, 120));
        return json({ ok: true });
      }
      return json({ error: "Not found" }, 404);
    }

    if (area === "players") {
      const all = await players();
      // GET /moderation/players → everyone, blocked first, then whoever's at a table
      if (!id && method === "GET") {
        const list = all.map(personShown).sort((a, b) => Number(!!b.ban) - Number(!!a.ban) || b.seated - a.seated || a.name.localeCompare(b.name));
        // Blocked players who've left no other trace still belong in the list.
        const known = new Set(list.map((p) => p.ref));
        for (const [ref, ban] of await bans()) if (!known.has(ref)) list.unshift({ ref, names: [ban.name], name: ban.name, tables: [], houses: [], designs: 0, challenge: false, ban, seated: 0 });
        return json({ players: list });
      }
      if (!/^[0-9a-f]{16}$/.test(id) || method !== "POST") return json({ error: "Not found" }, 404);
      const person = all.find((p) => p.ref === id);
      // POST /moderation/players/:ref/block { reason } → they can't sit, play, talk or share here any more
      if (action === "block") {
        if (!person) return json({ error: "There's no such player." }, 404);
        const ban: Ban = { reason: clean(input.reason, 200), at: now(), name: person.names[0] ?? "Unnamed player" };
        await rooms.sync.write("moderation", "bans", { [id]: ban });
        // Tables they're at shouldn't wait on someone who can't move: a bot takes over, or the seat frees.
        for (const t of person.tables) if (t.status === "open" || t.status === "playing") await rooms.removePlayer(t.id, t.seat);
        await record("Blocked a player", ban.name, ban.reason);
        return json({ ok: true });
      }
      // POST /moderation/players/:ref/unblock → welcome back
      if (action === "unblock") {
        const ban = (await bans()).get(id);
        if (!ban) return json({ error: "That player isn't blocked." }, 409);
        await rooms.sync.write("moderation", "bans", { [id]: null });
        await record("Unblocked a player", person?.names[0] ?? ban.name);
        return json({ ok: true });
      }
      return json({ error: "Not found" }, 404);
    }

    if (area === "houses" && houses) {
      const all = await houses.all();
      const blocked = await bans();
      // GET /moderation/houses → every house and who's in it
      if (!id && method === "GET") {
        return json({
          houses: all
            .map((h) => ({
              slug: h.slug,
              name: h.name,
              tables: h.tables.length,
              tournaments: h.tournaments?.length ?? 0,
              members: h.members.map((m) => ({ id: m.id, name: m.name, role: m.role, joined: m.joined, player: playerRef(m.player), blocked: blocked.has(playerRef(m.player)) })),
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
      const house = all.find((h) => h.slug === id);
      // GET /moderation/houses/:slug/chat → the house's chat, oldest first
      if (house && action === "chat" && method === "GET" && houses.chat) {
        const messages = await houses.chat.messages(house.slug);
        return json({ house: { slug: house.slug, name: house.name }, messages: messages.map((m) => ({ ...m, poll: m.poll ? { options: m.poll.options, votes: Object.keys(m.poll.votes).length } : undefined })) });
      }
      if (!house || method !== "POST") return json({ error: "There's no such house." }, 404);
      const member = house.members.find((m) => m.id === input.member);
      const done = async (problem: string | null, what: string, target: string, note = "") => {
        if (problem) return json({ error: problem }, 409);
        await record(what, target, note);
        return json({ ok: true });
      };
      // POST /moderation/houses/:slug/rename { name } → a new name (its link stays the same)
      if (action === "rename") return done(await houses.moderate(id, { name: input.name }), "Renamed a house", house.name, `Now “${clean(input.name, 30)}”`);
      // POST /moderation/houses/:slug/remove-member { member } → out of the house
      if (action === "remove-member") return done(await houses.moderate(id, { removeMember: String(input.member ?? "") }), "Removed a member from a house", `${member?.name ?? "Someone"} from ${house.name}`);
      // POST /moderation/houses/:slug/owner { member } → the house's new owner; the old one stays as an admin
      if (action === "owner") return done(await houses.moderate(id, { owner: String(input.member ?? "") }), "Changed a house's owner", house.name, `Now ${member?.name ?? "someone"}`);
      // POST /moderation/houses/:slug/chat-redact { id } → a message in the house's chat is gone, for everyone in the house
      if (action === "chat-redact" && houses.chat) {
        const gone = await houses.chat.redact(house.slug, Number(input.id));
        if (!gone) return json({ error: "That message has already gone." }, 404);
        await record("Removed a house chat message", `${gone.name} in ${house.name}`, clean(gone.text, 120));
        return json({ ok: true });
      }
      // POST /moderation/houses/:slug/delete → gone, for everyone; its tables carry on
      if (action === "delete") return done(await houses.moderate(id, { delete: true }), "Deleted a house", house.name);
      return json({ error: "Not found" }, 404);
    }

    if (area === "games" && catalogue) {
      // GET /moderation/games → every game in order, on or off, and the watching switch
      if (method === "GET") return json(await catalogue.state());
      // POST /moderation/games { order?, off?, watching? } → the catalogue, changed
      if (method === "POST") {
        const problem = await catalogue.set({ order: input.order, off: input.off, watching: input.watching });
        if (problem) return json({ error: problem }, 409);
        const parts = [input.order !== undefined ? "order" : "", input.off !== undefined ? "which games are on" : "", input.watching !== undefined ? `watching ${input.watching === true ? "on" : "off"}` : ""].filter(Boolean);
        await record("Changed the games", parts.join(", ") || "nothing");
        return json(await catalogue.state());
      }
    }

    if (area === "tunables" && tunables) {
      // GET /moderation/tunables → every game that can be tuned, the shape of what it takes, and what is saved
      if (!id && method === "GET") return json({ canPromote: promote?.enabled === true, games: await Promise.all(tunables.games().map(async (g) => ({ ...g, saved: await tunables.get(g.id), promoted: (await promote?.last(g.id)) ?? null }))) });
      // POST /moderation/tunables/:game { values } → the game's overrides, replaced (what's wrong comes back as 422 and nothing changes)
      if (id && !action && method === "POST") {
        const result = await tunables.set(id, input.values);
        if ("problems" in result) return json({ error: result.problems[0], problems: result.problems }, 422);
        await record("Changed a game's numbers", id, `version ${result.saved.version}`);
        return json(result.saved);
      }
      // POST /moderation/tunables/:game/promote → a draft pull request that writes the saved numbers into the code
      if (id && action === "promote" && method === "POST") {
        if (!promote) return json({ error: "Opening pull requests isn't set up on this parlor." }, 503);
        const saved = await tunables.get(id);
        try {
          const made = await promote.open(id, saved);
          await record("Opened a pull request for a game's numbers", id, `version ${made.version}: ${made.url}`);
          return json(made);
        } catch (error) {
          if (error instanceof PromoteError) return json({ error: error.message }, error.status);
          throw error;
        }
      }
      // POST /moderation/tunables/:game/reset → back to the game's own numbers
      if (id && action === "reset" && method === "POST") {
        const saved = await tunables.reset(id);
        if (!saved) return json({ error: "Not found" }, 404);
        await record("Put a game's numbers back", id, `version ${saved.version}`);
        return json(saved);
      }
    }

    if (area === "designs") {
      const made = await designs.all();
      const blocked = await bans();
      // GET /moderation/designs → every shared design (hidden ones too), newest first
      if (!id && method === "GET") {
        return json({
          designs: made
            .filter((d) => d.shared || d.hidden)
            .map((d) => ({ id: d.id, author: d.author, design: d.design, created: d.created, shared: d.shared, hidden: d.hidden ?? "", player: playerRef(d.owner), blocked: blocked.has(playerRef(d.owner)) })),
        });
      }
      const design = made.find((d) => d.id === id);
      if (!design || method !== "POST") return json({ error: "There's no such design." }, 404);
      const name = `“${design.design.name}” by ${design.author}`;
      // POST /moderation/designs/:id/hide { reason } → out of the gallery; its maker sees why
      if (action === "hide") {
        const reason = clean(input.reason, 200) || "The parlor's host took this out of the gallery.";
        await designs.hide(id, reason);
        await record("Hid a card design", name, reason);
        return json({ ok: true });
      }
      // POST /moderation/designs/:id/restore → back in the gallery
      if (action === "restore") {
        await designs.restore(id);
        await record("Restored a card design", name);
        return json({ ok: true });
      }
    }
    if (area === "courses" && courses) {
      const made = await courses.all();
      const blocked = await bans();
      // GET /moderation/courses → every shared course (hidden ones too), newest first
      if (!id && method === "GET") {
        return json({
          courses: made
            .filter((c) => c.shared || c.hidden)
            .map((c) => ({ id: c.id, kind: c.kind ?? "minigolf", author: c.author, course: c.versions[String(c.version)], updated: c.updated, shared: c.shared, hidden: c.hidden ?? "", player: playerRef(c.owner), blocked: blocked.has(playerRef(c.owner)) })),
        });
      }
      const course = made.find((c) => c.id === id);
      if (!course || method !== "POST") return json({ error: "There's no such course." }, 404);
      const name = `“${course.versions[String(course.version)]?.name ?? "A course"}” by ${course.author}`;
      // POST /moderation/courses/:id/hide { reason } → out of the gallery and no new tables; its maker sees why
      if (action === "hide") {
        const reason = clean(input.reason, 200) || "The parlor's host took this out of the gallery.";
        await courses.hide(id, reason);
        await record("Hid a Mini Golf course", name, reason);
        return json({ ok: true });
      }
      if (action === "restore") {
        await courses.restore(id);
        await record("Restored a Mini Golf course", name);
        return json({ ok: true });
      }
    }
    return json({ error: "Not found" }, 404);
  }

  return {
    /** Whether the server has an admin token. */
    enabled: secret !== null || github?.enabled === true,
    /** Whether this request comes from a blocked player. */
    async blocked(request: Request): Promise<boolean> {
      const player = playerOf(request);
      return player !== null && (await bans()).has(playerRef(player));
    },
    /** Answers /moderation requests; null for anything else. */
    async fetch(request: Request): Promise<Response | null> {
      const { pathname } = new URL(request.url);
      if (pathname !== mount && !pathname.startsWith(`${mount}/`)) return null;
      return handle(request, pathname.slice(mount.length));
    },
  };
}
