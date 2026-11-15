// Mini Golf courses people make (see @open-parlor/courses). A course is kept for its maker alone, or
// shared, which puts it in the gallery: everyone sees it in Mini Golf's setup and can play it. A
// maker is the same player cookie that holds a seat at a table.
//
//   courses/<id>   server only: the course, every version of it, its maker's player id, shared or not
//
// Each save that changes the holes is a new version with a game id of its own (`custom-<id>-<n>`),
// and every version stays where the game finds it (COURSES). So a table plays the holes it started
// on to the end, however the course is changed meanwhile, even across a restart. New tables get the
// latest version. A deleted or hidden course takes no new tables; tables already on it play on.
//
// A private course isn't listed for anyone but its maker; the game id is hard to guess, but a table
// isn't asked who opened it, so private means unlisted rather than locked.
import {
  courseId,
  courseProblems,
  isCustomCourse,
  normalizeCourse,
  registerCourse,
  type CustomCourse,
} from "@open-parlor/courses";
import { cleanName } from "@journey-to-code/decks";
import { newPlayerId, playerCookie, playerOf } from "@journey-to-code/rooms/server";
import { maskText } from "./names.js";

export interface CourseDoc {
  id: string;
  /** The maker's secret cookie value. Never sent to anyone. */
  owner: string;
  author: string;
  /** The latest version. */
  version: number;
  /** Every version, by number: tables in progress may be on any of them. */
  versions: Record<string, CustomCourse>;
  shared: boolean;
  created: number;
  updated: number;
  deleted?: boolean;
  /** Why a moderator took it out of the gallery. Its maker still sees it, with the reason. */
  hidden?: string;
}

interface Sync {
  write(collection: string, key: string, fields: Record<string, unknown>): Promise<unknown>;
  documents(): Promise<{
    get(collection: string, key: string): Record<string, unknown> | undefined;
    all(collection: string, prefix?: string): Array<{ key: string } & Record<string, unknown>>;
  }>;
}

const LETTERS = "abcdefghjkmnpqrstuvwxyz23456789";
const random = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => LETTERS[b % LETTERS.length]).join("");
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** How many courses one person may keep, how many the gallery shows, how often one person may save. */
export const COURSES_PER_PLAYER = 20;
export const GALLERY_SIZE = 100;
const SAVE_GAP_MS = 1500;

/** A course from a page, made safe and checked: or the reasons it can't be played. */
export function checkedCourse(given: unknown, blockedWords: string[] = []): CustomCourse | string[] {
  if (!given || typeof given !== "object") return ["That course is missing."];
  const course = normalizeCourse(given);
  // Names and tips are shown to everyone who plays: crude words are covered, as in chat.
  const clean: CustomCourse = {
    name: maskText(course.name, blockedWords),
    holes: course.holes.map((h) => ({ ...h, name: maskText(h.name, blockedWords), tip: maskText(h.tip, blockedWords) })),
  };
  const problems = courseProblems(clean);
  return problems.length ? problems : clean;
}

