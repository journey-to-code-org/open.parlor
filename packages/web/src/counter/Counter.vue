<!--
  Delbie's Counter: a shift behind the parts counter, and a game whose whole screen is Zubra
  components. There is no canvas. The customer speaks; the car is a select, the part a combobox,
  the count a stepper; the ticket is a table whose rows can be ticked and taken off; the core is a
  switch, the price level a segmented control, the change a money input; a part brought back is
  three choice cards; what the customer thought of it is a toast and a row of stars; and the end of
  the shift is a dialog. Every one of them is two-way: the form writes to the game through
  commands, and the game's ticket writes back to the form.

  A Vue island (in a .vue file a .zb import is a Vue component, with props, events and v-model).
  The game itself is in shift.ts, which is plain TypeScript.
-->
<script setup lang="ts">
import { COUNTER_LEVEL_NAMES, COUNTER_PARTS, COUNTER_POLICY, COUNTER_VEHICLES, dollars, type ArcadeEvent, type ArcadeView } from "@journey-to-code/games";
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import ActionButton from "@open-parlor/ui/zubra-ui/action-button.zb";
import AlertBanner from "@open-parlor/ui/zubra-ui/alert-banner.zb";
import ChoiceCards from "@open-parlor/ui/zubra-ui/choice-cards.zb";
import ComboBox from "@open-parlor/ui/zubra-ui/combo-box.zb";
import DataTable from "@open-parlor/ui/zubra-ui/data-table.zb";
import ModalDialog from "@open-parlor/ui/zubra-ui/modal-dialog.zb";
import MoneyInput from "@open-parlor/ui/zubra-ui/money-input.zb";
import QuantityStepper from "@open-parlor/ui/zubra-ui/quantity-stepper.zb";
import SegmentedControl from "@open-parlor/ui/zubra-ui/segmented-control.zb";
import SelectField from "@open-parlor/ui/zubra-ui/select-field.zb";
import StarRating from "@open-parlor/ui/zubra-ui/star-rating.zb";
import StatCard from "@open-parlor/ui/zubra-ui/stat-card.zb";
import StatusBadge from "@open-parlor/ui/zubra-ui/status-badge.zb";
import TabList from "@open-parlor/ui/zubra-ui/tab-list.zb";
import ToastRegion from "@open-parlor/ui/zubra-ui/toast-region.zb";
import ToggleSwitch from "@open-parlor/ui/zubra-ui/toggle-switch.zb";
import UserAvatar from "@open-parlor/ui/zubra-ui/user-avatar.zb";
import type { Shift } from "./shift";

const props = defineProps<{
  shift: Shift;
  /** How it ended, once it has: the line under the score, and whether it is this device's best. */
  ending: { line: string; score: number; best: boolean } | null;
  /** What happened on the last tick, for a sound to be made of it. */
  onEvents: (events: readonly ArcadeEvent[]) => void;
  onAgain: () => void;
  onLeave: () => void;
}>();

const view = shallowRef<ArcadeView>(props.shift.view());
const c = computed(() => view.value.counter!);
const front = computed(() => (c.value.asks ? c.value.line[0] : undefined));

// ---- The form ---------------------------------------------------------------------------------------
const tab = ref("sale");
const car = ref("");
const sku = ref("");
const qty = ref(1);
const ticked = ref<string[]>([]);
const pay = ref("card");
const change = ref<number | null>(null);
const ruling = ref("");

const CARS = [...new Set(COUNTER_VEHICLES.map((v) => v.make))].sort().map((make) => ({
  label: make,
  options: COUNTER_VEHICLES.map((v, i) => ({ v, i })).filter(({ v }) => v.make === make).map(({ v, i }) => ({ value: String(i), label: `${v.year} ${v.model} ${v.engine}` })),
}));
/** The parts for the car picked: what the combobox searches. */
const parts = computed(() => (car.value === "" ? [] : COUNTER_PARTS.filter((p) => p.vehicle === Number(car.value)).map((p) => ({ value: p.sku, label: `${p.name} · ${p.grade_name} · ${dollars(p.price)}` }))));
const TABS = [{ value: "sale", label: "Sale" }, { value: "return", label: "Bring-back" }];
const LEVELS = COUNTER_LEVEL_NAMES.map((label, i) => ({ value: String(i), label }));
const PAYS = [{ value: "card", label: "Card" }, { value: "cash", label: "Cash" }];
const RULINGS = [
  { id: "refund", title: "Refund", detail: `Unopened, and bought in the last ${COUNTER_POLICY.refundDays} days` },
  { id: "exchange", title: "Exchange", detail: "Defective, and bought in the last year" },
  { id: "refuse", title: "Refuse", detail: "Anything else. Sorry." },
];
const COLUMNS = [{ key: "name", label: "Part" }, { key: "qty", label: "Qty", align: "end", format: "number" }, { key: "each", label: "Each", align: "end", format: "currency" }, { key: "amount", label: "Amount", align: "end", format: "currency" }];
const rows = computed(() => c.value.ticket.lines.map((line) => ({ id: line.sku, name: line.name, qty: line.qty, each: line.each / 100, amount: line.amount / 100 })));

