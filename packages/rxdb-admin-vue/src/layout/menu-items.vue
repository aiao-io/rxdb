<script setup lang="ts">
import type { MenuNode } from '@aiao/rxdb-admin';
import { computed, type Component } from 'vue';
import type { RenderMenuExtra } from '../types.js';
import MenuLink from './menu-link.vue';

const props = withDefaults(
  defineProps<{
    /** 同一层的菜单节点。 */
    nodes: readonly MenuNode<Component>[];
    /** 当前页对应的叶子 id。 */
    activeId?: string;
    /** 展开的分组 id。 */
    open: ReadonlySet<string>;
  }>(),
  { activeId: undefined }
);

const emit = defineEmits<{
  /** 切换分组：分组 id 与同级的全部分组 id（手风琴用）。 */
  toggle: [id: string, siblings: readonly string[]];
}>();

defineSlots<{
  /** 菜单项右侧附加内容（徽标、计数）。 */
  extra?: RenderMenuExtra;
}>();

const siblings = computed(() => props.nodes.filter(node => node.children?.length).map(node => node.id));

const forward = (id: string, groups: readonly string[]): void => emit('toggle', id, groups);
</script>

<template>
  <template
    v-for="node in nodes"
    :key="node.id"
  >
    <li v-if="node.children?.length">
      <details :open="open.has(node.id)">
        <summary @click.prevent="emit('toggle', node.id, siblings)">
          <span class="admin-menu-icon"
            ><component
              :is="node.icon"
              v-if="node.icon"
          /></span>
          <span class="admin-menu-label">{{ node.label }}</span>
        </summary>
        <ul>
          <MenuItems
            :nodes="node.children"
            :active-id="activeId"
            :open="open"
            @toggle="forward"
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
          </MenuItems>
        </ul>
      </details>
    </li>
    <li v-else>
      <MenuLink
        :node="node"
        :active="node.id === activeId"
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
