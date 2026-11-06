<script setup lang="ts">
import type { DrawerRow, PreferencePreview, ResolvedOption } from '@aiao/rxdb-admin';

/**
 * 卡片单选：每张卡片带一个示意预览；设置行被禁用时点击无效。
 */
const props = defineProps<{
  /** 设置行。 */
  row: DrawerRow;
  /** 选项。 */
  options: readonly ResolvedOption[];
  /** 预览种类，决定示意图的形态。 */
  preview: PreferencePreview;
}>();

const select = (value: string): void => {
  if (props.row.enabled) props.row.set(value);
};
</script>

<template>
  <div
    class="admin-cards"
    role="group"
    :aria-label="row.label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="admin-card"
      :aria-pressed="row.value === option.value"
      :aria-disabled="!row.enabled"
      :data-testid="`pref-${row.path}-${option.value}`"
      @click="select(option.value)"
      ><span
        class="admin-preview"
        :data-kind="preview"
        :data-value="option.value"
        aria-hidden="true"
        ><i /><i /><i /></span
      >{{ option.label }}</button
    >
  </div>
</template>
