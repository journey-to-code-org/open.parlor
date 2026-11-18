<!-- One card, drawn by the parlor's own <battle-card>: the picture and the words go in its slots. -->
<script lang="ts">
  import { CARD_BY_ID, describe } from "../cards.ts";

  let { id, selected = false, disabled = false, onpick }: { id: string; selected?: boolean; disabled?: boolean; onpick?: () => void } = $props();
  const card = $derived(CARD_BY_ID[id]!);
</script>

<battle-card name={card.name} cost={card.cost} kind={card.kind} rarity={card.rarity} {selected} {disabled} onpick={() => onpick?.()}>
  <span slot="art">{card.art}</span>
  {describe(card)}
</battle-card>