// The switch and the level are the game's own ticket, read and written through it: two-way all the way down.
const coreBack = computed({ get: () => c.value.ticket.coreBack, set: (on: boolean) => props.shift.send({ do: "core", on }) });
const level = computed({ get: () => String(c.value.ticket.level), set: (to: string) => props.shift.send({ do: "level", level: Number(to) }) });
const coreOnShelf = computed(() => c.value.ticket.lines.reduce((sum, line) => sum + (COUNTER_PARTS.find((p) => p.sku === line.sku)?.core ?? 0) * line.qty, 0));

function add() {
  if (!sku.value) return;
  props.shift.send({ do: "ring", sku: sku.value, qty: qty.value });
  sku.value = "";
  qty.value = 1;
}
function takeOff() {
  for (const id of ticked.value) props.shift.send({ do: "void", sku: id });
  ticked.value = [];
}
function finish() {
  if (pay.value === "cash") props.shift.send({ do: "cash", cents: Math.round((change.value ?? 0) * 100) });
  else props.shift.send({ do: "card" });
}
function rule() {
  if (ruling.value) props.shift.send({ do: ruling.value as "refund" | "exchange" | "refuse" });
}

// A new face at the counter: a clean form.
watch(() => front.value?.id, () => {
  car.value = "";
  sku.value = "";
  qty.value = 1;
  ticked.value = [];
  pay.value = "card";
  change.value = null;
  ruling.value = "";
});
watch(car, () => { sku.value = ""; });

// ---- What the game says back -----------------------------------------------------------------------
const toast = (detail: Record<string, unknown>) => document.dispatchEvent(new CustomEvent("toast", { detail }));
const stop = props.shift.subscribe((next, events) => {
  view.value = next;
  if (!events.length) return;
  props.onEvents(events);
  const last = next.counter!.last;
  for (const e of events) {
    if (e.kind === "sale" || e.kind === "sorted") toast({ heading: `${"★".repeat(last?.stars ?? 5)} ${e.text ?? ""}`, message: e.kind === "sale" ? "Rung up right. Next!" : "Sorted, by the book.", variant: "success", duration: 2600 });
    else if (e.kind === "wrong") toast({ heading: e.text, message: (last?.notes ?? []).join(" "), variant: "danger", duration: 6000 });
    else if (e.kind === "walk") toast({ heading: `${e.text} walked out`, message: "Tired of waiting. One star.", variant: "warning", duration: 3500 });
  }
});
onBeforeUnmount(stop);

const clock = computed(() => `${Math.floor(c.value.seconds / 60)}:${String(c.value.seconds % 60).padStart(2, "0")}`);
const mood = (m: number) => (m > 600 ? "success" : m > 300 ? "warning" : "danger");
const moodWord = (m: number) => (m > 600 ? "Fine" : m > 300 ? "Fidgeting" : "Fuming");
const over = computed({ get: () => view.value.over, set: () => undefined });
const stars = computed(() => Math.round(c.value.stars / 10));
</script>

