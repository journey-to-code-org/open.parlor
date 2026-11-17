<!-- The page's own component, put in a Zubra component's slot: it reads what the page provided. -->
<script setup lang="ts">
import { inject, type Ref } from "vue";

const word = inject<Ref<string>>("word");
</script>

<template>
  <span data-t="f-ctx">{{ word }}</span>
</template>
