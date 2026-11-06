<script setup lang="ts">
import {
  moveVisibleWidget,
  PINNED_WIDGETS,
  toggleWidgetHidden,
  visibleWidgets,
  type WidgetKey
} from '@aiao/rxdb-admin';
import { Eye as EyeIcon, EyeOff as EyeOffIcon, GripVertical as GripVerticalIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';

/**
 * 顶栏部件的顺序与显隐：拖拽或上下方向键调整顺序，眼睛按钮切换显隐（设置入口不可隐藏）。
 */
const shell = useAdminShell();
const t = useAdminText();
const prefs = useAdminStore(shell.preferences);
const dragFrom = ref<number | null>(null);
const dropTo = ref<number | null>(null);

const visible = computed(() => visibleWidgets(prefs.value.widget));
const hidden = computed(() => prefs.value.widget.order.filter(key => prefs.value.widget.hidden.includes(key)));

const reorder = (from: number, to: number): void =>
  shell.preferences.setPath('widget.order', moveVisibleWidget(prefs.value.widget, from, to));
const toggle = (key: WidgetKey): void =>
  shell.preferences.setPath('widget.hidden', toggleWidgetHidden(prefs.value.widget.hidden, key));

const clearDrag = (): void => {
  dragFrom.value = null;
  dropTo.value = null;
};

const onKeyDown = (event: KeyboardEvent, index: number): void => {
  const delta =
    event.key === 'ArrowUp' ? -1
    : event.key === 'ArrowDown' ? 1
    : 0;
  if (delta === 0 || event.target !== event.currentTarget) return;
  event.preventDefault();
  // 键值在重排之前取：重排后同一下标指向的是邻居，要聚焦的是被移动的那一项
  const key = visible.value[index];
  reorder(index, index + delta);
  requestAnimationFrame(() => document.getElementById(`prefs-widget-${key}`)?.focus());
};

const onDragStart = (event: DragEvent, key: WidgetKey, index: number): void => {
  // Firefox 没有拖拽数据就不会启动拖放
  event.dataTransfer?.setData('text/plain', key);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  dragFrom.value = index;
};

const onDragOver = (event: DragEvent, index: number): void => {
  if (dragFrom.value === null) return;
  event.preventDefault();
  dropTo.value = index;
};

const onDrop = (event: DragEvent, index: number): void => {
  event.preventDefault();
  if (dragFrom.value !== null && dragFrom.value !== index) reorder(dragFrom.value, index);
  clearDrag();
};
</script>

<template>
  <div data-testid="pref-widgets">
    <p class="admin-row-hint mb-2">{{ t('prefs.widgets.dragHint') }}</p>
    <ul :aria-label="t('prefs.widgets.visible')">
      <li
        v-for="(key, index) in visible"
        :id="`prefs-widget-${key}`"
        :key="key"
        class="admin-widget-row"
        tabindex="0"
        draggable="true"
        :data-testid="`pref-widget-${key}`"
        :data-dragging="dragFrom === index"
        :data-drop-target="dropTo === index && dragFrom !== index"
        @keydown="onKeyDown($event, index)"
        @dragstart="onDragStart($event, key, index)"
        @dragover="onDragOver($event, index)"
        @drop="onDrop($event, index)"
        @dragend="clearDrag"
      >
        <GripVerticalIcon
          :size="16"
          class="admin-widget-handle"
          aria-hidden="true"
        />
        <span class="grow">{{ t(`widget.${key}`) }}</span>
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square"
          :aria-label="`${t('prefs.widgets.hide')}：${t(`widget.${key}`)}`"
          :disabled="PINNED_WIDGETS.includes(key)"
          :title="PINNED_WIDGETS.includes(key) ? t('prefs.widgets.pinned') : undefined"
          :data-testid="`pref-widget-toggle-${key}`"
          @click="toggle(key)"
        >
          <EyeIcon :size="14" />
        </button>
      </li>
    </ul>
    <template v-if="hidden.length > 0">
      <p class="admin-row-hint mt-3 mb-1">{{ t('prefs.widgets.hidden') }}</p>
      <ul :aria-label="t('prefs.widgets.hidden')">
        <li
          v-for="key in hidden"
          :key="key"
          class="admin-widget-row"
          :data-testid="`pref-widget-${key}`"
        >
          <span class="grow line-through opacity-60">{{ t(`widget.${key}`) }}</span>
          <button
            type="button"
            class="btn btn-ghost btn-xs btn-square"
            :aria-label="`${t('prefs.widgets.show')}：${t(`widget.${key}`)}`"
            :data-testid="`pref-widget-toggle-${key}`"
            @click="toggle(key)"
          >
            <EyeOffIcon :size="14" />
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>
