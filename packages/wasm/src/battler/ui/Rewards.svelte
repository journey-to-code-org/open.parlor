<!--
  After a fight: three cards on offer, and the deck. Drag an offer onto the deck to take it, or a card
  from the deck onto the shelf to put it back (the deck goes up or down by one, never below five). Or tap
  a card and use the button. Nothing here is forced: you can leave the shelf as it is.
-->
<script lang="ts">
  import { flip } from "svelte/animate";
  import { fade, scale } from "svelte/transition";
  import { draggable } from "./drag.ts";
  import CardView from "./CardView.svelte";
  import type { Run } from "./run.svelte.ts";

  let { run }: { run: Run } = $props();
  const view = $derived(run.view);

  /** What is picked up by tapping: an offer (by its place) or a card of the deck (by its uid). */
  let tapped = $state<{ from: "offer"; index: number } | { from: "deck"; uid: number } | null>(null);
  let over = $state("");

  /** The offers still on the shelf: all three until one is chosen. */
  const offered = $derived(view.taken ? [] : view.offers.map((id, index) => ({ id, index })));
  const canRemove = $derived(!view.removed && view.deck.length > 5);
  const sorted = $derived([...view.deck].sort((a, b) => run.tables.cardById[a.def]!.cost - run.tables.cardById[b.def]!.cost || run.tables.cardById[a.def]!.name.localeCompare(run.tables.cardById[b.def]!.name)));

  function take(index: number) {
    tapped = null;
    run.act({ t: "take", index });
  }
  function putBack(uid: number) {
    tapped = null;
    run.act({ t: "remove", uid });
  }
  const zoneName = (zone: HTMLElement | null) => zone?.dataset.zone ?? "";
</script>

<section class="rewards" aria-label="Between fights">
  <h2>{view.floorName} is over</h2>
  <p class="quiet">You get your breath back. Take a card for the deck, and put one back on the shelf if something isn't pulling its weight.</p>

  <h3>On the shelf</h3>
  <div class="offers" role="group" aria-label="Cards on offer">
    {#each offered as offer (offer.index)}
      <div
        class="slot"
        out:fade={{ duration: 180 }}
        animate:flip={{ duration: 200 }}
        use:draggable={{ enabled: true, onstart: () => (tapped = { from: "offer", index: offer.index }), onover: (zone) => (over = zoneName(zone)), ondrop: (zone) => ((over = ""), zoneName(zone) === "deck" && take(offer.index)), onend: () => (over = "") }}
      >
        <CardView id={offer.id} tables={run.tables} selected={tapped?.from === "offer" && tapped.index === offer.index} onpick={() => (tapped = tapped?.from === "offer" && tapped.index === offer.index ? null : { from: "offer", index: offer.index })} />
      </div>
    {/each}
    {#if view.taken}<p class="quiet">Chosen.</p>{/if}
  </div>
  <div class="buttons">
    <action-button disabled={view.taken || tapped?.from !== "offer"} onclick={() => tapped?.from === "offer" && take(tapped.index)}>Add it to the deck</action-button>
    <action-button variant="outline" disabled={view.taken} onclick={() => take(-1)}>Take nothing</action-button>
  </div>

  <h3>Your deck <span class="quiet">({view.deck.length} cards)</span></h3>
  <div class="zones">
    <div class="zone" class:over={over === "deck"} class:ready={!view.taken && tapped?.from === "offer"} data-zone="deck">Drop a card here to add it</div>
    <div class="zone" class:over={over === "shelf"} class:ready={canRemove} data-zone="shelf">{view.removed ? "A card has been put back" : canRemove ? "Drop a card here to put it back" : "The deck is as small as it goes"}</div>
  </div>
  <div class="deck" role="group" aria-label="Your deck">
    {#each sorted as card (card.uid)}
      <div
        class="slot small"
        in:scale={{ duration: 200, start: 0.6 }}
        out:scale={{ duration: 200, start: 0.4 }}
        animate:flip={{ duration: 220 }}
        use:draggable={{ enabled: canRemove, onstart: () => (tapped = { from: "deck", uid: card.uid }), onover: (zone) => (over = zoneName(zone)), ondrop: (zone) => ((over = ""), zoneName(zone) === "shelf" && putBack(card.uid)), onend: () => (over = "") }}
      >
        <CardView id={card.def} tables={run.tables} selected={tapped?.from === "deck" && tapped.uid === card.uid} onpick={() => canRemove && (tapped = tapped?.from === "deck" && tapped.uid === card.uid ? null : { from: "deck", uid: card.uid })} />
      </div>
    {/each}
  </div>
  <div class="buttons">
    <action-button variant="outline" disabled={!canRemove || tapped?.from !== "deck"} onclick={() => tapped?.from === "deck" && putBack(tapped.uid)}>Put it back on the shelf</action-button>
    <action-button disabled={!view.taken} onclick={() => run.act({ t: "go" })}>On to the next floor</action-button>
  </div>
</section>
