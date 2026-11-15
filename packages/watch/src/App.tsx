// Watch a game: the tables playing now, and tables of computer players that anyone can deal to
// watch and learn from.
//
// Quiet when nothing is happening: what's playing comes first, a line or two when nothing is, and
// dealing the computers a game is one button that opens a short form. The server lists only
// what's really going (see spectate.ts): games this parlor has and hasn't switched off, at
// tables someone is still playing.
//
// The page is Solid; everything on it is a zubra-ui component (see zubra.ts). They're custom
// elements: Solid sets their properties with `prop:` and listens to their events with `on:`.
import { For, Match, Show, Switch, createMemo, createResource, createSignal, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

interface Game {
  id: string;
  name: string;
  emoji: string;
  seats: [number, number];
  teams: boolean;
  on: boolean;
}

interface Table {
  id: string;
  game: string;
  gameName: string;
  emoji: string;
  rules: string;
  label: string;
  /** Computer players only: a watcher sees every hand. At any other table, the table but nobody's hand. */
  computers: boolean;
  seats: { name: string | null; bot: boolean }[];
  standing: string;
  /** When someone last moved (ms). */
  moved: number;
}

interface Live {
  tables: Table[];
  /** Whether tables with players at them can be watched. */
  watching: boolean;
  computerTables: { going: number; limit: number };
}

/** The server's endpoints sit beside the page: /watch/ → /spectate, /catalogue. */
const beside = (path: string) => new URL(`../${path}`, document.baseURI).href;
const REFRESH_MS = 5000;

const SKILLS = [
  { value: "mixed", label: "Their own way" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];
const PACES = [
  { value: "fast", label: "Fast" },
  { value: "medium", label: "Medium" },
  { value: "slow", label: "Slow" },
  { value: "natural", label: "Like a person" },
];

async function ask<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(beside(path), body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach the parlor. Check your connection and try again.");
  }
  const answer = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !answer) throw new Error(answer?.error ?? "This parlor can't do that.");
  return answer;
}

/** zubra-ui's <toast-region> listens on the document: any code shows a toast with an event. */
const toast = (message: string, variant: "danger" | "info" = "info") => document.dispatchEvent(new CustomEvent("toast", { detail: { message, variant } }));

/** "brokennil, Pappy and Rick". */
const listed = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? ""));

