import { FieldSelector } from '../field-selector/field-selector';
import { OperatorSelector } from '../operator-selector/operator-selector';
import { ValueInput } from '../value-input/value-input';
import type { QueryBuilderTheme } from './query-builder-theme';

/**
 * 默认主题（原生 HTML 实现）。
 *
 * @remarks
 * 不依赖任何第三方 UI 库，使用标准 HTML 表单元素（与 Angular 侧
 * `DEFAULT_QUERY_BUILDER_THEME` 一致）。开箱即用，无需额外配置。
 */
export const DEFAULT_QUERY_BUILDER_THEME: QueryBuilderTheme = {
  fieldSelector: FieldSelector,
  operatorSelector: OperatorSelector,
  valueInput: ValueInput
};
