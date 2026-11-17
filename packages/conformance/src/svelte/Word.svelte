<!-- The page's own component, put in a Zubra component's slot: it reads the page's context. -->
<script lang="ts">
  import { getContext } from "svelte";

  const word = getContext<() => string>("word");
</script>

<span data-t="f-ctx">{word()}</span>
