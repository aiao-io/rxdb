<script lang="ts" setup>
import { useI18n } from '@aiao/rxdb-i18n-vue';
import {
  getInputType,
  type FieldMetadata,
  type QueryBuilderController,
  type QueryBuilderRule
} from '@aiao/rxdb-model/headless';
import { computed } from 'vue';
import { defaultRuleValue, operatorLabel, operatorsFor, ruleValueFromText } from './article-model';

/** 绑定的 `t` 会读取语言与目录修订，切换语言时模板里的操作符文案随之重新渲染。 */
const i18n = useI18n();
const { t } = i18n;

const props = defineProps<{
  rule: QueryBuilderRule;
  controller: QueryBuilderController;
  fields: readonly FieldMetadata[];
}>();

const field = computed(() => props.fields.find(item => item.name === props.rule.field));
const operators = computed(() => operatorsFor(field.value));
const inputType = computed(() => getInputType(field.value?.type ?? 'string', props.rule.operator, field.value?.enum));
const valueText = computed(() => String(props.rule.value ?? ''));

const changeField = (name: string): void => {
  const next = props.fields.find(item => item.name === name);
  const operator = operatorsFor(next)[0]?.key ?? '=';
  props.controller.updateRule(props.rule.id, { field: name, operator, value: defaultRuleValue(next, operator) });
};

const changeOperator = (operator: string): void =>
  props.controller.updateRule(props.rule.id, { operator, value: defaultRuleValue(field.value, operator) });
</script>

<template>
  <div
    class="hl-rule"
    data-testid="qb-rule"
  >
    <select
      :aria-label="t('page.headless.field')"
      :value="rule.field"
      @change="changeField(($event.target as HTMLSelectElement).value)"
    >
      <option value="">{{ t('page.headless.selectField') }}</option>
      <option
        v-for="item in fields"
        :key="item.name"
        :value="item.name"
        >{{ item.displayName }}</option
      >
    </select>
    <select
      :aria-label="t('page.headless.operator')"
      :value="rule.operator"
      @change="changeOperator(($event.target as HTMLSelectElement).value)"
    >
      <option
        v-for="operator in operators"
        :key="operator.key"
        :value="operator.key"
        >{{ operatorLabel(operator, i18n) }}</option
      >
    </select>
    <select
      v-if="inputType === 'enum'"
      :aria-label="t('page.headless.value')"
      :value="valueText"
      @change="controller.updateRule(rule.id, { value: ($event.target as HTMLSelectElement).value })"
    >
      <option value="">{{ t('page.headless.pleaseSelect') }}</option>
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
      :aria-label="t('page.headless.value')"
      :inputmode="inputType === 'number' ? 'numeric' : undefined"
      :value="valueText"
      @input="
        controller.updateRule(rule.id, {
          value: ruleValueFromText(inputType, ($event.target as HTMLInputElement).value)
        })
      "
    />
    <button
      type="button"
      :aria-label="t('page.headless.deleteRule')"
      @click="controller.remove(rule.id)"
      >{{ t('common.delete') }}</button
    >
  </div>
</template>
