<!--
  The house's chat, and who is in the house right now. A Vue island on the house's page, drawn with
  Zubra components inside one more: `<house-chat-feed>`, a `'use collection housechat'` element
  that holds the house's chat as a live Zubra Sync document and says who else has the page open
  (its presence). Everything below is in that element's slot, drawn from its events.

  The faces are avatars with a status dot in a cluster; the messages a stack; a poll is choice
  cards to vote with and a bar chart of how it stands; the message box a text field; asking a
  question and taking a message down are dialogs, teleported out to the body; the word filter is a
  switch; what went wrong an alert.

  Two keyed lists sit in Zubra components' slots and change while they're open: the faces reorder
  (whoever is here comes first), and the messages arrive, fall off the start and are taken out of
  the middle. Each is a TransitionGroup, so the elements have to be moved, not made again.
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ActionButton from "@open-parlor/ui/zubra-ui/action-button.zb";
import AlertBanner from "@open-parlor/ui/zubra-ui/alert-banner.zb";
import BarChart from "@open-parlor/ui/zubra-ui/bar-chart.zb";
import ChoiceCards from "@open-parlor/ui/zubra-ui/choice-cards.zb";
import ClusterLayout from "@open-parlor/ui/zubra-ui/cluster-layout.zb";
import EmptyState from "@open-parlor/ui/zubra-ui/empty-state.zb";
import ModalDialog from "@open-parlor/ui/zubra-ui/modal-dialog.zb";
import StackLayout from "@open-parlor/ui/zubra-ui/stack-layout.zb";
import StatusBadge from "@open-parlor/ui/zubra-ui/status-badge.zb";
import TextField from "@open-parlor/ui/zubra-ui/text-field.zb";
import ToggleSwitch from "@open-parlor/ui/zubra-ui/toggle-switch.zb";
import UserAvatar from "@open-parlor/ui/zubra-ui/user-avatar.zb";
import HouseChatFeed from "./house-chat-feed.zb";
import { tally, when, type HouseChatActions } from "./chat";

/** A message as the house's document holds it: the same for every member. */
interface Said {
  id: number;
  by: string;
  name: string;
  text: string;
  at: number;
  poll?: { options: string[]; votes: Record<string, number> };
}

const LIMIT = 280;
const MAX_OPTIONS = 4;

const props = defineProps<{
  slug: string;
  actions: HouseChatActions;
  /** Everyone in the house, in the house's order. */
  members: { id: string; name: string }[];
  /** This browser's own member id, and whether they run the house. */
  me: string;
  manager: boolean;
  online: boolean;
  /** Someone else said something (for a sound). */
  onHeard?: () => void;
}>();

// ---- What the feed says -----------------------------------------------------------------------------
const messages = ref<Said[]>([]);
const filter = ref(false);
const others = ref<string[]>([]);
// What has been heard already: nothing makes a sound until the chat has loaded once.
let seen = 0;
let settled = false;
const settle = setTimeout(() => (settled = true), 2000);
onBeforeUnmount(() => clearTimeout(settle));

function onChat(event: CustomEvent<{ messages: Said[]; rev: number; filter: boolean }>) {
  const next = event.detail;
  const newest = next.messages.at(-1)?.id ?? 0;
  if (settled && newest > seen && next.messages.some((m) => m.id > seen && m.by !== props.me)) props.onHeard?.();
  if (next.rev > 0) settled = true;
  seen = Math.max(seen, newest);
  messages.value = next.messages;
  filter.value = next.filter;
}
function onHere(event: CustomEvent<string[]>) {
  const next = event.detail;
  if (next.length !== others.value.length || next.some((id, i) => id !== others.value[i])) others.value = next;
}

const here = computed(() => new Set([props.me, ...others.value]));
// Whoever is here first, then the rest, each group in the house's own order: a face moves along
// the row when its owner comes or goes.
const faces = computed(() => {
  const all = props.members.map((m) => ({ ...m, here: here.value.has(m.id) }));
  return [...all.filter((m) => m.here), ...all.filter((m) => !m.here)];
});
const hereNames = computed(() => faces.value.filter((m) => m.here && m.id !== props.me).map((m) => m.name));
const hereLine = computed(() => {
  if (props.members.length === 1) return "Only you so far";
  const names = hereNames.value;
  if (names.length === 0) return "Just you here";
  if (names.length <= 2) return `${names.join(" and ")} ${names.length === 1 ? "is" : "are"} here`;
  return `${names.length} others here`;
});

