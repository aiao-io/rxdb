<script lang="ts" setup>
/**
 * 单条查询规则组件（对齐 Angular 侧 `QueryRuleComponent`）。
 *
 * 显示一条查询规则的编辑界面：字段选择器、操作符选择器、值输入、删除按钮；
 * exists / notExists 操作符带「+ 子条件」展开面板；主题插槽经
 * {@link QUERY_BUILDER_THEME} 注入（回退 {@link DEFAULT_QUERY_BUILDER_THEME}）。
 */
import type { FieldMetadata, QueryBuilderRuleGroup, UIRule, ValidationError } from '@aiao/rxdb-model';
import { computed, inject, ref, watch } from 'vue';
import { DEFAULT_QUERY_BUILDER_THEME } from '../theme/default-query-builder-theme';
import { QUERY_BUILDER_THEME } from '../theme/query-builder-theme';

/** 带 where 子查询的规则类型 */
type UIRuleWithWhere = UIRule & {
  where?: QueryBuilderRuleGroup<Record<string, unknown>>;
};

const props = withDefaults(
  defineProps<{
    /** 本规则 */
    rule: UIRuleWithWhere;
    /** 可用字段 */
    fields: FieldMetadata[];
    /** 校验错误 */
    errors?: ValidationError[];
  }>(),
  { errors: () => [] }
);

const emit = defineEmits<{
  /** 规则更新 */
  update: [event: { id: string; updates: Partial<UIRuleWithWhere> }];
  /** 删除规则 */
  remove: [];
}>();

const existsOperators = new Set(['exists', 'notExists']);
const noValueOperators = new Set(['null', 'notNull']);

/** 注入的主题（回退到默认主题） */
const theme = inject(QUERY_BUILDER_THEME, undefined) ?? DEFAULT_QUERY_BUILDER_THEME;

const fieldAsString = computed(() => props.rule.field);

/** 本字段的错误（按消息去重） */
const ruleErrors = computed(() => {
  const seen = new Set<string>();
  return props.errors.filter(e => {
    if (e.field !== props.rule.field) return false;
    if (seen.has(e.message)) return false;
    seen.add(e.message);
    return true;
  });
});

const errorTooltip = computed(() => ruleErrors.value.map(e => e.message).join(' | '));

const isExistsOperator = computed(() => existsOperators.has(props.rule.operator));
const isNoValueOperator = computed(() => noValueOperators.has(props.rule.operator));

/** 子查询面板是否展开（已有 where 规则时自动展开） */
const showSubquery = ref(false);

const subqueryVisible = computed(() => {
  const where = props.rule.where;
  if (where && where.rules && where.rules.length > 0) {
    return true;
  }
  return showSubquery.value;
});

const currentField = computed(() => {
  const fieldName = props.rule.field;
  return props.fields.find(f => f.name === fieldName);
});

const currentFieldType = computed(() => currentField.value?.type ?? 'string');
const currentEnumOptions = computed(() => currentField.value?.enum ?? []);

/** 当前字段的关系目标实体字段列表 */
const currentRelationFields = computed(() => currentField.value?.relationFields ?? []);

/** 规则的 where 子查询 */
const ruleWhere = computed(() => props.rule.where);

/** 动态组件注入 inputs：字段选择器 */
const fieldSelectorInputs = computed(() => ({
  fields: props.fields,
  selectedField: fieldAsString.value,
  fieldChangeFn: fieldChangeCb
}));

/** 动态组件注入 inputs：操作符选择器 */
const operatorSelectorInputs = computed(() => ({
  fieldMetadata: currentField.value,
  fieldType: currentFieldType.value,
  selectedOperator: props.rule.operator,
  operatorChangeFn: operatorChangeCb
}));

/** 动态组件注入 inputs：值输入 */
const valueInputInputs = computed(() => ({
  fieldType: currentFieldType.value,
  operator: props.rule.operator,
  value: props.rule.value,
  enumOptions: currentEnumOptions.value,
  relationFields: currentRelationFields.value,
  where: ruleWhere.value,
  errorMessage: errorTooltip.value,
  valueChangeFn: valueChangeCb,
  whereChangeFn: whereChangeCb
}));

