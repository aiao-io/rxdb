<script lang="ts" setup>
import { X } from '@lucide/vue';

/**
 * 树页面的页内写入错误提示（新建、重命名、批量添加、删除、级联删除、删除并提升子节点）。
 *
 * @remarks
 * 与全局 toast 不同：不自动消失、带可键盘操作的关闭按钮，e2e 与读屏都能稳定定位。
 * `message` 为 `null` 时不渲染。
 */
defineProps<{ message: string | null }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <div
    class="alert alert-error"
    v-if="message"
    data-testid="tree-write-error"
    role="alert"
  >
    <span class="flex-1 text-sm">{{ message }}</span>
    <button
      class="btn btn-ghost btn-sm btn-circle"
      aria-label="关闭错误提示"
      @click="$emit('close')"
      type="button"
    >
      <X :size="16" />
    </button>
  </div>
</template>
