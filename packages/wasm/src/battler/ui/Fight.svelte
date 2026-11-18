<!--
  A fight: the foes across the top, you in the middle, your hand along the bottom. Play a card by
  dragging it onto a foe (attacks) or onto yourself (everything else), or tap it and tap who it is for.
  Drag a card sideways within the hand to put it where you want it.
-->
<script lang="ts">
  import { flip } from "svelte/animate";
  import { fade, fly } from "svelte/transition";
  import { intentText, needsFoe } from "../cards.ts";
  import type { Card } from "../engine.ts";
  import { draggable, slotIn } from "./drag.ts";
  import CardView from "./CardView.svelte";
  import type { Run } from "./run.svelte.ts";

  let { run }: { run: Run } = $props();
  const view = $derived(run.view);

  /** The card picked by tapping, waiting to be told who it is for. */
  let held = $state<number | null>(null);
  /** The card being dragged, and the zone it is over. */
  let lifted = $state<number | null>(null);
  let over = $state<string>("");
  let handRow: HTMLElement | undefined = $state();

  const cardOf = (uid: number) => view.hand.find((card) => card.uid === uid);
  const defOf = (card: Card) => run.tables.cardById[card.def]!;
  const affordable = (card: Card) => defOf(card).cost <= view.energy;
  const heldCard = $derived(held === null ? undefined : cardOf(held));
  const aiming = $derived(lifted ?? held);
  const aimedDef = $derived.by(() => {
    const card = aiming === null ? undefined : cardOf(aiming);
    return card ? defOf(card) : undefined;
  });

  function play(card: Card, foe?: number) {
    held = null;
    run.act({ t: "play", uid: card.uid, ...(foe === undefined ? {} : { target: foe }) });
  }

  /** Whether a foe is a place to drop (or tap) the card: attacks and marks need one; the sweeping ones go anywhere. */
  const foeTakes = (def: { effect: { all?: boolean } } & Parameters<typeof needsFoe>[0]) => needsFoe(def) || !!def.effect.all;

  /** Tapping a card: play it where it needs no choice, or hold it for the foe's tap. */
  function tap(card: Card) {
    if (!affordable(card)) return run.act({ t: "play", uid: card.uid, target: view.foes[0]?.uid });
    const def = defOf(card);
    if (held === card.uid) held = null;
    else if (!needsFoe(def)) play(card);
    else if (view.foes.length === 1) play(card, view.foes[0]!.uid);
    else held = card.uid;
  }

  function tapFoe(uid: number) {
    if (heldCard) play(heldCard, uid);
  }

  function drop(card: Card, zone: HTMLElement, x: number) {
    const kind = zone.dataset.zone;
    const def = defOf(card);
    if (kind === "foe") {
      if (needsFoe(def)) play(card, Number(zone.dataset.uid));
      else if (def.effect.all) play(card);
    } else if (kind === "self") {
      if (!needsFoe(def)) play(card);
    } else if (kind === "hand" && handRow) {
      const el = handRow.querySelector<HTMLElement>(`[data-uid="${card.uid}"]`);
      run.act({ t: "move", uid: card.uid, to: slotIn(handRow, x, el) });
    }
  }

  const intent = (foe: (typeof view.foes)[number]) => intentText(foe.intent);
  const pct = (hp: number, max: number) => Math.round((hp / max) * 100);
</script>

<section class="fight" aria-label="The fight">
  <div class="foes" role="group" aria-label="Foes">
    {#each view.foes as foe (foe.uid)}
      <div
        class="foe"
        class:aimed={aimedDef && foeTakes(aimedDef)}
        class:over={over === `foe:${foe.uid}`}
        data-zone="foe"
        data-uid={foe.uid}
        animate:flip={{ duration: 200 }}
        out:fade={{ duration: 250 }}
        role="button"
        tabindex="0"
        aria-label={`${foe.name}, ${foe.hp} of ${foe.maxHp}, next ${foe.intent.kind === "attack" ? "attacks for " + foe.intent.amount : "blocks " + foe.intent.amount}`}
        onclick={() => tapFoe(foe.uid)}
        onkeydown={(event) => (event.key === "Enter" || event.key === " ") && (event.preventDefault(), tapFoe(foe.uid))}
      >
        <div class="art" aria-hidden="true">{foe.art}</div>
        <div class="name">{foe.name}</div>
        <progress-bar value={foe.hp} max={foe.maxHp} label="Patience" aria-hidden="true"></progress-bar>
        <div class="line">
          <status-badge variant={foe.intent.kind === "attack" ? "danger" : "primary"}>{intent(foe)}</status-badge>
          {#if foe.block}<status-badge>🛡 {foe.block}</status-badge>{/if}
          {#if foe.vulnerable}<status-badge variant="warning">marked down {foe.vulnerable}</status-badge>{/if}
        </div>
        <div class="hp">{foe.hp} / {foe.maxHp}</div>
      </div>
    {/each}
  </div>

  <div
    class="self"
    class:aimed={aimedDef && !needsFoe(aimedDef)}
    class:over={over === "self"}
    data-zone="self"
    role="button"
    tabindex="0"
    aria-label={`You: patience ${view.hp} of ${view.maxHp}, block ${view.block}`}
    onclick={() => heldCard && !needsFoe(defOf(heldCard)) && play(heldCard)}
    onkeydown={(event) => (event.key === "Enter" || event.key === " ") && heldCard && !needsFoe(defOf(heldCard)) && (event.preventDefault(), play(heldCard))}
  >
    <div class="who">
      <span class="art" aria-hidden="true">🧑‍🔧</span>
      <div class="bars">
        <progress-bar value={view.hp} max={view.maxHp} label="Your patience" aria-hidden="true"></progress-bar>
        <div class="line">
          <span class="hp">{view.hp} / {view.maxHp}</span>
          {#if view.block}<status-badge variant="primary">🛡 {view.block}</status-badge>{/if}
        </div>
      </div>
    </div>
    <div class="energy" aria-label={`${view.energy} energy`}>
      {#each Array(Math.max(3, view.energy)) as _, n}<span class:spent={n >= view.energy}>⚡</span>{/each}
    </div>
  </div>

  <div class="hand" class:over={over === "hand"} data-zone="hand" bind:this={handRow} role="group" aria-label={`Your hand, ${view.hand.length} cards`}>
    {#each view.hand as card (card.uid)}
      <div
        class="slot"
        data-uid={card.uid}
        animate:flip={{ duration: 220 }}
        in:fly={{ y: 60, duration: 220 }}
        out:fly={{ y: -90, duration: 220 }}
        use:draggable={{
          enabled: true,
          onstart: () => ((lifted = card.uid), (held = null)),
          onover: (zone) => (over = zone ? (zone.dataset.zone === "foe" ? `foe:${zone.dataset.uid}` : (zone.dataset.zone ?? "")) : ""),
          ondrop: (zone, x) => ((lifted = null), (over = ""), drop(card, zone, x)),
          onend: () => ((lifted = null), (over = "")),
        }}
      >
        <CardView id={card.def} tables={run.tables} selected={held === card.uid} disabled={!affordable(card)} onpick={() => tap(card)} />
      </div>
    {/each}
    {#if view.hand.length === 0}<p class="empty">No cards in hand. End the turn.</p>{/if}
  </div>

  <div class="bar">
    <span class="pile" title="Draw pile">🂠 {view.draw.length}</span>
    <span class="pile" title="Discard pile">🗑 {view.discard.length}</span>
    <action-button onclick={() => run.act({ t: "end" })}>End turn</action-button>
  </div>
</section>
