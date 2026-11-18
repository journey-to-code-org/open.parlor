<!--
  The game's rules: what each thing is (how much it can take, how fast and big it is, what it is
  drawn with and sounds like), how much ammunition is held, and a handful of the engine's numbers.
  Kept as one change, the RULES lump (wad/rules.ts), a moment after typing stops. Only what
  differs from the engine's own is written, so an empty box is the engine's own.
-->
<script lang="ts">
  import type { Change } from "../../wad/mod.ts";
  import { describe } from "../../wad/names.ts";
  import { AMMO, NUMBERS, readRules, RULE_THINGS, RULES, type RuleThing, THING_NUMBERS, THING_SOUNDS, thingKey, writeRules } from "../../wad/rules.ts";

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
  const name = (thing: RuleThing) => describe("sprite", thing.sprite) || thing.id.replace("MT_", "").toLowerCase();
  const listed = $derived(RULE_THINGS.filter((thing) => sort === "all" || thing.sort === sort));
  const choices = $derived(listed.map((thing) => ({ value: String(thing.index), label: `${name(thing)} (${thing.sprite})${[...rules.keys()].some((key) => key.startsWith(`thing.${thing.index}.`)) ? " · changed" : ""}` })));
  let picked = $state("12");
  const thing = $derived(listed.find((one) => String(one.index) === picked) ?? listed[0]!);
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
    <div class="grid">
      {#each THING_NUMBERS as field (field.key)}
        <text-field data-rule={thingKey(thing, field.key)} type="number" inputmode="numeric" label={field.label} description={field.help} placeholder={String(thing[field.key])} value={rules.get(thingKey(thing, field.key)) ?? ""} onvaluechange={(event: News<string>) => set(thingKey(thing, field.key), whole(event.detail), String(thing[field.key]))}></text-field>
      {/each}
    </div>
    <select-field data-rule={thingKey(thing, "sprite")} label="Drawn with" description="Every picture of the sprite takes the place of the same moment and side of its own. One you have added goes here by its four letters; a moment it has no picture for isn't drawn." options={spriteChoices} value={rules.get(thingKey(thing, "sprite")) ?? thing.sprite} onvaluechange={(event: News<string>) => set(thingKey(thing, "sprite"), event.detail, thing.sprite)}></select-field>
    <div class="grid">
      {#each THING_SOUNDS as field (field.key)}
        <select-field data-rule={thingKey(thing, field.key)} label={field.label} options={soundChoices(thing[field.key])} value={rules.get(thingKey(thing, field.key)) ?? ""} onvaluechange={(event: News<string>) => set(thingKey(thing, field.key), event.detail, "")}></select-field>
      {/each}
    </div>
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
