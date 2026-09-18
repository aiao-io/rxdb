/**
 * @aiao/rxdb-model-angular
 *
 * Angular 查询构建器组件库
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
 * ```typescript
 * import { QueryBuilderComponent } from '@aiao/rxdb-model-angular';
 *
 * @Component({
 *   imports: [QueryBuilderComponent],
 *   template: `
 *     <rxdb-query-builder
 *       [entity]="userEntity"
 *       (queryChange)="onQueryChange($event)"
 *     />
 *   `
 * })
 * export class MyComponent {
 *   userEntity = inject(UserEntity);
 *
 *   onQueryChange(query: RuleGroup<User>) {
 *     console.log('Query changed:', query);
 *   }
 * }
 * ```
 */

// 主组件
export { QueryBuilderComponent } from './query-builder/query-builder.component';
export type { RxDBQueryOutput } from './query-builder/query-builder.component';

// 子组件（可单独使用）
export { FieldSelectorComponent } from './field-selector/field-selector.component';
export { OperatorSelectorComponent } from './operator-selector/operator-selector.component';
export { PopoverSelectComponent } from './popover-select/popover-select.component';
export { QueryGroupComponent } from './query-group/query-group.component';
export { QueryRuleComponent } from './query-rule/query-rule.component';
export { SubqueryBuilderComponent } from './subquery-builder/subquery-builder.component';
export { TreeItemDirective, TreeSelectComponent } from './tree-select/tree-select.component';
export { ValueInputComponent } from './value-input/value-input.component';

// 主题注入
export { DEFAULT_QUERY_BUILDER_THEME } from './theme/default-query-builder-theme';
export { QUERY_BUILDER_THEME, provideQueryBuilderTheme } from './theme/query-builder-theme.token';

// Core exports
export * from '@aiao/rxdb-model';
export type { QueryBuilderTheme } from './theme/query-builder-theme.token';
