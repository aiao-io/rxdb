<script setup lang="ts">
import { ref } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';

const RESIZE_STEP = 16;

/**
 * 侧栏右缘的宽度拖拽手柄：指针拖动或左右方向键调整，范围由偏好约束（160–320）。
 */
const shell = useAdminShell();
const t = useAdminText();
const prefs = useAdminStore(shell.preferences);
const dragging = ref(false);
let origin = { x: 0, width: 0 };

const resizeTo = (width: number): void => shell.preferences.setPath('sidebar.width', width);

const onPointerDown = (event: PointerEvent): void => {
  event.preventDefault();
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  origin = { x: event.clientX, width: prefs.value.sidebar.width };
  dragging.value = true;
};

const onPointerMove = (event: PointerEvent): void => {
  if (dragging.value) resizeTo(origin.width + event.clientX - origin.x);
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
    :aria-valuenow="prefs.sidebar.width"
    aria-valuemin="160"
    aria-valuemax="320"
    tabindex="0"
    :data-dragging="dragging"
    data-testid="admin-sidebar-resizer"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="dragging = false"
    @pointercancel="dragging = false"
    @keydown="onKeyDown"
  />
</template>