// 子条件清空/全部删除时自动收起面板并恢复 +子条件 按钮
watch(
  () => props.rule.where,
  where => {
    const hasRules = where && where.rules && where.rules.length > 0;
    if (!hasRules) {
      showSubquery.value = false;
    }
  }
);

/** 字段变更（默认操作符推导 + 重置子查询） */
const onFieldChange = (fieldName: string): void => {
  const field = props.fields.find(f => f.name === fieldName);
  emit('update', {
    id: props.rule.id,
    updates: {
      field: fieldName,
      operator:
        field?.isRelation ? 'exists'
        : field?.type === 'keyValue' ? 'null'
        : '=',
      value: field?.type === 'boolean' ? false : '',
      where: undefined // 重置子查询
    }
  });
};

/** 添加子条件：展开面板并创建一条默认子规则 */
const onAddSubcondition = (): void => {
  showSubquery.value = true;
  const relationFields = currentRelationFields.value;
  const firstField = relationFields[0];
  if (firstField) {
    const where: QueryBuilderRuleGroup<Record<string, unknown>> = {
      id: '',
      combinator: 'and',
      rules: [
        {
          id: '',
          field: firstField.name,
          operator:
            firstField.isRelation ? 'exists'
            : firstField.type === 'keyValue' ? 'null'
            : '=',
          value: firstField.type === 'boolean' ? false : ''
        }
      ]
    };
    emit('update', { id: props.rule.id, updates: { where } });
  }
};

/** 操作符变更 */
const onOperatorChange = (operator: string): void => {
  const updates: Partial<UIRuleWithWhere> = { operator };
  if (existsOperators.has(operator) || noValueOperators.has(operator)) {
    updates.value = null;
  }
  if (!existsOperators.has(operator)) {
    updates.where = undefined;
    showSubquery.value = false;
  }
  emit('update', { id: props.rule.id, updates });
};

/** 值变更 */
const onValueChange = (value: unknown): void => {
  emit('update', { id: props.rule.id, updates: { value } });
};

/** 子查询条件变更 */
const onWhereChange = (where: QueryBuilderRuleGroup<Record<string, unknown>> | undefined): void => {
  emit('update', { id: props.rule.id, updates: { where } });
};

/** 删除规则 */
const onRemove = (): void => {
  emit('remove');
};

// 回调 prop（动态组件注入路径）
const fieldChangeCb = (field: string) => onFieldChange(field);
const operatorChangeCb = (op: string) => onOperatorChange(op);
const valueChangeCb = (value: unknown) => onValueChange(value);
const whereChangeCb = (where: QueryBuilderRuleGroup<Record<string, unknown>> | undefined) => onWhereChange(where);

defineExpose({
  fieldAsString,
  ruleErrors,
  errorTooltip,
  isExistsOperator,
  isNoValueOperator,
  subqueryVisible,
  currentField,
  currentFieldType,
  currentEnumOptions,
  currentRelationFields,
  ruleWhere,
  fieldSelectorInputs,
  operatorSelectorInputs,
  valueInputInputs,
  onFieldChange,
  onAddSubcondition,
  onOperatorChange,
  onValueChange,
  onWhereChange,
  onRemove,
  showSubquery
});
</script>

<template>
  <div class="rxdb-query-rule group flex flex-col rounded p-1">
    <div class="flex flex-wrap items-center gap-2">
      <component
        v-bind="fieldSelectorInputs"
        :is="theme.fieldSelector"
      />
      <component
        v-bind="operatorSelectorInputs"
        :is="theme.operatorSelector"
      />
      <button
        class="btn btn-ghost btn-xs"
        v-if="isExistsOperator && !subqueryVisible"
        @click="onAddSubcondition"
        title="添加子条件"
        type="button"
      >
        + 子条件（可选）
      </button>
      <component
        v-bind="valueInputInputs"
        v-else-if="!isNoValueOperator"
        :is="theme.valueInput"
      />
      <button
        class="btn btn-ghost btn-xs btn-square text-base-content/30 hover:text-error ml-auto"
        @click="onRemove"
        title="删除条件"
        type="button"
      >
        ✕
      </button>
    </div>
    <component
      v-bind="valueInputInputs"
      v-if="isExistsOperator && subqueryVisible"
      :is="theme.valueInput"
    />
  </div>
</template>
