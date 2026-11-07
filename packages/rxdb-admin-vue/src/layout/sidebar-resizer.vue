<script setup lang="ts">
import { SIDEBAR_WIDTH_RANGE, SidebarDrag } from '@aiao/rxdb-admin';
import { onBeforeUnmount, ref } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';

const RESIZE_STEP = 16;

/**
 * 侧栏右缘的宽度拖拽手柄：指针拖动或左右方向键调整，范围由偏好约束（160–320）。
 * 指针拖动期间只预览宽度，偏好在松手时才一次性提交，外壳不会随指针移动重渲染。
 */
const shell = useAdminShell();
const t = useAdminText();
const prefs = useAdminStore(shell.preferences);
// 拖动中的预览宽度，`null` 表示没有在拖动
const live = ref<number | null>(null);
// 带 #private 字段的类实例，不能放进 ref()：深层代理读不到私有字段
let drag: SidebarDrag | undefined;

// 拖动中手柄被卸载（侧栏折叠、关掉拖拽偏好）：撤掉预览，不提交
onBeforeUnmount(() => drag?.cancel());

const resizeTo = (width: number): void => shell.preferences.setPath('sidebar.width', width);

const onPointerDown = (event: PointerEvent): void => {
  event.preventDefault();
  const handle = event.currentTarget as HTMLElement;
  handle.setPointerCapture?.(event.pointerId);
  drag = new SidebarDrag(shell.preferences, handle, event.clientX);
  live.value = drag.width;
};

const onPointerMove = (event: PointerEvent): void => {
  if (drag) live.value = drag.move(event.clientX);
};

const onPointerEnd = (): void => {
  drag?.end();
  drag = undefined;
  live.value = null;
};

const onKeyDown = (event: KeyboardEvent): void => {
  const delta =
    event.key === 'ArrowRight' ? RESIZE_STEP
    : event.key === 'ArrowLeft' ? -RESIZE_STEP
    : 0;
  if (delta === 0) return;
  event.preventDefault();
  resizeTo(prefs.value.sidebar.width + delta);
};
</script>

<template>
  <div
    class="admin-sidebar-resizer"
    role="separator"
    aria-orientation="vertical"
    :aria-label="t('layout.resize')"
    :aria-valuenow="live ?? prefs.sidebar.width"
    :aria-valuemin="SIDEBAR_WIDTH_RANGE.min"
    :aria-valuemax="SIDEBAR_WIDTH_RANGE.max"
    tabindex="0"
    :data-dragging="live !== null"
    data-testid="admin-sidebar-resizer"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @keydown="onKeyDown"
  />
</template>
