<script lang="ts" setup>
/**
 * 对话框外壳组件（内置 DialogPortal 内使用）。
 *
 * 对齐 Angular 侧 `EntityDialogComponent`（CDK Dialog 语境）的行为：
 * - 对话框语境（注入了 {@link ENTITY_DIALOG_CONTEXT}）渲染标题栏（标题拖拽 + 全屏切换 + 关闭）
 *   与 8 向缩放把手；裸用（无对话框语境）只投影内容；
 * - 全屏切换写入面板（`.rxdb-dialog-pane`）内联样式，可还原；
 * - 边缘拖拽缩放与标题拖拽走真实 mousedown / mousemove / mouseup 事件链，最小宽高 400 / 300。
 */
import { inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { ENTITY_DIALOG_CONTEXT } from './dialog-context';

const props = defineProps<{
  /** 标题栏文案 */
  title: string;
}>();

const emit = defineEmits<{
  /** 请求关闭（点关闭按钮或程序化 close） */
  closeRequested: [];
}>();

const dialogContext = inject(ENTITY_DIALOG_CONTEXT, undefined);
/** 是否处于对话框语境（等价 Angular 的 `!!inject(DialogRef, { optional: true })`） */
const isInDialog = !!dialogContext;

const rootEl = ref<HTMLElement | null>(null);
const isFullscreen = ref(false);

let pane: HTMLElement | null = null;
let resizing = false;
let savedPaneState: { left: string; top: string; width: string; height: string } | null = null;

/** 拖拽（标题栏把手）活动句柄，卸载时收尾。 */
let dragCleanup: (() => void) | null = null;

const findPane = (): HTMLElement | null => rootEl.value?.closest<HTMLElement>('.rxdb-dialog-pane') ?? null;

/** 关闭：先请求宿主（closeRequested），再关对话框语境。 */
const close = (): void => {
  emit('closeRequested');
  dialogContext?.close();
};

/** 全屏切换：保存面板尺寸状态，写入 100vw / 100vh 内联样式，可逆。 */
const toggleFullscreen = (): void => {
  const wasFullscreen = isFullscreen.value;
  isFullscreen.value = !wasFullscreen;
  const fullscreen = !wasFullscreen;
  // 与 Angular 同语义：pane 由 rAF 的 initFixedPane 缓存，未初始化时只切换状态
  const currentPane = pane;
  if (!currentPane) return;

  if (fullscreen) {
    savedPaneState = {
      left: currentPane.style.left,
      top: currentPane.style.top,
      width: currentPane.style.width,
      height: currentPane.style.height
    };
    currentPane.style.left = '0';
    currentPane.style.top = '0';
    currentPane.style.width = '100vw';
    currentPane.style.height = '100vh';
  } else {
    if (savedPaneState) {
      currentPane.style.left = savedPaneState.left;
      currentPane.style.top = savedPaneState.top;
      currentPane.style.width = savedPaneState.width;
      currentPane.style.height = savedPaneState.height;
      savedPaneState = null;
    }
  }
};

/** 边缘缩放：mousedown 起始，document 级 mousemove / mouseup 收尾。 */
const startResize = (e: MouseEvent, dir: string): void => {
  const currentPane = pane;
  if (!currentPane || resizing || isFullscreen.value) return;
  e.preventDefault();
  e.stopPropagation();
  resizing = true;
  const startX = e.clientX;
  const startY = e.clientY;
  const startW = currentPane.offsetWidth;
  const startH = currentPane.offsetHeight;
  const startL = parseFloat(currentPane.style.left) || 0;
  const startT = parseFloat(currentPane.style.top) || 0;
  const minW = 400;
  const minH = 300;

  const onMove = (ev: MouseEvent): void => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (dir.includes('e')) currentPane.style.width = Math.max(minW, startW + dx) + 'px';
    if (dir.includes('w')) {
      const w = Math.max(minW, startW - dx);
      currentPane.style.width = w + 'px';
      currentPane.style.left = startL + startW - w + 'px';
    }
    if (dir.includes('s')) currentPane.style.height = Math.max(minH, startH + dy) + 'px';
    if (dir.includes('n')) {
      const h = Math.max(minH, startH - dy);
      currentPane.style.height = h + 'px';
      currentPane.style.top = startT + startH - h + 'px';
    }
  };
  const onUp = (): void => {
    resizing = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
};

/** 标题栏拖拽：移动整个面板（等价 CDK `CdkDrag` + `cdkDragHandle`）。 */
const startDrag = (e: MouseEvent): void => {
  if (!isInDialog || isFullscreen.value) return;
  const currentPane = pane;
  if (!currentPane) return;
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const startL = parseFloat(currentPane.style.left) || 0;
  const startT = parseFloat(currentPane.style.top) || 0;

  const onMove = (ev: MouseEvent): void => {
    currentPane.style.left = startL + ev.clientX - startX + 'px';
    currentPane.style.top = startT + ev.clientY - startY + 'px';
  };
  const onUp = (): void => {
    dragCleanup = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  dragCleanup = onUp;
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
};

/** 固定 pane：把面板钉在当前布局位置（等价 Angular 的 #initFixedPane）。 */
const initFixedPane = (): void => {
  const currentPane = findPane();
  if (!currentPane) return;
  pane = currentPane;
  const rect = currentPane.getBoundingClientRect();
  currentPane.style.position = 'fixed';
  currentPane.style.left = rect.left + 'px';
  currentPane.style.top = rect.top + 'px';
  currentPane.style.margin = '0';
  currentPane.style.maxWidth = 'none';
  currentPane.style.maxHeight = 'none';
};

onMounted(() => {
  if (!isInDialog) return;
  requestAnimationFrame(() => initFixedPane());
});

onBeforeUnmount(() => {
  dragCleanup?.();
});

defineExpose({
  isInDialog,
  isFullscreen,
  toggleFullscreen,
  startResize,
  startDrag,
  close
});
</script>

<template>
  <div
    class="rxdb-entity-dialog"
    ref="rootEl"
  >
    <!-- Resize handles -->
    <template v-if="isInDialog">
      <div
        class="resize-handle resize-n"
        @mousedown="startResize($event, 'n')"
      />
      <div
        class="resize-handle resize-s"
        @mousedown="startResize($event, 's')"
      />
      <div
        class="resize-handle resize-e"
        @mousedown="startResize($event, 'e')"
      />
      <div
        class="resize-handle resize-w"
        @mousedown="startResize($event, 'w')"
      />
      <div
        class="resize-handle resize-ne"
        @mousedown="startResize($event, 'ne')"
      />
      <div
        class="resize-handle resize-nw"
        @mousedown="startResize($event, 'nw')"
      />
      <div
        class="resize-handle resize-se"
        @mousedown="startResize($event, 'se')"
      />
      <div
        class="resize-handle resize-sw"
        @mousedown="startResize($event, 'sw')"
      />
    </template>

    <!-- Dialog Title Bar (drag handle + fullscreen toggle + close) -->
    <div
      class="border-base-300 flex shrink-0 items-center justify-between border-b px-4 py-2"
      v-if="isInDialog"
    >
      <span
        class="flex-1 cursor-grab text-base font-semibold select-none active:cursor-grabbing"
        @mousedown="startDrag"
      >
        {{ title }}
      </span>
      <div class="flex items-center gap-1">
        <!-- Fullscreen Toggle -->
        <button
          class="btn btn-ghost btn-xs btn-square"
          :aria-label="isFullscreen ? '退出全屏' : '全屏'"
          @click="toggleFullscreen"
          type="button"
        >
          <svg
            class="h-4 w-4"
            v-if="isFullscreen"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
          </svg>
          <svg
            class="h-4 w-4"
            v-else
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
        <!-- Close -->
        <button
          class="btn btn-ghost btn-xs btn-square"
          @click="close"
          aria-label="关闭"
          type="button"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Projected content -->
    <slot />
  </div>
</template>

<style scoped>
.rxdb-entity-dialog {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background-color: var(--color-base-100);
  border-radius: var(--radius-md);
}

.resize-handle {
  position: absolute;
  z-index: 100;
}

.resize-n {
  top: -4px;
  left: 8px;
  right: 8px;
  height: 8px;
  cursor: n-resize;
}

.resize-s {
  bottom: -4px;
  left: 8px;
  right: 8px;
  height: 8px;
  cursor: s-resize;
}

.resize-e {
  top: 8px;
  bottom: 8px;
  right: -4px;
  width: 8px;
  cursor: e-resize;
}

.resize-w {
  top: 8px;
  bottom: 8px;
  left: -4px;
  width: 8px;
  cursor: w-resize;
}

.resize-ne {
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  cursor: ne-resize;
}

.resize-nw {
  top: -4px;
  left: -4px;
  width: 16px;
  height: 16px;
  cursor: nw-resize;
}

.resize-se {
  bottom: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  cursor: se-resize;
}

.resize-sw {
  bottom: -4px;
  left: -4px;
  width: 16px;
  height: 16px;
  cursor: sw-resize;
}
</style>
