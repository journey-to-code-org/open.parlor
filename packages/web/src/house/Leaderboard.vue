<!-- Spades standings from the house's finished games. Fetched again when a game finishes. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { houses, type Standings } from "../housesApi";

const props = defineProps<{ slug: string; me: string; finished: number }>();
const board = ref<Standings | null>(null);
watch(
  () => [props.slug, props.finished],
  () => houses.leaderboard(props.slug).then((b) => (board.value = b), () => (board.value = null)),
  { immediate: true },
);
const ranked = computed(() => (board.value?.players ?? []).filter((p) => p.played > 0));
// Ties share a place: one more than the number of players strictly ahead.
const placeOf = (p: Standings["players"][number]) => 1 + ranked.value.filter((q) => q.won > p.won || (q.won === p.won && (q.winPct ?? 0) > (p.winPct ?? 0))).length;
</script>

<template>
  <section v-if="board" class="house-block" aria-label="Leaderboard">
    <h2>Leaderboard</h2>
    <p v-if="board.games === 0" class="fine">Standings start after the first finished game.</p>
    <template v-else>
      <table class="standings">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Player</th>
            <th scope="col">Won</th>
            <th scope="col">Played</th>
            <th scope="col">Win %</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in ranked" :key="p.id" :class="p.id === me ? 'me' : ''">
            <td>{{ placeOf(p) === 1 && p.won > 0 ? "♠" : placeOf(p) }}</td>
            <th scope="row">{{ p.name }}</th>
            <td>{{ p.won }}</td>
            <td>{{ p.played }}</td>
            <td>{{ p.winPct }}%</td>
          </tr>
        </tbody>
      </table>
      <p class="fine">{{ board.games }} finished game{{ board.games === 1 ? "" : "s" }}. Games with bots count; bots don't rank.</p>

      <template v-if="board.partners.length > 0">
        <h3>Best partners</h3>
        <ul class="house-list">
          <li v-for="p in board.partners.slice(0, 3)" :key="p.ids.join('+')">
            <div>
              <strong>{{ p.names[0] }} &amp; {{ p.names[1] }}</strong>
              <small>{{ p.won }}–{{ p.played - p.won }} together</small>
            </div>
          </li>
        </ul>
      </template>

      <ul v-if="board.highlights.biggestComeback || board.highlights.mostNils" class="highlights">
        <li v-if="board.highlights.biggestComeback">
          <strong>Biggest comeback:</strong> {{ board.highlights.biggestComeback.names.join(" & ") }} came back from {{ board.highlights.biggestComeback.behindBy }} behind to win
          {{ board.highlights.biggestComeback.final[0] }}–{{ board.highlights.biggestComeback.final[1] }}.
        </li>
        <li v-if="board.highlights.mostNils"><strong>Nil queen or king:</strong> {{ board.highlights.mostNils.name }}, with {{ board.highlights.mostNils.made }} made.</li>
      </ul>
    </template>
  </section>
</template>
