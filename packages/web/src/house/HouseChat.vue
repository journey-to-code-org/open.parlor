<!--
  The house's chat, and who is in the house right now. A Vue island on the house's page, drawn with
  Zubra components: the faces are avatars with a status dot in a cluster, the messages a stack, the
  message box a text field, the buttons action buttons, taking a message down a dialog, and what
  went wrong an alert.

  Two keyed lists sit in a Zubra component's slot and change while it is open. The faces reorder
  (whoever is here comes first) and the messages arrive at the end, fall off the start and are
  taken out of the middle; each is a TransitionGroup, so the elements have to be moved, not made
  again. The dialog is teleported out to the body and stays bound.

  The chat itself is in chat.ts, which is plain TypeScript.
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import ActionButton from "@open-parlor/ui/zubra-ui/action-button.zb";
import AlertBanner from "@open-parlor/ui/zubra-ui/alert-banner.zb";
import ClusterLayout from "@open-parlor/ui/zubra-ui/cluster-layout.zb";
import EmptyState from "@open-parlor/ui/zubra-ui/empty-state.zb";
import ModalDialog from "@open-parlor/ui/zubra-ui/modal-dialog.zb";
import StackLayout from "@open-parlor/ui/zubra-ui/stack-layout.zb";
import StatusBadge from "@open-parlor/ui/zubra-ui/status-badge.zb";
import TextField from "@open-parlor/ui/zubra-ui/text-field.zb";
import UserAvatar from "@open-parlor/ui/zubra-ui/user-avatar.zb";
import type { HouseMessage } from "../housesApi";
import { when, type ChatLook, type ChatStore } from "./chat";

const props = defineProps<{
  store: ChatStore;
  /** Everyone in the house, in the house's order. */
  members: { id: string; name: string }[];
  /** This browser's own member id. */
  me: string;
  online: boolean;
}>();

const look = shallowRef<ChatLook>(props.store.look());
const stop = props.store.subscribe((next) => (look.value = next));
onBeforeUnmount(stop);

const chat = computed(() => look.value.chat);
const messages = computed(() => chat.value?.messages ?? []);
const here = computed(() => new Set(look.value.here));

// Whoever is here first, then the rest, each group in the house's own order: a face moves along
// the row when its owner comes or goes.
const faces = computed(() => {
  const all = props.members.map((m) => ({ ...m, here: here.value.has(m.id) }));
  return [...all.filter((m) => m.here), ...all.filter((m) => !m.here)];
});
const others = computed(() => faces.value.filter((m) => m.here && m.id !== props.me));
const hereLine = computed(() => {
  if (props.members.length === 1) return "Only you so far";
  const names = others.value.map((m) => m.name);
  if (names.length === 0) return "Just you here";
  if (names.length <= 2) return `${names.join(" and ")} ${names.length === 1 ? "is" : "are"} here`;
  return `${names.length} others here`;
});

// ---- Saying something -------------------------------------------------------------------------------
const draft = ref("");
const sending = ref(false);
const problem = ref<string | null>(null);
const ready = computed(() => chat.value !== null && props.online);

async function send() {
  const text = draft.value.trim();
  if (!text || sending.value) return;
  sending.value = true;
  problem.value = await props.store.say(text);
  sending.value = false;
  if (problem.value === null) draft.value = "";
}

// ---- Taking one down --------------------------------------------------------------------------------
const asking = ref<HouseMessage | null>(null);
const askOpen = computed({ get: () => asking.value !== null, set: (open: boolean) => !open && (asking.value = null) });
const taking = ref(false);

async function takeDown() {
  const message = asking.value;
  if (!message || taking.value) return;
  taking.value = true;
  problem.value = await props.store.unsay(message.id);
  taking.value = false;
  asking.value = null;
}

