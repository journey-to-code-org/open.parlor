<!--
  Svelte's own features around Zubra components: keyed each with animate:flip, context, class: and
  style:, #await import(), transition:, spread props, use: actions, #key and snippets. The checks
  are in tests/features.spec.ts.
-->
<script lang="ts">
  import { setContext } from "svelte";
  import { flip } from "svelte/animate";
  import { fade } from "svelte/transition";
  import { FACES, VARIANTS, WORDS } from "../shared/fixture";
  import Word from "./Word.svelte";

  let faces = $state([...FACES]);
  let word = $state<string>(WORDS[0]);
  setContext("word", () => word);
  let hot = $state(false);
  let wanted = $state(false);
  let fading = $state(true);
  let left = $state(0);
  let spread = $state(0);
  const badge = $derived({ variant: VARIANTS[spread % VARIANTS.length], dot: true });
  let heard = $state("");
  let live = $state(0);
  let watched = $state(true);
  let key = $state(0);
  let presses = $state(0);

  /** An action: tells the page what the field reports, for as long as the field is there. */
  function hears(node: HTMLElement, tell: (text: string) => void) {
    const listener = (event: Event) => tell((event as CustomEvent<string>).detail);
    node.addEventListener("valuechange", listener);
    live++;
    return {
      destroy() {
        node.removeEventListener("valuechange", listener);
        live--;
      },
    };
  }
</script>

{#snippet action(label: string)}
  <action-button slot="actions" data-t="f-snip-action" onclick={() => presses++}>{label}</action-button>
{/snippet}

<main data-t="f-features">
  <section>
    <h2>A keyed list, reordered (animate:flip)</h2>
    <stack-layout data-t="f-order" gap="0.25rem">
      {#each faces as face (face)}
        <status-badge data-f-item={face} animate:flip={{ duration: 120 }}>{face}</status-badge>
      {/each}
    </stack-layout>
    <button data-t="f-reverse" type="button" onclick={() => (faces = [...faces].reverse())}>Reverse</button>
  </section>

  <section>
    <h2>Context through a slot</h2>
    <empty-state data-t="f-ctx-home" heading="Context"><Word /></empty-state>
    <button data-t="f-ctx-set" type="button" onclick={() => (word = WORDS[1])}>Change the word</button>
  </section>

  <section>
    <h2>class: and style:</h2>
    <status-badge data-t="f-styled" class:f-hot={hot} style:opacity={hot ? 0.5 : 1}>Styled</status-badge>
    <button data-t="f-style-toggle" type="button" onclick={() => (hot = !hot)}>Toggle</button>
  </section>

  <section>
    <h2>Loaded later (#await import)</h2>
    {#if wanted}
      {#await import("./Lazy.svelte")}
        <span data-t="f-lazy-wait">Waiting</span>
      {:then { default: Lazy }}
        <Lazy />
      {/await}
    {:else}
      <span data-t="f-lazy-wait">Waiting</span>
    {/if}
    <button data-t="f-lazy-load" type="button" onclick={() => (wanted = true)}>Load</button>
  </section>

  <section>
    <h2>Leaving with a transition (transition:fade)</h2>
    {#if fading}
      <status-badge data-t="f-fade" transition:fade={{ duration: 120 }} onoutroend={() => left++}>Fading</status-badge>
    {/if}
    <output data-t="f-fade-out">{left}</output>
    <button data-t="f-fade-toggle" type="button" onclick={() => (fading = !fading)}>Toggle</button>
  </section>

  <section>
    <h2>Props from an object (spread)</h2>
    <status-badge data-t="f-spread" {...badge}>Spread</status-badge>
    <button data-t="f-spread-next" type="button" onclick={() => spread++}>Next</button>
  </section>

  <section>
    <h2>An action (use:)</h2>
    {#if watched}
      <text-field data-t="f-action" label="Watched" use:hears={(text) => (heard = text)}></text-field>
    {/if}
    <output data-t="f-action-out">{heard}</output>
    <output data-t="f-action-live">{live}</output>
    <button data-t="f-action-toggle" type="button" onclick={() => (watched = !watched)}>Take away</button>
  </section>

  <section>
    <h2>Made afresh (#key)</h2>
    {#key key}
      <toggle-switch data-t="f-keyed" label="Fresh"></toggle-switch>
    {/key}
    <button data-t="f-key-next" type="button" onclick={() => key++}>Next key</button>
  </section>

  <section>
    <h2>Snippets</h2>
    <empty-state data-t="f-snip" heading="Snippet">
      <span>Snippet text</span>
      {@render action("Go")}
    </empty-state>
    <output data-t="f-snip-out">{presses}</output>
  </section>
</main>
