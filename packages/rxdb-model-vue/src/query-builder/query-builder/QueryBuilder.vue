<script lang="ts" setup>
/**
 * Vue Query Builder 主组件（对齐 Angular 侧 `QueryBuilderComponent`）。
 *
 * 提供可视化的查询条件构建界面，支持：
 * - 传入 SchemaInfo 或 FieldMetadata[] 定义可用字段；
 * - 拖拽重排规则和分组；
 * - 嵌套分组（最大 5 层）；
 * - 实时验证；
 * - Escape 键在有规则时清空全部条件。
 */
import {
  createQueryBuilderService,
  type FieldMetadata,
  type RuleGroup,
  type SchemaInfo,
  type UIRule,
  type ValidationResult
} from '@aiao/rxdb-model';
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';
import QueryGroup from '../query-group/QueryGroup.vue';
import { QueryDragDropHandler, type UIRuleGroup } from '../query-group/query-drag-drop';
import type { RxDBQueryOutput } from './query-builder-types';

const props = withDefaults(
  defineProps<{
    /** Schema 信息，包含字段定义 */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    schema?: SchemaInfo;
    /** 字段列表（直接传入，优先于 schema） */
    fields?: FieldMetadata[];
    /** 初始查询条件（可选） */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    initialQuery?: RxDBQueryOutput<Record<string, unknown>>;
    /** 最大嵌套层级 */
    maxDepth?: number;
    /** 内容区域最大高度（超出后滚动） */
    height?: string;
    /** 是否开启拖拽排序功能 */
    enableDrag?: boolean;
    /** 是否开启分组展开/收起功能 */
    enableCollapse?: boolean;
  }>(),
  { fields: () => [], maxDepth: 5, height: '80vh', enableDrag: true, enableCollapse: true }
);

const emit = defineEmits<{
  /** 查询条件变更 */
  queryChange: [query: RxDBQueryOutput<Record<string, unknown>>];
  /** 验证状态变更 */
  validationChange: [result: ValidationResult];
}>();

const service = createQueryBuilderService<Record<string, unknown>>({
  config: { maxNestingLevel: props.maxDepth }
});

const rootGroup = shallowRef<UIRuleGroup | undefined>(undefined);
const validation = shallowRef<ValidationResult | undefined>(undefined);
const rootSub = service.rootGroup$.subscribe(g => (rootGroup.value = g as UIRuleGroup));
const validationSub = service.validation$.subscribe(v => (validation.value = v));

const scrollContainer = ref<HTMLElement | null>(null);

const dragDropHandler = new QueryDragDropHandler((itemId, targetGroupId, targetIndex) =>
  service.moveItem(itemId, targetGroupId, targetIndex)
);

/** 上次应用的 initialQuery 引用，用于检测是否有新查询需要加载 */
let lastAppliedInitialQuery: unknown = undefined;

/** 计算后的字段列表（fields 优先，其次 schema.fields） */
const fieldsComputed = computed(() => {
  const directFields = props.fields;
  if (directFields && directFields.length > 0) {
    return directFields;
  }
  const schemaInfo = props.schema;
  return schemaInfo?.fields ?? [];
});

/** 验证错误列表 */
const validationErrors = computed(() => validation.value?.errors ?? []);

/** 是否有规则 */
const hasRules = computed(() => {
  const group = rootGroup.value;
  return !!group && group.rules.length > 0;
});

// 监听字段变化并同步到服务
watch(
  fieldsComputed,
  fields => {
    if (fields.length > 0) {
      service.setFields(fields);
    }
  },
  { immediate: true }
);

// 监听初始查询并加载（引用变化时重新加载，用户修改不影响此 prop 故不会覆盖）
watch(
  () => props.initialQuery,
  initial => {
    if (initial !== undefined && initial !== lastAppliedInitialQuery) {
      lastAppliedInitialQuery = initial;
      service.fromRxDBQuery(initial as unknown as RuleGroup<Record<string, unknown>>);
    }
  },
  { immediate: true }
);

// 监听查询变化并发出事件
watch(rootGroup, group => {
  if (group) {
    emit('queryChange', service.toRxDBQuery() as RxDBQueryOutput<Record<string, unknown>>);
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

/** 添加第一个规则（用首个字段建规则） */
const addFirstRule = (): void => {
  const firstField = fieldsComputed.value[0];
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
const clearAll = (): void => {
  service.clear();
};

/** 添加规则到指定组 */
const onAddRule = (event: { parentId: string; rule: Omit<UIRule, 'id'> }): void => {
  service.addRule(event.parentId, event.rule);
  scrollToBottom();
};

/** 添加子组到指定组 */
const onAddGroup = (parentId: string): void => {
  service.addGroup(parentId);
  scrollToBottom();
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

/** 键盘快捷键处理 */
const onKeyDown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && hasRules.value) {
    event.preventDefault();
    clearAll();
  }
};

const scrollToBottom = (): void => {
  setTimeout(() => {
    scrollContainer.value?.scrollTo({ top: scrollContainer.value.scrollHeight, behavior: 'smooth' });
  }, 0);
};

defineExpose({
  hasRules,
  rootGroup,
  validationErrors,
  fieldsComputed,
  dragDropHandler,
  addFirstRule,
  clearAll,
  onKeyDown,
  onAddRule,
  onAddGroup,
  onRemoveItem,
  onUpdateRule,
  onUpdateCombinator
});
</script>

<template>
  <div
    class="rxdb-query-builder bg-base-100"
    @keydown="onKeyDown"
    aria-label="查询条件构建器"
    role="search"
    tabindex="0"
  >
    <div
      class="overflow-y-auto"
      :style="{ 'max-height': height }"
      ref="scrollContainer"
    >
      <!-- 标题栏 -->
      <div class="mb-4 flex items-center justify-between">
        <h3
          class="text-base"
          id="query-builder-title"
        >
          查询条件
        </h3>
        <div
          class="flex gap-2"
          aria-label="查询操作"
          role="toolbar"
        >
          <button
            class="btn btn-ghost btn-sm"
            v-if="hasRules"
            @click="clearAll"
            @keydown.enter="clearAll"
            aria-label="清空所有查询条件"
            title="清空所有查询条件 (Escape)"
            type="button"
          >
            清空
          </button>
        </div>
      </div>

      <!-- 空状态提示 -->
      <div
        class="text-base-content/60 min-w-md py-8 text-center"
        v-if="!hasRules"
        aria-live="polite"
        role="status"
      >
        <div
          class="mb-2 flex justify-center"
          aria-hidden="true"
        >
          <svg
            class="size-12 opacity-40"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="11"
              cy="11"
              r="8"
            />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
        <p class="mb-4"> 还没有任何查询条件 </p>
        <button
          class="btn btn-sm"
          @click="addFirstRule"
          aria-label="添加第一个条件"
          type="button"
        >
          添加第一个条件
        </button>
      </div>

      <!-- 根规则组 -->
      <QueryGroup
        v-else
        :allow-collapse="enableCollapse"
        :depth="0"
        :drag-drop-handler="enableDrag ? dragDropHandler : undefined"
        :errors="validationErrors"
        :fields="fieldsComputed"
        :group="rootGroup!"
        :max-depth="maxDepth"
        @add-group="onAddGroup"
        @add-rule="onAddRule"
        @remove-item="onRemoveItem"
        @update-combinator="onUpdateCombinator"
        @update-rule="onUpdateRule"
        role="region"
      />
    </div>
  </div>
</template>
