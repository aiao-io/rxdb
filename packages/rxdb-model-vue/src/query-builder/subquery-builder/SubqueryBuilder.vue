<script lang="ts" setup>
/**
 * 子查询构建器组件（对齐 Angular 侧 `SubqueryBuilderComponent`）。
 *
 * 用于 EXISTS / NOT EXISTS 操作符的嵌套查询条件：添加子条件、嵌套规则组、清空子条件。
 */
import {
  createQueryBuilderService,
  type FieldMetadata,
  type QueryBuilderRuleGroup,
  type UIRule,
  type ValidationResult
} from '@aiao/rxdb-model';
import { computed, onScopeDispose, shallowRef, watch } from 'vue';
import QueryGroup from '../query-group/QueryGroup.vue';
import type { UIRuleGroup } from '../query-group/query-drag-drop';

const props = withDefaults(
  defineProps<{
    /** 字段列表 */
    fields: FieldMetadata[];
    /** 初始查询 */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    initialQuery?: QueryBuilderRuleGroup<Record<string, unknown>>;
    /** 最大嵌套层级 */
    maxDepth?: number;
  }>(),
  { maxDepth: 3 }
);

const emit = defineEmits<{
  /** 查询变更（无规则时 emit undefined 而不是空 RuleGroup） */
  queryChange: [query: { combinator: 'and' | 'or'; rules: unknown[] } | undefined];
  /** 验证变更 */
  validationChange: [result: ValidationResult];
}>();

const service = createQueryBuilderService<Record<string, unknown>>({
  config: { maxNestingLevel: props.maxDepth }
});

const rootGroup = shallowRef<UIRuleGroup | undefined>(undefined);
const validation = shallowRef<ValidationResult | undefined>(undefined);
const rootSub = service.rootGroup$.subscribe(g => (rootGroup.value = g as UIRuleGroup));
const validationSub = service.validation$.subscribe(v => (validation.value = v));

/** initialQuery 是否已应用（只应用一次） */
let initialQueryApplied = false;

// 监听字段变化并同步到服务
watch(
  () => props.fields,
  fields => {
    if (fields.length > 0) {
      service.setFields(fields);
    }
  },
  { immediate: true }
);

// 监听初始查询并加载（只应用一次，避免用户修改后被重置）
watch(
  () => props.initialQuery,
  initial => {
    if (!initialQueryApplied) {
      if (initial) {
        initialQueryApplied = true;
        service.fromRxDBQuery(initial);
      }
    }
  },
  { immediate: true }
);

// 监听查询变化并发出事件
watch(rootGroup, group => {
  if (group) {
    const query = service.toRxDBQuery();
    if (!query.rules || query.rules.length === 0) {
      emit('queryChange', undefined);
    } else {
      emit('queryChange', query);
    }
  }
});

// 监听验证变化并发出事件
watch(validation, v => {
  if (v) {
    emit('validationChange', v);
  }
});

// 同步 maxDepth 到 service
watch(
  () => props.maxDepth,
  depth => {
    service.setMaxNestingLevel(depth);
  },
  { immediate: true }
);

onScopeDispose(() => {
  rootSub.unsubscribe();
  validationSub.unsubscribe();
  service.destroy();
});

/** 是否有规则 */
const hasRules = computed(() => {
  const group = rootGroup.value;
  return !!group && group.rules.length > 0;
});

/** 添加第一条规则 */
const handleAddFirstRule = (): void => {
  const firstField = props.fields[0];
  if (firstField) {
    service.addRule(undefined, {
      field: firstField.name,
      operator:
        firstField.isRelation ? 'exists'
        : firstField.type === 'keyValue' ? 'null'
        : '=',
      value: firstField.type === 'boolean' ? false : ''
    });
  }
};

/** 清空所有规则 */
const handleClear = (): void => {
  service.clear();
};

/** 添加规则到指定组 */
const onAddRule = (event: { parentId: string; rule: Omit<UIRule, 'id'> }): void => {
  service.addRule(event.parentId, event.rule);
};

/** 添加子组到指定组 */
const onAddGroup = (parentId: string): void => {
  service.addGroup(parentId);
};

/** 删除规则或组 */
const onRemoveItem = (id: string): void => {
  service.remove(id);
};

/** 更新规则 */
const onUpdateRule = (event: { id: string; updates: Partial<UIRule> }): void => {
  service.updateRule(event.id, event.updates);
};

/** 更新组合器 */
const onUpdateCombinator = (event: { id: string; combinator: 'and' | 'or' }): void => {
  service.updateGroupCombinator(event.id, event.combinator);
};

defineExpose({
  rootGroup,
  hasRules,
  handleAddFirstRule,
  handleClear,
  onAddRule,
  onAddGroup,
  onRemoveItem,
  onUpdateRule,
  onUpdateCombinator
});
</script>

<template>
  <div class="subquery-builder border-base-300 bg-base-200/50 p-2">
    <div
      class="text-base-content/60 flex items-center gap-2"
      v-if="!hasRules"
    >
      <button
        class="btn btn-ghost btn-xs"
        @click="handleAddFirstRule"
        type="button"
      >
        + 添加子条件
      </button>
      <span class="text-xs opacity-50">（可选）</span>
    </div>
    <template v-else>
      <QueryGroup
        class="rxdb-subquery-root-group"
        :depth="0"
        :fields="fields"
        :group="rootGroup!"
        :max-depth="maxDepth"
        @add-group="onAddGroup"
        @add-rule="onAddRule"
        @remove-item="onRemoveItem"
        @update-combinator="onUpdateCombinator"
        @update-rule="onUpdateRule"
      />
      <div class="mt-2 flex justify-end">
        <button
          class="btn btn-ghost btn-xs text-error"
          @click="handleClear"
          type="button"
        >
          清空
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 等价 Angular 侧 `rxdb-query-group ::ng-deep > .rxdb-query-group { border: 0; padding: 0 }`：
   只去掉子查询根组的边框与内边距，不波及其内部嵌套组。 */
.subquery-builder :deep(.rxdb-subquery-root-group) {
  border: 0;
  padding: 0;
}
</style>
