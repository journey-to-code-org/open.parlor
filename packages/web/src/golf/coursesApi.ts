// Mini Golf courses people make, from the page's side: the gallery and your own on the server, and
// putting a course where this page's copy of the game finds it (see @open-parlor/courses).
import { hasCourse, isCustomCourse, registerCourse, type CustomCourse } from "@open-parlor/courses";

export interface SavedCourse {
  id: string;
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

/** Every course this page has put where the game finds it, by game id: what a bot worker is handed. */
const known = new Map<string, CustomCourse>();

/** Put a course where this page's game finds it. Resolves to whether it's there. */
export function learnCourse(game: string, course: CustomCourse): boolean {
  if (!registerCourse(course, game)) return false;
  known.set(game, course);
  return true;
}

/** The courses a game's state is played on that this page knows: for a worker thread, which has its own copy of the game. */
export function coursesFor(state: unknown): { id: string; course: CustomCourse }[] {
  const id = (state as { rules?: { course?: unknown } } | null)?.rules?.course;
  return isCustomCourse(id) && known.has(id) ? [{ id, course: known.get(id)! }] : [];
}

/** A course the worker has been handed: put it where the worker's copy of the game finds it. */
export function learnHanded(courses: { id: string; course: CustomCourse }[] | undefined) {
  for (const { id, course } of courses ?? []) if (!hasCourse(id)) learnCourse(id, course);
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

const learnAll = (list: SavedCourse[]) => {
  for (const c of list) learnCourse(c.game, c.course);
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
