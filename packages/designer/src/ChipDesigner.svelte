<!--
  The chip designer: a colour and insets for each of the eight chips, an edge, a mark and a
  finish. "Play with them" makes a set the chips this browser sees at every table played for chips
  (Hold'em, Five Card Draw, Blackjack). Sets are kept in this browser.

  Svelte, on Zubra components, like the card designer beside it: zubra-ui's tabs, fields, swatches,
  cards, dialogs and toasts, and the parlor's own <poker-chip>.
-->
<script lang="ts">
  import {
    CHIP_EDGES,
    CHIP_FINISHES,
    CHIP_MARKS,
    CHIP_STARTERS,
    CHIP_VALUES,
    MARK_GLYPHS,
    PARLOR_CHIPS,
    chipProblems,
    chipValueLabel,
    forgetChips,
    keepChips,
    myChips,
    normalizeChips,
    playWithChips,
    playingChips,
    sameChips,
    watchChips,
    type ChipDesign,
    type SavedChips,
  } from "@open-parlor/ui/chip-design";
  import { onMount } from "svelte";
  import ChipRack from "./lib/ChipRack.svelte";
  import ColorPick from "./lib/ColorPick.svelte";

  type Tab = "design" | "mine" | "starters";
  const tabs = [
    { value: "design", label: "Design" },
    { value: "mine", label: "My chips" },
    { value: "starters", label: "Starters" },
  ];
  type News<T> = CustomEvent<T>;

  const fresh = (): ChipDesign => ({ ...structuredClone(PARLOR_CHIPS), name: "My chips" });

  let tab = $state<Tab>("design");
  let design = $state<ChipDesign>(fresh());
  /** The kept set being changed, or null for a new one. */
  let editing = $state<SavedChips | null>(null);
  /** Which chip the colour pickers change. */
  let picked = $state(1);
  let kept = $state<SavedChips[]>(myChips());
  let playing = $state<ChipDesign>(playingChips());
  let deleting = $state<SavedChips | null>(null);
  let deleteOpen = $state(false);

  const problems = $derived(chipProblems(normalizeChips(design)));
  const ownChips = $derived(sameChips(playing, PARLOR_CHIPS));
  const chip = $derived(design.chips[picked]!);

  const title = (word: string) => word[0]!.toUpperCase() + word.slice(1);
  const edges = CHIP_EDGES.map((e) => ({ value: e, label: title(e) }));
  const marks = CHIP_MARKS.map((m) => ({ value: m, label: m === "value" ? "123" : m === "none" ? "None" : MARK_GLYPHS[m] }));
  const finishes = CHIP_FINISHES.map((f) => ({ value: f, label: title(f) }));
  const starters = CHIP_STARTERS.map((s) => ({ value: s.name, label: s.name }));

  const BODIES: [string, string][] = [["#f4f1e8", "White"], ["#c8322b", "Red"], ["#1f8a4c", "Green"], ["#23252b", "Black"], ["#6b3fa0", "Purple"], ["#e0a81e", "Yellow"], ["#e2701d", "Orange"], ["#3aa0c9", "Sky"], ["#1b2340", "Navy"], ["#ff8fb8", "Pink"], ["#b08d57", "Brass"]];
  const INSETS: [string, string][] = [["#f7f3ea", "Ivory"], ["#23252b", "Black"], ["#2b5fad", "Blue"], ["#d9b23a", "Gold"], ["#c8322b", "Red"], ["#ff6fa8", "Pink"], ["#3b2a12", "Umber"]];

  function toast(message: string, variant: "success" | "danger" | "info" = "info") {
    document.dispatchEvent(new CustomEvent("toast", { detail: { message, variant } }));
  }
  const say = (error: unknown) => toast(error instanceof Error ? error.message : "Something went wrong. Try again.", "danger");

  onMount(() =>
    // Another tab (a table's settings, say) changed the chips this browser plays with.
    watchChips(() => {
      kept = myChips();
      playing = playingChips();
    }),
  );

  function startFrom(name: string) {
    const starter = CHIP_STARTERS.find((s) => s.name === name);
    if (starter) design = { ...structuredClone(starter), name: editing ? design.name : starter === PARLOR_CHIPS ? "My chips" : `My ${starter.name.toLowerCase()}` };
  }
  function startOver() {
    design = fresh();
    editing = null;
  }
  function edit(saved: SavedChips) {
    design = structuredClone($state.snapshot(saved.design));
    editing = saved;
    tab = "design";
    scrollTo({ top: 0 });
  }
  function remix(from: ChipDesign) {
    design = { ...structuredClone($state.snapshot(from)), name: from === PARLOR_CHIPS ? "My chips" : `${from.name} remix`.slice(0, 40) };
    editing = null;
    tab = "design";
    scrollTo({ top: 0 });
  }
  function keepIt(event?: Event) {
    event?.preventDefault();
    if (problems.length) return;
    try {
      editing = keepChips($state.snapshot(design), editing?.id);
      toast(`“${editing.design.name}” is kept in My chips.`, "success");
    } catch (error) {
      say(error);
    }
  }
  function playWith(set: ChipDesign) {
    try {
      const chosen = normalizeChips($state.snapshot(set));
      playWithChips(sameChips(chosen, PARLOR_CHIPS) ? null : chosen);
      toast(`You'll see “${chosen.name}” at every table played for chips on this device.`, "success");
    } catch (error) {
      say(error);
    }
  }
  function deleteIt() {
    if (!deleting) return;
    forgetChips(deleting.id);
    if (editing?.id === deleting.id) editing = null;
    toast(`Deleted “${deleting.design.name}”.`, "success");
    deleteOpen = false;
  }
  /** Change one chip's colours. */
  function colour(part: "colour" | "inset", value: string) {
    design.chips[picked]![part] = value;
  }
</script>

<toast-region position="bottom-end" label="Notifications"></toast-region>

<div class="page">
  <header class="top">
    <div>
      <a class="home" href="../"><span aria-hidden="true">←</span> open.parlor</a>
      <h1>Chip designer</h1>
      <p class="quiet">Make your own poker chips for Hold'em, Five Card Draw and Blackjack. <a href="./">Design a deck of cards instead</a></p>
    </div>
    <div class="now" aria-live="polite">
      <span>Playing with <strong>{ownChips ? "the parlor's own chips" : playing.name}</strong></span>
      {#if !ownChips}
        <action-button variant="link" size="sm" onclick={() => playWith(PARLOR_CHIPS)}>Use the parlor's chips</action-button>
      {/if}
    </div>
  </header>

  <p class="quiet note">Chips are for your own eyes: everyone at a table sees the chips they chose, and they're kept on this device.</p>

  <tab-list {tabs} value={tab} label="Chip designer" onvaluechange={(event: News<string>) => (tab = event.detail as Tab)}>
    <section data-tab="design">
      <div class="bench">
        <div class="stage">
          <poker-chip class="big" colour={chip.colour} inset={chip.inset} edge={design.edge} mark={design.mark} finish={design.finish} value={CHIP_VALUES[picked]} label="The {chipValueLabel(CHIP_VALUES[picked]!)} chip"></poker-chip>
          <ChipRack {design} {picked} onpick={(i) => (picked = i)} size={44} />
          <p class="hint">Pick a chip to change its colours.</p>
        </div>

        <form class="controls" onsubmit={keepIt} novalidate>
          {#if editing}
            <alert-banner variant="info" heading="Changing “{editing.design.name}”">
              <span>Keeping it updates this set.</span>
              <action-button slot="actions" variant="outline" size="sm" onclick={startOver}>Start a new set instead</action-button>
            </alert-banner>
          {/if}

          <fieldset>
            <legend>The set</legend>
            <text-field label="Name" value={design.name} maxlength={40} required={true} onvaluechange={(event: News<string>) => (design.name = event.detail)}></text-field>
            <select-field label="Start from" description="Picks every colour and choice below; change what you like after." placeholder="Choose a starting point" value="" options={starters} onvaluechange={(event: News<string>) => startFrom(event.detail)}></select-field>
          </fieldset>

          <fieldset>
            <legend>Every chip</legend>
            <div class="group">
              <span class="label">Edge</span>
              <segmented-control label="Edge" value={design.edge} options={edges} onvaluechange={(event: News<string>) => (design.edge = event.detail as ChipDesign["edge"])}></segmented-control>
            </div>
            <div class="group">
              <span class="label">Mark</span>
              <segmented-control class="marks" label="Mark" value={design.mark} options={marks} onvaluechange={(event: News<string>) => (design.mark = event.detail as ChipDesign["mark"])}></segmented-control>
            </div>
            <div class="group">
              <span class="label">Finish</span>
              <segmented-control label="Finish" value={design.finish} options={finishes} onvaluechange={(event: News<string>) => (design.finish = event.detail as ChipDesign["finish"])}></segmented-control>
              <span class="quiet small">How the light catches them at a table drawn in 3-D.</span>
            </div>
          </fieldset>

          <fieldset>
            <legend>The {chipValueLabel(CHIP_VALUES[picked]!)} chip</legend>
            <ColorPick label="Colour" value={chip.colour} palette={BODIES} onchange={(c) => colour("colour", c)} />
            <ColorPick label="Insets and mark" value={chip.inset} palette={INSETS} onchange={(c) => colour("inset", c)} />
          </fieldset>

          {#if problems.length}
            <alert-banner variant="warning" heading="These chips would be hard to play with">
              <ul class="problems">
                {#each problems as problem (problem)}
                  <li>{problem}</li>
                {/each}
              </ul>
            </alert-banner>
          {/if}

          <cluster-layout gap="0.6rem">
            <action-button type="submit" disabled={problems.length > 0}><span>{editing ? "Save changes" : "Keep these chips"}</span></action-button>
            <action-button variant="outline" disabled={problems.length > 0 || sameChips(playing, design)} onclick={() => playWith(design)}><span>{sameChips(playing, design) ? "You're playing with them" : "Play with them"}</span></action-button>
          </cluster-layout>
        </form>
      </div>
    </section>

    <section data-tab="mine">
      {#if kept.length}
        <auto-grid min="16rem" gap="1rem">
          {#each kept as saved (saved.id)}
            <content-card heading={saved.design.name}>
              <div slot="media" class="media"><ChipRack design={saved.design} size={30} /></div>
              {#if sameChips(playing, saved.design)}
                <status-badge variant="primary">Playing with them</status-badge>
              {/if}
              <cluster-layout slot="footer" gap="0.4rem">
                <action-button size="sm" disabled={sameChips(playing, saved.design)} onclick={() => playWith(saved.design)}>Play with them</action-button>
                <action-button variant="outline" size="sm" onclick={() => edit(saved)}>Change</action-button>
                <action-button variant="ghost" size="sm" label="Delete {saved.design.name}" onclick={() => ((deleting = saved), (deleteOpen = true))}>Delete</action-button>
              </cluster-layout>
            </content-card>
          {/each}
        </auto-grid>
      {:else}
        <empty-state heading="No chips yet">
          <span>Sets you keep show up here.</span>
          <action-button slot="actions" onclick={() => (tab = "design")}>Design some chips</action-button>
        </empty-state>
      {/if}
    </section>

    <section data-tab="starters">
      <auto-grid min="16rem" gap="1rem">
        {#each CHIP_STARTERS as starter (starter.name)}
          <content-card heading={starter.name}>
            <div slot="media" class="media"><ChipRack design={starter} size={30} /></div>
            <cluster-layout slot="footer" gap="0.4rem">
              <action-button size="sm" disabled={sameChips(playing, starter)} onclick={() => playWith(starter)}>Play with them</action-button>
              <action-button variant="outline" size="sm" onclick={() => remix(starter)}>Remix</action-button>
            </cluster-layout>
          </content-card>
        {/each}
      </auto-grid>
    </section>
  </tab-list>
</div>

<modal-dialog open={deleteOpen} label="Delete these chips?" onopenchange={(event: News<boolean>) => (deleteOpen = event.detail)}>
  <p>“{deleting?.design.name ?? "These chips"}” will be gone for good. If you're playing with them, you keep playing with them until you choose others.</p>
  <action-button slot="actions" variant="outline" data-close>Keep them</action-button>
  <action-button slot="actions" variant="destructive" onclick={deleteIt}>Delete chips</action-button>
</modal-dialog>

<style>
  .page { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.25rem; width: min(72rem, 100%); margin: 0 auto; padding: 1.25rem clamp(1rem, 3vw, 2rem) 5rem; }
  .quiet { color: var(--muted-foreground); font-size: 0.925rem; }
  .small { font-size: 0.85rem; }
  .note { max-width: 70ch; }
  .top { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 0.75rem 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border); }
  .home { font-size: 0.9rem; color: var(--muted-foreground); text-decoration: none; }
  .home:hover { text-decoration: underline; }
  h1 { font-size: clamp(1.6rem, 4vw, 2rem); margin: 0.2rem 0; }
  .now { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.75rem; font-size: 0.9rem; color: var(--muted-foreground); }
  .now strong { color: var(--foreground); }

  .bench { display: grid; gap: 1.5rem; grid-template-columns: minmax(0, 1fr); align-items: start; }
  @media (min-width: 56rem) {
    .bench { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 2rem; }
    .stage { position: sticky; top: 1rem; }
  }
  .stage {
    display: grid; gap: 1.1rem; justify-items: center; padding: 1.75rem 1rem 1.25rem;
    border-radius: calc(var(--radius) * 2);
    background: radial-gradient(120% 90% at 50% 0%, var(--felt-light), var(--felt-dark));
    color: #fbf6ec;
  }
  .stage :global(poker-chip.big) { width: min(15rem, 60vw); }
  .hint { font-size: 0.85rem; color: #d9e4dc; }
  .media { display: grid; place-items: center; padding: 1rem 0.5rem; background: radial-gradient(120% 90% at 50% 0%, var(--felt-light), var(--felt-dark)); }

  .controls { display: grid; gap: 1.25rem; }
  fieldset { display: grid; gap: 1rem; min-width: 0; margin: 0; padding: 1.1rem 1.2rem 1.25rem; border: 1px solid var(--border); border-radius: calc(var(--radius) * 1.4); background: var(--card); }
  legend { padding: 0 0.4rem; font-family: Georgia, "Times New Roman", serif; font-size: 1.05rem; font-weight: 600; }
  .group { display: grid; gap: 0.4rem; justify-items: start; }
  .label { font-size: 0.9rem; font-weight: 600; }
  .controls :global(.marks button) { min-width: 2.4rem; font-size: 1.05rem; font-variant-emoji: text; }
  .problems { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.25rem; }
</style>
