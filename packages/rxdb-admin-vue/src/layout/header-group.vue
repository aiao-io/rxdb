<script setup lang="ts">
import type { MenuNode } from '@aiao/rxdb-admin';
import { ChevronDown as ChevronDownIcon } from '@lucide/vue';
import type { Component } from 'vue';
import HeaderLink from './header-link.vue';

defineProps<{
  /** 带子项的分组节点。 */
  node: MenuNode<Component>;
}>();
</script>

<template>
  <div class="dropdown dropdown-hover">
    <div
      tabindex="0"
      role="button"
      class="btn btn-ghost btn-sm"
      ><component
        :is="node.icon"
        v-if="node.icon" />{{ node.label }}<ChevronDownIcon :size="14"
    /></div>
    <ul
      tabindex="0"
      class="dropdown-content menu bg-base-100 rounded-box z-50 w-52 p-2 shadow"
    >
      <li
        v-for="child in node.children ?? []"
        :key="child.id"
      >
        <HeaderLink :node="child" />
      </li>
    </ul>
  </div>
</template>
