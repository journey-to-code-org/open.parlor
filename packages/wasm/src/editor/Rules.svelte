<!--
  The game's rules: what each thing is (how much it can take, how fast and big it is, what it is
  drawn with and sounds like), how much ammunition is held, and a handful of the engine's numbers.
  Kept as one change, the RULES lump (wad/rules.ts), a moment after typing stops. Only what
  differs from the engine's own is written, so an empty box is the engine's own.
-->
<script lang="ts">
  import type { Change } from "../../wad/mod.ts";
  import { describe } from "../../wad/names.ts";
  import { ACTION_NOTES, ACTIONS, AMMO, copyThing, ENTRIES, type Entry, momentOf, momentsFrom, NUMBERS, OWN_STATES, OWN_THINGS, readRules, removeThing, RULES, type RuleThing, THING_NUMBERS, THING_SOUNDS, thingKey, thingsOf, writeRules } from "../../wad/rules.ts";

  type News<T> = CustomEvent<T>;

  let {
    original,
    saved,
    sprites,
    sounds,
    keep,
    restore,
  }: {
    /** The rules the game came with, if it came with any. */
    original: Uint8Array | undefined;
    /** The rules as they were last kept, if they have been changed. */
    saved: Uint8Array | undefined;
    /** Every sprite there is, by its four letters: the game's and any that were added. */
    sprites: string[];
    /** Every sound there is, by its lump's name. */
    sounds: string[];
    keep: (change: Change) => void;
    restore: () => void;
  } = $props();

  // What is on the page is the truth while it is being typed; what was kept is read when it changes from outside (put back, a file loaded).
  let rules = $state.raw(new Map<string, string>());
  let shownFor: Uint8Array | undefined | null = null;
  $effect(() => {
    const from = saved ?? original;
    if (from === shownFor) return;
    shownFor = from;
    rules = readRules(from);
  });

  let timer = 0;
  function changed(act: (rules: Map<string, string>) => void) {
    const next = new Map(rules);
    act(next);
    rules = next;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const data = writeRules(next);
      const own = writeRules(readRules(original));
      const same = data.length === own.length && data.every((byte, i) => byte === own[i]);
      if (same) {
        shownFor = original;
        restore();
      } else {
        shownFor = data;
        keep({ kind: "rules", name: RULES, data });
      }
    }, 400);
  }
  /** Sets a rule, or takes it away where the box was emptied or says what the engine would anyway. */
  const set = (key: string, value: string, own: string) => changed((next) => (value === "" || value === own ? next.delete(key) : next.set(key, value)));
  /** A whole number of nought or more, or "" for anything else. */
  const whole = (text: string) => (/^\d{1,6}$/.test(text.trim()) ? String(Number(text.trim())) : "");

  const SORTS = [
    { value: "monster", label: "Monsters" },
    { value: "shot", label: "What is thrown" },
    { value: "pickup", label: "Pick-ups" },
    { value: "all", label: "Everything" },
  ];
  let sort = $state("monster");
  /** Every kind of thing as the rules leave it, the ones the rules made among them. */
  const things = $derived(thingsOf(rules));
  const isNew = (thing: RuleThing) => thing.index >= OWN_THINGS;
  const name = (thing: RuleThing) => (isNew(thing) ? `Yours, number ${thing.number}` : describe("sprite", thing.sprite) || thing.id.replace("MT_", "").toLowerCase());
  const listed = $derived(things.filter((thing) => sort === "all" || thing.sort === sort));
  const choices = $derived(listed.map((thing) => ({ value: String(thing.index), label: `${name(thing)} (${thing.sprite})${!isNew(thing) && [...rules.keys()].some((key) => key.startsWith(`thing.${thing.index}.`)) ? " · changed" : ""}` })));
  let picked = $state("12");
  const thing = $derived(listed.find((one) => String(one.index) === picked) ?? listed[0]!);
  /** What the engine's own of a field is for this thing: for one the rules made, there is none, and every box is its own. */
  const ownOf = (one: RuleThing, field: keyof RuleThing) => (isNew(one) ? "" : String(thingsOf(new Map()).find((own) => own.index === one.index)![field]));

  // What it does: its moments, from where they start for one of the things that can happen to it.
  let entry = $state<Entry>("spawnstate");
  const entries = $derived(ENTRIES.filter(({ key }) => thing[key] > 0).map(({ key, label }) => ({ value: key, label })));
  const start = $derived(thing[entries.some((one) => one.value === entry) ? entry : (entries[0]?.value ?? "spawnstate")]);
  const moments = $derived(momentsFrom(rules, start));
  const FRAMES = Array.from({ length: 29 }, (_, i) => ({ value: String(i), label: String.fromCharCode(65 + i) }));
  const actionChoices = [{ value: "", label: "Nothing" }, ...ACTIONS.map((action) => ({ value: action, label: ACTION_NOTES[action] ? `${ACTION_NOTES[action]} (${action})` : action }))];
  /** Sets something of a moment. One of the engine's own goes back to its own when set to what that was; one of the rules' keeps every line. */
  function setMoment(number: number, field: "frame" | "bright" | "tics" | "action" | "next", value: string) {
    if (value === "") return;
    const own = momentOf(new Map(), number);
    const was = field === "bright" ? (own.bright ? "1" : "0") : field === "action" ? own.action || "-" : String(own[field]);
    changed((next) => (number < OWN_STATES && value === was ? next.delete(`state.${number}.${field}`) : next.set(`state.${number}.${field}`, value)));
  }
  /** A whole number, or -1, or "". */
  const signed = (text: string) => (/^-?\d{1,6}$/.test(text.trim()) && Number(text) >= -1 ? String(Number(text.trim())) : "");
  /** Which other kinds of thing go through a moment too: changing it changes them. */
  const sharedWith = $derived.by(() => {
    const mine = new Set(moments.map((moment) => moment.number));
    return things.filter((other) => other.index !== thing.index && ENTRIES.some(({ key }) => momentsFrom(rules, other[key]).some((moment) => mine.has(moment.number)))).map(name);
  });

  let full = $state(false);
  function makeNew() {
    const made = copyThing(rules, thing);
    if (!made) return void (full = true);
    changed((next) => {
      next.clear();
      for (const [key, value] of made.rules) next.set(key, value);
    });
    sort = "all";
    picked = String(made.index);
  }
  function takeOut() {
    const without = removeThing(rules, thing.index);
    changed((next) => {
      next.clear();
      for (const [key, value] of without) next.set(key, value);
    });
  }
  const spriteChoices = $derived(sprites.map((sprite) => ({ value: sprite, label: describe("sprite", sprite) ? `${sprite}: ${describe("sprite", sprite)}` : sprite })));
  const soundChoices = (own: string) => [{ value: "", label: own ? `The engine's own (${own})` : "The engine's own (none)" }, { value: "-", label: "None" }, ...sounds.map((sound) => ({ value: sound, label: describe("sound", sound) ? `${sound}: ${describe("sound", sound)}` : sound }))];
  const groups = [...new Set(NUMBERS.map((number) => number.group))];
  const count = $derived(rules.size);