// ---- Following the talk down ------------------------------------------------------------------------
// The list follows new messages unless the reader has scrolled back up through the older ones.
const box = ref<HTMLElement | null>(null);
let seen: number | null = null;
watch(
  () => messages.value.at(-1),
  async (newest) => {
    const first = seen === null && chat.value !== null;
    const fresh = newest !== undefined && seen !== null && newest.id > seen;
    const near = box.value ? box.value.scrollHeight - box.value.scrollTop - box.value.clientHeight < 140 : true;
    if (chat.value !== null) seen = newest?.id ?? 0;
    if (!first && !(fresh && (newest!.mine || near))) return;
    await nextTick();
    if (box.value) box.value.scrollTop = box.value.scrollHeight;
  },
  { immediate: true },
);
</script>

<template>
  <div class="house-chat">
    <ClusterLayout class="hc-here" gap="0.35rem" role="group" aria-label="Who's here">
      <TransitionGroup name="hc-face">
        <span v-for="m in faces" :key="m.id" class="hc-face" :class="{ away: !m.here }" :title="`${m.name}${m.id === me ? ' (you)' : ''}: ${m.here ? 'here now' : 'not here'}`">
          <UserAvatar :name="m.name" size="sm" :status="m.here ? 'online' : 'offline'" />
        </span>
      </TransitionGroup>
      <StatusBadge class="hc-count" :variant="others.length ? 'success' : 'neutral'" :dot="others.length > 0">{{ hereLine }}</StatusBadge>
    </ClusterLayout>

    <div ref="box" class="hc-log" role="log" aria-label="Messages" tabindex="0">
      <EmptyState v-if="!chat" :heading="online ? 'Opening the chat…' : 'The chat needs a connection'">{{ online ? "One moment." : "It will be here when you're back online." }}</EmptyState>
      <EmptyState v-else-if="messages.length === 0" heading="Nothing said yet">{{ chat.others > 0 ? "Say hi to the house." : "Nobody else is here yet. Leave a note for when they are." }}</EmptyState>
      <StackLayout v-else gap="0.45rem">
        <TransitionGroup name="hc-msg">
          <article v-for="m in messages" :key="m.id" class="hc-msg" :class="{ mine: m.mine }">
            <UserAvatar v-if="!m.mine" :name="m.name" size="sm" :status="here.has(m.by) ? 'online' : ''" />
            <div class="hc-bubble">
              <span class="hc-who">
                {{ m.name }}
                <time :datetime="new Date(m.at).toISOString()">{{ when(m.at) }}</time>
              </span>
              <span class="hc-text">{{ m.text }}</span>
              <ActionButton v-if="m.mine || chat.canRemove" class="hc-take" variant="link" size="sm" @click="asking = m">Take down</ActionButton>
            </div>
          </article>
        </TransitionGroup>
      </StackLayout>
    </div>

    <form class="hc-form" @submit.prevent="send">
      <TextField v-model="draft" label="Say something to the house" name="message" autocomplete="off" :maxlength="chat?.limit ?? 280" :disabled="!ready" />
      <ActionButton type="submit" :loading="sending" :disabled="!draft.trim() || !ready">Send</ActionButton>
    </form>

    <AlertBanner v-if="problem" variant="danger" heading="That didn't go through">{{ problem }}</AlertBanner>

    <!-- Out on the body, where nothing on the house's page can clip it; the class brings the chat's colours along. -->
    <Teleport to="body">
      <div class="house-chat-theme">
        <ModalDialog v-model:open="askOpen" :label="asking?.mine ? 'Take your message down?' : `Take down what ${asking?.name ?? 'they'} said?`">
          <p class="hc-quote">“{{ asking?.text }}”</p>
          <p>It goes for everyone in the house, and can't be put back.</p>
          <ActionButton slot="actions" variant="outline" data-close>Leave it</ActionButton>
          <ActionButton slot="actions" variant="destructive" :loading="taking" @click="takeDown">Take it down</ActionButton>
        </ModalDialog>
      </div>
    </Teleport>
  </div>
</template>
