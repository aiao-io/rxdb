<script setup lang="ts">
import { getPath, type DrawerRow, type ResolvedControl } from '@aiao/rxdb-admin';
import { ref, watch } from 'vue';
import { useAdminShell } from '../context.js';

/**
 * 数字输入：输入时只改草稿，失焦或回车才提交（夹取由偏好存储负责）；
 * 清空时可空数字写 `null`，不可空或非法输入还原为当前值。
 */
const props = defineProps<{
  /** 设置行。 */
  row: DrawerRow;
  /** 数字控件的范围与单位。 */
  control: Extract<ResolvedControl, { kind: 'number' }>;
}>();

const shell = useAdminShell();
const draftOf = (value: unknown): string => (value === null ? '' : String(value));

const draft = ref(draftOf(props.row.value));

// 偏好变化（含被夹取后的值）时草稿跟随
watch(
  () => props.row.value,
  value => {
    draft.value = draftOf(value);
  }
);

const onInput = (event: Event): void => {
  draft.value = (event.target as HTMLInputElement).value;
};

const commit = (): void => {
  const { value } = props.row;
  if (draft.value.trim() === '') {
    if (props.control.nullable) props.row.set(null);
    else draft.value = String(value);
    return;
  }
  const parsed = Number(draft.value);
  if (!Number.isFinite(parsed)) {
    draft.value = draftOf(value);
    return;
  }
  props.row.set(parsed);
  // 值被清洗（越界夹取）后可能与当前值相同，行的值不变就不会触发草稿同步：回读存储里的最终值
  draft.value = draftOf(getPath(shell.preferences.value, props.row.path));
};
</script>

<template>
  <span class="flex items-center gap-1">
    <input
      :id="`prefs-${row.id}`"
      type="number"
      class="input input-sm w-28"
      :min="control.min"
      :max="control.max"
      :step="control.step"
      :value="draft"
      :disabled="!row.enabled"
      :data-testid="`pref-${row.path}`"
      @input="onInput"
      @blur="commit"
      @keydown.enter="commit"
    />
    <span
      v-if="control.unit"
      class="text-xs opacity-60"
      >{{ control.unit }}</span
    >
  </span>
</template>
