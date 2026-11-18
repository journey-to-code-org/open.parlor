<!--
  Read the Room, on a player's phone: the question as this seat is to answer it. Each kind of
  question is a different Zubra control, bound two ways: a slider for a scale, choice cards for a
  vote, segmented controls for the either-ors, a tag input for three answers, a text field for a
  caption, and star ratings for what the others wrote.

  A Vue island. What the room said is drawn by another island beside it, in Solid
  (solid/RoomBoard.tsx), from the same view and with the same components.
-->
<script setup lang="ts">
import type { WordForm } from "@journey-to-code/games";
import { computed, ref, watch } from "vue";
import ActionButton from "@open-parlor/ui/zubra-ui/action-button.zb";
import ChoiceCards from "@open-parlor/ui/zubra-ui/choice-cards.zb";
import RangeSlider from "@open-parlor/ui/zubra-ui/range-slider.zb";
import SegmentedControl from "@open-parlor/ui/zubra-ui/segmented-control.zb";
import StarRating from "@open-parlor/ui/zubra-ui/star-rating.zb";
import StatusBadge from "@open-parlor/ui/zubra-ui/status-badge.zb";
import TagInput from "@open-parlor/ui/zubra-ui/tag-input.zb";
import TextField from "@open-parlor/ui/zubra-ui/text-field.zb";

const props = defineProps<{
  /** Null once this seat has answered. */
  form: WordForm | null;
  names: string[];
  /** An answer is on its way to the table. */
  busy: boolean;
  /** Whether everyone's answers are in and the room is being shown. */
  shown: boolean;
  onSend: (move: Record<string, unknown>) => void;
}>();

const value = ref(50);
const pick = ref("");
const sides = ref<string[]>([]);
const tags = ref<string[]>([]);
const text = ref("");
const stars = ref<number[]>([]);

// A new question: a clean form.
watch(() => `${props.form?.kind}:${props.form?.prompt}`, () => {
  value.value = 50;
  pick.value = "";
  sides.value = (props.form?.pairs ?? []).map(() => "");
  tags.value = [];
  text.value = "";
  stars.value = (props.form?.items ?? []).map(() => 0);
}, { immediate: true });

const people = computed(() => (props.form?.seats ?? []).map((seat) => ({ id: String(seat), title: props.names[seat] ?? `Player ${seat + 1}`, detail: "" })));
const pairs = computed(() => (props.form?.pairs ?? []).map(([a, b]) => [{ value: "a", label: a }, { value: "b", label: b }]));
const ready = computed(() => {
  const f = props.form;
  if (!f || props.busy) return false;
  if (f.kind === "vote") return pick.value !== "";
  if (f.kind === "either") return sides.value.every((side) => side !== "");
  if (f.kind === "three") return tags.value.length === f.count;
  if (f.kind === "caption") return text.value.trim().length > 0;
  if (f.kind === "rate") return stars.value.every((n) => n > 0);
  return true;
});

function send() {
  const f = props.form;
  if (!f || !ready.value) return;
  const answer =
    f.kind === "scale" ? { value: value.value }
    : f.kind === "vote" ? { pick: Number(pick.value) }
    : f.kind === "either" ? { flags: sides.value.map((side) => side === "b") }
    : f.kind === "three" ? { tags: tags.value }
    : f.kind === "caption" ? { text: text.value }
    : { stars: stars.value };
  props.onSend({ type: f.type, ...answer });
}
</script>

<template>
  <form v-if="form" class="room-form" @submit.prevent="send">
    <template v-if="form.kind === 'scale'">
      <RangeSlider v-model="value" label="Where do you stand?" :min="form.min" :max="form.max" />
      <p class="room-ends"><span>{{ form.low }}</span><span>{{ form.high }}</span></p>
    </template>

    <ChoiceCards v-else-if="form.kind === 'vote'" v-model="pick" label="Pick one of the others" :items="people" />

    <template v-else-if="form.kind === 'either'">
      <SegmentedControl v-for="(options, n) in pairs" :key="n" v-model="sides[n]" :label="`Which will the room say? (${n + 1} of ${pairs.length})`" :options="options" />
    </template>

    <template v-else-if="form.kind === 'three'">
      <TagInput v-model="tags" label="Your three" :max="form.count" />
      <p class="room-hint">Type one and press Enter. {{ tags.length }} of {{ form.count }}.</p>
    </template>

    <TextField v-else-if="form.kind === 'caption'" v-model="text" label="Your line" :maxlength="form.length" placeholder="Make them laugh" />

    <template v-else>
      <div v-for="(item, n) in form.items" :key="n" class="room-line">
        <p>“{{ item }}”</p>
        <StarRating v-model="stars[n]" :label="`Stars for line ${n + 1}`" />
      </div>
    </template>

    <ActionButton type="submit" :disabled="!ready" :loading="busy">{{ form.kind === "rate" ? "Hand out the stars" : "Lock it in" }}</ActionButton>
  </form>
  <p v-else-if="!shown" class="room-waiting"><StatusBadge variant="success" :dot="true">Your answer is in</StatusBadge> Waiting for the others.</p>
</template>
