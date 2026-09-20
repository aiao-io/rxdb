/**
 * @fileoverview QueryBuilder 主题（Angular `QUERY_BUILDER_THEME` DI token 的 React Context 版）。
 *
 * 主题组件约定（与 Angular 侧一致）：
 * - 接受字段、操作符、值等 props；
 * - 通过 `onXxxChange` 回调把变更交给宿主（Angular 侧 output + `*Fn` input 的双通道
 *   在 React 合并为单一回调 prop，语义等价）。
 *
 * @module query-builder/theme
 */
import { createContext, type ComponentType, type JSX, type ReactNode } from 'react';
import type { FieldSelectorProps } from '../field-selector/field-selector';
import type { OperatorSelectorProps } from '../operator-selector/operator-selector';
import type { ValueInputProps } from '../value-input/value-input';

/**
 * QueryBuilder 主题接口：定义各 UI 插槽的组件类型，允许替换为不同的 UI 库实现。
 */
export interface QueryBuilderTheme {
  /** 字段选择器组件。 */
  fieldSelector: ComponentType<FieldSelectorProps>;
  /** 操作符选择器组件。 */
  operatorSelector: ComponentType<OperatorSelectorProps>;
  /** 值输入组件。 */
  valueInput: ComponentType<ValueInputProps>;
}

/**
 * QueryBuilder 主题 context（Angular 侧 `QUERY_BUILDER_THEME` InjectionToken 的 React 等价物）。
 *
 * @example
 * ```tsx
 * <QueryBuilderThemeProvider theme={MY_THEME}>
 *   <QueryBuilder fields={fields} />
 * </QueryBuilderThemeProvider>
 * ```
 */
export const QUERY_BUILDER_THEME = createContext<QueryBuilderTheme | undefined>(undefined);

/** {@link QueryBuilderThemeProvider} 的 props。 */
export interface QueryBuilderThemeProviderProps {
  /** 主题对象。 */
  theme: QueryBuilderTheme;
  /** 消费子树。 */
  children?: ReactNode;
}

/**
 * 提供自定义主题（Angular 侧 `provideQueryBuilderTheme` 的 React 等价物）。
 */
export function QueryBuilderThemeProvider({ theme, children }: QueryBuilderThemeProviderProps): JSX.Element {
  return <QUERY_BUILDER_THEME.Provider value={theme}>{children}</QUERY_BUILDER_THEME.Provider>;
}
