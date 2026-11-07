<script setup lang="ts">
import type { MenuNode } from '@aiao/rxdb-admin';
import type { Component } from 'vue';
import HeaderLink from './header-link.vue';

defineProps<{
  /** 下拉菜单内的递归节点。 */
  nodes: readonly MenuNode<Component>[];
  /** 当前菜单项标识。 */
  activeId: string | undefined;
}>();
</script>

<template>
  <li
    v-for="node in nodes"
    :key="node.id"
  >
    <template v-if="node.children?.length">
      <span class="menu-title">
        <component
          :is="node.icon"
          v-if="node.icon"
          :size="16"
        />
        {{ node.label }}
      </span>
      <ul>
        <HeaderItems
          :nodes="node.children"
          :active-id="activeId"
        />
      </ul>
    </template>
    <HeaderLink
      v-else
      :node="node"
      :active="node.id === activeId"
    />
  </li>
</template>