<template>
  <div class="counter">
    <header class="counter-stats">
      <StatCard label="Shift" :value="clock" :period="view.stage ?? ''" />
      <StatCard label="Drawer" :value="dollars(c.till)" :period="`${c.served} served`" />
      <StatCard label="Score" :value="view.score.toLocaleString('en-US')" :period="c.streak > 1 ? `${c.streak} in a row` : c.walked ? `${c.walked} walked out` : 'Keep them moving'" />
    </header>

    <section class="counter-line" aria-label="The line">
      <span v-if="!c.line.length" class="counter-quiet">Nobody in. Enjoy it.</span>
      <span v-for="(who, i) in c.line" :key="who.id" class="counter-who" :class="{ first: i === 0 }">
        <UserAvatar :name="who.name" :size="i === 0 ? 'lg' : 'md'" />
        <StatusBadge :variant="mood(who.mood)" :dot="true">{{ i === 0 ? who.name : moodWord(who.mood) }}</StatusBadge>
      </span>
    </section>

    <AlertBanner v-if="front" class="counter-says" variant="info" :heading="`${front.name} says`">
      {{ c.says }}
      <strong v-if="c.tender !== null" class="counter-tender">Cash on the counter: {{ dollars(c.tender) }}</strong>
    </AlertBanner>
    <AlertBanner v-else class="counter-says" variant="info" heading="Next!">{{ c.line.length ? "Stepping up…" : "The door will ring in a second." }}</AlertBanner>

    <TabList v-model="tab" label="What are they here for?" :tabs="TABS">
      <div data-tab="sale" class="counter-form">
        <div class="counter-lookup">
          <SelectField v-model="car" label="Car" placeholder="Pick their car" :options="CARS" />
          <ComboBox v-model="sku" class="counter-part" label="Part" :placeholder="car === '' ? 'Pick the car first' : 'Type a few letters: brake, plug…'" :items="parts" />
          <div class="counter-add">
            <QuantityStepper v-model="qty" label="How many" :min="1" :max="12" />
            <ActionButton :disabled="!sku" @click="add">Add to ticket</ActionButton>
          </div>
        </div>

        <DataTable v-model:selected="ticked" label="Ticket" :columns="COLUMNS" :rows="rows" :selectable="true" :filterable="false" />
        <ActionButton v-if="ticked.length" variant="outline" size="sm" @click="takeOff">Take {{ ticked.length === 1 ? "it" : "them" }} off</ActionButton>

        <ToggleSwitch v-model:checked="coreBack" label="The old part came back" description="Switch on, and no core is charged" :extra="coreOnShelf ? dollars(coreOnShelf) : ''" />
        <SegmentedControl v-model="level" label="Price level" :options="LEVELS" />

        <dl class="counter-totals">
          <div><dt>Subtotal</dt><dd>{{ dollars(c.ticket.subtotal) }}</dd></div>
          <div v-if="c.ticket.discount"><dt>{{ COUNTER_LEVEL_NAMES[c.ticket.level] }} price</dt><dd>−{{ dollars(c.ticket.discount) }}</dd></div>
          <div v-if="c.ticket.core"><dt>Core</dt><dd>{{ dollars(c.ticket.core) }}</dd></div>
          <div><dt>Tax</dt><dd>{{ dollars(c.ticket.tax) }}</dd></div>
          <div class="total"><dt>Total</dt><dd>{{ dollars(c.ticket.total) }}</dd></div>
        </dl>

        <div class="counter-pay">
          <SegmentedControl v-model="pay" label="Paying by" :options="PAYS" />
          <MoneyInput v-if="pay === 'cash'" v-model="change" label="Change to hand back" />
          <p v-if="pay === 'cash' && c.ticket.change !== null" class="counter-hint">The register says {{ dollars(c.ticket.change) }}.</p>
          <ActionButton :disabled="!front" @click="finish">{{ pay === "cash" ? "Hand back the change" : "Run the card" }}</ActionButton>
        </div>
      </div>

      <div data-tab="return" class="counter-form">
        <p v-if="c.returning" class="counter-receipt">On the receipt: <strong>{{ c.returning.name }}</strong>, bought <strong>{{ c.returning.days }} {{ c.returning.days === 1 ? "day" : "days" }}</strong> ago.</p>
        <p v-else class="counter-receipt">Nothing has been handed across the counter.</p>
        <ChoiceCards v-model="ruling" label="What do they get?" :items="RULINGS" />
        <ActionButton :disabled="!ruling || !front" @click="rule">That's the ruling</ActionButton>
      </div>
    </TabList>

    <ModalDialog v-model:open="over" label="Shift's over">
      <p class="counter-dream">“Living that dream.” <span>Delbie</span></p>
      <StarRating :value="stars" :readonly="true" label="What the customers thought" />
      <p class="counter-final">{{ (ending?.score ?? view.score).toLocaleString("en-US") }}</p>
      <p>{{ ending?.line ?? "" }}{{ ending?.best ? " · your best yet" : "" }}</p>
      <ActionButton slot="actions" variant="outline" @click="onLeave">Clock out</ActionButton>
      <ActionButton slot="actions" @click="onAgain">Another shift</ActionButton>
    </ModalDialog>

    <ToastRegion position="top-center" :max="2" label="How that went" />
  </div>
</template>
