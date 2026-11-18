<!-- "Buzz my phone", for the Vue screens: the same states and words as NotifyButton.tsx, over the
     same framework-free functions in notifications.ts. -->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { current, turnOff, turnOn, type NotifyState } from "../notifications";

defineProps<{ what: string }>();
const state = ref<NotifyState>("checking");
const problem = ref<string | null>(null);
onMounted(() => void current().then((s) => (state.value = s)));
async function run(fn: () => Promise<NotifyState>) {
  problem.value = null;
  try {
    state.value = await fn();
  } catch (e) {
    problem.value = (e as Error).message;
  }
}
</script>

<template>
  <div v-if="state !== 'checking' && state !== 'unsupported' && state !== 'server-off'" class="notify">
    <p v-if="state === 'install-first'" class="fine">
      To get a buzz on this iPhone when {{ what }}: tap the Share button <span aria-hidden="true">⎋</span>, choose <strong>Add to Home Screen</strong>, then open open.parlor from your Home Screen and turn
      notifications on there.
    </p>
    <button v-if="state === 'off'" type="button" class="secondary" @click="run(turnOn)">🔔 Buzz my phone when {{ what }}</button>
    <p v-if="state === 'on'" class="fine">
      🔔 This phone gets a buzz when {{ what }}.
      <button type="button" class="link" @click="run(turnOff)">Turn off</button>
    </p>
    <p v-if="state === 'denied'" class="fine">Notifications are blocked for open.parlor. You can allow them in this phone's settings for the site.</p>
    <p v-if="problem" class="error">{{ problem }}</p>
  </div>
</template>
