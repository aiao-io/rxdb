<script setup lang="ts">
/**
 * BOM 发生项编辑器（对齐 Angular `ao-bom-line-editor`、React `BomLineEditor`）。
 *
 * 编辑共享状态中当前发生项的用量、组件损耗、投料工序与生效期，保存经 `commands.saveOccurrence`
 * 沿用领域仓储，组件不发出事件。生效期按 UTC 填写与显示（`datetime-local` 不带时区），说明经
 * `aria-describedby` 关联到日期字段；保存失败与共享字段校验失败原样展示，切换发生项时重置表单。
 */
import {
  BOM_VIEW_STYLES,
  BOM_EDITOR_INPUTS,
  bomEditorFields,
  bomErrorText,
  parseBomEditorFields
} from '@aiao/rxdb-plugin-bom';
import type { BomEditorFields, BomViewCommands, BomViewState } from '@aiao/rxdb-plugin-bom';
import { computed, reactive, shallowRef, useId, watch } from 'vue';

const props = defineProps<{
  /** 共享控制器发布的视图状态（`useBomView` 的 `state.value`）。 */
  state: BomViewState;
  /** 共享控制器命令，原样透传。 */
  commands: BomViewCommands;
}>();
const utcHintId = useId();
const fields = reactive(bomEditorFields(null));
const localError = shallowRef<unknown>(null);
const disabled = computed(() => !props.state.editor.value?.editable || props.state.editor.saving);
const inputs = BOM_EDITOR_INPUTS;

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
    <form
      v-if="state.editor.value"
      @submit.prevent="save"
    >
      <h3>BOM 行编辑</h3>
      <p :id="utcHintId">生效期按 UTC 填写与显示</p>
      <label
        v-for="control in inputs"
        :key="control.field"
        >{{ control.label }}
        <input
          :aria-describedby="control.type === 'datetime-local' ? utcHintId : undefined"
          :value="fields[control.field]"
          :name="control.field"
          :type="control.type"
          :step="control.type === 'datetime-local' ? '0.001' : undefined"
          :disabled="disabled"
          @input="setField(control.field, $event)"
        />
      </label>
      <p
        v-if="state.editor.value.readOnlyReason !== null"
        role="note"
        >{{ state.editor.value.readOnlyReason }}</p
      >
      <p
        v-if="state.editor.saving"
        role="status"
        >正在保存发生项…</p
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