const problem = ref<string | null>(null);
const busy = ref(false);
async function attempt(work: () => Promise<string | null>) {
  if (busy.value) return false;
  busy.value = true;
  problem.value = await work();
  busy.value = false;
  return problem.value === null;
}

// ---- Saying something -------------------------------------------------------------------------------
const draft = ref("");
async function send() {
  const text = draft.value.trim();
  if (text && (await attempt(() => props.actions.say(text)))) draft.value = "";
}

// ---- Polls ------------------------------------------------------------------------------------------
const voteOf = (m: Said) => tally(m.poll!, props.me);
const choicesOf = (m: Said) => m.poll!.options.map((title, i) => ({ id: String(i), title }));
const barsOf = (m: Said) => {
  const { counts } = voteOf(m);
  return m.poll!.options.map((label, i) => ({ label, value: counts[i]! }));
};
const vote = (m: Said, chosen: string) => void attempt(() => props.actions.vote(m.id, chosen === "" ? null : Number(chosen)));

const asking = ref(false);
const question = ref("");
const answers = ref<string[]>(["", ""]);
const filled = computed(() => answers.value.map((a) => a.trim()).filter(Boolean));
function openAsk() {
  question.value = "";
  answers.value = ["", ""];
  asking.value = true;
}
async function ask() {
  if (await attempt(() => props.actions.ask(question.value.trim(), filled.value))) asking.value = false;
}

// ---- Taking one down --------------------------------------------------------------------------------
const taking = ref<Said | null>(null);
const takeOpen = computed({ get: () => taking.value !== null, set: (open: boolean) => !open && (taking.value = null) });
async function takeDown() {
  const m = taking.value;
  if (m) await attempt(() => props.actions.unsay(m.id));
  taking.value = null;
}

// ---- The word filter --------------------------------------------------------------------------------
const setFilter = (on: boolean) => void attempt(() => props.actions.setFilter(on));

// ---- Following the talk down ------------------------------------------------------------------------
// The list follows new messages unless the reader has scrolled back up through the older ones.
const box = ref<HTMLElement | null>(null);
let shownNewest: number | null = null;
onMounted(() => (shownNewest = null));
watch(
  () => messages.value.at(-1),
  async (newest) => {
    const first = shownNewest === null && newest !== undefined;
    const fresh = newest !== undefined && shownNewest !== null && newest.id > shownNewest;
    const near = box.value ? box.value.scrollHeight - box.value.scrollTop - box.value.clientHeight < 160 : true;
    if (newest) shownNewest = Math.max(shownNewest ?? 0, newest.id);
    if (!first && !(fresh && (newest!.by === props.me || near))) return;
    await nextTick();
    if (box.value) box.value.scrollTop = box.value.scrollHeight;
  },
);
</script>

