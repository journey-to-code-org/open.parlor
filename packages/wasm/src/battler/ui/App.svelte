<!--
  Delbie's Back Room: a deck-building battler, drawn by Svelte on Zubra components. The rules are
  plain TypeScript (../engine.ts); a run is its seed and the commands given, so the same seed plays out
  the same way. Five fights, the last against the Rat King; after each you pick up one card and may put
  one back.
-->
<script lang="ts">
  import type { Tables } from "../tables.ts";
  import CardView from "./CardView.svelte";
  import Fight from "./Fight.svelte";
  import Rewards from "./Rewards.svelte";
  import { encode } from "../record.ts";
  import { best, createRun, toast } from "./run.svelte.ts";

  type News<T> = Event & { detail: T };
  const fresh = () => Math.floor(Math.random() * 1_000_000) + 1;
  let { tables }: { tables: Tables } = $props();
  const asked = Number(new URLSearchParams(location.search).get("seed"));
  // The numbers are chosen once, before the page mounts, and a run is played on them to the end.
  // svelte-ignore state_referenced_locally
  const run = createRun(asked > 0 ? Math.floor(asked) : fresh(), tables);
  const view = $derived(run.view);

  // The run as text (seed, the numbers it is played on, every command): what the parlor's host pastes into
  // the admin app's inspector to play it back.
  async function copyRun() {
    const text = encode({ seed: run.seed, numbers: run.tables.version, commands: [...run.commands] });
    try {
      await navigator.clipboard.writeText(text);
      toast(`Run code copied (${run.commands.length} ${run.commands.length === 1 ? "move" : "moves"}).`, "success");
    } catch {
      toast("Couldn't copy. Your browser won't let this page use the clipboard.", "danger");
    }
  }

  let showDeck = $state(false);
  let again = $state(false);
  let ended = $state(false);
  let furthest = $state(best.read());
  const over = $derived(view.phase === "won" || view.phase === "lost");

  // The end of a run opens its dialog once; "the same run again" closes it and starts over.
  $effect(() => {
    if (over) {
      ended = true;
      furthest = best.read();
    }
  });

  const stars = $derived(view.phase === "won" ? (view.hp >= 30 ? 5 : view.hp >= 15 ? 4 : 3) : Math.min(2, view.floor));
  const restart = (seed: number) => {
    ended = false;
    again = false;
    run.restart(seed);
  };
  const sortedDeck = $derived([...view.deck].sort((a, b) => run.tables.cardById[a.def]!.cost - run.tables.cardById[b.def]!.cost || run.tables.cardById[a.def]!.name.localeCompare(run.tables.cardById[b.def]!.name)));
</script>

<main class="page backroom">
  <header class="top">
    <a class="home" href="../../">← open.parlor</a>
    <h1>Delbie's Back Room</h1>
    <p class="quiet">Five trouble spots between you and a quiet stockroom. Fight with parts, add the good ones to your deck, and put the dud ones back on the shelf.</p>
  </header>

  <div class="status" role="status" aria-live="polite">
    <progress-bar value={Math.min(view.floor + (view.phase === "reward" || over ? 1 : 0), view.floors)} max={view.floors} label={over && view.phase === "won" ? "All five floors" : `Floor ${view.floor + 1} of ${view.floors}: ${view.floorName}`}></progress-bar>
    <div class="line">
      <status-badge>Seed {run.seed}</status-badge>
      <status-badge variant="primary">Turn {view.turn}</status-badge>
      <action-button variant="outline" size="sm" onclick={() => (showDeck = true)}>Deck ({view.deck.length})</action-button>
      <action-button variant="ghost" size="sm" onclick={copyRun}>Copy run code</action-button>
      <action-button variant="ghost" size="sm" onclick={() => (over ? restart(fresh()) : (again = true))}>New run</action-button>
    </div>
  </div>

  {#if view.phase === "reward"}
    <Rewards {run} />
  {:else}
    <Fight {run} />
  {/if}

  <ol class="story" aria-label="What just happened">
    {#each run.story.slice(-4) as line, n (n + line)}
      <li>{line}</li>
    {/each}
  </ol>
</main>

<toast-region position="bottom-end" label="Notices" max={3} duration={4000}></toast-region>

<modal-dialog open={showDeck} label="Your deck" onopenchange={(event: News<boolean>) => (showDeck = event.detail)}>
  <span slot="heading">Your deck ({view.deck.length})</span>
  <div class="deck viewer">
    {#each sortedDeck as card (card.uid)}
      <div class="slot small"><CardView id={card.def} tables={run.tables} disabled={false} /></div>
    {/each}
  </div>
  <action-button slot="actions" data-close>Done</action-button>
</modal-dialog>

<modal-dialog open={ended && over} label={view.phase === "won" ? "The back corner is quiet" : "That's enough for today"} onopenchange={(event: News<boolean>) => (ended = event.detail)}>
  <span slot="heading">{view.phase === "won" ? "The back corner is quiet" : "That's enough for today"}</span>
  <div class="result">
    <star-rating readonly value={stars} label="The run"></star-rating>
    {#if view.phase === "won"}
      <p>All five floors, with {view.hp} of {view.maxHp} patience left and {view.deck.length} cards in the deck.</p>
    {:else}
      <p>You made it past {view.floor} {view.floor === 1 ? "floor" : "floors"} and ran out of patience on <strong>{view.floorName}</strong>.</p>
    {/if}
    <p class="quiet">Furthest this browser has got: {furthest > view.floors ? "the whole way" : `floor ${furthest}`}. Seed {run.seed}: the same run again deals the same cards, so you can try another way through.</p>
  </div>
  <action-button slot="actions" variant="outline" data-close onclick={() => restart(run.seed)}>The same run again</action-button>
  <action-button slot="actions" data-close onclick={() => restart(fresh())}>A new run</action-button>
</modal-dialog>

<modal-dialog open={again} label="Start over?" onopenchange={(event: News<boolean>) => (again = event.detail)}>
  <span slot="heading">Start a new run?</span>
  <p>This run isn't finished. A new one starts on the first floor with the starting deck.</p>
  <action-button slot="actions" variant="outline" data-close>Keep going</action-button>
  <action-button slot="actions" data-close onclick={() => restart(fresh())}>New run</action-button>
</modal-dialog>
