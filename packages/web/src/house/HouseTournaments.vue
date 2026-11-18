<!-- A house's tournaments: signing up, playing, or won. Managers can start one. -->
<script setup lang="ts">
import { GAME_LIST } from "../GamePicker";
import type { House } from "../housesApi";

defineProps<{ tournaments: House["tournaments"]; canManage: boolean; game: string; onOpenTournament: (id: string) => void; onStart: () => void }>();
const emoji = (game: string) => GAME_LIST.find((g) => g.id === game)?.emoji ?? "♠️";
const gameName = (game: string) => (game === "spades" ? "spades" : (GAME_LIST.find((g) => g.id === game)?.name ?? ""));
function state(t: House["tournaments"][number]) {
  if (t.status === "signup") return `Signing up · ${t.entrants} ${t.game === "spades" ? "team" : "player"}${t.entrants === 1 ? "" : "s"} so far`;
  if (t.status === "playing") return `Playing · ${t.round}`;
  return `🏆 ${t.champion}`;
}
</script>

<template>
  <section class="house-block" aria-label="Tournaments">
    <h2>Tournaments</h2>
    <p v-if="tournaments.length === 0" class="fine">
      {{ canManage ? "Run a bracket: everyone signs up, plays their match when they can, and one of you takes the crown." : "No tournaments yet." }}
    </p>
    <ul class="house-list">
      <li v-for="t in tournaments" :key="t.id">
        <div>
          <strong>{{ emoji(t.game) }} {{ t.name }}</strong>
          <small>{{ state(t) }}</small>
        </div>
        <button type="button" class="secondary small" @click="onOpenTournament(t.id)">{{ t.status === "signup" ? "Sign up" : "Bracket" }}</button>
      </li>
    </ul>
    <button v-if="canManage" type="button" class="secondary" @click="onStart">Start a {{ gameName(game) }} tournament</button>
  </section>
</template>
