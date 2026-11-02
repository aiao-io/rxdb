<script lang="ts" setup>
import { useI18n, useI18nRuntime } from '@aiao/rxdb-i18n-vue';
import {
  getInputType,
  type FieldMetadata,
  type OperatorDefinition,
  type QueryBuilderController,
  type QueryBuilderRule
} from '@aiao/rxdb-model/headless';
import { computed } from 'vue';
import { operatorLabel } from './article-model';
import { operatorsFor } from './query-operators';

const i18n = useI18nRuntime();
const { locale } = useI18n();
/** 读取 `locale` 让切换语言时模板重新渲染，再按运行时翻译操作符。 */
const operatorText = (operator: OperatorDefinition): string => {
  void locale.value;
  return operatorLabel(operator, i18n);
};

const props = defineProps<{
  rule: QueryBuilderRule;
  controller: QueryBuilderController;
  fields: readonly FieldMetadata[];
}>();

const field = computed(() => props.fields.find(item => item.name === props.rule.field));
const operators = computed(() => operatorsFor(field.value));
const inputType = computed(() => getInputType(field.value?.type ?? 'string', props.rule.operator, field.value?.enum));
const valueText = computed(() =>
  props.rule.value === null || props.rule.value === undefined ? '' : String(props.rule.value)
);

/** 把输入框文本还原成规则值：数值字段转 number，空文本为 null。 */
const coerceValue = (raw: string): unknown => {
  if (inputType.value !== 'number') return raw;
  return raw.trim() === '' ? null : Number(raw);
};

const changeField = (name: string): void => {
  const next = props.fields.find(item => item.name === name);
  const [first] = operatorsFor(next);
  props.controller.updateRule(props.rule.id, { field: name, operator: first?.key ?? '=', value: '' });
};
</script>

<template>
  <div
    class="hl-rule"
    data-testid="qb-rule"
  >
    <select
      aria-label="字段"
      :value="rule.field"
      @change="changeField(($event.target as HTMLSelectElement).value)"
    >
      <option value="">选择字段</option>
      <option
        v-for="item in fields"
        :key="item.name"
        :value="item.name"
        >{{ item.displayName }}</option
      >
    </select>
    <select
      aria-label="操作符"
      :value="rule.operator"
      @change="controller.updateRule(rule.id, { operator: ($event.target as HTMLSelectElement).value, value: '' })"
    >
      <option
        v-for="operator in operators"
        :key="operator.key"
        :value="operator.key"
        >{{ operatorText(operator) }}</option
      >
    </select>
    <select
      v-if="inputType === 'enum'"
      aria-label="值"
      :value="String(rule.value ?? '')"
      @change="controller.updateRule(rule.id, { value: ($event.target as HTMLSelectElement).value })"
    >
      <option value="">请选择</option>
      <option
        v-for="option in field?.enum ?? []"
        :key="String(option)"
        :value="String(option)"
      >
        {{ String(option) }}
      </option>
    </select>
    <input
      v-else-if="inputType !== 'none'"
      aria-label="值"
      :inputmode="inputType === 'number' ? 'numeric' : undefined"
      :value="valueText"
      @input="controller.updateRule(rule.id, { value: coerceValue(($event.target as HTMLInputElement).value) })"
    />
    <button
      type="button"
      aria-label="删除规则"
      @click="controller.remove(rule.id)"
      >删除</button
    >
  </div>
</template>
