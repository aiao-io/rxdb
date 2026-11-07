<script setup lang="ts">
import type { MenuNode } from '@aiao/rxdb-admin';
import { computed, type Component } from 'vue';
import type { RenderMenuExtra } from '../types.js';
import { railEntries } from './menu-helpers.js';
import MenuLink from './menu-link.vue';

const props = withDefaults(
  defineProps<{
    /** 菜单树，渲染前压平为叶子。 */
    nodes: readonly MenuNode<Component>[];
    /** 当前页对应的叶子 id。 */
    activeId?: string;
  }>(),
  { activeId: undefined }
);

defineSlots<{
  /** 菜单项右侧附加内容（徽标、计数）。 */
  extra?: RenderMenuExtra;
}>();

const entries = computed(() => railEntries(props.nodes));
</script>

<template>
  <template
    v-for="(entry, index) in entries"
    :key="entry === null ? `separator-${index}` : entry.id"
  >
    <li
      v-if="entry === null"
      aria-hidden="true"
      class="admin-menu-rail-separator"
    />
    <li v-else>
      <MenuLink
        :node="entry"
        :active="entry.id === activeId"
      >
        <template
          v-if="$slots.extra"
          #extra="slotProps"
        >
          <slot
            name="extra"
            v-bind="slotProps"
          />
        </template>
      </MenuLink>
    </li>
  </template>
</template>
