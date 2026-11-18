<!-- A house's tables, each with what it's up to and a way in. -->
<script setup lang="ts">
import type { HouseTable } from "../housesApi";
import NotifyButton from "../vue/NotifyButton.vue";
import { tableAction, tableTitle } from "./titles";

defineProps<{ tables: HouseTable[]; onOpenTable: (id: string) => void }>();
</script>

<template>
  <section class="house-block" aria-label="Tables">
    <h2>Tables</h2>
    <p v-if="tables.length === 0" class="fine">No tables yet. Start one, then share it.</p>
    <ul class="house-list">
      <li v-for="t in tables" :key="t.id">
        <div>
          <strong>{{ tableTitle(t) }}</strong>
          <small>{{ t.rules }} · {{ t.seats.map((s) => s.name ?? "open").join(", ") }}</small>
        </div>
        <button type="button" class="secondary small" @click="onOpenTable(t.id)">{{ tableAction(t) }}</button>
      </li>
    </ul>
    <NotifyButton what="someone opens a table or says something here" />
  </section>
</template>
