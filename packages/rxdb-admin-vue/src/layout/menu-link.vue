<script setup lang="ts">
import type { MenuNode } from '@aiao/rxdb-admin';
import { computed, type Component } from 'vue';
import { useAdminShell } from '../context.js';
import type { RenderMenuExtra } from '../types.js';
import { interceptNavigation } from './intercept-navigation.js';

const props = defineProps<{
  /** 带路由的菜单叶子。 */
  node: MenuNode<Component>;
  /** 是否当前页。 */
  active: boolean;
}>();

defineSlots<{
  /** 菜单项右侧附加内容（徽标、计数）。 */
  extra?: RenderMenuExtra;
}>();

const shell = useAdminShell();
const route = computed(() => props.node.route as string);

// 非当前页时不带 class 属性（`:class` 求值为空串仍会写出 `class=""`），与 React 版的 DOM 一致
const activeAttrs = computed(() => (props.active ? { class: 'menu-active' } : undefined));

const go = (event: MouseEvent): void => interceptNavigation(event, () => shell.navigate(route.value));
</script>

<template>
  <a
    :href="route"
    v-bind="activeAttrs"
    :aria-current="active ? 'page' : undefined"
    :title="node.label"
    :data-testid="node.testId ?? 'admin-menu-link'"
    @click="go"
  >
    <span class="admin-menu-icon"
      ><component
        :is="node.icon"
        v-if="node.icon"
        :size="16"
    /></span>
    <span class="admin-menu-label">{{ node.label }}</span>
    <span
      v-if="$slots.extra"
      class="admin-menu-extra"
      ><slot
        name="extra"
        :node="node"
    /></span>
  </a>
</template>