<template>
  <HouseChatFeed :doc="slug" :member="me" @chatchange="onChat" @herechange="onHere">
    <div class="house-chat">
      <ClusterLayout class="hc-here" gap="0.35rem" role="group" aria-label="Who's here">
        <TransitionGroup name="hc-face">
          <span v-for="m in faces" :key="m.id" class="hc-face" :class="{ away: !m.here }" :title="`${m.name}${m.id === me ? ' (you)' : ''}: ${m.here ? 'here now' : 'not here'}`">
            <UserAvatar :name="m.name" size="sm" :status="m.here ? 'online' : 'offline'" />
          </span>
        </TransitionGroup>
        <StatusBadge class="hc-count" :variant="hereNames.length ? 'success' : 'neutral'" :dot="hereNames.length > 0">{{ hereLine }}</StatusBadge>
      </ClusterLayout>

      <div ref="box" class="hc-log" role="log" aria-label="Messages" tabindex="0">
        <EmptyState v-if="messages.length === 0" :heading="online ? 'Nothing said yet' : 'Nothing kept on this device'">{{ !online ? "The chat will be here when you're back online." : members.length > 1 ? "Say hi to the house." : "Nobody else is here yet. Leave a note for when they are." }}</EmptyState>
        <StackLayout v-else gap="0.45rem">
          <TransitionGroup name="hc-msg">
            <article v-for="m in messages" :key="m.id" class="hc-msg" :class="{ mine: m.by === me, poll: m.poll }">
              <UserAvatar v-if="m.by !== me" :name="m.name" size="sm" :status="here.has(m.by) ? 'online' : ''" />
              <div class="hc-bubble">
                <span class="hc-who">
                  {{ m.name }}{{ m.poll ? " asks" : "" }}
                  <time :datetime="new Date(m.at).toISOString()">{{ when(m.at) }}</time>
                </span>
                <span class="hc-text">{{ m.text }}</span>
                <template v-if="m.poll">
                  <ChoiceCards class="hc-vote" :label="`Your answer to: ${m.text}`" :items="choicesOf(m)" :value="voteOf(m).mine === null ? '' : String(voteOf(m).mine)" @valuechange="vote(m, $event.detail)" />
                  <BarChart class="hc-bars" :items="barsOf(m)" :label="`${voteOf(m).total} ${voteOf(m).total === 1 ? 'vote' : 'votes'}`" />
                  <ActionButton v-if="voteOf(m).mine !== null" class="hc-take" variant="link" size="sm" :disabled="busy || !online" @click="vote(m, '')">Take back my vote</ActionButton>
                </template>
                <ActionButton v-if="m.by === me || manager" class="hc-take" variant="link" size="sm" @click="taking = m">Take down</ActionButton>
              </div>
            </article>
          </TransitionGroup>
        </StackLayout>
      </div>

      <form class="hc-form" @submit.prevent="send">
        <TextField v-model="draft" label="Say something to the house" name="message" autocomplete="off" :maxlength="LIMIT" :disabled="!online" />
        <ActionButton type="submit" :loading="busy" :disabled="!draft.trim() || !online">Send</ActionButton>
      </form>
      <div class="hc-tools">
        <ActionButton variant="outline" size="sm" :disabled="!online" @click="openAsk">Ask the house…</ActionButton>
        <ToggleSwitch v-if="manager" class="hc-filter" label="Cover crude words" :checked="filter" :disabled="!online || busy" @checkedchange="setFilter($event.detail)" />
        <StatusBadge v-else-if="filter" variant="outline">Crude words are covered</StatusBadge>
      </div>

      <AlertBanner v-if="problem" variant="danger" heading="That didn't go through">{{ problem }}</AlertBanner>
    </div>
  </HouseChatFeed>

  <!-- Out on the body, where nothing on the house's page can clip them; the class brings the chat's colours along. -->
  <Teleport to="body">
    <div class="house-chat-theme">
      <ModalDialog v-model:open="asking" label="Ask the house">
        <form class="hc-ask" @submit.prevent="ask">
          <TextField v-model="question" label="Your question" name="question" autocomplete="off" :maxlength="140" :required="true" />
          <TextField v-for="(_, i) in answers" :key="i" v-model="answers[i]" :label="`Answer ${i + 1}`" :name="`answer-${i}`" autocomplete="off" :maxlength="40" :required="i < 2" />
          <ActionButton v-if="answers.length < MAX_OPTIONS" variant="link" size="sm" @click="answers.push('')">Add an answer</ActionButton>
        </form>
        <ActionButton slot="actions" variant="outline" data-close>Never mind</ActionButton>
        <ActionButton slot="actions" :loading="busy" :disabled="!question.trim() || filled.length < 2" @click="ask">Ask</ActionButton>
      </ModalDialog>
      <ModalDialog v-model:open="takeOpen" :label="taking?.by === me ? 'Take your message down?' : `Take down what ${taking?.name ?? 'they'} said?`">
        <p class="hc-quote">“{{ taking?.text }}”</p>
        <p>It goes for everyone in the house, and can't be put back.</p>
        <ActionButton slot="actions" variant="outline" data-close>Leave it</ActionButton>
        <ActionButton slot="actions" variant="destructive" :loading="busy" @click="takeDown">Take it down</ActionButton>
      </ModalDialog>
    </div>
  </Teleport>
</template>
