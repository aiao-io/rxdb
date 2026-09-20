<script lang="ts" setup>
/**
 * 查询规则组组件（递归，对齐 Angular 侧 `QueryGroupComponent`）。
 *
 * 显示一组查询规则，支持：
 * - AND/OR 切换（Teable 风格：行内 conjunction 前缀）；
 * - 添加规则/子组（达到嵌套上限时按钮保留但禁用，并给出可见原因）；
 * - 删除组、递归嵌套显示、拖拽重排（before / after / into）。
 */
import type { FieldMetadata, UIRule, ValidationError } from '@aiao/rxdb-model';
import { computed, ref } from 'vue';
import QueryRule from '../query-rule/QueryRule.vue';
import { calculateDropMode, type QueryDragDropHandler, type QueryDropMode, type UIRuleGroup } from './query-drag-drop';

defineOptions({ name: 'QueryGroup' });

const props = withDefaults(
  defineProps<{
    /** 本组规则 */
    group: UIRuleGroup;
    /** 可用字段 */
    fields: FieldMetadata[];
    /** 校验错误 */
    errors?: ValidationError[];
    /** 嵌套深度 */
    depth?: number;
    /** 最大嵌套层级 */
    maxDepth?: number;
    /** 拖拽处理器 */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    dragDropHandler?: QueryDragDropHandler;
    /** 是否允许展开/收起组 */
    allowCollapse?: boolean;
  }>(),
  { errors: () => [], depth: 0, maxDepth: 5, allowCollapse: true }
);

const emit = defineEmits<{
  /** 添加规则 */
  addRule: [event: { parentId: string; rule: Omit<UIRule, 'id'> }];
  /** 添加子组 */
  addGroup: [parentId: string];
  /** 删除规则或组 */
  removeItem: [id: string];
  /** 更新规则 */
  updateRule: [event: { id: string; updates: Partial<UIRule> }];
  /** 更新组合器 */
  updateCombinator: [event: { id: string; combinator: 'and' | 'or' }];
}>();

/** 当前组是否已折叠 */
const collapsed = ref(false);

/** 是否可以添加子组（未达到最大深度） */
const canAddGroup = computed(() => props.depth < props.maxDepth - 1);

/** 达到嵌套上限时展示给用户的原因（不能静默） */
const nestingLimitHint = computed(() => `已达最大嵌套层级（${props.maxDepth} 层）`);

/** 切换折叠状态 */
const toggleCollapse = (): void => {
  collapsed.value = !collapsed.value;
};

/** 切换组合器 */
const toggleCombinator = (combinator: 'and' | 'or'): void => {
  if (props.group.combinator !== combinator) {
    emit('updateCombinator', { id: props.group.id, combinator });
  }
};

/** 添加规则（用首个字段构造默认规则） */
const onAddRule = (): void => {
  const firstField = props.fields[0];
  if (firstField) {
    emit('addRule', {
      parentId: props.group.id,
      rule: {
        field: firstField.name,
        operator:
          firstField.isRelation ? 'exists'
          : firstField.type === 'keyValue' ? 'null'
          : '=',
        value: firstField.type === 'boolean' ? false : ''
      }
    });
  }
};

/** 添加子组（按钮的 disabled 挡不住键盘/程序化调用，这里再守一次） */
const onAddGroup = (): void => {
  if (!canAddGroup.value) return;
  emit('addGroup', props.group.id);
};

/** 删除此组 */
const onRemove = (): void => {
  emit('removeItem', props.group.id);
};

/** 规则更新 */
const onRuleUpdate = (event: { id: string; updates: Partial<UIRule> }): void => {
  emit('updateRule', event);
};

/** 删除规则 */
const onRuleRemove = (id: string): void => {
  emit('removeItem', id);
};

/** 类型守卫：是否为规则组 */
const isRuleGroup = (item: UIRuleGroup | UIRule): item is UIRuleGroup => 'combinator' in item && 'rules' in item;

/** 类型转换：转为规则组 */
const asRuleGroup = (item: UIRuleGroup | UIRule): UIRuleGroup => item as UIRuleGroup;

/** 类型转换：转为规则 */
const asRule = (item: UIRuleGroup | UIRule): UIRule => item as UIRule;

/** 追踪函数 */
const trackByItem = (item: UIRuleGroup | UIRule): string => item.id;

const isDragging = (itemId: string): boolean => props.dragDropHandler?.state.value.draggedItemId === itemId;

const isDropTarget = (itemId: string, mode: QueryDropMode): boolean => {
  const state = props.dragDropHandler?.state.value;
  return !!state && state.targetItemId === itemId && state.dropMode === mode && state.isValidTarget;
};

