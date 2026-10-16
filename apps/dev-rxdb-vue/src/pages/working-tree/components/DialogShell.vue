<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { restoreFocus, trapTabKey } from '../utils/focus-trap';

/**
 * 模态对话框外壳：合并、对比与只读检出位查看器共用（GitHub Desktop 对话框形态：白面板圆角描边、半透明背板）。
 *
 * @remarks
 * 背板与面板是**兄弟**节点。背板是 `role="button"`（点它关闭），而按钮的子孙不许可聚焦——
 * 背板包着面板就是 axe 的 `nested-interactive` 违规。打开时焦点移进面板，面板里任意处按 Escape 关闭。
 *
 * 面板是焦点陷阱：Tab / Shift+Tab 在面板里首尾回绕，键盘走不到背板与页面上（见 `trapTabKey`）。
 * 关闭时焦点还给打开前持有它的元素，但只在它还在文档里时还：合并、对比与只读检出位查看器都从会关掉的
 * 菜单打开，对话框关闭时那个菜单项早已不在，焦点就留给浏览器（见 `restoreFocus`）。
 */
withDefaults(
  defineProps<{
    /** 面板的 `data-testid` */
    testId: string;
    /** 标题元素的 id：对话框的可读名 */
    labelledBy: string;
    /** 面板宽度：`wide` 给放得下实体表格的只读检出位查看器 */
    size?: 'default' | 'wide';
  }>(),
  { size: 'default' }
);

const emit = defineEmits<{
  (e: 'closeRequested'): void;
}>();

const panel = ref<HTMLElement | null>(null);
/** 打开前持有焦点的元素：挂载后、焦点移进面板之前记下，关闭时还给它 */
let opener: Element | null = null;

onMounted(() => {
  opener = document.activeElement;
  panel.value?.focus();
});
onUnmounted(() => restoreFocus(opener));

/** 面板里的 Tab / Shift+Tab 首尾回绕 */
const trapTab = (event: KeyboardEvent): void => trapTabKey(event.currentTarget as HTMLElement, event);
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-3">
    <div
      class="absolute inset-0 bg-black/50"
      @click="emit('closeRequested')"
      @keydown.enter="emit('closeRequested')"
      @keydown.escape="emit('closeRequested')"
      aria-label="Close dialog"
      role="button"
      tabindex="0"
    ></div>
    <div
      class="relative max-h-[90dvh] w-full overflow-y-auto rounded-md border border-[var(--gd-border)] p-5 shadow-2xl outline-none"
      :class="size === 'wide' ? 'max-w-5xl' : 'max-w-lg'"
      ref="panel"
      :style="{ background: 'var(--gd-panel)' }"
      @keydown="trapTab"
      @keydown.escape="emit('closeRequested')"
      :aria-labelledby="labelledBy"
      aria-modal="true"
      :data-testid="testId"
      role="dialog"
      tabindex="-1"
    >
      <slot />
    </div>
  </div>
</template>
