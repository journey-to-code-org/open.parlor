<!--
  The editor for the game: everything the game is drawn and heard with, and every other lump of its data, by
  kind, each of which can be swapped for a file of your own. What is changed is kept in this
  browser, and is what the game is played with, alone.

  The page is Svelte; its controls are Zubra components (see zubra.ts): zubra-ui's tabs, fields,
  switches, buttons, badges, dialogs and toasts. They're custom elements, so Svelte sets their
  properties and listens to their events directly. Reading and writing the game's data is ../../wad,
  which knows nothing of Svelte or of the page.
-->
<script lang="ts">
  import { SvelteMap } from "svelte/reactivity";
  import game from "../../games/shooter/data.json";
  import nodesWasm from "../../games/shooter/nodes/nodes.wasm?url";
  import wasm from "../../games/shooter/shooter.wasm?url";
  import { asset as fetched } from "../../host/assets.ts";
  import { type Asset, canAdd, catalogue, isDrawn, isNewNameFor, key, type Kind, KINDS } from "../../wad/catalogue.ts";
  import { RULES } from "../../wad/rules.ts";
  import { WORDS } from "../../wad/words.ts";
  import { wallNames } from "../../wad/level.ts";
  import { composeWall, wallPictures as readWallPictures } from "../../wad/texture.ts";
  import { applyMod, type Change, isAddition, modFromWad, modToWad } from "../../wad/mod.ts";
  import { decodePatch, type Palette, paletteOf } from "../../wad/picture.ts";
  import { loadMod, removeChange, saveChange } from "../../wad/saved.ts";
  import { readWad, type Wad } from "../../wad/wad.ts";
  import { withDelbies } from "../shooter/delbies.ts";
  import { mountShooter, type Shooter } from "../shooter/player.ts";
  import { download, type Fit, isSound, pictureLump, pictureOf, play, png, soundLump } from "./convert.ts";
  import Levels from "./Levels.svelte";
  import Rules from "./Rules.svelte";
  import Thumb from "./Thumb.svelte";
  import Words from "./Words.svelte";

  type News<T> = CustomEvent<T>;
  type Tab = Kind | "level" | "said" | "ruled" | "changed" | "play";

  const LABELS: Record<string, string> = { sprite: "Sprites", wall: "Walls", floor: "Floors", screen: "Screens", sound: "Sounds", other: "Everything else" };
  /** The kinds with a tab of tiles each. */
  const TILED: Kind[] = [...KINDS, "other"];
  /** What one of a kind is called, where something new of it can be added. */
  const ONE: Partial<Record<Kind, string>> = { sprite: "sprite", wall: "wall", floor: "floor", sound: "sound", other: "lump" };
  const HINTS: Record<string, string> = {
    sprite: "Everything that stands in a level: monsters, the weapon in your hand, things to pick up. A name is four letters for the thing, a letter for the moment, and a number for the side it is seen from. One you add under four letters of your own is drawn once the Rules tab gives it to a thing.",
    wall: "The pieces walls are built from. A new picture is made the size of the piece it replaces. One you add under a new name becomes a wall picture of that name, to put on walls in the Levels tab.",
    floor: "Floors and ceilings. Each is 64 by 64 pixels and repeats. One you add under a new name can be put on floors and ceilings in the Levels tab.",
    screen: "The title, the menus, the status bar, the scores and the letters. A new picture is made the size of the one it replaces.",
    sound: "Sound effects. Any sound file this browser can play will do; it is made one channel, at the game's rate. One you add under a name of your own is heard once the Rules tab gives it to a thing.",
    other: "The rest of what is in the game's data: its colours, the lists that say which pieces make which wall, its songs, the recordings played behind the title. A file given here goes in as it is, byte for byte, so it has to be in the engine's own form already. Get one wrong and the game may not start: put it back and it will.",
  };
  /** How many of a tab are shown before "Show more". */
  const PAGE = 60;
  const address = `${import.meta.env.BASE_URL}data/${game.file}`;

  let stage = $state<"loading" | "ready" | "failed">("loading");
  let progress = $state("Fetching the game");
  let failure = $state("");
  // The game's own data, read once, then never changed.
  let wad = $state.raw<Wad>({ kind: "IWAD", lumps: [] });
  let palette = $state.raw<Palette>(new Uint8Array(768));
  let assets = $state.raw<Asset[]>([]);
  /** What has been changed, by kind and name. */
  const changes = new SvelteMap<string, Change>();

  let tab = $state<Tab>("sprite");
  let search = $state("");
  let shown = $state(PAGE);
  let picked = $state<Asset | null>(null);
  let fit = $state<Fit>({ ownSize: false, smooth: true });
  let over = $state(false);
  let busy = $state(false);
  let resetting = $state(false);
  /** Something new being added: its kind, the name being typed for it, and what is wrong with the name. */
  let adding = $state<{ kind: Kind; name: string } | null>(null);
  let adder = $state<HTMLInputElement>();
  let chooser = $state<HTMLInputElement>();
  let importer = $state<HTMLInputElement>();
  let stageElement = $state<HTMLElement>();
  /** The level open in the Levels tab, and the one "Try it" starts in (none: the title screen). */
  let level = $state("");
  let tryLevel = $state("");

  const tabs = $derived([...KINDS.map((kind) => ({ value: kind, label: LABELS[kind]! })), { value: "level", label: "Levels" }, { value: "said", label: "Words" }, { value: "ruled", label: "Rules" }, { value: "other", label: LABELS.other! }, { value: "changed", label: `Changed (${changes.size})` }, { value: "play", label: "Try it" }]);
  /** What the game came with. */
  const own = $derived(new Set(assets.map((asset) => key(asset.kind, asset.name))));
  /** What has been added to it: a floor, a wall or a lump under a name the game had nothing by. */
  const added = $derived([...changes.values()].filter((change) => !own.has(key(change.kind, change.name)) && (isAddition(change) || change.kind === "rules")).map((change): Asset => ({ kind: change.kind, name: change.name, index: -1, note: change.kind === "rules" ? "What each thing is, and the numbers the game plays by" : "Added by you" })));
  /** Everything there is to change: the game's own and what has been added, by name. */
  const all = $derived(added.length ? [...assets, ...added].sort((a, b) => a.name.localeCompare(b.name)) : assets);
  const recipes = $derived(readWallPictures(wad));
  /** A wall that was added is a wall picture of its own name, unless the game has one by that name already. */
  const newWalls = $derived(added.filter((asset) => asset.kind === "wall" && !recipes.has(asset.name)));
  const wallPictures = $derived(newWalls.length ? [...wallNames(wad), ...newWalls.map((asset) => asset.name)].sort() : wallNames(wad));
  /** The pieces wall pictures are put together from, by name. */
  const pieces = $derived(new Map(all.filter((asset) => asset.kind === "wall").map((asset) => [asset.name, asset])));
  /** What a wall picture looks like, from its patches as they now are: one that has been changed shows changed. */
  const wallPicture = (name: string) => {
    const recipe = recipes.get(name);
    if (!recipe) return newWalls.some((asset) => asset.name === name) ? decodePatch(now(pieces.get(name)!)) : null;
    return composeWall(recipe, (patch) => (pieces.has(patch) ? now(pieces.get(patch)!) : undefined));
  };
  /** The node builder, fetched and compiled the first time a level's walls are changed. */
  let nodes: Promise<WebAssembly.Module> | null = null;
  const builder = () => (nodes ??= WebAssembly.compileStreaming(fetch(nodesWasm)).catch((error) => ((nodes = null), Promise.reject(error))));
  /** As the game has it: nothing, for something that was added. */
  const original = (asset: Asset) => wad.lumps[asset.index]?.data ?? new Uint8Array(0);
  const isNew = (asset: Asset) => asset.index < 0;
  const bytes = (count: number) => (count < 1024 ? `${count} bytes` : count < 1048576 ? `${(count / 1024).toFixed(1)} KB` : `${(count / 1048576).toFixed(1)} MB`);
  const now = (asset: Asset) => changes.get(key(asset.kind, asset.name))?.data ?? original(asset);
  const isChanged = (asset: Asset) => changes.has(key(asset.kind, asset.name));
  const size = (asset: Asset, data: Uint8Array) => {
    const picture = pictureOf(asset.kind, data);
    return picture ? `${picture.width} × ${picture.height}` : "";
  };

  const listed = $derived.by(() => {
    const words = search.trim().toLowerCase();
    return all.filter((asset) => (tab === "changed" ? isChanged(asset) : asset.kind === tab) && (!words || asset.name.toLowerCase().includes(words) || asset.note.toLowerCase().includes(words)));
  });

  /** zubra-ui's <toast-region> listens on the document: any code shows a toast with an event. */
  const toast = (message: string, variant: "danger" | "info" | "success" = "info") => document.dispatchEvent(new CustomEvent("toast", { detail: { message, variant } }));

  async function load() {
    try {
      const bytes = await fetched(address, {
        progress: (received, total) => (progress = total ? `Fetching the game: ${(received / 1048576).toFixed(0)} of ${(total / 1048576).toFixed(0)} MB` : "Fetching the game"),
        valid: (data) => /^[IP]WAD$/.test(String.fromCharCode(...data.subarray(0, 4))),
      });
      // The game as it is played: its own title and levels over the data it is built on. "As it came" here means that.
      wad = readWad(await withDelbies(bytes));
      palette = paletteOf(wad.lumps.find((lump) => lump.name === "PLAYPAL")?.data ?? new Uint8Array(0));
      assets = catalogue(wad).sort((a, b) => a.name.localeCompare(b.name));
      const known = new Set(assets.map((asset) => key(asset.kind, asset.name)));
      for (const change of await loadMod()) if (known.has(key(change.kind, change.name)) || isAddition(change) || change.kind === "rules") changes.set(key(change.kind, change.name), change);
      stage = "ready";
    } catch (error) {
      failure = navigator.onLine ? (error as Error).message : "There is no connection, and the game hasn't been downloaded to this device yet.";
      stage = "failed";
    }
  }
  void load();

  function keep(change: Change) {
    changes.set(key(change.kind, change.name), change);
    saveChange(change);
  }

  function restore(kind: Kind, name: string) {
    changes.delete(key(kind, name));
    removeChange(kind, name);
  }

  /** Puts a file in an asset's place. True if it took. */
  async function replace(asset: Asset, file: Blob): Promise<boolean> {
    try {
      // A lump of no other kind goes in as it is. Something added has no original to be made the size of.
      const data = asset.kind === "other" ? new Uint8Array(await file.arrayBuffer()) : isSound(asset.kind) ? await soundLump(file) : await pictureLump(file, asset.kind, isNew(asset) ? null : pictureOf(asset.kind, original(asset))!, palette, fit);
      if (!data.length) throw new Error("That file is empty.");
      keep({ kind: asset.kind, name: asset.name, data });
      return true;
    } catch (error) {
      toast(`${asset.name}: ${(error as Error).message}`, "danger");
      return false;
    }
  }

  /**
   * Files dropped on the page, or chosen. With something open, one file is for it. Otherwise each
   * file is for the thing it is named after (TROOA1.png for the sprite TROOA1), which is how a
   * folder of pictures goes in at once.
   */
  async function take(files: File[]) {
    if (!files.length || stage !== "ready" || busy) return;
    busy = true;
    try {
      if (picked && files.length === 1) {
        if (await replace(picked, files[0]!)) toast(`${picked.name} changed.`, "success");
        return;
      }
      let [took, made] = [0, 0];
      const lost: string[] = [];
      for (const file of files) {
        const name = file.name.replace(/\.[^.]*$/, "").toUpperCase();
        const named = all.filter((asset) => asset.name === name && (isDrawn(asset.kind) || asset.kind === "other"));
        // A name two kinds share (a floor and a wall piece) goes to the kind whose tab is open; a picture never goes to a lump of no kind unless that tab is open.
        let target = named.find((asset) => asset.kind === tab) ?? named.find((asset) => asset.kind !== "other");
        // A name the game has nothing by, on a tab that can take something new, is something new.
        const fresh = !target && canAdd(tab as Kind) && isNewNameFor(tab as Kind, name) && !all.some((asset) => asset.name === name && tab === "other");
        if (fresh) target = { kind: tab as Kind, name, index: -1, note: "" };
        if (target && (await replace(target, file))) fresh ? made++ : took++;
        else if (!target) lost.push(file.name);
      }
      if (took) toast(took === 1 ? "One thing changed." : `${took} things changed.`, "success");
      if (made) toast(made === 1 ? "One thing added." : `${made} things added.`, "success");
      if (lost.length) toast(`Nothing in the game is named ${lost.slice(0, 3).join(", ")}${lost.length > 3 ? ` (and ${lost.length - 3} more)` : ""}. Open the thing to change and drop the file on it, or add it as something new from the tab for what it is.`, "danger");
    } finally {
      busy = false;
    }
  }

  function dropped(event: DragEvent) {
    event.preventDefault();
    over = false;
    void take([...(event.dataTransfer?.files ?? [])]);
  }

  function chosen(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    void take([...(input.files ?? [])]);
    input.value = "";
  }

  /** What is wrong with the name being typed for something new, or "". */
  const nameTrouble = $derived.by(() => {
    if (!adding) return "";
    const name = adding.name.trim().toUpperCase();
    if (!name) return "";
    if (adding.kind === "sprite" && !isNewNameFor("sprite", name)) return "Four letters for the thing, a letter for the moment and a figure for the side: RATXA0, or RATXA1 to RATXA8 for eight sides.";
    if (adding.kind === "sound" && !isNewNameFor("sound", name)) return "DS, then up to six capitals or figures: DSRAT1.";
    if (!isNewNameFor(adding.kind, name)) return "Up to eight capitals, figures or underscores, and not a name the game keeps for itself.";
    if (all.some((asset) => asset.name === name && (asset.kind === adding!.kind || adding!.kind === "other"))) return "The game has one by that name: open it to change it.";
    return "";
  });

  /** A file chosen for something new: it goes in under the name typed. */
  async function addChosen(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !adding || nameTrouble) return;
    const asset: Asset = { kind: adding.kind, name: adding.name.trim().toUpperCase(), index: -1, note: "" };
    busy = true;
    try {
      if (await replace(asset, file)) {
        toast(`${asset.name} added.`, "success");
        adding = null;
      }
    } finally {
      busy = false;
    }
  }

  /** A lump as the file it is. */
  const saveRaw = (asset: Asset) => download(`${asset.name}.lmp`, new Blob([now(asset) as BlobPart], { type: "application/octet-stream" }));

  async function savePng(asset: Asset) {
    const picture = pictureOf(asset.kind, now(asset));
    if (picture) download(`${asset.name}.png`, await png(picture, palette));
  }

  const exportMod = () => download("my-changes.wad", new Blob([modToWad(changes.values(), wad) as BlobPart], { type: "application/octet-stream" }));

  async function importMod(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const { changes: found, skipped } = modFromWad(new Uint8Array(await file.arrayBuffer()), all, wad);
      found.forEach(keep);
      toast(found.length ? `${found.length} ${found.length === 1 ? "change" : "changes"} taken from ${file.name}.` : `Nothing in ${file.name} is something this game has.`, found.length ? "success" : "danger");
      if (found.length && skipped.length) toast(`${skipped.length} of its lumps were left out: this game has no place for them.`);
    } catch (error) {
      toast((error as Error).message, "danger");
    }
  }

  function resetAll() {
    for (const change of [...changes.values()]) removeChange(change.kind, change.name);
    changes.clear();
    resetting = false;
    if (tab === "changed") tab = "sprite";
  }

  function choose(to: Tab) {
    // Chosen from the tabs, "Try it" starts at the title; from a level, in that level.
    if (to === "play" && tab !== "play") tryLevel = "";
    tab = to;
    search = "";
    shown = PAGE;
  }

  /** Opens something from the list: a picture or a sound in the dialog, a level in the Levels tab. */
  function open(asset: Asset) {
    if (asset.kind === "words") return choose("said");
    if (asset.kind === "rules") return choose("ruled");
    if (isDrawn(asset.kind) || asset.kind === "other") return void (picked = asset);
    level = asset.name;
    choose("level");
  }

  /** Plays a level with the changes as they stand. */
  function tryIn(name: string) {
    tryLevel = name;
    tab = "play";
  }

  // "Try it": the game itself, on this page, with the changes as they stand. It is taken off the
  // page again when another tab is chosen, so it isn't left running, or holding the keyboard.
  $effect(() => {
    if (tab !== "play" || !stageElement || stage !== "ready") return;
    // "E2M3" is episode 2, map 3 to the engine's command line; "MAP07" is map 7.
    const where = tryLevel.match(/^E(\d)M(\d)$/)?.slice(1) ?? tryLevel.match(/^MAP(\d\d)$/)?.slice(1).map((map) => String(Number(map)));
    const mounted: Shooter = mountShooter(stageElement, {
      wasm,
      wad: { url: address, name: "freedoom1.wad", megabytes: game.megabytes },
      base: withDelbies,
      title: where ? `Try ${tryLevel}` : "Try it",
      blurb: changes.size ? "The game, with what you have changed." : "The game as it came: nothing is changed yet.",
      args: where ? ["-warp", ...where] : [],
      levels: { episodes: 4, maps: 9 },
      own: { apply: async (data) => applyMod(data, changes.values()), note: async () => "" },
    });
    return () => mounted.destroy();
  });
