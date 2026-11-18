<!-- An invite to a house: your name, then in. -->
<script setup lang="ts">
import { ref } from "vue";
import TextField from "@open-parlor/ui/zubra-ui/text-field.zb";
import { loadSavedName, saveName } from "../storage";

const props = defineProps<{ houseName: string; problem: string | null; onJoin: (name: string) => void }>();
const name = ref(loadSavedName());
function join() {
  saveName(name.value.trim());
  props.onJoin(name.value.trim());
}
</script>

<template>
  <main class="setup house">
    <header class="setup-head">
      <div class="suits" aria-hidden="true">♠ ♥ ♣ ♦</div>
      <p>You're invited to</p>
      <h1>{{ houseName }}</h1>
    </header>
    <TextField v-model="name" label="Your spades name" :required="true" :maxlength="20" autocomplete="nickname" />
    <button type="button" class="primary deal" :disabled="!name.trim()" @click="join">Come on in</button>
    <p v-if="problem" class="error">{{ problem }}</p>
  </main>
</template>
