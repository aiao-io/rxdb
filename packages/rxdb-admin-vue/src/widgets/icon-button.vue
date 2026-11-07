<script setup lang="ts">
/**
 * 顶栏的图标按钮：名称同时作为 `aria-label` 与 `title`。`aria-pressed`、点击等其余属性与事件落在 `<button>` 上。
 */
defineProps<{
  /** 可访问名称。 */
  label: string;
  /** `data-testid`。 */
  testId: string;
}>();

defineSlots<{
  /** 图标。 */
  default?(): unknown;
}>();
</script>

<template>
  <button
    type="button"
    class="btn btn-ghost btn-sm btn-square"
    :aria-label="label"
    :title="label"
    :data-testid="testId"
  >
    <slot />
  </button>
</template>
