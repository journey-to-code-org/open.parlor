<!-- Loaded when asked for, with a Zubra component the page hasn't used until then. -->
<script setup lang="ts">
import RangeSlider from "@open-parlor/ui/zubra-ui/range-slider.zb";
import { ref } from "vue";

const level = ref(50);
</script>

<template>
  <RangeSlider v-model="level" data-t="f-lazy" label="Late" />
  <output data-t="f-lazy-out">{{ level }}</output>
</template>