const isDropInvalid = (itemId: string): boolean => {
  const state = props.dragDropHandler?.state.value;
  return !!state && state.targetItemId === itemId && !state.isValidTarget && !!state.draggedItemId;
};

const onItemDragStart = (event: DragEvent, item: UIRule | UIRuleGroup): void => {
  const handler = props.dragDropHandler;
  if (!handler || !event.dataTransfer) return;
  event.stopPropagation();
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', item.id);
  const row = (event.target as HTMLElement).closest('.rxdb-drag-item') as HTMLElement | null;
  if (row) {
    const rect = row.getBoundingClientRect();
    event.dataTransfer.setDragImage(row, event.clientX - rect.left, event.clientY - rect.top);
  }
  handler.start(item.id);
};

const onItemDragOver = (event: DragEvent, item: UIRule | UIRuleGroup, isGroup: boolean): void => {
  event.preventDefault();
  event.stopPropagation();
  const handler = props.dragDropHandler;
  if (!handler || !event.dataTransfer) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const dropMode = calculateDropMode(event.clientY, rect, isGroup);
  const draggedId = handler.state.value.draggedItemId;
  const isValid = !!draggedId && draggedId !== item.id && (dropMode !== 'into' || isGroup);
  event.dataTransfer.dropEffect = isValid ? 'move' : 'none';
  handler.over(item.id, dropMode, isValid, props.depth);
};

const onItemDragLeave = (event: DragEvent): void => {
  const target = event.currentTarget as HTMLElement;
  const related = event.relatedTarget as Node | null;
  if (!related || !target.contains(related)) {
    props.dragDropHandler?.leave();
  }
};

const onItemDrop = (
  event: DragEvent,
  targetItem: UIRule | UIRuleGroup,
  targetIndex: number,
  isGroup: boolean
): void => {
  event.preventDefault();
  event.stopPropagation();
  const handler = props.dragDropHandler;
  const state = handler?.state.value;
  if (!handler || !state?.draggedItemId || !state.isValidTarget || !state.dropMode) {
    handler?.end();
    return;
  }
  const dropMode = state.dropMode;
  let finalTargetGroupId: string;
  let finalTargetIndex: number;
  if (dropMode === 'into' && isGroup) {
    const subGroup = targetItem as UIRuleGroup;
    finalTargetGroupId = subGroup.id;
    const draggedInTarget = subGroup.rules.some(r => r.id === state.draggedItemId);
    finalTargetIndex = draggedInTarget ? subGroup.rules.length - 1 : subGroup.rules.length;
  } else {
    finalTargetGroupId = props.group.id;
    const rules = props.group.rules;
    const draggedIndex = rules.findIndex(r => r.id === state.draggedItemId);
    const isInSameGroup = draggedIndex !== -1;
    let adjustedIndex = targetIndex;
    if (isInSameGroup && draggedIndex < targetIndex) {
      adjustedIndex--;
    }
    finalTargetIndex = dropMode === 'before' ? adjustedIndex : adjustedIndex + 1;
  }
  handler.drop(state.draggedItemId, finalTargetGroupId, finalTargetIndex);
};

const onItemDragEnd = (): void => {
  props.dragDropHandler?.end();
};

defineExpose({
  collapsed,
  canAddGroup,
  nestingLimitHint,
  toggleCollapse,
  toggleCombinator,
  onAddRule,
  onAddGroup,
  onRemove,
  onRuleUpdate,
  onRuleRemove,
  isRuleGroup,
  asRuleGroup,
  asRule,
  trackByItem,
  isDragging,
  isDropTarget,
  isDropInvalid,
  onItemDragStart,
  onItemDragOver,
  onItemDragLeave,
  onItemDrop,
  onItemDragEnd
});
</script>

