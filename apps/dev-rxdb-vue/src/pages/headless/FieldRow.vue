<script lang="ts" setup>
import type { EntityFormFieldSnapshot } from '@aiao/rxdb-model/headless';
import { computed } from 'vue';
import { fieldId, type FieldInputs } from './field-inputs';

/** 数值字段用文本框承载，才能保留无法解析的原始输入并展示解析错误。 */
const NUMERIC_TYPES = new Set(['integer', 'number']);

const props = defineProps<{ idPrefix: string; state: EntityFormFieldSnapshot; inputs: FieldInputs }>();

const config = computed(() => props.state.config);
const id = computed(() => fieldId(props.idPrefix, config.value.field));
const errorId = computed(() => `${id.value}-error`);
const showError = computed(
  () =>
    props.state.error !== undefined && (props.inputs.state.attempted || config.value.field in props.inputs.state.raw)
);
const textValue = computed(() => props.inputs.state.raw[config.value.field] ?? props.state.displayValue);
const inputMode = computed(() => (NUMERIC_TYPES.has(config.value.type) ? 'numeric' : undefined));
/** 两种控件共用的标签关联、错误关联与只读状态绑定。 */
const common = computed(() => ({
  id: id.value,
  name: config.value.field,
  disabled: props.state.readonly,
  'aria-invalid': showError.value || undefined,
  'aria-describedby': showError.value ? errorId.value : undefined,
  'aria-required': config.value.required || undefined
}));

const onInput = (value: string): void => props.inputs.input(config.value.field, value);
</script>

<template>
  <div class="hl-field">
    <label :for="id">{{ config.displayName }}</label>
    <select
      v-if="config.type === 'enum'"
      v-bind="common"
      :value="String(state.value ?? '')"
      @change="onInput(($event.target as HTMLSelectElement).value)"
    >
      <option value="">请选择</option>
      <option
        v-for="value in config.enumValues ?? []"
        :key="value"
        :value="value"
      >
        {{ config.options?.[value]?.label ?? value }}
      </option>
    </select>
    <input
      v-else
      v-bind="common"
      type="text"
      :inputmode="inputMode"
      :value="textValue"
      @input="onInput(($event.target as HTMLInputElement).value)"
    />
    <p
      v-if="showError"
      :id="errorId"
      class="hl-error"
      role="alert"
      :data-testid="`error-${config.field}`"
    >
      {{ state.error?.message }}
    </p>
  </div>
</template>
