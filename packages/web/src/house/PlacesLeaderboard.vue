<!-- Standings for a game played for places (Palace and the kit games): first counts as a win, and
     last is remembered too. Fetched again when one of its games finishes. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { GAME_LIST } from "../GamePicker";
import { houses, type PalaceStandings } from "../housesApi";
import type { GameId } from "../storage";

const props = defineProps<{ slug: string; me: string; game: GameId; finished: number }>();
const board = ref<PalaceStandings | null>(null);
watch(
  () => [props.slug, props.game, props.finished],
  () => houses.placesLeaderboard(props.slug, props.game).then((b) => (board.value = b), () => (board.value = null)),
  { immediate: true },
);
const name = computed(() => GAME_LIST.find((g) => g.id === props.game)?.name ?? "Palace");
const ranked = computed(() => (board.value?.players ?? []).filter((p) => p.played > 0));
const note = computed(() =>
  props.game === "palace" ? "Won is first out; Last is left holding the cards." : board.value?.teams ? "Won counts your team's wins." : "Won is first place; Last is last place.",
);
</script>

<template>
  <section v-if="board" class="house-block" :aria-label="`${name} leaderboard`">
    <h2>{{ name }} leaderboard</h2>
    <p v-if="board.games === 0" class="fine">Standings start after the first finished {{ name }} game.</p>
    <template v-else>
      <table class="standings">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Player</th>
            <th scope="col">Won</th>
            <th v-if="!board.teams" scope="col">Last</th>
            <th scope="col">Played</th>
            <th scope="col">Avg place</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in ranked" :key="p.id" :class="p.id === me ? 'me' : ''">
            <td>{{ i === 0 && p.won > 0 ? "👑" : i + 1 }}</td>
            <th scope="row">{{ p.name }}</th>
            <td>{{ p.won }}</td>
            <td v-if="!board.teams">{{ p.last }}</td>
            <td>{{ p.played }}</td>
            <td>{{ p.avgPlace }}</td>
          </tr>
        </tbody>
      </table>
      <p class="fine">{{ board.games }} finished game{{ board.games === 1 ? "" : "s" }}. {{ note }}</p>
    </template>
  </section>
</template>
