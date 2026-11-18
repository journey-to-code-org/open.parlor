<!--
  The editor for the game's pictures and sounds: everything the game is drawn and heard with, by
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
  import { type Asset, catalogue, isLevelKind, key, type Kind, KINDS } from "../../wad/catalogue.ts";
  import { wallNames } from "../../wad/level.ts";
  import { applyMod, type Change, modFromWad, modToWad } from "../../wad/mod.ts";
  import { type Palette, paletteOf } from "../../wad/picture.ts";
  import { loadMod, removeChange, saveChange } from "../../wad/saved.ts";
  import { readWad, type Wad } from "../../wad/wad.ts";
  import { mountShooter, type Shooter } from "../shooter/player.ts";
  import { download, type Fit, isSound, pictureLump, pictureOf, play, png, soundLump } from "./convert.ts";
  import Levels from "./Levels.svelte";
  import Thumb from "./Thumb.svelte";

  type News<T> = CustomEvent<T>;
  type Tab = Kind | "level" | "changed" | "play";

  const LABELS: Record<string, string> = { sprite: "Sprites", wall: "Walls", floor: "Floors", screen: "Screens", sound: "Sounds" };
  const HINTS: Record<string, string> = {
    sprite: "Everything that stands in a level: monsters, the weapon in your hand, things to pick up. A name is four letters for the thing, a letter for the moment, and a number for the side it is seen from.",
    wall: "The pieces walls are built from. A new picture is made the size of the piece it replaces.",
    floor: "Floors and ceilings. Each is 64 by 64 pixels and repeats.",
    screen: "The title, the menus, the status bar, the scores and the letters. A new picture is made the size of the one it replaces.",
    sound: "Sound effects. Any sound file this browser can play will do; it is made one channel, at the game's rate.",
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
  let chooser = $state<HTMLInputElement>();
  let importer = $state<HTMLInputElement>();
  let stageElement = $state<HTMLElement>();
  /** The level open in the Levels tab, and the one "Try it" starts in (none: the title screen). */
  let level = $state("");
  let tryLevel = $state("");

  const tabs = $derived([...KINDS.map((kind) => ({ value: kind, label: LABELS[kind]! })), { value: "level", label: "Levels" }, { value: "changed", label: `Changed (${changes.size})` }, { value: "play", label: "Try it" }]);
  const wallPictures = $derived(wallNames(wad));
  /** The node builder, fetched and compiled the first time a level's walls are changed. */
  let nodes: Promise<WebAssembly.Module> | null = null;
  const builder = () => (nodes ??= WebAssembly.compileStreaming(fetch(nodesWasm)).catch((error) => ((nodes = null), Promise.reject(error))));
  const original = (asset: Asset) => wad.lumps[asset.index]!.data;
  const now = (asset: Asset) => changes.get(key(asset.kind, asset.name))?.data ?? original(asset);
  const isChanged = (asset: Asset) => changes.has(key(asset.kind, asset.name));
  const size = (asset: Asset, data: Uint8Array) => {
    const picture = pictureOf(asset.kind, data);
    return picture ? `${picture.width} × ${picture.height}` : "";
  };

  const listed = $derived.by(() => {
    const words = search.trim().toLowerCase();
    return assets.filter((asset) => (tab === "changed" ? isChanged(asset) : asset.kind === tab) && (!words || asset.name.toLowerCase().includes(words) || asset.note.toLowerCase().includes(words)));
  });

  /** zubra-ui's <toast-region> listens on the document: any code shows a toast with an event. */
  const toast = (message: string, variant: "danger" | "info" | "success" = "info") => document.dispatchEvent(new CustomEvent("toast", { detail: { message, variant } }));

  async function load() {
    try {
      const bytes = await fetched(address, {
        progress: (received, total) => (progress = total ? `Fetching the game: ${(received / 1048576).toFixed(0)} of ${(total / 1048576).toFixed(0)} MB` : "Fetching the game"),
        valid: (data) => /^[IP]WAD$/.test(String.fromCharCode(...data.subarray(0, 4))),
      });
      wad = readWad(bytes);
      palette = paletteOf(wad.lumps.find((lump) => lump.name === "PLAYPAL")?.data ?? new Uint8Array(0));
      assets = catalogue(wad).sort((a, b) => a.name.localeCompare(b.name));
      const known = new Set(assets.map((asset) => key(asset.kind, asset.name)));
      for (const change of await loadMod()) if (known.has(key(change.kind, change.name))) changes.set(key(change.kind, change.name), change);
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
      const data = isSound(asset.kind) ? await soundLump(file) : await pictureLump(file, asset.kind, pictureOf(asset.kind, original(asset))!, palette, fit);
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
      let took = 0;
      const lost: string[] = [];
      for (const file of files) {
        const name = file.name.replace(/\.[^.]*$/, "").toUpperCase();
        const named = assets.filter((asset) => asset.name === name && !isLevelKind(asset.kind));
        // A name two kinds share (a floor and a wall piece) goes to the kind whose tab is open.
        const target = named.find((asset) => asset.kind === tab) ?? named[0];
        if (target && (await replace(target, file))) took++;
        else if (!target) lost.push(file.name);
      }
      if (took) toast(took === 1 ? "One thing changed." : `${took} things changed.`, "success");
      if (lost.length) toast(`Nothing in the game is named ${lost.slice(0, 3).join(", ")}${lost.length > 3 ? ` (and ${lost.length - 3} more)` : ""}. Open the thing to change and drop the file on it.`, "danger");
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
      const { changes: found, skipped } = modFromWad(new Uint8Array(await file.arrayBuffer()), assets, wad);
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
    if (!isLevelKind(asset.kind)) return void (picked = asset);
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
<input bind:this={chooser} class="hidden" type="file" accept={picked && isSound(picked.kind) ? "audio/*" : "image/*"} onchange={chosen} />
<input bind:this={importer} class="hidden" type="file" accept=".wad" onchange={importMod} />

<div class="page">
  <header class="top">
    <a class="home" href="../"><span aria-hidden="true">←</span> The game</a>
    <h1>Change the game</h1>
    <p class="quiet">Swap the game's pictures and sounds for your own, and change what is placed in its levels. What you change is kept in this browser, and is what you play with when you play alone.</p>
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
      {#each [...KINDS, "changed"] as panel (panel)}
        <section data-tab={panel}>
          {#if tab === panel}
            <p class="quiet hint">
              {panel === "changed" ? "Everything you have changed." : HINTS[panel as Kind]}
              {#if panel !== "changed"}Drop a file on the page and it goes to the thing it is named after.{/if}
            </p>
            {#if panel !== "changed" || changes.size > 0}
              <text-field class="search" label="Find" placeholder="A name, or what it is" value={search} onvaluechange={(event: News<string>) => ((search = event.detail), (shown = PAGE))}></text-field>
            {/if}
            {#if listed.length}
              <ul class="tiles">
                {#each listed.slice(0, shown) as asset (key(asset.kind, asset.name))}
                  <li>
                    <button type="button" class="tile" class:changed={isChanged(asset)} onclick={() => open(asset)}>
                      <span class="thumb">
                        {#if isLevelKind(asset.kind)}
                          <span class="sound" aria-hidden="true">▦</span>
                        {:else if isSound(asset.kind)}
                          <span class="sound" aria-hidden="true">♪</span>
                        {:else}
                          <Thumb kind={asset.kind} data={now(asset)} {palette} label="" />
                        {/if}
                      </span>
                      <span class="name">{asset.name}</span>
                      {#if asset.note}<span class="what">{asset.note}</span>{/if}
                      {#if isChanged(asset)}<status-badge variant="primary">Changed</status-badge>{/if}
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
      <section data-tab="level">
        {#if tab === "level"}
          <Levels {wad} {assets} {palette} bind:level wallPictures={wallPictures} {builder} saved={(kind, name) => changes.get(key(kind, name))?.data} {keep} {restore} {toast} ontry={tryIn} />
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
      {#if isSound(asset.kind)}
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
          {#if changed}
            <figure>
              <span class="view"><Thumb kind={asset.kind} data={original(asset)} {palette} label="{asset.name} as it came" /></span>
              <figcaption>As it came · {size(asset, original(asset))}</figcaption>
            </figure>
          {/if}
        </div>
      {/if}

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="drop" class:over ondragenter={() => (over = true)} ondragleave={() => (over = false)}>
        <span>Drop a {isSound(asset.kind) ? "sound" : "picture"} here, or</span>
        <action-button loading={busy} onclick={() => chooser?.click()}><span>Choose a {isSound(asset.kind) ? "sound" : "picture"}</span></action-button>
      </div>

      {#if !isSound(asset.kind)}
        {#if asset.kind === "sprite"}
          <toggle-switch label="Keep the new picture's own size" description="Off, it is made the size of the one it replaces. On, it is drawn in the game as big as it is." checked={fit.ownSize} oncheckedchange={(event: News<boolean>) => (fit.ownSize = event.detail)}></toggle-switch>
        {/if}
        <toggle-switch label="Smooth it when its size changes" description="Turn off for pixel art, to keep its edges hard." checked={fit.smooth} oncheckedchange={(event: News<boolean>) => (fit.smooth = event.detail)}></toggle-switch>
      {/if}
    </div>
    <cluster-layout slot="actions" gap="0.6rem">
      {#if !isSound(asset.kind)}<action-button variant="outline" size="sm" onclick={() => savePng(asset)}>Save as a PNG</action-button>{/if}
      {#if changed}<action-button variant="outline" size="sm" onclick={() => restore(asset.kind, asset.name)}>Put the original back</action-button>{/if}
      <action-button size="sm" data-close>Done</action-button>
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
