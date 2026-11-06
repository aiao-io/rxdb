<script setup lang="ts">
import type { DrawerRow } from '@aiao/rxdb-admin';
import { computed, ref, watch } from 'vue';

/**
 * 文本输入：输入时只改草稿，失焦（有改动时）或回车才提交。
 */
const props = withDefaults(
  defineProps<{
    /** 设置行。 */
    row: DrawerRow;
    /** 占位文本。 */
    placeholder?: string;
  }>(),
  { placeholder: undefined }
);

const value = computed(() => String(props.row.value ?? ''));
const draft = ref(value.value);

watch(value, current => {
  draft.value = current;
});

const onInput = (event: Event): void => {
  draft.value = (event.target as HTMLInputElement).value;
};

const onBlur = (): void => {
  if (draft.value !== value.value) props.row.set(draft.value);
};
</script>

<template>
  <input
    :id="`prefs-${row.id}`"
    type="text"
    class="input input-sm w-56"
    :value="draft"
    :placeholder="placeholder"
    :disabled="!row.enabled"
    :data-testid="`pref-${row.path}`"
    @input="onInput"
    @blur="onBlur"
    @keydown.enter="row.set(draft)"
  />
</template>
