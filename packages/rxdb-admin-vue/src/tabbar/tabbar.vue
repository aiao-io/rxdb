<script setup lang="ts">
import { findMenuPath } from '@aiao/rxdb-admin';
import { Pin as PinIcon, X as XIcon } from '@lucide/vue';
import { computed, nextTick, ref, shallowRef, useTemplateRef } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { interceptNavigation } from '../layout/intercept-navigation.js';
import HistoryMenu from './history-menu.vue';
import TabContextMenu from './tab-context-menu.vue';
import type { TabMenuAnchor } from './types.js';

/**
 * 页签栏：多页签、固定、拖拽 / 键盘排序、右键菜单、中键关闭、滚轮横向滚动。
 * 偏好关闭或还没有页签时不渲染。
 */
const shell = useAdminShell();
const t = useAdminText();
const layout = useAdminStore(shell.layout);
const prefs = useAdminStore(shell.preferences);
const tabsState = useAdminStore(shell.tabs);
const menu = useAdminStore(shell.menu);
const anchor = shallowRef<TabMenuAnchor | null>(null);
const dragKey = ref<string | null>(null);
const dropKey = ref<string | null>(null);
const scroller = useTemplateRef<HTMLUListElement>('scroller');

const rows = computed(() =>
  tabsState.value.tabs.map((tab, index) => ({
    tab,
    index,
    active: tab.key === tabsState.value.activeKey,
    icon: findMenuPath(menu.value, tab.url).at(-1)?.icon
  }))
);

const closeMenu = (): void => {
  anchor.value = null;
};

const openMenu = (key: string, x: number, y: number): void => {
  anchor.value = { key, x, y };
};

const move = (key: string, toIndex: number): void => shell.tabs.reorder(key, toIndex);

const clearDrag = (): void => {
  dragKey.value = null;
  dropKey.value = null;
};

const onKeyDown = (event: KeyboardEvent, key: string, index: number): void => {
  const { draggable } = prefs.value.tabbar;
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu(key, box.left, box.bottom);
  } else if (draggable && event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault();
    const link = event.currentTarget as HTMLElement;
    move(key, index + (event.key === 'ArrowLeft' ? -1 : 1));
    // keyed diff 重排时移动的可能正是被聚焦的节点（向左移动时），浏览器里被移动的节点会失焦：渲染完成后补回焦点
    void nextTick(() => link.focus());
  }
};

const onContextMenu = (event: MouseEvent, key: string): void => {
  event.preventDefault();
  openMenu(key, event.clientX, event.clientY);
};

const onMouseDown = (event: MouseEvent): void => {
  if (event.button === 1 && prefs.value.tabbar.middleClickToClose) event.preventDefault();
};

const onAuxClick = (event: MouseEvent, key: string, pinned: boolean): void => {
  if (event.button === 1 && prefs.value.tabbar.middleClickToClose && !pinned) {
    event.preventDefault();
    shell.closeTab(key);
  }
};

const onDragStart = (event: DragEvent, key: string): void => {
  event.dataTransfer?.setData('text/plain', key);
  dragKey.value = key;
};

const onDragOver = (event: DragEvent, key: string): void => {
  if (dragKey.value === null) return;
  event.preventDefault();
  dropKey.value = key;
};

const onDrop = (event: DragEvent, target: string): void => {
  event.preventDefault();
  const source = dragKey.value;
  clearDrag();
  const to = tabsState.value.tabs.findIndex(tab => tab.key === target);
  if (source && source !== target && to >= 0) move(source, to);
};

const onWheel = (event: WheelEvent): void => {
  if (prefs.value.tabbar.wheelable) scroller.value?.scrollBy?.({ left: event.deltaY });
};
</script>

<template>
  <nav
    v-if="layout.showTabbar && tabsState.tabs.length > 0"
    class="admin-tabbar"
    :data-style="prefs.tabbar.styleType"
    :aria-label="t('tabbar.label')"
    data-testid="admin-tabbar"
  >
    <HistoryMenu v-if="prefs.tabbar.visitHistory" />
    <ul
      ref="scroller"
      class="admin-tabbar-scroll"
      @wheel="onWheel"
    >
      <li
        v-for="{ tab, index, active, icon } in rows"
        :key="tab.key"
        class="admin-tab"
        :data-active="active"
        :data-pinned="tab.pinned"
        :data-dragging="dragKey === tab.key"
        :data-drop-target="dropKey === tab.key && dragKey !== tab.key"
        data-testid="admin-tab"
        :draggable="prefs.tabbar.draggable"
        @contextmenu="onContextMenu($event, tab.key)"
        @mousedown="onMouseDown"
        @auxclick="onAuxClick($event, tab.key, tab.pinned)"
        @dragstart="onDragStart($event, tab.key)"
        @dragover="onDragOver($event, tab.key)"
        @drop="onDrop($event, tab.key)"
        @dragend="clearDrag"
      >
        <a
          class="admin-tab-title"
          :href="tab.url"
          :aria-current="active ? 'page' : undefined"
          :title="tab.title"
          @click="interceptNavigation($event, () => shell.activateTab(tab.key))"
          @keydown="onKeyDown($event, tab.key, index)"
        >
          <PinIcon
            v-if="tab.pinned"
            :size="12"
            aria-hidden="true"
          />
          <component
            :is="icon"
            v-if="prefs.tabbar.showIcon && icon"
            :size="16"
          />
          <span>{{ tab.title }}</span>
        </a>
        <button
          v-if="!tab.pinned"
          type="button"
          class="admin-tab-close"
          :aria-label="`${t('tabbar.close')}：${tab.title}`"
          data-testid="admin-tab-close"
          @click="shell.closeTab(tab.key)"
        >
          <XIcon :size="12" />
        </button>
      </li>
    </ul>
    <TabContextMenu
      v-if="anchor"
      :anchor="anchor"
      @close="closeMenu"
    />
  </nav>
</template>
