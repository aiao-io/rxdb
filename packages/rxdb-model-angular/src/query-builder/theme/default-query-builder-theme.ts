import { FieldSelectorComponent } from '../field-selector/field-selector.component';
import { OperatorSelectorComponent } from '../operator-selector/operator-selector.component';
import { ValueInputComponent } from '../value-input/value-input.component';
import type { QueryBuilderTheme } from './query-builder-theme.token';

/**
 * 默认主题（原生 HTML 实现）
 *
 * @description
 * 不依赖任何第三方 UI 库，使用标准 HTML 表单元素。
 * 适合轻量级场景或作为自定义主题的参考实现。
 *
 * @example
 * ```typescript
 * // 默认主题无需额外配置，开箱即用
 * imports: [QueryBuilderComponent]
 * ```
 */
export const DEFAULT_QUERY_BUILDER_THEME: QueryBuilderTheme = {
  fieldSelector: FieldSelectorComponent,
  operatorSelector: OperatorSelectorComponent,
  valueInput: ValueInputComponent
};
