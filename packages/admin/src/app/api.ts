// The server's moderation endpoints (packages/server/src/moderation.ts). Every request carries the
// admin token; the server never sends a player's cookie, only a reference to pick them out by.
import type { CardDesign } from "@journey-to-code/decks";

export type TableStatus = "open" | "playing" | "finished" | "closed";

export interface Seat {
  seat: number;
  name: string | null;
  bot: boolean;
  /** The player's reference, or null for a bot or an empty seat. */
  player: string | null;
  blocked: boolean;
}

export interface Table {
  id: string;
  game: string;
  gameName: string;
  rules: string;
  label: string;
  house: { slug: string; name: string } | null;
  started: boolean;
  finished: boolean;
  /** Why it was closed, or "". */
  closed: string;
  status: TableStatus;
  messages: number;
  seats: Seat[];
}

export interface ChatLine {
  key: string;
  seat: number;
  name: string;
  text: string;
  at: number;
  bot: boolean;
  removed?: boolean;
}

export interface Ban {
  reason: string;
  at: number;
  name: string;
}

export interface Player {
  ref: string;
  name: string;
  names: string[];
  tables: { id: string; game: string; seat: number; status: TableStatus }[];
  houses: { slug: string; name: string; role: string }[];
  designs: number;
  challenge: boolean;
  seated: number;
  ban: Ban | null;
}

export interface SharedDesign {
  id: string;
  author: string;
  design: CardDesign;
  created: number;
  shared: boolean;
  /** Why it was hidden, or "". */
  hidden: string;
  player: string;
  blocked: boolean;
}

/** A Mini Golf course someone made and shared (see the parlor's course editor). */
export interface SharedCourse {
  id: string;
  /** A Mini Golf course or a bowling lane. */
  kind: "minigolf" | "bowling";
  author: string;
  /** A course has holes; a lane is one grid of its own. */
  course: { name: string; holes?: { name: string; par: number; cols: number; rows: number; cells: string }[]; cols?: number; rows?: number; cells?: string };
  updated: number;
  shared: boolean;
  /** Why it was hidden, or "". */
  hidden: string;
  player: string;
  blocked: boolean;
}

export interface HouseMember {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
  joined: number;
  player: string;
  blocked: boolean;
}

export interface House {
  slug: string;
  name: string;
  tables: number;
  tournaments: number;
  members: HouseMember[];
}

export interface CatalogueGame {
  id: string;
  name: string;
  emoji: string;
  /** Fewest and most players. */
  seats: [number, number];
  teams: boolean;
  on: boolean;
}

export interface Catalogue {
  games: CatalogueGame[];
  /** Whether tables with players at them can be watched. */
  watching: boolean;
}

export interface Overview {
  tables: { total: number; open: number; playing: number; finished: number; closed: number };
  players: number;
  blocked: number;
  houses: number;
  designs: { total: number; shared: number; hidden: number };
  /** Copies of the database: the newest, how many there are, and the server's settings. Null when it keeps nothing on disk or backups are off. */
  backups: { latest: { name: string; size: number; at: number } | null; kept: number; keep: number; hours: number } | null;
  /** The computer players' thinking in worker threads; null when the server thinks on its main thread. */
  bots?: { workers: number; queued: number; running: number; thinks: number; averageMs: number; worstMs: number; abandoned: number } | null;
}

/** Road to the Shootout's pack: the host's own, published from the workshop, or none (the one the game came with). */
export interface ShootoutPack {
  published: { name: string; size: number; at: number } | null;
}

export interface LogEntry {
  id: string;
  at: number;
  action: string;
  target: string;
  note: string;
}

/** A game whose numbers the host may change: what shape they take, and what has been saved. */
export interface TunableGame {
  id: string;
  name: string;
  shape: import("./tuning/shape").Shape;
  saved: { version: number; values: Record<string, unknown>; at: number };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The moderation endpoints sit beside the app: /admin/ → /moderation. */
const BASE = new URL("../moderation", document.baseURI).href;

export class Api {
  constructor(private readonly token: () => string) {}