</script>

<svelte:window ondragover={(event) => event.preventDefault()} ondrop={dropped} />

<toast-region position="bottom-end" label="Notifications"></toast-region>
<input bind:this={chooser} class="hidden" type="file" accept={picked?.kind === "other" ? "" : picked && isSound(picked.kind) ? "audio/*" : "image/*"} onchange={chosen} />
<input bind:this={adder} class="hidden" type="file" accept={adding?.kind === "other" ? "" : adding?.kind === "sound" ? "audio/*" : "image/*"} onchange={addChosen} />
<input bind:this={importer} class="hidden" type="file" accept=".wad" onchange={importMod} />

<div class="page">
  <header class="top">
    <a class="home" href="../"><span aria-hidden="true">←</span> The game</a>
    <h1>Change the game</h1>
    <p class="quiet">Swap the game's pictures and sounds for your own, and change its levels or build your own. What you change is kept in this browser, and is what you play with when you play alone.</p>
  </header>

  {#if stage === "loading"}
    <div class="waiting"><loading-spinner label={progress} inline={true}></loading-spinner><span class="quiet">{progress}</span></div>
  {:else if stage === "failed"}
    <alert-banner variant="danger" heading="The game's data couldn't be opened"><span>{failure}</span></alert-banner>
  {:else}
    <cluster-layout gap="0.6rem">
      <action-button variant="outline" size="sm" disabled={changes.size === 0} onclick={exportMod}>Save my changes as a file</action-button>
      <action-button variant="outline" size="sm" onclick={() => importer?.click()}>Load changes from a file</action-button>
      <action-button variant="ghost" size="sm" disabled={changes.size === 0} onclick={() => (resetting = true)}>Put everything back</action-button>
    </cluster-layout>

    <tab-list {tabs} value={tab} label="What to change" onvaluechange={(event: News<string>) => choose(event.detail as Tab)}>
      {#each [...TILED, "changed"] as panel (panel)}
        <section data-tab={panel}>
          {#if tab === panel}
            <p class="quiet hint">
              {panel === "changed" ? "Everything you have changed." : HINTS[panel as Kind]}
              {#if panel !== "changed"}Drop a file on the page and it goes to the thing it is named after{ONE[panel as Kind] ? `; one named for nothing the game has is added as a new ${ONE[panel as Kind]}` : ""}.{/if}
            </p>
            {#if ONE[panel as Kind]}
              <action-button class="add" variant="outline" size="sm" onclick={() => (adding = { kind: panel as Kind, name: "" })}>Add a new {ONE[panel as Kind]}</action-button>
            {/if}
            {#if panel !== "changed" || changes.size > 0}
              <text-field class="search" label="Find" placeholder="A name, or what it is" value={search} onvaluechange={(event: News<string>) => ((search = event.detail), (shown = PAGE))}></text-field>
            {/if}
            {#if listed.length}
              <ul class="tiles">
                {#each listed.slice(0, shown) as asset (key(asset.kind, asset.name))}
                  <li>
                    <button type="button" class="tile" class:changed={isChanged(asset)} onclick={() => open(asset)}>
                      <span class="thumb">
                        {#if asset.kind === "other"}
                          <span class="sound" aria-hidden="true">▤</span>
                        {:else if !isDrawn(asset.kind)}
                          <span class="sound" aria-hidden="true">▦</span>
                        {:else if isSound(asset.kind)}
                          <span class="sound" aria-hidden="true">♪</span>
                        {:else}
                          <Thumb kind={asset.kind} data={now(asset)} {palette} label="" />
                        {/if}
                      </span>
                      <span class="name">{asset.name}</span>
                      {#if asset.note}<span class="what">{asset.note}</span>{/if}
                      {#if isNew(asset)}<status-badge variant="success">Added</status-badge>{:else if isChanged(asset)}<status-badge variant="primary">Changed</status-badge>{/if}
                    </button>
                  </li>
                {/each}
              </ul>
              {#if listed.length > shown}
                <action-button variant="outline" onclick={() => (shown += PAGE * 2)}>Show more ({listed.length - shown} left)</action-button>
              {/if}
            {:else}
              <empty-state heading={panel === "changed" && !search ? "Nothing is changed yet" : "Nothing by that name"}>
                <span>{panel === "changed" && !search ? "Open a sprite, a wall, a floor, a screen or a sound and give it a file of your own, or move something in a level." : "Try fewer letters."}</span>
              </empty-state>
            {/if}
          {/if}
        </section>
      {/each}
      <section data-tab="said">
        {#if tab === "said"}
          <Words original={wad.lumps.find((lump) => lump.name === WORDS)?.data} saved={changes.get(key("words", WORDS))?.data} {keep} restore={() => restore("words", WORDS)} />
        {/if}
      </section>
      <section data-tab="ruled">
        {#if tab === "ruled"}
          <Rules original={wad.lumps.find((lump) => lump.name === RULES)?.data} saved={changes.get(key("rules", RULES))?.data} sprites={[...new Set(all.filter((asset) => asset.kind === "sprite").map((asset) => asset.name.slice(0, 4)))].sort()} sounds={all.filter((asset) => asset.kind === "sound").map((asset) => asset.name)} {keep} restore={() => restore("rules", RULES)} />
        {/if}
      </section>
      <section data-tab="level">
        {#if tab === "level"}
          <Levels {wad} assets={all} {palette} bind:level wallPictures={wallPictures} {wallPicture} {builder} saved={(kind, name) => changes.get(key(kind, name))?.data} {keep} {restore} {toast} ontry={tryIn} />
        {/if}
      </section>
      <section data-tab="play">
        <div class="stage" bind:this={stageElement}></div>
      </section>
    </tab-list>
  {/if}
</div>

<modal-dialog open={picked !== null} label={picked?.name ?? ""} onopenchange={(event: News<boolean>) => !event.detail && (picked = null)}>
  {#if picked}
    {@const asset = picked}
    {@const changed = isChanged(asset)}
    <div class="detail">
      {#if asset.note}<p>{asset.note}</p>{/if}
      {#if asset.kind === "other"}
        <p class="quiet">{isNew(asset) ? "Yours" : changed ? "Yours" : "As it came"}: {bytes(now(asset).length)}{#if changed && !isNew(asset)}. As it came: {bytes(original(asset).length)}{/if}.</p>
        <p class="quiet">A file given here goes in as it is, so it has to be in the engine's own form already. Save this one as a file to see what that is, or to change it in a tool that knows it.</p>
      {:else if isSound(asset.kind)}
        <cluster-layout gap="0.6rem">
          <action-button variant="outline" onclick={() => play(now(asset))}>▶ Play it</action-button>
          {#if changed}<action-button variant="ghost" onclick={() => play(original(asset))}>▶ Play the original</action-button>{/if}
        </cluster-layout>
      {:else}
        <div class="views">
          <figure>
            <span class="view"><Thumb kind={asset.kind} data={now(asset)} {palette} label="{asset.name} as it is now" /></span>
            <figcaption>{changed ? "Yours" : "As it came"} · {size(asset, now(asset))}</figcaption>
          </figure>
          {#if changed && !isNew(asset)}
            <figure>
              <span class="view"><Thumb kind={asset.kind} data={original(asset)} {palette} label="{asset.name} as it came" /></span>
              <figcaption>As it came · {size(asset, original(asset))}</figcaption>
            </figure>
          {/if}
        </div>
      {/if}

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="drop" class:over ondragenter={() => (over = true)} ondragleave={() => (over = false)}>
        <span>Drop a {asset.kind === "other" ? "file" : isSound(asset.kind) ? "sound" : "picture"} here, or</span>
        <action-button loading={busy} onclick={() => chooser?.click()}><span>Choose a {asset.kind === "other" ? "file" : isSound(asset.kind) ? "sound" : "picture"}</span></action-button>
      </div>

      {#if !isSound(asset.kind) && asset.kind !== "other"}
        {#if asset.kind === "sprite"}
          <toggle-switch label="Keep the new picture's own size" description="Off, it is made the size of the one it replaces. On, it is drawn in the game as big as it is." checked={fit.ownSize} oncheckedchange={(event: News<boolean>) => (fit.ownSize = event.detail)}></toggle-switch>
        {/if}
        <toggle-switch label="Smooth it when its size changes" description="Turn off for pixel art, to keep its edges hard." checked={fit.smooth} oncheckedchange={(event: News<boolean>) => (fit.smooth = event.detail)}></toggle-switch>
      {/if}
    </div>
    <cluster-layout slot="actions" gap="0.6rem">
      {#if asset.kind === "other"}<action-button variant="outline" size="sm" onclick={() => saveRaw(asset)}>Save it as a file</action-button>
      {:else if !isSound(asset.kind)}<action-button variant="outline" size="sm" onclick={() => savePng(asset)}>Save as a PNG</action-button>{/if}
      {#if isNew(asset)}<action-button variant="outline" size="sm" onclick={() => (restore(asset.kind, asset.name), (picked = null))}>Take it out</action-button>
      {:else if changed}<action-button variant="outline" size="sm" onclick={() => restore(asset.kind, asset.name)}>Put the original back</action-button>{/if}
      <action-button size="sm" data-close>Done</action-button>
    </cluster-layout>
  {/if}
</modal-dialog>

<modal-dialog open={adding !== null} label={adding ? `Add a new ${ONE[adding.kind]}` : ""} onopenchange={(event: News<boolean>) => !event.detail && (adding = null)}>
  {#if adding}
    {@const one = adding}
    <div class="detail">
      <p>
        {one.kind === "sprite"
          ? "A picture of your own, as one moment of a sprite the game never had, at its own size. Name it with four letters of your own for the thing, a letter for the moment (A is the first) and a figure for the side: 0 if it looks the same from every side, or 1 to 8. Then give it to a thing in the Rules tab."
          : one.kind === "sound"
            ? "A sound of your own, under a name the game never had: DS and up to six more. Then give it to a thing in the Rules tab."
            : one.kind === "floor"
          ? "A picture of your own, as a floor or ceiling the game never had. It is made 64 by 64 and repeats."
          : one.kind === "wall"
            ? "A picture of your own, as a wall the game never had. It keeps its shape, at a size the engine repeats properly: no taller than 128, and 8 to 256 wide."
            : "Any file, as a lump of the game's data under a name of your own. This engine reads only the names it knows, so this is for a WAD you mean to save and use elsewhere."}
      </p>
      <text-field class="new-name" label="Its name" description={one.kind === "sprite" ? "Like RATXA0." : one.kind === "sound" ? "Like DSRAT1." : "Up to eight capitals, figures or underscores."} value={one.name} error={nameTrouble} onvaluechange={(event: News<string>) => (one.name = event.detail)}></text-field>
    </div>
    <cluster-layout slot="actions" gap="0.6rem">
      <action-button variant="outline" size="sm" data-close>Not now</action-button>
      <action-button size="sm" loading={busy} disabled={!one.name.trim() || !!nameTrouble} onclick={() => adder?.click()}>Choose a {one.kind === "other" ? "file" : one.kind === "sound" ? "sound" : "picture"}</action-button>
    </cluster-layout>
  {/if}
</modal-dialog>

<modal-dialog open={resetting} label="Put everything back?" onopenchange={(event: News<boolean>) => (resetting = event.detail)}>
  <p>All {changes.size} of your changes are thrown away, and the game is as it came. Save them as a file first if you might want them again.</p>
  <cluster-layout slot="actions" gap="0.6rem">
    <action-button variant="outline" size="sm" data-close>Keep my changes</action-button>
    <action-button variant="destructive" size="sm" onclick={resetAll}>Put everything back</action-button>
  </cluster-layout>
</modal-dialog>
