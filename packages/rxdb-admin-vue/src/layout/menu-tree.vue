<script setup lang="ts">
import { activeGroupIds, findMenuPath, groupIds, groupsToOpen, toggleGroup } from '@aiao/rxdb-admin';
import { computed, shallowRef, watch } from 'vue';
import { useAdminShell, useAdminStore } from '../context.js';
import type { MenuTreeProps, RenderMenuExtra } from '../types.js';
import MenuItems from './menu-items.vue';
import RailItems from './rail-items.vue';

/**
 * 侧栏菜单树：分组可折叠（手风琴由偏好控制），当前页高亮，折叠为图标轨时压平。
 */
const props = defineProps<MenuTreeProps>();

defineSlots<{
  /** 菜单项右侧附加内容（徽标、计数）。 */
  extra?: RenderMenuExtra;
}>();

const shell = useAdminShell();
const url = useAdminStore(shell.currentUrl);
const prefs = useAdminStore(shell.preferences);
const open = shallowRef(new Set(groupsToOpen(props.nodes, url.value)));
// 已见过的分组：菜单更新后只展开新出现的分组，用户收起过的老分组不会被重新打开
let known: ReadonlySet<string> = new Set(groupIds(props.nodes));
const activeId = computed(() => findMenuPath(props.nodes, url.value).at(-1)?.id);

watch(url, current => {
  open.value = new Set([...open.value, ...activeGroupIds(props.nodes, current)]);
});

watch(
  () => props.nodes,
  nodes => {
    const fresh = groupsToOpen(nodes, url.value, known);
    known = new Set(groupIds(nodes));
    if (fresh.length > 0) open.value = new Set([...open.value, ...fresh]);
  }
);

const toggle = (id: string, siblings: readonly string[]): void => {
  open.value = toggleGroup(open.value, id, siblings, prefs.value.navigation.accordion);
};
</script>

<template>
  <ul
    class="menu admin-menu"
    :class="{ 'menu-md': rail }"
    :data-style="prefs.navigation.styleType"
    data-testid="admin-menu"
  >
    <RailItems
      v-if="rail"
      :nodes="nodes"
      :active-id="activeId"
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
    </RailItems>
    <MenuItems
      v-else
      :nodes="nodes"
      :active-id="activeId"
      :open="open"
      @toggle="toggle"
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
</template>
