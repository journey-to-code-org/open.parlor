<!-- A house's people. The owner makes admins and removes people; managers make a new invite link. -->
<script setup lang="ts">
import { ref } from "vue";
import { houses, inviteLink, type House } from "../housesApi";

const props = defineProps<{ house: House; canManage: boolean; attempt: (work: () => Promise<House | void>) => Promise<void> }>();
const copied = ref(false);

async function invite() {
  const url = inviteLink(props.house);
  try {
    if (navigator.share) await navigator.share({ title: props.house.name, text: `Pull up a chair at ${props.house.name}.`, url });
    else {
      await navigator.clipboard.writeText(url);
      copied.value = true;
      setTimeout(() => (copied.value = false), 2000);
    }
  } catch {
    /* closed the share sheet */
  }
}

const flip = (m: House["members"][number]) => props.attempt(() => houses.setRole(props.house.slug, m.id, m.role === "admin" ? "member" : "admin"));
const remove = (m: House["members"][number]) => confirm(`Remove ${m.name} from ${props.house.name}?`) && props.attempt(() => houses.remove(props.house.slug, m.id));
const newLink = () => confirm("Make a new invite link? The old one will stop working.") && props.attempt(() => houses.newLink(props.house.slug));
</script>

<template>
  <section class="house-block" aria-label="Family">
    <h2>Family</h2>
    <ul class="house-list">
      <li v-for="m in house.members" :key="m.id">
        <div>
          <strong>{{ m.name }}</strong>
          <small>{{ m.id === house.me.id ? `you · ${m.role}` : m.role }}</small>
        </div>
        <span v-if="house.me.role === 'owner' && m.role !== 'owner'" class="row-actions">
          <button type="button" class="link" @click="flip(m)">{{ m.role === "admin" ? "Make member" : "Make admin" }}</button>
          <button type="button" class="link danger" @click="remove(m)">Remove</button>
        </span>
      </li>
    </ul>
    <button type="button" class="secondary" @click="invite">{{ copied ? "Link copied" : "Invite family" }}</button>
    <button v-if="canManage" type="button" class="link" @click="newLink">Make a new invite link</button>
  </section>
</template>