</script>

<div class="rules">
  <div class="bar">
    <p class="quiet">What each thing is, and the numbers the game plays by. An empty box is the engine's own, shown faintly. They are read when the game starts, and a game with other devices is played without them.</p>
    <action-button variant="outline" size="sm" disabled={!saved} onclick={restore}>Put the rules back</action-button>
  </div>
  <p class="quiet">{count === 0 ? "Nothing is changed." : count === 1 ? "One rule is changed." : `${count} rules are changed.`}</p>

  <h2>Things</h2>
  <segmented-control label="Which things" options={SORTS} value={sort} onvaluechange={(event: News<string>) => (sort = event.detail)}></segmented-control>
  <select-field class="which-thing" label="A thing" options={choices} value={String(thing.index)} onvaluechange={(event: News<string>) => (picked = event.detail)}></select-field>
  {#key thing.index}
    <cluster-layout gap="0.6rem">
      <action-button class="make-new" variant="outline" size="sm" onclick={makeNew}>Make a new thing like this one</action-button>
      {#if isNew(thing)}<action-button class="take-out" variant="ghost" size="sm" onclick={takeOut}>Take this thing out</action-button>{/if}
    </cluster-layout>
    {#if full}<p class="quiet">There is room for 32 kinds of thing of your own, and about 500 moments between them: that room is used up.</p>{/if}
    {#if isNew(thing)}
      <text-field data-rule={thingKey(thing, "number")} type="number" inputmode="numeric" label="The number levels place it by" description="It is in the Levels tab's list of things to add under this number. Not one the game uses already." value={rules.get(thingKey(thing, "number")) ?? ""} onvaluechange={(event: News<string>) => whole(event.detail) && Number(event.detail) > 4 && !things.some((other) => other.index !== thing.index && other.number === Number(event.detail)) && set(thingKey(thing, "number"), whole(event.detail), "")}></text-field>
    {/if}
    <div class="grid">
      {#each THING_NUMBERS as field (field.key)}
        <text-field data-rule={thingKey(thing, field.key)} type="number" inputmode="numeric" label={field.label} description={field.help} placeholder={ownOf(thing, field.key) || String(thing[field.key])} value={rules.get(thingKey(thing, field.key)) ?? ""} onvaluechange={(event: News<string>) => set(thingKey(thing, field.key), whole(event.detail), ownOf(thing, field.key))}></text-field>
      {/each}
    </div>
    <select-field data-rule={thingKey(thing, "sprite")} label="Drawn with" description="Every picture of the sprite takes the place of the same moment and side of its own. One you have added goes here by its four letters; a moment it has no picture for isn't drawn." options={spriteChoices} value={rules.get(thingKey(thing, "sprite")) ?? thing.sprite} onvaluechange={(event: News<string>) => set(thingKey(thing, "sprite"), event.detail, ownOf(thing, "sprite"))}></select-field>
    <div class="grid">
      {#each THING_SOUNDS as field (field.key)}
        <select-field data-rule={thingKey(thing, field.key)} label={field.label} options={soundChoices(thing[field.key])} value={rules.get(thingKey(thing, field.key)) ?? ""} onvaluechange={(event: News<string>) => set(thingKey(thing, field.key), event.detail, "")}></select-field>
      {/each}
    </div>

    <h3>What it does</h3>
    <p class="quiet">A thing is always in one moment or another: a picture of its sprite, for so long, running something, then on to the next. Time is in thirty-fifths of a second; -1 is for good.</p>
    {#if entries.length}
      <select-field class="which-entry" label="When it is" options={entries} value={entries.some((one) => one.value === entry) ? entry : entries[0]!.value} onvaluechange={(event: News<string>) => (entry = event.detail as Entry)}></select-field>
      {#if sharedWith.length}<p class="quiet shared">These moments are also {sharedWith.slice(0, 4).join(", ")}{sharedWith.length > 4 ? ` and ${sharedWith.length - 4} more` : ""}'s: changing them changes those too. A new thing made like this one has moments of its own.</p>{/if}
      <ol class="moments">
        {#each moments as moment (moment.number)}
          <li data-moment={moment.number}>
            <span class="count">{moment.number}</span>
            <select-field class="m-frame" label="Picture" options={FRAMES} value={String(moment.frame)} onvaluechange={(event: News<string>) => setMoment(moment.number, "frame", event.detail)}></select-field>
            <text-field class="m-tics" type="number" inputmode="numeric" label="For" value={String(moment.tics)} onvaluechange={(event: News<string>) => setMoment(moment.number, "tics", signed(event.detail))}></text-field>
            <select-field class="m-action" label="Running" options={actionChoices} value={moment.action} onvaluechange={(event: News<string>) => setMoment(moment.number, "action", event.detail || "-")}></select-field>
            <text-field class="m-next" type="number" inputmode="numeric" label="Then" value={String(moment.next)} onvaluechange={(event: News<string>) => setMoment(moment.number, "next", whole(event.detail))}></text-field>
            <toggle-switch class="m-bright" label="Lit" checked={moment.bright} oncheckedchange={(event: News<boolean>) => setMoment(moment.number, "bright", event.detail ? "1" : "0")}></toggle-switch>
          </li>
        {/each}
      </ol>
      <p class="quiet">{moments.at(-1)?.tics === -1 ? "It stays in the last of them." : moments.at(-1)?.next === 0 ? "After the last of them it is gone." : `After the last of them it goes to moment ${moments.at(-1)?.next}.`}</p>
    {:else}
      <p class="quiet">It has no moments of its own.</p>
    {/if}
  {/key}

  <h2>Ammunition</h2>
  <div class="grid">
    {#each AMMO as ammo, index (ammo.label)}
      <text-field data-rule={`ammo.${index}.max`} type="number" inputmode="numeric" label={`${ammo.label}: the most you can carry`} placeholder={String(ammo.max)} value={rules.get(`ammo.${index}.max`) ?? ""} onvaluechange={(event: News<string>) => set(`ammo.${index}.max`, whole(event.detail), String(ammo.max))}></text-field>
      <text-field data-rule={`ammo.${index}.clip`} type="number" inputmode="numeric" label={`${ammo.label}: in a small pick-up`} description="A box is five times this." placeholder={String(ammo.clip)} value={rules.get(`ammo.${index}.clip`) ?? ""} onvaluechange={(event: News<string>) => set(`ammo.${index}.clip`, whole(event.detail), String(ammo.clip))}></text-field>
    {/each}
  </div>

  {#each groups as group (group)}
    <h2>{group}</h2>
    <div class="grid">
      {#each NUMBERS.filter((number) => number.group === group) as number (number.key)}
        <text-field data-rule={`rule.${number.key}`} type="number" inputmode="numeric" label={number.label} placeholder={String(number.own)} value={rules.get(`rule.${number.key}`) ?? ""} onvaluechange={(event: News<string>) => set(`rule.${number.key}`, whole(event.detail), String(number.own))}></text-field>
      {/each}
    </div>
  {/each}
</div>

<style>
  .rules {
    display: grid;
    gap: 0.9rem;
    max-width: 52rem;
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
  h3 {
    margin: 0.4rem 0 0;
    font-size: 0.98rem;
  }
  .moments {
    display: grid;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .moments li {
    display: grid;
    grid-template-columns: 2.6rem 5rem 5rem minmax(10rem, 1fr) 5.5rem auto;
    align-items: end;
    gap: 0.5rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .count {
    align-self: center;
    color: var(--muted-foreground);
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 44rem) {
    .moments li {
      grid-template-columns: 1fr 1fr;
    }
    .count {
      grid-column: 1 / -1;
    }
    .moments :global(.m-action) {
      grid-column: 1 / -1;
    }
  }
  .quiet {
    margin: 0;
    color: var(--muted-foreground);
    font-size: 0.9rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 0.9rem;
  }
</style>
