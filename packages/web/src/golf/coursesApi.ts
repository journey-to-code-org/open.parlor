// Mini Golf courses and bowling lanes people make, from the page's side: the gallery and your own on
// the server, and putting one where this page's copy of the game finds it (see @open-parlor/courses).
import { hasMap, isCustomMap, registerMap, type CustomCourse, type CustomLane, type CustomMap, type MapKind } from "@open-parlor/courses";

export interface SavedCourse {
  id: string;
  kind: MapKind;
  /** What a table's rules call it: its latest version. */
  game: string;
  author: string;
  course: CustomCourse;
  shared: boolean;
  created: number;
  updated: number;
  mine: boolean;
  /** Why a moderator took it out of the gallery: only its maker is told. */
  hidden?: string;
}

/** A bowling lane saved on the server: the same, with a lane where a course would be. */
export type SavedLane = Omit<SavedCourse, "course"> & { course: CustomLane };

/** A course or a lane handed to a worker thread with a think. */
export type Handed = { id: string; kind?: MapKind; course: CustomMap };

/** Every course and lane this page has put where the game finds it, by game id: what a bot worker is handed. */
const known = new Map<string, { kind: MapKind; map: CustomMap }>();

/** Put a course (or a lane) where this page's game finds it. Resolves to whether it's there. */
export function learnMap(kind: MapKind, game: string, map: CustomMap): boolean {
  if (!registerMap(kind, map, game)) return false;
  known.set(game, { kind, map });
  return true;
}
export const learnCourse = (game: string, course: CustomCourse) => learnMap("minigolf", game, course);
export const learnLane = (game: string, lane: CustomLane) => learnMap("bowling", game, lane);

/** The courses and lanes a game's state is played on that this page knows: for a worker thread, which has its own copy of the game. */
export function coursesFor(state: unknown): Handed[] {
  const rules = (state as { rules?: { course?: unknown; lane?: unknown } } | null)?.rules;
  return [rules?.course, rules?.lane].filter(isCustomMap).flatMap((id) => {
    const found = known.get(id);
    return found ? [{ id, kind: found.kind, course: found.map }] : [];
  });
}

/** Courses and lanes the worker has been handed: put them where the worker's copy of the game finds them. */
export function learnHanded(handed: Handed[] | undefined) {
  for (const { id, kind = "minigolf", course } of handed ?? []) if (!hasMap(kind, id)) learnMap(kind, id, course);
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the parlor. Check your connection and try again.");
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error ?? "The parlor can't do that right now.");
  return data;
}

const learnAll = <T extends SavedCourse | SavedLane>(list: T[]) => {
  for (const c of list) learnMap(c.kind ?? "minigolf", c.game, c.course);
  return list;
};

export const courses = {
  /** The gallery, and your own courses whether shared or not; each put where the game finds it. */
  list: async () => learnAll((await call<{ courses: SavedCourse[] }>("/courses")).courses),
  get: async (id: string) => learnAll([await call<SavedCourse>(`/courses/${encodeURIComponent(id)}`)])[0]!,
  create: async (course: CustomCourse, author: string, shared: boolean) => learnAll([await call<SavedCourse>("/courses", { course, author, shared })])[0]!,
  update: async (id: string, change: { course?: CustomCourse; author?: string; shared?: boolean }) => learnAll([await call<SavedCourse>(`/courses/${encodeURIComponent(id)}`, change)])[0]!,
  remove: (id: string) => call<{ ok: true }>(`/courses/${encodeURIComponent(id)}/delete`, {}),
};

export const lanes = {
  /** The gallery's lanes, and your own whether shared or not; each put where the game finds it. */
  list: async () => learnAll((await call<{ courses: SavedLane[] }>("/courses?kind=bowling")).courses),
  get: async (id: string) => learnAll([await call<SavedLane>(`/courses/${encodeURIComponent(id)}`)])[0]!,
  create: async (lane: CustomLane, author: string, shared: boolean) => learnAll([await call<SavedLane>("/courses", { kind: "bowling", course: lane, author, shared })])[0]!,
  update: async (id: string, change: { course?: CustomLane; author?: string; shared?: boolean }) => learnAll([await call<SavedLane>(`/courses/${encodeURIComponent(id)}`, change)])[0]!,
  remove: courses.remove,
};
