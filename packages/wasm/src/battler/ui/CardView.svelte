<!-- One card, drawn by the parlor's own <battle-card>: the picture and the words go in its slots. -->
<script lang="ts">
  import { describe } from "../cards.ts";
  import type { Tables } from "../tables.ts";

  let { id, tables, selected = false, disabled = false, onpick }: { id: string; tables: Tables; selected?: boolean; disabled?: boolean; onpick?: () => void } = $props();
  const card = $derived(tables.cardById[id]!);
</script>

<battle-card name={card.name} cost={card.cost} kind={card.kind} rarity={card.rarity} {selected} {disabled} onpick={() => onpick?.()}>
  <span slot="art">{card.art}</span>
  {describe(card)}
</battle-card>
