/**
 * @aiao/rxdb-model-react
 *
 * React 查询构建器组件库。
 *
 * @description
 * 提供可视化的 RxDB 查询条件构建组件，支持：
 * - 从 EntityMetadata 自动解析字段
 * - 支持多种数据类型和操作符
 * - AND/OR 条件组合
 * - 最大 5 层嵌套
 * - 实时验证
 *
 * @example
 * ```tsx
 * import { QueryBuilder } from '@aiao/rxdb-model-react';
 *
 * <QueryBuilder fields={fields} onQueryChange={query => console.log(query)} />;
 * ```
 */

// 主组件
export { QueryBuilder, type QueryBuilderProps, type RxDBQueryOutput } from './query-builder/query-builder.js';

// 子组件（可单独使用）
export { FieldSelector, type FieldSelectorProps } from './field-selector/field-selector.js';
export { OperatorSelector, type OperatorSelectorProps } from './operator-selector/operator-selector.js';
export { PopoverSelect, type PopoverSelectOption, type PopoverSelectProps } from './popover-select/popover-select.js';
export {
  QueryDragDropHandler,
  QueryGroup,
  type QueryDragDropState,
  type QueryDropMode,
  type QueryGroupProps,
  type UIRuleGroup
} from './query-group/query-group.js';
export { QueryRule, type QueryRuleProps, type UIRuleWithWhere } from './query-rule/query-rule.js';
export { SubqueryBuilder, type SubqueryBuilderProps } from './subquery-builder/subquery-builder.js';
export { TreeItemDirective, TreeSelect, type TreeSelectProps } from './tree-select/tree-select.js';
export { ValueInput, type ValueInputProps } from './value-input/value-input.js';

// 主题注入
export { DEFAULT_QUERY_BUILDER_THEME } from './theme/default-query-builder-theme.js';
export {
  QUERY_BUILDER_THEME,
  QueryBuilderThemeProvider,
  type QueryBuilderTheme,
  type QueryBuilderThemeProviderProps
} from './theme/query-builder-theme.js';

// Core exports
export * from '@aiao/rxdb-model';
