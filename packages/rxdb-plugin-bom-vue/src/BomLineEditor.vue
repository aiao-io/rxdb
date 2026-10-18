<script setup lang="ts">
import { BOM_VIEW_STYLES, bomEditorFields, bomErrorText, parseBomEditorFields } from '@aiao/rxdb-plugin-bom';
import type { BomEditorFields, BomViewCommands, BomViewState } from '@aiao/rxdb-plugin-bom';
import { computed, reactive, shallowRef, watch } from 'vue';

const props = defineProps<{ state: BomViewState; commands: BomViewCommands }>();
const fields = reactive(bomEditorFields(null));
const localError = shallowRef<unknown>(null);
const disabled = computed(() => !props.state.editor.value?.editable || props.state.editor.saving);
const inputs: readonly { field: keyof BomEditorFields; label: string; type: string }[] = [
  { field: 'qty', label: '用量', type: 'text' },
  { field: 'componentScrap', label: '组件损耗', type: 'text' },
  { field: 'operationSeq', label: '投料工序', type: 'number' },
  { field: 'effectiveFrom', label: '生效起点', type: 'datetime-local' },
  { field: 'effectiveTo', label: '生效终点', type: 'datetime-local' }
];

const setField = (field: keyof BomEditorFields, event: Event): void => {
  fields[field] = (event.target as HTMLInputElement).value;
};

watch(
  () => props.state.editor.value,
  value => {
    Object.assign(fields, bomEditorFields(value));
    localError.value = null;
  },
  { immediate: true }
);

const save = async (): Promise<void> => {
  if (disabled.value) return;
  localError.value = null;
  try {
    await props.commands.saveOccurrence(parseBomEditorFields(fields));
  } catch (error) {
    localError.value = error;
  }
};
</script>

<template>
  <section
    class="bom-view bom-line-editor"
    aria-label="BOM 行编辑器"
    :aria-busy="state.editor.saving || state.editor.phase === 'loading'"
  >
    <component :is="'style'">{{ BOM_VIEW_STYLES }}</component>
    <p
      v-if="!state.editor.value"
      role="status"
      >{{ state.editor.phase === 'loading' ? '正在加载发生项…' : '请选择一条 BOM 行进行编辑' }}</p
    >
    <p
      v-if="state.editor.saving"
      role="status"
      >正在保存发生项…</p
    >
    <form
      v-if="state.editor.value"
      @submit.prevent="save"
    >
      <h3>BOM 行编辑</h3>
      <label
        v-for="control in inputs"
        :key="control.field"
        >{{ control.label }}
        <input
          :value="fields[control.field]"
          :name="control.field"
          :type="control.type"
          :step="control.type === 'datetime-local' ? '0.001' : undefined"
          :disabled="disabled"
          @input="setField(control.field, $event)"
        />
      </label>
      <p
        v-if="state.editor.value.readOnlyReason"
        role="note"
        >{{ state.editor.value.readOnlyReason }}</p
      >
      <button
        type="submit"
        :disabled="disabled"
        >{{ state.editor.saving ? '保存中…' : '保存' }}</button
      >
    </form>
    <p
      v-if="state.editor.error !== null || localError !== null"
      role="alert"
      >{{ bomErrorText(localError ?? state.editor.error) }}</p
    >
  </section>
</template>
