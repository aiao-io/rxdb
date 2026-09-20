<script lang="ts" setup>
/**
 * 字段选择器组件（对齐 Angular 侧 `FieldSelectorComponent`）。
 *
 * 使用 Popover API 展示树形字段结构，支持过滤和嵌套关系字段的展开/折叠，
 * 基于包内键盘导航管理提供完整键盘导航和无障碍支持。
 *
 * 支持两种使用方式：
 * 1. 直接模板使用：监听 `fieldChange` emit 事件；
 * 2. 通过动态组件注入：传入 `fieldChangeFn` 回调 prop。
 */
import { buildFieldTree, type FieldMetadata } from '@aiao/rxdb-model';
import { computed } from 'vue';
import TreeSelect from '../tree-select/TreeSelect.vue';

const props = withDefaults(
  defineProps<{
    /** 可用字段列表 */
    fields: FieldMetadata[];
    /** 当前选中字段 */
    selectedField?: string;
    /** 占位文案 */
    placeholder?: string;
    /** 动态组件注入时使用的回调 */
    fieldChangeFn?: ((field: string) => void) | undefined;
  }>(),
  { selectedField: '', placeholder: '选择字段', fieldChangeFn: undefined }
);

const emit = defineEmits<{
  /** 字段选中（直接模板使用） */
  fieldChange: [field: string];
}>();

const fieldTree = computed(() => buildFieldTree(props.fields));

const onSelect = (field: string): void => {
  emit('fieldChange', field);
  props.fieldChangeFn?.(field);
};

defineExpose({ fieldTree, onSelect });
</script>

<template>
  <TreeSelect
    :nodes="fieldTree"
    :placeholder="placeholder"
    :selected="selectedField"
    @select-change="onSelect"
    min-width="14rem"
  />
</template>
