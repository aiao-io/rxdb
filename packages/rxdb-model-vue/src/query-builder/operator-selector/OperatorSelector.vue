<script lang="ts" setup>
/**
 * 操作符选择器组件（对齐 Angular 侧 `OperatorSelectorComponent`）。
 *
 * 基于 {@link PopoverSelect} 提供操作符选择功能，自动根据字段类型或
 * 元数据筛选可用操作符，支持搜索过滤和键盘导航。
 *
 * 支持两种使用方式：
 * 1. 直接模板使用：监听 `operatorChange` emit 事件；
 * 2. 通过动态组件注入：传入 `operatorChangeFn` 回调 prop。
 */
import { getDefaultOperatorRegistry, type FieldMetadata, type PropertyType } from '@aiao/rxdb-model';
import { computed } from 'vue';
import PopoverSelect from '../popover-select/PopoverSelect.vue';

const props = withDefaults(
  defineProps<{
    /** 字段元数据（优先于 fieldType 推导可选项） */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    fieldMetadata?: FieldMetadata | undefined;
    /** 字段类型 */
    fieldType?: string;
    /** 当前选中操作符 */
    selectedOperator?: string;
    /** 动态组件注入时使用的回调 */
    operatorChangeFn?: ((op: string) => void) | undefined;
  }>(),
  { fieldType: 'string', selectedOperator: '=', operatorChangeFn: undefined }
);

const emit = defineEmits<{
  /** 操作符选中（直接模板使用） */
  operatorChange: [op: string];
}>();

const registry = getDefaultOperatorRegistry();

const operatorOptions = computed(() => {
  const metadata = props.fieldMetadata;
  const operators = metadata ? registry.getForField(metadata) : registry.getForType(props.fieldType as PropertyType);
  return operators.map(op => ({ value: op.key, label: op.label }));
});

const onOperatorChange = (op: string): void => {
  emit('operatorChange', op);
  props.operatorChangeFn?.(op);
};

defineExpose({ operatorOptions, onOperatorChange });
</script>

<template>
  <PopoverSelect
    :options="operatorOptions"
    :selected="selectedOperator"
    @select-change="onOperatorChange"
    min-width="8rem"
    placeholder="选择操作符"
  />
</template>