export function App() {
  // What's on now, asked again every few seconds while the page is in view. The list is kept in a
  // store matched up by table, so a refresh only touches what changed: nothing flickers.
  const [live, setLive] = createStore<{ ready: boolean; offline: boolean; tables: Table[]; watching: boolean; full: boolean; limit: number }>({
    ready: false,
    offline: false,
    tables: [],
    watching: true,
    full: false,
    limit: 0,
  });
  async function load() {
    try {
      const now = await ask<Live>("spectate");
      setLive({ ready: true, offline: false, watching: now.watching, full: now.computerTables.going >= now.computerTables.limit, limit: now.computerTables.limit });
      setLive("tables", reconcile(now.tables, { key: "id" }));
    } catch {
      // A missed refresh keeps what's showing; only a page that never loaded says it can't.
      if (!live.ready) setLive({ ready: true, offline: true });
    }
  }
  void load();
  const timer = setInterval(() => document.visibilityState === "visible" && void load(), REFRESH_MS);
  const back = () => document.visibilityState === "visible" && void load();
  document.addEventListener("visibilitychange", back);
  onCleanup(() => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", back);
  });

  const people = createMemo(() => live.tables.filter((t) => !t.computers));
  const computers = createMemo(() => live.tables.filter((t) => t.computers));

  // Dealing the computers a game: closed until asked for.
  const [games] = createResource<Game[]>(() =>
    ask<{ games: Game[] }>("catalogue").then(
      (c) => c.games.filter((g) => g.on),
      () => [],
    ),
  );
  const [dealOpen, setDealOpen] = createSignal(false);
  const [game, setGame] = createSignal("");
  const [players, setPlayers] = createSignal("");
  const [skill, setSkill] = createSignal("hard");
  const [pace, setPace] = createSignal("medium");
  const [dealing, setDealing] = createSignal(false);

  const chosen = createMemo(() => games()?.find((g) => g.id === game()) ?? games()?.[0]);
  /** How many can play the chosen game: a choice only when the game has one. */
  const counts = createMemo(() => {
    const g = chosen();
    if (!g || g.teams || g.seats[0] === g.seats[1]) return [];
    return Array.from({ length: g.seats[1] - g.seats[0] + 1 }, (_, i) => String(g.seats[0] + i)).map((n) => ({ value: n, label: n }));
  });
  const seats = createMemo(() => (counts().some((c) => c.value === players()) ? players() : (counts()[Math.min(1, counts().length - 1)]?.value ?? "")));

  const tableLink = (id: string) => `../?table=${encodeURIComponent(id)}`;

  async function deal(event: Event) {
    event.preventDefault();
    const g = chosen();
    if (!g || dealing()) return;
    setDealing(true);
    try {
      const { id } = await ask<{ id: string }>("spectate", { game: g.id, seats: seats() ? Number(seats()) : undefined, skill: skill(), pace: pace() });
      location.href = tableLink(id);
    } catch (error) {
      toast((error as Error).message, "danger");
      setDealing(false);
      void load();
    }
  }

  const who = (table: Table) => listed(table.seats.flatMap((s) => (s.name ? [s.name] : [])));

  const Row = (props: { table: Table }) => (
    <li class="row">
      <span class="emoji" aria-hidden="true">
        {props.table.emoji}
      </span>
      <span class="what">
        <strong>{props.table.gameName}</strong>
        <span class="who">{who(props.table)}</span>
        <span class="where">{[props.table.standing || "Just dealt", props.table.rules].filter(Boolean).join(" · ")}</span>
      </span>
      <action-button
        prop:size="sm"
        prop:variant={props.table.computers ? "outline" : "primary"}
        prop:href={tableLink(props.table.id)}
        prop:label={props.table.computers ? `Watch the computers play ${props.table.gameName}` : `Watch ${who(props.table)} play ${props.table.gameName}`}
      >
        Watch
      </action-button>
    </li>
  );

  return (
    <>
      <toast-region prop:position="bottom-end" prop:label="Notifications" />
      <div class="page">
        <header class="top">
          <a class="home" href="../">
            <span aria-hidden="true">←</span> open.parlor
          </a>
          <h1>Watch a game</h1>
        </header>

        <Switch>
          <Match when={!live.ready}>
            <div class="waiting">
              <loading-spinner prop:label="Finding the tables" prop:inline={true} />
            </div>
          </Match>
          <Match when={live.offline}>
            <alert-banner prop:variant="info" prop:heading="Nothing to watch here">
              <span>This copy of the parlor has no server behind it, so there are no tables to watch. You can still practise against the computer.</span>
              <action-button slot="actions" prop:variant="outline" prop:size="sm" prop:href="../">
                Back to the parlor
              </action-button>
            </alert-banner>
          </Match>
          <Match when={live.ready}>
            <Show when={people().length}>
              <section aria-labelledby="people-heading">
                <h2 id="people-heading">Playing now</h2>
                <ul class="rows">
                  <For each={people()}>{(table) => <Row table={table} />}</For>
                </ul>
                <p class="quiet note">You see the table and the score, not anyone's hand.</p>
              </section>
            </Show>

            <Show when={computers().length}>
              <section aria-labelledby="computers-heading">
                <h2 id="computers-heading">The computers playing</h2>
                <ul class="rows">
                  <For each={computers()}>{(table) => <Row table={table} />}</For>
                </ul>
                <p class="quiet note">At these tables you see every hand.</p>
              </section>
            </Show>

            <Show when={!live.tables.length}>
              <section class="calm" aria-live="polite">
                <p class="lead">Nobody's playing right now.</p>
                <p class="quiet">{live.watching ? "When someone is, their table shows up here." : "This parlor keeps people's tables private; the computers' tables show up here."}</p>
              </section>
            </Show>
            <Show when={live.tables.length && !live.watching}>
              <p class="quiet">This parlor keeps people's tables private.</p>
            </Show>

            <section class="deal-box" aria-labelledby="deal-heading">
              <Show
                when={dealOpen()}
                fallback={
                  <action-button prop:variant={live.tables.length ? "outline" : "primary"} prop:disabled={live.full} on:click={() => setDealOpen(true)}>
                    <span>{live.full ? "The computers' tables are all busy" : "Deal the computers a game"}</span>
                  </action-button>
                }
              >
                <h2 id="deal-heading">Deal the computers a game</h2>
                <p class="quiet">They sit down and play it out; you see every hand.</p>
                <form class="deal" onSubmit={deal}>
                  <select-field
                    prop:label="Game"
                    prop:options={(games() ?? []).map((g) => ({ value: g.id, label: `${g.emoji} ${g.name}` }))}
                    prop:value={chosen()?.id ?? ""}
                    on:valuechange={(event: CustomEvent<string>) => setGame(event.detail)}
                  />
                  <Show when={counts().length}>
                    <div class="group">
                      <span class="label">Players</span>
                      <segmented-control prop:label="Players" prop:options={counts()} prop:value={seats()} on:valuechange={(event: CustomEvent<string>) => setPlayers(event.detail)} />
                    </div>
                  </Show>
                  <details class="more">
                    <summary>More options</summary>
                    <div class="group">
                      <span class="label">How well they play</span>
                      <segmented-control prop:label="How well they play" prop:options={SKILLS} prop:value={skill()} on:valuechange={(event: CustomEvent<string>) => setSkill(event.detail)} />
                    </div>
                    <div class="group">
                      <span class="label">How fast</span>
                      <segmented-control prop:label="How fast" prop:options={PACES} prop:value={pace()} on:valuechange={(event: CustomEvent<string>) => setPace(event.detail)} />
                    </div>
                  </details>
                  <Show when={live.full}>
                    <p class="quiet">{live.limit} computer games are going. Watch one of those, or deal a new one when a game ends.</p>
                  </Show>
                  <cluster-layout prop:gap="0.75rem">
                    <action-button prop:type="submit" prop:loading={dealing()} prop:disabled={live.full || !chosen()}>
                      <span>{chosen() ? `Deal ${chosen()!.name}` : "Deal"}</span>
                    </action-button>
                    <action-button prop:variant="ghost" on:click={() => setDealOpen(false)}>
                      Cancel
                    </action-button>
                  </cluster-layout>
                </form>
              </Show>
            </section>
          </Match>
        </Switch>
      </div>
    </>
  );
}
