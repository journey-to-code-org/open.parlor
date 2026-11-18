<!-- Open tables: every table that's waiting for players, whatever the game. See who's playing what
     and how long they've waited, and jump into a seat. A Vue island of Zubra fields over lobbyApi.ts;
     LobbyPage.tsx only mounts it. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import SelectField from "@open-parlor/ui/zubra-ui/select-field.zb";
import TextField from "@open-parlor/ui/zubra-ui/text-field.zb";
import { lobby, lobbyProblem, waited, whoIsThere, type OpenTable } from "../lobbyApi";
import { loadSavedName, saveName } from "../storage";
import NotifyButton from "./NotifyButton.vue";

export interface LobbyGame {
  id: string;
  name: string;
  emoji: string;
}

const props = defineProps<{ games: LobbyGame[]; onOpenTable: (id: string) => void; onLeave: () => void }>();

const REFRESH_MS = 4000;
const tables = ref<OpenTable[] | null>(null);
const name = ref(loadSavedName());
const game = ref("all");
const problem = ref<string | null>(null);
const joining = ref<string | null>(null);
// "Buzz me when a table opens": off, any game, or one game. Hidden when the server has no push.
const alerts = ref<{ games: string[]; notifications: boolean } | null>(null);

const about = (id: string) => props.games.find((g) => g.id === id) ?? props.games[0]!;
const buzzFor = computed(() => alerts.value?.games[0] ?? "off");
const buzzChoices = computed(() => [{ value: "off", label: "Don't buzz me" }, { value: "any", label: "Any game" }, ...props.games.map((g) => ({ value: g.id, label: g.name }))]);
const playing = computed(() => [...new Set((tables.value ?? []).map((t) => t.game as string))]);
const filters = computed(() => [{ value: "all", label: "Any game" }, ...props.games.filter((g) => playing.value.includes(g.id) || g.id === game.value).map((g) => ({ value: g.id, label: g.name }))]);
const shown = computed(() => (tables.value ?? []).filter((t) => game.value === "all" || t.game === game.value));
const since = (t: OpenTable) => (waited(t.created) === "just now" ? "opened just now" : `waiting ${waited(t.created)}`);

let live = true;
let loaded = false;
let timer: ReturnType<typeof setInterval> | undefined;
function load() {
  if (document.visibilityState === "hidden") return;
  lobby
    .list()
    .then(
      (next) => {
        if (live) tables.value = next;
      },
      (e) => {
        // A missed refresh keeps the list that's showing; only a first load that fails says so.
        if (!live || loaded) return;
        problem.value = lobbyProblem(e);
        tables.value = [];
      },
    )
    .finally(() => (loaded = true));
}
onMounted(() => {
  lobby.alerts().then((a) => (alerts.value = a), () => undefined);
  load();
  timer = setInterval(load, REFRESH_MS);
  document.addEventListener("visibilitychange", load);
});
onBeforeUnmount(() => {
  live = false;
  clearInterval(timer);
  document.removeEventListener("visibilitychange", load);
});

async function jump(table: OpenTable) {
  problem.value = null;
  joining.value = table.id;
  try {
    if (table.seat === null) {
      saveName(name.value.trim());
      await lobby.sit(table.id, name.value.trim());
    }
    props.onOpenTable(table.id);
  } catch (e) {
    problem.value = lobbyProblem(e);
    joining.value = null;
    lobby.list().then((next) => (tables.value = next), () => undefined);
  }
}

function buzz(choice: string) {
  lobby.setAlerts(choice === "off" ? [] : [choice]).then(
    (a) => (alerts.value = a),
    (e) => (problem.value = lobbyProblem(e)),
  );
}
</script>

<template>
  <main class="setup lobby open-tables">
    <header class="setup-head">
      <div class="suits" aria-hidden="true">♠ ♥ ♣ ♦</div>
      <h1>Open tables</h1>
      <p>People waiting for players right now. Jump into a seat; the game starts when the table fills.</p>
    </header>

    <TextField v-model="name" label="Your name" :required="true" :maxlength="20" autocomplete="nickname" />
    <SelectField v-if="playing.length > 1" v-model="game" label="Game" :options="filters" />

    <p v-if="tables === null" class="fine">Looking for open tables…</p>
    <p v-else-if="shown.length === 0" class="rules-summary open-none">
      Nobody's waiting right now. Pick a game and choose "Find players": you'll be first at the table, and it shows up here for everyone else.
    </p>
    <ul v-else class="house-list open-list" aria-label="Open tables" aria-live="polite">
      <li v-for="t in shown" :key="t.id">
        <span class="open-emoji" aria-hidden="true">{{ about(t.game).emoji }}</span>
        <div>
          <strong>
            {{ about(t.game).name }}
            <em v-if="t.seat !== null">you're here</em>
          </strong>
          <small>{{ whoIsThere(t) }}</small>
          <small>{{ t.free }} of {{ t.seats.length }} seats open · {{ t.rules ? `${t.rules} · ` : "" }}{{ since(t) }}</small>
        </div>
        <button type="button" class="primary small" :disabled="joining !== null || (t.seat === null && !name.trim())" @click="jump(t)">
          {{ t.seat !== null ? "Go back" : "Jump in" }}
        </button>
      </li>
    </ul>
    <p v-if="problem" class="error">{{ problem }}</p>
    <section v-if="alerts?.notifications" class="house-block" aria-label="Notifications">
      <SelectField label="Buzz me when a table opens for" :value="buzzFor" :options="buzzChoices" @valuechange="buzz($event.detail)" />
      <NotifyButton v-if="buzzFor !== 'off'" what="someone's looking for players" />
    </section>
    <button type="button" class="link" @click="onLeave">← All games</button>
  </main>
</template>
