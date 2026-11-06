<script setup lang="ts">
import type { MenuNode } from '@aiao/rxdb-admin';
import type { Component } from 'vue';
import { useAdminText } from '../context.js';
import HeaderGroup from './header-group.vue';
import HeaderLink from './header-link.vue';

/**
 * 顶部导航的水平菜单：分组悬停展开子项。
 */
defineProps<{
  /** 菜单树。 */
  nodes: readonly MenuNode<Component>[];
}>();

const t = useAdminText();
</script>

<template>
  <nav
    class="admin-header-menu"
    :aria-label="t('layout.navigation')"
    data-testid="admin-header-menu"
  >
    <template
      v-for="node in nodes"
      :key="node.id"
    >
      <HeaderGroup
        v-if="node.children?.length"
        :node="node"
      />
      <HeaderLink
        v-else
        :node="node"
      />
    </template>
  </nav>
</template>
