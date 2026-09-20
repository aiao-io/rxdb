<script lang="ts" setup>
/**
 * 对话框浮层宿主（`@angular/cdk/dialog` 的包内替代）。
 *
 * 行为对齐 Angular 侧的 CDK Dialog 用法：
 * - Teleport 到 body 顶层渲染，`role="dialog"` + `aria-modal="true"`；
 * - Escape 关闭**最上层**打开的对话框（模块级栈，等价 CDK 的 OverlayKeyboardDispatcher）；
 * - 点击背景（面板外）关闭；面板内点击不关闭；
 * - 面板定位：按 width / height 在视口居中，随后由 EntityDialog 的固定 pane 初始化接管。
 *
 * 关闭时 emit `closed` 事件，携带关闭结果（如 `'saved'`）。
 */
import { onBeforeUnmount, onMounted, provide, ref, type CSSProperties } from 'vue';
import { ENTITY_DIALOG_CONTEXT, type EntityDialogContext } from './dialog-context';

const props = withDefaults(
  defineProps<{
    /** 面板宽度（任意 CSS 长度，如 `'720px'`） */
    width?: string;
    /** 面板最小宽度 */
    minWidth?: string;
    /** 面板高度（任意 CSS 长度，如 `'80vh'`） */
    height?: string;
    /** 面板最小高度 */
    minHeight?: string;
    /** 面板附加 class（对齐 CDK Dialog 的 `panelClass`） */
    panelClass?: string;
  }>(),
  { width: '', minWidth: '', height: '', minHeight: '', panelClass: '' }
);

const emit = defineEmits<{
  /** 对话框关闭；携带关闭结果（如 `'saved'`） */
  closed: [result?: unknown];
}>();

/** 打开中的对话框关闭函数栈；Escape 只关最上层（CDK OverlayKeyboardDispatcher 语义）。 */
const dialogStack: Array<() => void> = [];
let escapeBound = false;
const ensureGlobalEscapeListener = (): void => {
  if (escapeBound || typeof document === 'undefined') return;
  escapeBound = true;
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') dialogStack.at(-1)?.();
  });
};

const close = (result?: unknown): void => {
  emit('closed', result);
};
provide(ENTITY_DIALOG_CONTEXT, { close } satisfies EntityDialogContext);

const paneStyle = ref<CSSProperties>({
  position: 'fixed',
  left: '0px',
  top: '0px',
  width: props.width,
  minWidth: props.minWidth,
  height: props.height,
  minHeight: props.minHeight
});

/** 将面板置于视口居中（CDK Dialog 默认全局居中策略）。 */
const positionPane = (): void => {
  const innerWidth = window.innerWidth;
  const innerHeight = window.innerHeight;
  const px = (value: string): number => (value.endsWith('px') ? parseFloat(value) : 0);
  const vh = (value: string): number => (value.endsWith('vh') ? (parseFloat(value) / 100) * innerHeight : 0);
  const widthPx = px(props.width) || 0;
  const heightPx = vh(props.height) || px(props.height) || 0;
  paneStyle.value = {
    ...paneStyle.value,
    left: widthPx > 0 ? `${Math.max(0, (innerWidth - widthPx) / 2)}px` : '0px',
    top: heightPx > 0 ? `${Math.max(0, (innerHeight - heightPx) / 2)}px` : '0px'
  };
};

let stackEntry: (() => void) | undefined;

onMounted(() => {
  stackEntry = close;
  dialogStack.push(stackEntry);
  ensureGlobalEscapeListener();
  requestAnimationFrame(() => positionPane());
});

onBeforeUnmount(() => {
  if (stackEntry) {
    const index = dialogStack.indexOf(stackEntry);
    if (index >= 0) dialogStack.splice(index, 1);
    stackEntry = undefined;
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      class="rxdb-dialog-overlay"
      @click.self="close()"
    >
      <div
        class="rxdb-dialog-pane"
        :class="panelClass"
        :style="paneStyle"
        aria-modal="true"
        role="dialog"
      >
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.rxdb-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgb(0 0 0 / 32%);
}

.rxdb-dialog-pane {
  display: flex;
  flex-direction: column;
}
</style>