<template>
  <div
    class="rxdb-query-group border-base-300 my-1 rounded-lg border p-2"
    :class="{ 'bg-base-200': depth % 2 === 1 }"
  >
    <!-- 组合器 + 操作按钮（同一行） -->
    <div
      class="flex items-center gap-2"
      :class="{ 'mb-2': !collapsed }"
    >
      <div class="join">
        <button
          class="btn btn-xs join-item"
          :class="group.combinator !== 'and' ? 'btn-ghost' : 'btn-primary'"
          @click="toggleCombinator('and')"
          type="button"
        >
          AND
        </button>
        <button
          class="btn btn-xs join-item"
          :class="group.combinator !== 'or' ? 'btn-ghost' : 'btn-primary'"
          @click="toggleCombinator('or')"
          type="button"
        >
          OR
        </button>
      </div>

      <button
        class="btn btn-ghost btn-xs btn-square"
        v-if="allowCollapse"
        :title="collapsed ? '展开' : '收起'"
        @click="toggleCollapse"
        type="button"
      >
        <svg
          class="h-3 w-3 transition-transform duration-200"
          :class="{ '-rotate-90': collapsed }"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2.5"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div class="flex-1" />

      <template v-if="!collapsed">
        <button
          class="btn btn-ghost btn-xs"
          @click="onAddRule"
          type="button"
        >
          + 条件
        </button>

        <!-- 达到上限时保留按钮并禁用，而不是整个条件渲染掉（超出需给出可见原因） -->
        <button
          class="btn btn-ghost btn-xs"
          :aria-disabled="!canAddGroup"
          :disabled="!canAddGroup"
          :title="canAddGroup ? undefined : nestingLimitHint"
          @click="onAddGroup"
          type="button"
        >
          + 分组
        </button>
        <span
          class="text-base-content/50 text-xs"
          v-if="!canAddGroup"
          role="status"
          >{{ nestingLimitHint }}</span
        >

        <button
          class="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-error"
          v-if="depth > 0"
          @click="onRemove"
          title="删除组"
          type="button"
        >
          ✕
        </button>
      </template>
    </div>

    <!-- 规则列表 -->
    <div
      class="space-y-1"
      v-if="!collapsed"
    >
      <div
        class="rxdb-drag-item"
        v-for="(item, idx) in group.rules"
        :class="{
          dragging: isDragging(item.id),
          'drop-invalid': isDropInvalid(item.id),
          'drop-target-after': isDropTarget(item.id, 'after'),
          'drop-target-before': isDropTarget(item.id, 'before'),
          'drop-target-into': isDropTarget(item.id, 'into')
        }"
        :key="trackByItem(item)"
        @dragend="onItemDragEnd"
        @dragleave="onItemDragLeave"
        @dragover="onItemDragOver($event, item, isRuleGroup(item))"
        @drop="onItemDrop($event, item, idx, isRuleGroup(item))"
      >
        <div
          class="flex items-start gap-1"
          v-if="isRuleGroup(item)"
        >
          <span
            class="btn btn-ghost btn-xs btn-square text-base-content/30 hover:text-base-content/60 mt-1 cursor-grab"
            v-if="dragDropHandler"
            @dragstart="onItemDragStart($event, item)"
            draggable="true"
            >⠿</span
          >
          <div class="min-w-0 flex-1">
            <QueryGroup
              :allow-collapse="allowCollapse"
              :depth="depth + 1"
              :drag-drop-handler="dragDropHandler"
              :errors="errors"
              :fields="fields"
              :group="asRuleGroup(item)"
              :max-depth="maxDepth"
              @add-group="emit('addGroup', $event)"
              @add-rule="emit('addRule', $event)"
              @remove-item="emit('removeItem', $event)"
              @update-combinator="emit('updateCombinator', $event)"
              @update-rule="emit('updateRule', $event)"
            />
          </div>
        </div>
        <div
          class="flex items-center gap-1"
          v-else
        >
          <span
            class="btn btn-ghost btn-xs btn-square text-base-content/30 hover:text-base-content/60 cursor-grab"
            v-if="dragDropHandler"
            @dragstart="onItemDragStart($event, item)"
            draggable="true"
            >⠿</span
          >
          <div class="min-w-0 flex-1">
            <QueryRule
              :errors="errors"
              :fields="fields"
              :rule="asRule(item)"
              @remove="onRuleRemove(asRule(item).id)"
              @update="onRuleUpdate"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div
      class="text-base-content/50 py-2 text-center text-sm select-none"
      v-if="!collapsed && group.rules.length === 0"
    >
      暂无条件
    </div>
  </div>
</template>

<style scoped>
.rxdb-drag-item {
  position: relative;
}

.rxdb-drag-item.dragging {
  opacity: 0.4;
}

.rxdb-drag-item.drop-target-before::before {
  content: '';
  position: absolute;
  top: -2px;
  left: 0;
  right: 0;
  height: 3px;
  background: oklch(0.6 0.2 250);
  border-radius: 2px;
  z-index: 1;
}

.rxdb-drag-item.drop-target-after::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 3px;
  background: oklch(0.6 0.2 250);
  border-radius: 2px;
  z-index: 1;
}

.rxdb-drag-item.drop-target-into {
  outline: 2px dashed oklch(0.6 0.2 250);
  outline-offset: -2px;
  border-radius: 0.5rem;
  background: oklch(0.6 0.2 250 / 10%);
}

.rxdb-drag-item.drop-invalid {
  outline: 2px dashed oklch(0.6 0.2 30);
  outline-offset: -2px;
  border-radius: 0.5rem;
}
</style>
