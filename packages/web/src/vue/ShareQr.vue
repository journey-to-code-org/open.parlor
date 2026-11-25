<!-- "Show a QR code" beside an invite, for the Vue screens (ShareQr.tsx is the React one). The
     code's encoder is fetched the first time it's asked for. -->
<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{ url: string; label: string; what: string }>();
const open = ref(false);
const drawn = ref<{ path: string; size: number } | null>(null);

watch(
  [open, () => props.url],
  async ([shown, url]) => {
    if (!shown) return;
    const { qrPath } = await import("../wifi/qrcore");
    drawn.value = qrPath(url);
  },
);
</script>

<template>
  <button type="button" class="secondary" :aria-expanded="open" @click="open = !open">{{ open ? "Hide the QR code" : "Show a QR code" }}</button>
  <figure v-if="open" class="share-qr">
    <svg v-if="drawn" class="qr" :viewBox="`0 0 ${drawn.size} ${drawn.size}`" role="img" :aria-label="label" shape-rendering="crispEdges">
      <rect :width="drawn.size" :height="drawn.size" fill="#fff" />
      <path :d="drawn.path" fill="#000" />
    </svg>
    <p v-else class="fine">Drawing the code…</p>
    <figcaption>{{ what }}</figcaption>
  </figure>
</template>