export function createCourses(sync: Sync, { mount = "/courses", now = () => Date.now(), blockedWords = [] }: { mount?: string; now?: () => number; blockedWords?: string[] } = {}) {
  const docs = sync.documents();
  const lastSaved = new Map<string, number>();
  /** Every version registered here, by game id: for a thread that needs it handed over (bots.ts). */
  const registered = new Map<string, CustomCourse>();

  const get = async (id: string) => (await docs).get("courses", id) as unknown as CourseDoc | undefined;
  async function all(): Promise<CourseDoc[]> {
    return ((await docs).all("courses") as unknown as CourseDoc[]).filter((d) => d.id && !d.deleted).sort((a, b) => b.updated - a.updated);
  }
  /** Put every version of a course where the game finds it. */
  const register = (doc: CourseDoc) => {
    for (const [n, course] of Object.entries(doc.versions ?? {})) {
      const game = courseId(doc.id, Number(n));
      if (registerCourse(course, game)) registered.set(game, course);
    }
  };
  const save = async (doc: CourseDoc) => {
    await sync.write("courses", doc.id, doc as unknown as Record<string, unknown>);
    register(doc);
  };

  // Every course there is, every version, deleted ones too: a table may still be on any of them.
  const loaded = docs.then((d) => {
    for (const doc of d.all("courses") as unknown as CourseDoc[]) if (doc.id) register(doc);
  });

  /** What a page gets: never the maker's player id. */
  const shown = (doc: CourseDoc, player: string | null) => {
    const mine = player !== null && doc.owner === player;
    const course = doc.versions[String(doc.version)]!;
    return {
      id: doc.id,
      /** What a table's rules call it: this version. */
      game: courseId(doc.id, doc.version),
      author: doc.author,
      course,
      shared: doc.shared,
      created: doc.created,
      updated: doc.updated,
      mine,
      ...(mine && doc.hidden ? { hidden: doc.hidden } : {}),
    };
  };

  async function handle(request: Request, path: string): Promise<Response> {
    await loaded;
    const parts = path.split("/").filter(Boolean);
    const method = request.method;
    const player = playerOf(request);
    const input = method === "POST" ? (((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>) : {};

    // GET /courses → the gallery: shared courses, newest first, and yours whether shared or not
    if (parts.length === 0 && method === "GET") {
      const list = (await all()).filter((d) => (d.shared && !d.hidden) || (player !== null && d.owner === player)).slice(0, GALLERY_SIZE + COURSES_PER_PLAYER);
      return json({ courses: list.map((d) => shown(d, player)) });
    }

    // POST /courses { course, author?, shared? } → a new course, yours
    if (parts.length === 0 && method === "POST") {
      const course = checkedCourse(input.course, blockedWords);
      if (Array.isArray(course)) return json({ error: course[0], problems: course }, 400);
      const me = player ?? newPlayerId();
      if ((await all()).filter((d) => d.owner === me).length >= COURSES_PER_PLAYER) return json({ error: `You can keep ${COURSES_PER_PLAYER} courses. Delete one to make room.` }, 409);
      if (now() - (lastSaved.get(me) ?? 0) < SAVE_GAP_MS) return json({ error: "Slow down a little." }, 429);
      lastSaved.set(me, now());
      let id = random(8);
      while (await get(id)) id = random(8);
      const doc: CourseDoc = { id, owner: me, author: cleanName(input.author, "Someone"), version: 1, versions: { "1": course }, shared: input.shared === true, created: now(), updated: now() };
      await save(doc);
      return json(shown(doc, me), 201, player ? {} : { "set-cookie": playerCookie(me, request) });
    }

    const doc = parts[0] ? await get(parts[0]) : undefined;
    const action = parts[1] ?? "";
    const mine = !!doc && player !== null && doc.owner === player;
    if (!doc || doc.deleted || (!mine && (!doc.shared || doc.hidden))) return json({ error: "There's no course at that link." }, 404);

    // GET /courses/:id → one course
    if (action === "" && method === "GET") return json(shown(doc, player));
    if (method !== "POST") return json({ error: "Not found" }, 404);
    if (!mine) return json({ error: "Only its maker can change a course." }, 403);

    // POST /courses/:id { course?, author?, shared? } → change yours: new holes are a new version
    if (action === "") {
      const course = input.course === undefined ? undefined : checkedCourse(input.course, blockedWords);
      if (Array.isArray(course)) return json({ error: course[0], problems: course }, 400);
      if (course && now() - (lastSaved.get(doc.owner) ?? 0) < SAVE_GAP_MS) return json({ error: "Slow down a little." }, 429);
      if (course) lastSaved.set(doc.owner, now());
      const changed = course !== undefined && JSON.stringify(course) !== JSON.stringify(doc.versions[String(doc.version)]);
      const version = changed ? doc.version + 1 : doc.version;
      const next: CourseDoc = {
        ...doc,
        version,
        versions: changed ? { ...doc.versions, [String(version)]: course! } : doc.versions,
        author: input.author === undefined ? doc.author : cleanName(input.author, "Someone"),
        shared: typeof input.shared === "boolean" ? input.shared : doc.shared,
        updated: now(),
      };
      await save(next);
      return json(shown(next, player));
    }
    // POST /courses/:id/delete → gone from the gallery and your list; tables on it play on
    if (action === "delete") {
      await sync.write("courses", doc.id, { deleted: true, shared: false, updated: now() });
      return json({ ok: true });
    }
    return json({ error: "Not found" }, 404);
  }

  /** The doc behind a game id, if it's a course people made. */
  async function docOf(game: string): Promise<{ doc: CourseDoc; version: number } | undefined> {
    const m = /^custom-([a-z0-9]+)-(\d+)$/.exec(game);
    const doc = m ? await get(m[1]!) : undefined;
    return doc && m ? { doc, version: Number(m[2]) } : undefined;
  }

  return {
    ready: loaded,
    /** The holes behind a game id, if this thread has them: what a worker thread is handed. */
    courseNow: (game: string): CustomCourse | undefined => registered.get(game),
    /**
     * Why a new table can't be opened on this course, or null if it can: a course people made has to
     * be one we have, not deleted or taken down. Built-in courses always can.
     */
    async refuse(game: unknown): Promise<string | null> {
      if (!isCustomCourse(game)) return null;
      await loaded;
      const found = await docOf(game);
      if (!found || !found.doc.versions[String(found.version)]) return "That course isn't one we have.";
      if (found.doc.deleted) return "That course has been deleted.";
      if (found.doc.hidden) return "That course was taken out of the gallery.";
      return null;
    },
    /** The holes behind a game id, for a thread that has to put the course where its own copy of the game finds it. */
    async courseOf(game: string): Promise<CustomCourse | undefined> {
      await loaded;
      const found = await docOf(game);
      return found?.doc.versions[String(found.version)];
    },
    /** Every course that hasn't been deleted, for server code (moderation). Holds player ids: never send these to a page as they are. */
    all,
    async hide(id: string, reason: string): Promise<boolean> {
      const doc = await get(id);
      if (!doc || doc.deleted) return false;
      await sync.write("courses", id, { hidden: reason.replace(/\s+/g, " ").trim().slice(0, 200) || "A moderator took this out of the gallery." });
      return true;
    },
    async restore(id: string): Promise<boolean> {
      const doc = await get(id);
      if (!doc || doc.deleted) return false;
      await sync.write("courses", id, { hidden: "" });
      return true;
    },
    /** Answers /courses requests; null for anything else. */
    async fetch(request: Request): Promise<Response | null> {
      const { pathname } = new URL(request.url);
      if (pathname !== mount && !pathname.startsWith(`${mount}/`)) return null;
      return handle(request, pathname.slice(mount.length));
    },
  };
}

export type Courses = ReturnType<typeof createCourses>;
