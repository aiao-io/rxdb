<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide } from 'vue';
import { ADMIN_SHELL_KEY } from './context.js';
import type { AdminShellProviderProps } from './types.js';

/**
 * 为子树提供外壳，并在挂载期间把外壳绑定到浏览器（快捷键、主题、布局变量、标题）。
 * 为避免首屏闪烁，建议在首次渲染之前就调用 `shell.attach()`；`attach` 幂等。
 * 外壳在组件生命周期内保持不变：需要替换时给 Provider 加 `key` 让子树整体重建。
 */
const props = defineProps<AdminShellProviderProps>();

defineSlots<{
  /** 子树。 */
  default?(): unknown;
}>();

provide(ADMIN_SHELL_KEY, props.shell);

let detach: (() => void) | undefined;

onMounted(() => {
  detach = props.shell.attach();
});

onBeforeUnmount(() => detach?.());
</script>

<template>
  <slot />
</template>
