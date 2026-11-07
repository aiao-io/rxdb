<script setup lang="ts">
import { findMenuPath, type MenuNode } from '@aiao/rxdb-admin';
import { computed, type Component } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import HeaderGroup from './header-group.vue';
import HeaderLink from './header-link.vue';

/**
 * 顶部导航的水平菜单：分组悬停展开子项。
 */
const props = defineProps<{
  /** 菜单树。 */
  nodes: readonly MenuNode<Component>[];
}>();

const t = useAdminText();
const url = useAdminStore(useAdminShell().currentUrl);
const activeId = computed(() => findMenuPath(props.nodes, url.value).at(-1)?.id);
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
        :active-id="activeId"
      />
      <HeaderLink
        v-else
        :node="node"
        :active="node.id === activeId"
      />
    </template>
  </nav>
</template>