  private async send<T>(path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(BASE + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { authorization: `Bearer ${this.token()}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      throw new ApiError("Couldn't reach the parlor. Check your connection and try again.", 0);
    }
    const answer = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok || !answer) throw new ApiError(answer?.error ?? `The parlor answered ${response.status}.`, response.status);
    return answer;
  }

  overview = () => this.send<Overview>("/overview");

  /** A copy of the parlor's database, made now: its file name and bytes. */
  async backup(): Promise<{ name: string; file: Blob }> {
    let response: Response;
    try {
      response = await fetch(`${BASE}/backup`, { headers: { authorization: `Bearer ${this.token()}` }, credentials: "omit", cache: "no-store" });
    } catch {
      throw new ApiError("Couldn't reach the parlor. Check your connection and try again.", 0);
    }
    if (!response.ok) throw new ApiError(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? `The parlor answered ${response.status}.`, response.status);
    const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "cardroom-backup.db";
    return { name, file: await response.blob() };
  }
  shootout = () => this.send<ShootoutPack>("/shootout");
  resetShootout = () => this.send<ShootoutPack>("/shootout/reset", {});
  /** Publish a pack file: what is sent is the file itself. */
  async publishShootout(file: Blob): Promise<ShootoutPack> {
    let response: Response;
    try {
      response = await fetch(`${BASE}/shootout/pack`, { method: "POST", headers: { authorization: `Bearer ${this.token()}`, "content-type": "application/octet-stream" }, body: file, credentials: "omit", cache: "no-store" });
    } catch {
      throw new ApiError("Couldn't reach the parlor. Check your connection and try again.", 0);
    }
    const answer = (await response.json().catch(() => null)) as (ShootoutPack & { error?: string }) | null;
    if (!response.ok || !answer) throw new ApiError(answer?.error ?? `The parlor answered ${response.status}.`, response.status);
    return answer;
  }
  tables = () => this.send<{ tables: Table[] }>("/tables").then((r) => r.tables);
  table = (id: string) => this.send<{ table: Table; chat: ChatLine[] }>(`/tables/${id}`);
  players = () => this.send<{ players: Player[] }>("/players").then((r) => r.players);
  designs = () => this.send<{ designs: SharedDesign[] }>("/designs").then((r) => r.designs);
  courses = () => this.send<{ courses: SharedCourse[] }>("/courses").then((r) => r.courses);
  log = () => this.send<{ log: LogEntry[] }>("/log").then((r) => r.log);

  houses = () => this.send<{ houses: House[] }>("/houses").then((r) => r.houses);
  renameHouse = (slug: string, name: string) => this.send(`/houses/${slug}/rename`, { name });
  removeMember = (slug: string, member: string) => this.send(`/houses/${slug}/remove-member`, { member });
  makeOwner = (slug: string, member: string) => this.send(`/houses/${slug}/owner`, { member });
  deleteHouse = (slug: string) => this.send(`/houses/${slug}/delete`, {});
  games = () => this.send<Catalogue>("/games");
  setGames = (change: { order?: string[]; off?: string[]; watching?: boolean }) => this.send<Catalogue>("/games", change);

  tunables = () => this.send<{ games: TunableGame[] }>("/tunables").then((r) => r.games);
  setTunables = (game: string, values: unknown) => this.send<TunableGame["saved"]>(`/tunables/${game}`, { values });
  resetTunables = (game: string) => this.send<TunableGame["saved"]>(`/tunables/${game}/reset`, {});

  closeTable = (id: string, reason: string) => this.send(`/tables/${id}/close`, { reason });
  unseat = (id: string, seat: number) => this.send(`/tables/${id}/unseat`, { seat });
  redact = (id: string, key: string) => this.send(`/tables/${id}/redact`, { key });
  block = (ref: string, reason: string) => this.send(`/players/${ref}/block`, { reason });
  unblock = (ref: string) => this.send(`/players/${ref}/unblock`, {});
  hideDesign = (id: string, reason: string) => this.send(`/designs/${id}/hide`, { reason });
  restoreDesign = (id: string) => this.send(`/designs/${id}/restore`, {});
  hideCourse = (id: string, reason: string) => this.send(`/courses/${id}/hide`, { reason });
  restoreCourse = (id: string) => this.send(`/courses/${id}/restore`, {});
}
