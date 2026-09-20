<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import type { WorkingTreeContextMenuItem, WorkingTreeContextMenuState } from '../utils/context-menu';

/** 菜单的预估尺寸；位置按它夹回视口内。 */
const MENU_WIDTH = 208;
const ITEM_HEIGHT = 30;
const SEPARATOR_HEIGHT = 9;

/**
 * GitHub Desktop 形态的右键菜单。
 *
 * @remarks
 * 内联渲染（fixed 定位在本页面 DOM 里），形态与分支下拉同源：透明背板点哪都关，
 * Escape 走 document 级监听。菜单项是 `<button role="menuitem">`，键盘可达。
 * 位置按视口夹回：贴边右键时菜单不会伸出窗口（GitHub Desktop 的同款行为）。
 */
const props = defineProps<{
  menu: WorkingTreeContextMenuState | null;
}>();

const emit = defineEmits<{
  (e: 'itemSelected', item: WorkingTreeContextMenuItem): void;
  (e: 'closeRequested'): void;
}>();

/** 夹回视口内的横坐标：贴右边缘右键时菜单完整可见。 */
const clampedX = computed(() => {
  const menu = props.menu;
  if (menu === null) return 0;
  return Math.max(8, Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8));
});

const clampedY = computed(() => {
  const menu = props.menu;
  if (menu === null) return 0;
  const height =
    menu.items.reduce((total, item) => total + (item.separator === true ? SEPARATOR_HEIGHT : ITEM_HEIGHT), 0) + 12;
  return Math.max(8, Math.min(menu.y, window.innerHeight - height - 8));
});

/** Escape 走 document 级监听而不是挂在容器上：焦点在菜单任意子元素上时事件都能冒泡到 document。
 *  只认 Escape（Angular 侧是 key 过滤的 `keydown.escape` 监听）：其余按键不关菜单。 */
const onDocumentKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && props.menu !== null) emit('closeRequested');
};

onMounted(() => document.addEventListener('keydown', onDocumentKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onDocumentKeydown));
</script>

<template>
  <div v-if="menu !== null">
    <!-- 点外面关闭的透明背板（与分支菜单同一种形态） -->
    <div
      class="fixed inset-0 z-40"
      @click="emit('closeRequested')"
      @keydown.escape="emit('closeRequested')"
      aria-label="Close context menu"
      role="button"
      tabindex="0"
    ></div>
    <div
      class="gd-menu fixed z-50 py-1"
      :style="{ left: clampedX + 'px', top: clampedY + 'px', width: MENU_WIDTH + 'px' }"
      aria-label="Context menu"
      role="menu"
    >
      <template
        v-for="item in menu.items"
        :key="item.id"
      >
        <div
          class="gd-menu-divider"
          v-if="item.separator === true"
          role="separator"
        ></div>
        <button
          class="gd-menu-row"
          v-else
          :class="{ 'gd-btn-danger': item.danger === true }"
          :data-testid="item.testId ?? null"
          @click="emit('itemSelected', item)"
          role="menuitem"
          type="button"
        >
          {{ item.label }}
        </button>
      </template>
    </div>
  </div>
</template>
