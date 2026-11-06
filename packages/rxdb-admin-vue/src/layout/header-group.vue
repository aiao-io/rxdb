<script setup lang="ts">
import type { MenuNode } from '@aiao/rxdb-admin';
import { ChevronDown as ChevronDownIcon } from '@lucide/vue';
import type { Component } from 'vue';
import HeaderItems from './header-items.vue';

defineProps<{
  /** 带子项的分组节点。 */
  node: MenuNode<Component>;
  /** 当前菜单项标识。 */
  activeId: string | undefined;
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
        v-if="node.icon"
        :size="16" />{{ node.label }}<ChevronDownIcon :size="14"
    /></div>
    <ul
      tabindex="0"
      class="dropdown-content menu bg-base-100 rounded-box z-50 w-52 p-2 shadow"
    >
      <HeaderItems
        :nodes="node.children ?? []"
        :active-id="activeId"
      />
    </ul>
  </div>
</template>
