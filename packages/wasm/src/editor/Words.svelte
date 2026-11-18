<!--
  What the game says: lines for when things happen (Delbie's), and the engine's own words for
  levels, things picked up and locked doors, each with what to say in its place. Kept as one
  change, the WORDS lump (wad/words.ts), a moment after typing stops.
-->
<script lang="ts">
  import type { Change } from "../../wad/mod.ts";
  import { linesFor, MOMENTS, plain, readWords, setLines, TEXTS, WORDS, writeWords } from "../../wad/words.ts";

  type News<T> = CustomEvent<T>;

  let {
    original,
    saved,
    keep,
    restore,
  }: {
    /** The words as the game has them. */
    original: Uint8Array | undefined;
    /** The words as they were last kept, if they have been changed. */
    saved: Uint8Array | undefined;
    keep: (change: Change) => void;
    restore: () => void;
  } = $props();

  // What is on the page is the truth while it is being typed; what was kept is read when it changes from outside (put back, a file loaded).
  let words = $state.raw(new Map<string, string>());
  let shownFor: Uint8Array | undefined | null = null;
  $effect(() => {
    const from = saved ?? original;
    if (from === shownFor) return;
    shownFor = from;
    words = readWords(from);
  });

  const groups = [...new Set(TEXTS.map((text) => text.group))];
  let timer = 0;
  function changed(act: (words: Map<string, string>) => void) {
    const next = new Map(words);
    act(next);
    words = next;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const data = writeWords(next);
      const own = writeWords(readWords(original));
      const same = data.length === own.length && data.every((byte, i) => byte === own[i]);
      if (same) {
        shownFor = original;
        restore();
      } else {
        shownFor = data;
        keep({ kind: "words", name: WORDS, data });
      }
    }, 400);
  }
</script>

<div class="words">
  <div class="bar">
    <p class="quiet">The game's font has capitals, figures and plain marks only; anything else is left out. Leave a box empty and the game says what it would have, or nothing.</p>
    <action-button variant="outline" size="sm" disabled={!saved} onclick={restore}>Put the words back</action-button>
  </div>

  <h2>What Delbie says</h2>
  <p class="quiet">A line each. The game picks one of them each time, and doesn't talk over itself.</p>
  {#each MOMENTS as moment (moment.key)}
    <label class="moment">
      <span>{moment.label}</span>
      <textarea data-moment={moment.key} rows={Math.max(2, linesFor(words, moment.key).length + 1)} value={linesFor(words, moment.key).join("\n")} oninput={(event) => changed((next) => setLines(next, moment.key, event.currentTarget.value.split("\n")))}></textarea>
    </label>
  {/each}

  {#each groups as group (group)}
    <h2>{group}</h2>
    <div class="texts">
      {#each TEXTS.filter((text) => text.group === group) as text (text.from)}
        <text-field data-from={text.from} label={text.label} description={`The engine's own: "${text.from}"`} value={words.get(text.from) ?? ""} onvaluechange={(event: News<string>) => changed((next) => (plain(event.detail).trim() ? next.set(text.from, event.detail) : next.delete(text.from)))}></text-field>
      {/each}
    </div>
  {/each}
</div>

<style>
  .words {
    display: grid;
    gap: 0.9rem;
    max-width: 46rem;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  h2 {
    margin: 0.6rem 0 0;
    font-size: 1.05rem;
  }
  .quiet {
    margin: 0;
    color: var(--muted-foreground);
    font-size: 0.9rem;
  }
  .moment {
    display: grid;
    gap: 0.35rem;
    font-weight: 600;
    font-size: 0.92rem;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--background);
    color: var(--foreground);
    font: inherit;
    font-weight: 400;
    line-height: 1.5;
    resize: vertical;
  }
  textarea:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .texts {
    display: grid;
    gap: 0.9rem;
  }
</style>
