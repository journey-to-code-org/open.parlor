<!-- A component whose setup waits (an async setup), so it can only be drawn inside <Suspense>. -->
<script setup lang="ts">
import TextField from "@open-parlor/ui/zubra-ui/text-field.zb";
import { inject, ref } from "vue";

// Ready when the page says so: the check holds the fallback on screen until it clicks.
await inject<Promise<void>>("ready");
const said = ref("");
</script>

<template>
  <TextField v-model="said" data-t="f-suspense" label="After waiting" />
  <output data-t="f-suspense-out">{{ said }}</output>
</template>
