/**
 * @aiao/rxdb-model-vue 查询构建器组件库（对齐 Angular 侧 `query-builder/index.ts`）。
 *
 * 提供可视化的 RxDB 查询条件构建组件，支持：
 * - 从 EntityMetadata 自动解析字段；
 * - 支持多种数据类型和操作符；
 * - AND/OR 条件组合；
 * - 最大 5 层嵌套；
 * - 实时验证。
 */

// 主组件
export type { RxDBQueryOutput } from './query-builder/query-builder-types';
export { default as QueryBuilder } from './query-builder/QueryBuilder.vue';

// 子组件（可单独使用）
export { default as FieldSelector } from './field-selector/FieldSelector.vue';
export { default as OperatorSelector } from './operator-selector/OperatorSelector.vue';
export { default as PopoverSelect } from './popover-select/PopoverSelect.vue';
export {
  QueryDragDropHandler,
  calculateDropMode,
  type QueryDragDropState,
  type QueryDropMode,
  type UIRuleGroup
} from './query-group/query-drag-drop';
export { default as QueryGroup } from './query-group/QueryGroup.vue';
export { default as QueryRule } from './query-rule/QueryRule.vue';
export { default as SubqueryBuilder } from './subquery-builder/SubqueryBuilder.vue';
export { default as TreeSelect } from './tree-select/TreeSelect.vue';
export { default as ValueInput } from './value-input/ValueInput.vue';

// 主题注入
export { DEFAULT_QUERY_BUILDER_THEME } from './theme/default-query-builder-theme';
export { QUERY_BUILDER_THEME, provideQueryBuilderTheme } from './theme/query-builder-theme';
export type { QueryBuilderTheme } from './theme/query-builder-theme';

// Core exports
export * from '@aiao/rxdb-model';
