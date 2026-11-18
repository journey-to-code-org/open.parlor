<!--
  A picture from the game, drawn on a canvas at its own size and scaled by the page. It is only
  drawn once it is near the screen: a tab can hold a thousand of them.
-->
<script lang="ts">
  import type { Kind } from "../../wad/catalogue.ts";
  import type { Palette } from "../../wad/picture.ts";
  import { draw, pictureOf } from "./convert.ts";

  let { kind, data, palette, label }: { kind: Kind; data: Uint8Array; palette: Palette; label: string } = $props();

  let canvas = $state<HTMLCanvasElement>();
  let seen = $state(false);

  /** Tells the canvas when it first comes near the screen. */
  function whenSeen(node: HTMLCanvasElement) {
    const watcher = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        seen = true;
        watcher.disconnect();
      },
      { rootMargin: "300px" },
    );
    watcher.observe(node);
    return { destroy: () => watcher.disconnect() };
  }

  // Drawn when seen, and again whenever the lump under it changes.
  $effect(() => {
    const picture = seen && canvas ? pictureOf(kind, data) : null;
    if (picture && canvas) draw(canvas, picture, palette);
  });
</script>

<!-- With no label it is decoration: the name beside it says what it is. -->
<canvas bind:this={canvas} use:whenSeen width="1" height="1" aria-label={label || undefined} aria-hidden={label ? undefined : true}></canvas>

<style>
  /* Fills the box it is given, as large as fits, its pixels kept square-edged. */
  canvas {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    object-fit: contain;
    image-rendering: pixelated;
  }
</style>
