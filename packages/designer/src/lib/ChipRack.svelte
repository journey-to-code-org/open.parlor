<!--
  A set of chips laid out in a row, one of each value: the preview on a set's card, and (with
  `onpick`) the rack the designer picks the chip to change from.
-->
<script lang="ts">
  import { CHIP_VALUES, chipValueLabel, type ChipDesign } from "@open-parlor/ui/chip-design";

  interface Props {
    design: ChipDesign;
    /** The chip being changed, when the rack is for picking one. */
    picked?: number;
    onpick?: (index: number) => void;
    size?: number;
  }
  let { design, picked = -1, onpick, size = 40 }: Props = $props();
</script>

{#if onpick}
  <div class="rack" role="radiogroup" aria-label="Which chip to change" style:--chip="{size}px">
    {#each design.chips as chip, i (i)}
      <button
        type="button"
        role="radio"
        aria-checked={picked === i}
        class:picked={picked === i}
        onclick={() => onpick(i)}
        aria-label="The {chipValueLabel(CHIP_VALUES[i]!)} chip"
      >
        <poker-chip colour={chip.colour} inset={chip.inset} edge={design.edge} mark={design.mark} finish={design.finish} value={CHIP_VALUES[i]} label=""></poker-chip>
        <span>{chipValueLabel(CHIP_VALUES[i]!)}</span>
      </button>
    {/each}
  </div>
{:else}
  <div class="rack" role="img" aria-label="Chips of {design.name}" style:--chip="{size}px">
    {#each design.chips as chip, i (i)}
      <poker-chip colour={chip.colour} inset={chip.inset} edge={design.edge} mark={design.mark} finish={design.finish} value={CHIP_VALUES[i]} label=""></poker-chip>
    {/each}
  </div>
{/if}

<style>
  .rack { display: flex; flex-wrap: wrap; justify-content: center; gap: calc(var(--chip) * 0.12); }
  /* The rack to pick from: two rows of four, so no chip is left on a row of its own. */
  .rack[role="radiogroup"] { display: grid; grid-template-columns: repeat(4, auto); justify-content: center; }
  .rack :global(poker-chip) { width: var(--chip); }
  button { display: grid; justify-items: center; gap: 0.2rem; padding: 0.3rem; border: 2px solid transparent; border-radius: 0.8rem; background: none; color: inherit; font: inherit; font-size: 0.8rem; cursor: pointer; }
  button:hover { background: rgb(255 255 255 / 0.08); }
  button.picked { border-color: #e8c46a; background: rgb(232 196 106 / 0.14); }
  button:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
</style>
