// What every page of the admin app shares: the admin token, the parlor as the server last reported
// it, and keeping that fresh. One instance for the app (providedIn: "root"); the pages read its
// signals and call its refresh after they change something.
import { Injectable, effect, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { Api, ApiError, type Catalogue, type House, type LogEntry, type Overview, type Player, type SharedCourse, type SharedDesign, type Table, type TableStatus } from "./api";

const TOKEN_KEY = "cardroom.admin.token";
const REFRESH_MS = 20_000;
export const STATUS_LABEL: Record<TableStatus, string> = { open: "Waiting for players", playing: "Playing", finished: "Finished", closed: "Closed" };

@Injectable({ providedIn: "root" })
export class Admin {
  private readonly router = inject(Router);

  // Signing in: the token lives in this tab only (sessionStorage), never in a cookie.
  readonly token = signal(remembered());
  readonly signedIn = signal(false);
  /** Why the sign-in page is showing: a wrong token, or one that stopped working. */
  readonly signInError = signal("");

  readonly overview = signal<Overview | null>(null);
  readonly tables = signal<Table[]>([]);
  readonly players = signal<Player[]>([]);
  readonly designs = signal<SharedDesign[]>([]);
  readonly courses = signal<SharedCourse[]>([]);
  readonly log = signal<LogEntry[]>([]);
  readonly houses = signal<House[]>([]);
  readonly catalogue = signal<Catalogue | null>(null);
  /** While a change to the games is on its way to the server: a refresh leaves them alone. */
  readonly savingGames = signal(false);
  readonly loaded = signal(false);
  readonly loadError = signal("");
  /** How many times the lists have come back from the server: a page with more to fetch follows it. */
  readonly refreshed = signal(0);
  /** While a question is open, the lists stay as they are under it. */
  readonly paused = signal(false);

  readonly api = new Api(() => this.token());

  constructor() {
    // While signed in, keep the lists fresh; a hidden tab waits until it's looked at again.
    effect((onCleanup) => {
      if (!this.signedIn()) return;
      const tick = () => document.visibilityState === "visible" && !this.paused() && void this.refresh();
      const timer = setInterval(tick, REFRESH_MS);
      document.addEventListener("visibilitychange", tick);
      onCleanup(() => {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", tick);
      });
    });
  }

  /** Check a token with the server and, if it's the one, keep it for the tab. The problem, or "". */
  async signIn(token: string): Promise<string> {
    if (!token) return "Enter the admin token.";
    this.token.set(token);
    try {
      this.overview.set(await this.api.overview());
      try {
        sessionStorage.setItem(TOKEN_KEY, token);
      } catch {
        // Private browsing: signed in until the tab reloads.
      }
      this.signedIn.set(true);
      this.signInError.set("");
      void this.refresh();
      return "";
    } catch (error) {
      this.forget();
      return message(error);
    }
  }

  signOut(why = ""): void {
    this.forget();
    this.signInError.set(why);
    this.loaded.set(false);
    this.tables.set([]);
    this.players.set([]);
    this.designs.set([]);
    this.courses.set([]);
    this.houses.set([]);
    this.log.set([]);
    this.catalogue.set(null);
    this.overview.set(null);
    void this.router.navigate(["/sign-in"]);
  }

  private forget(): void {
    this.token.set("");
    this.signedIn.set(false);
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing was kept.
    }
  }

  async refresh(): Promise<void> {
    try {
      const [overview, tables, players, designs, log, houses, catalogue, courses] = await Promise.all([this.api.overview(), this.api.tables(), this.api.players(), this.api.designs(), this.api.log(), this.api.houses(), this.api.games(), this.api.courses()]);
      this.courses.set(courses);
      this.houses.set(houses);
      if (!this.savingGames()) this.catalogue.set(catalogue);
      this.overview.set(overview);
      this.tables.set(tables);
      this.players.set(players);
      this.designs.set(designs);
      this.log.set(log);
      this.loaded.set(true);
      this.loadError.set("");
      this.refreshed.update((n) => n + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return this.signOut("The admin token changed. Sign in again.");
      this.loadError.set(message(error));
    }
  }

  /** zubra-ui's <toast-region> listens on the document: any code shows a toast with an event. */
  toast(text: string, variant: "success" | "danger" | "info" = "info"): void {
    document.dispatchEvent(new CustomEvent("toast", { detail: { message: text, variant } }));
  }

  /** Do something on the server, then say how it went and fetch the lists again. */
  async act(run: () => Promise<string>): Promise<void> {
    try {
      this.toast(await run(), "success");
    } catch (error) {
      this.toast(message(error), "danger");
    }
    await this.refresh();
  }
}

function remembered(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

/** A Zubra component's event carries its news in `detail`. */
export function detailOf<T>(event: Event): T {
  return (event as CustomEvent<T>).detail;
}

export function when(at: number): string {
  return new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Who's at a table, in a line. */
export function people(table: Table): string {
  const names = table.seats.filter((s) => s.name && !s.bot).map((s) => s.name);
  const bots = table.seats.filter((s) => s.bot).length;
  const empty = table.seats.filter((s) => !s.name).length;
  return [names.join(", "), bots ? `${bots} ${bots === 1 ? "bot" : "bots"}` : "", empty && table.status === "open" ? `${empty} empty` : ""].filter(Boolean).join(" · ") || "Nobody yet";
}
