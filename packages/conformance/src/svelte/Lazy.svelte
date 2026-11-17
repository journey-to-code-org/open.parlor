<!-- Loaded when asked for, with a Zubra component the page hasn't used until then. -->
<script lang="ts">
  import "@open-parlor/ui/zubra-ui/range-slider.zb";

  let level = $state(50);
</script>

<range-slider data-t="f-lazy" label="Late" value={level} onvaluechange={(e: CustomEvent<number>) => (level = e.detail)}></range-slider>
<output data-t="f-lazy-out">{level}</output>
