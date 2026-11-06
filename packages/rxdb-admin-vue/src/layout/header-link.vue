<script setup lang="ts">
import type { MenuNode } from '@aiao/rxdb-admin';
import { computed, type Component } from 'vue';
import { useAdminShell, useAdminStore } from '../context.js';
import { interceptNavigation } from './intercept-navigation.js';

const props = defineProps<{
  /** 带路由的菜单叶子。 */
  node: MenuNode<Component>;
}>();

const shell = useAdminShell();
const url = useAdminStore(shell.currentUrl);
const route = computed(() => props.node.route as string);
const active = computed(() =>
  route.value === '/' ? url.value === '/' : url.value === route.value || url.value.startsWith(`${route.value}/`)
);

const go = (event: MouseEvent): void => interceptNavigation(event, () => shell.navigate(route.value));
</script>

<template>
  <a
    :href="route"
    class="btn btn-ghost btn-sm"
    :class="{ 'btn-active': active }"
    :aria-current="active ? 'page' : undefined"
    :data-testid="node.testId ?? 'admin-header-link'"
    @click="go"
    ><component
      :is="node.icon"
      v-if="node.icon"
    />{{ node.label }}</a
  >
</template>
