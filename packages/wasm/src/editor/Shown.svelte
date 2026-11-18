<!--
  A picture already read (a wall's, put together from its patches; a floor's), drawn small beside
  the choice of it. Nothing at all where there is no picture: "-", a wall with nothing on it.
-->
<script lang="ts">
  import type { Palette, Picture } from "../../wad/picture.ts";
  import { draw } from "./convert.ts";

  let { picture, palette }: { picture: Picture | null; palette: Palette } = $props();
  let canvas = $state<HTMLCanvasElement>();

  $effect(() => {
    if (canvas && picture) draw(canvas, picture, palette);
  });
</script>

<span class="shown" aria-hidden="true">
  {#if picture}<canvas bind:this={canvas} width="1" height="1"></canvas>{/if}
</span>

<style>
  .shown {
    display: block;
    flex: none;
    width: 3.5rem;
    height: 3.5rem;
    border-radius: calc(var(--radius) - 2px);
    overflow: hidden;
    background: color-mix(in oklab, var(--muted) 70%, transparent);
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    image-rendering: pixelated;
  }
</style>
