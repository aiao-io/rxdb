<script setup lang="ts">
import type { MenuNode } from '@aiao/rxdb-admin';
import { computed, type Component } from 'vue';
import { useAdminShell } from '../context.js';
import { interceptNavigation } from './intercept-navigation.js';

const props = defineProps<{
  /** 带路由的菜单叶子。 */
  node: MenuNode<Component>;
  /** 是否为当前菜单项。 */
  active: boolean;
}>();

const shell = useAdminShell();
const route = computed(() => props.node.route as string);

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
      :size="16"
    />{{ node.label }}</a
  >
</template>
