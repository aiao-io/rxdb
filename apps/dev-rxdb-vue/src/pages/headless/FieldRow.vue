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
    props.state.error !== undefined &&
    (props.inputs.state.attempted || props.inputs.state.touched.has(config.value.field))
);
const textValue = computed(() => props.inputs.state.raw[config.value.field] ?? props.state.displayValue);
const inputMode = computed(() => (NUMERIC_TYPES.has(config.value.type) ? 'numeric' : undefined));

const onInput = (value: unknown): void => props.inputs.input(config.value.field, value);
</script>

<template>
  <div class="hl-field">
    <label :for="id">{{ config.displayName }}</label>
    <input
      v-if="config.type === 'boolean'"
      :id="id"
      :name="config.field"
      type="checkbox"
      :checked="state.value === true"
      :disabled="state.readonly"
      :aria-invalid="showError || undefined"
      :aria-describedby="showError ? errorId : undefined"
      :aria-required="config.required || undefined"
      @change="onInput(($event.target as HTMLInputElement).checked)"
    />
    <select
      v-else-if="config.type === 'enum'"
      :id="id"
      :name="config.field"
      :value="String(state.value ?? '')"
      :disabled="state.readonly"
      :aria-invalid="showError || undefined"
      :aria-describedby="showError ? errorId : undefined"
      :aria-required="config.required || undefined"
      @change="onInput(($event.target as HTMLSelectElement).value)"
    >
      <option value="">请选择</option>
      <option v-for="value in config.enumValues ?? []" :key="value" :value="value">
        {{ config.options?.[value]?.label ?? value }}
      </option>
    </select>
    <input
      v-else
      :id="id"
      :name="config.field"
      type="text"
      :inputmode="inputMode"
      :value="textValue"
      :disabled="state.readonly"
      :aria-invalid="showError || undefined"
      :aria-describedby="showError ? errorId : undefined"
      :aria-required="config.required || undefined"
      @input="onInput(($event.target as HTMLInputElement).value)"
    />
    <p v-if="showError" :id="errorId" class="hl-error" role="alert" :data-testid="`error-${config.field}`">
      {{ state.error?.message }}
    </p>
  </div>
</template>
