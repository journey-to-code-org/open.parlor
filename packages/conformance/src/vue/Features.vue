<!--
  Vue's own features around Zubra components: Transition, TransitionGroup, KeepAlive, Teleport,
  provide/inject, async components, Suspense, template refs, v-bind with an object, v-model
  modifiers, v-show, and class and style bindings. The checks are in tests/features.spec.ts.
-->
<script setup lang="ts">
import EmptyState from "@open-parlor/ui/zubra-ui/empty-state.zb";
import StackLayout from "@open-parlor/ui/zubra-ui/stack-layout.zb";
import StatusBadge from "@open-parlor/ui/zubra-ui/status-badge.zb";
import TextField from "@open-parlor/ui/zubra-ui/text-field.zb";
import ToggleSwitch from "@open-parlor/ui/zubra-ui/toggle-switch.zb";
import { computed, defineAsyncComponent, provide, ref } from "vue";
import { FACES, VARIANTS, WORDS } from "../shared/fixture";
import Kept from "./Kept.vue";
import Waited from "./Waited.vue";
import Word from "./Word.vue";

const Lazy = defineAsyncComponent(() => import("./Lazy.vue"));

const faces = ref([...FACES]);
const word = ref<string>(WORDS[0]);
provide("word", word);
const hot = ref(false);
const far = ref(false);
const wanted = ref(false);
const kept = ref(true);
const fading = ref(true);
const left = ref(0);
const spread = ref(0);
const badge = computed(() => ({ variant: VARIANTS[spread.value % VARIANTS.length], dot: true }));
const trimmed = ref("");
const shown = ref(true);

// <Suspense>: Waited's setup waits for this, and the button lets it go.
let release = () => {};
provide("ready", new Promise<void>((resolve) => (release = resolve)));

// A template ref on a Zubra component: Zubra's Vue component exposes its element.
const named = ref<{ element: HTMLElement & { value: string } } | null>(null);
const typed = ref("");
const throughRef = ref("");
function readRef() {
  const element = named.value?.element;
  throughRef.value = element ? `${element.localName}:${element.value}` : "no element";
  element?.querySelector("input")?.focus();
}
</script>

<template>
  <main data-t="f-features">
    <section>
      <h2>A keyed list, reordered (TransitionGroup)</h2>
      <StackLayout data-t="f-order" gap="0.25rem">
        <TransitionGroup name="f-move">
          <StatusBadge v-for="face in faces" :key="face" :data-f-item="face">{{ face }}</StatusBadge>
        </TransitionGroup>
      </StackLayout>
      <button data-t="f-reverse" type="button" @click="faces = [...faces].reverse()">Reverse</button>
    </section>

    <section>
      <h2>Context through a slot (provide / inject)</h2>
      <EmptyState data-t="f-ctx-home" heading="Context"><Word /></EmptyState>
      <button data-t="f-ctx-set" type="button" @click="word = WORDS[1]">Change the word</button>
    </section>

    <section>
      <h2>Class and style bindings</h2>
      <StatusBadge data-t="f-styled" :class="{ 'f-hot': hot }" :style="{ opacity: hot ? 0.5 : 1 }">Styled</StatusBadge>
      <button data-t="f-style-toggle" type="button" @click="hot = !hot">Toggle</button>
    </section>

    <section>
      <h2>Somewhere else on the page (Teleport)</h2>
      <Teleport to="body">
        <ToggleSwitch v-model:checked="far" data-t="f-portal" label="Far away" />
      </Teleport>
      <output data-t="f-portal-out">{{ far ? "on" : "off" }}</output>
      <button data-t="f-portal-off" type="button" @click="far = false">Switch off</button>
    </section>

    <section>
      <h2>Loaded later (defineAsyncComponent)</h2>
      <Lazy v-if="wanted" />
      <span v-else data-t="f-lazy-wait">Waiting</span>
      <button data-t="f-lazy-load" type="button" @click="wanted = true">Load</button>
    </section>

    <section>
      <h2>Kept while off the page (KeepAlive)</h2>
      <KeepAlive><Kept v-if="kept" /></KeepAlive>
      <button data-t="f-keep-toggle" type="button" @click="kept = !kept">Hide / show</button>
    </section>

    <section>
      <h2>Leaving with a transition (Transition)</h2>
      <Transition name="f-fade" @after-leave="left++">
        <StatusBadge v-if="fading" data-t="f-fade">Fading</StatusBadge>
      </Transition>
      <output data-t="f-fade-out">{{ left }}</output>
      <button data-t="f-fade-toggle" type="button" @click="fading = !fading">Toggle</button>
    </section>

    <section>
      <h2>Props from an object (v-bind)</h2>
      <StatusBadge data-t="f-spread" v-bind="badge">Spread</StatusBadge>
      <button data-t="f-spread-next" type="button" @click="spread++">Next</button>
    </section>

    <section>
      <h2>A v-model modifier</h2>
      <TextField v-model.trim="trimmed" data-t="f-trim" label="Trimmed" />
      <output data-t="f-trim-out">[{{ trimmed }}]</output>
    </section>

    <section>
      <h2>Suspense</h2>
      <Suspense>
        <Waited />
        <template #fallback><p data-t="f-suspense-wait">Waiting…</p></template>
      </Suspense>
      <button data-t="f-suspense-go" type="button" @click="release()">Go</button>
    </section>

    <section>
      <h2>A template ref</h2>
      <TextField ref="named" v-model="typed" data-t="f-ref" label="Through a ref" />
      <button data-t="f-ref-read" type="button" @click="readRef">Read it through the ref</button>
      <output data-t="f-ref-out">{{ throughRef }}</output>
    </section>

    <section>
      <h2>v-show</h2>
      <StatusBadge v-show="shown" data-t="f-vshow">Shown</StatusBadge>
      <button data-t="f-vshow-toggle" type="button" @click="shown = !shown">Toggle</button>
    </section>
  </main>
</template>
