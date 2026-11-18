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
  /** The engine's words that are replaced and aren't in the lists above: anything else it says can be, word for word. */
  const listed = new Set<string>(TEXTS.map((text) => text.from));
  const others = $derived([...words.keys()].filter((from) => !from.startsWith("!") && !listed.has(from)));
  let [from, to] = $state(["", ""]);
  function addOther() {
    const [theirs, ours] = [from.trim(), plain(to).trim()];
    if (!theirs || !ours || theirs.startsWith("!") || theirs.includes("=")) return;
    changed((next) => next.set(theirs, ours));
    [from, to] = ["", ""];
  }
  /** The ending is kept on one line, its line breaks written as \n. */
  const ending = $derived((words.get("!ending") ?? "").split("\\n").join("\n"));
  const setEnding = (text: string) => changed((next) => (text.trim() ? next.set("!ending", text.split("\n").map((line) => plain(line).trimEnd()).join("\\n")) : next.delete("!ending")));
  const setLevels = (text: string) => {
    const count = Math.round(Number(text));
    changed((next) => (count >= 1 && count <= 36 ? next.set("!levels", String(count)) : next.delete("!levels")));
  };
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

  <h2>The end of the game</h2>
  <text-field data-key="levels" type="number" inputmode="numeric" label="How many levels the game has" description="The ending comes after this one. Nine to an episode, so the tenth is the second episode's first. Empty, the game ends after the eighth of each episode, as the engine always did." value={words.get("!levels") ?? ""} onvaluechange={(event: News<string>) => setLevels(event.detail)}></text-field>
  <label class="moment">
    <span>What it says when they are done</span>
    <textarea data-key="ending" rows={Math.max(4, ending.split("\n").length + 1)} value={ending} oninput={(event) => setEnding(event.currentTarget.value)}></textarea>
  </label>

  <h2>Anything else the game says</h2>
  <p class="quiet">Any words of the engine's can be replaced: give them exactly as the game shows them, capitals, spaces and full stops and all, and what to say in their place.</p>
  <div class="texts">
    {#each others as theirs (theirs)}
      <text-field data-from={theirs} label={theirs} description="Empty it to have the engine's own words back." value={words.get(theirs) ?? ""} onvaluechange={(event: News<string>) => changed((next) => (plain(event.detail).trim() ? next.set(theirs, plain(event.detail)) : next.delete(theirs)))}></text-field>
    {/each}
    <text-field class="other-from" label="The engine's own words" placeholder="Picked up a rocket." value={from} onvaluechange={(event: News<string>) => (from = event.detail)}></text-field>
    <text-field class="other-to" label="What to say instead" value={to} onvaluechange={(event: News<string>) => (to = event.detail)}></text-field>
    <action-button class="other-add" variant="outline" size="sm" disabled={!from.trim() || !plain(to).trim()} onclick={addOther}>Replace those words</action-button>
  </div>
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
