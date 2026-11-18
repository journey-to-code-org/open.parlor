<!--
  The house's chat, and who is in the house right now: open.chat's <chat-room>, a Zubra component,
  in a Vue island on the house's page. It follows the room live by itself and sends what the person
  does to `actions` (house/chat.ts). It comes from the package as its .zb source, so the Zubra
  plugin compiles it with the parlor's own copies of the parts it is made of (`action-button`,
  `text-field` and the rest), which stand in for the package's.
-->
<script setup lang="ts">
import ChatRoom from "@journey-to-code/chat-ui/components/chat-room.zb";
import type { ChatActions } from "@journey-to-code/chat/client";
import { roomOf } from "./chat";

defineProps<{
  slug: string;
  actions: ChatActions;
  /** Everyone in the house, in the house's order. */
  members: { id: string; name: string }[];
  /** This browser's own member id, and whether they run the house. */
  me: string;
  manager: boolean;
  online: boolean;
  /** Someone else said something (for a sound). */
  onHeard?: () => void;
}>();
</script>

<template>
  <ChatRoom class="house-chat" :doc="roomOf(slug)" :me="me" :members="members" :manager="manager" :online="online" :can-filter="true" noun="house" :actions="actions" @heard="onHeard?.()" />
</template>
