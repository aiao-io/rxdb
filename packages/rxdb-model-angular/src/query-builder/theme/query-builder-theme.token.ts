import { InjectionToken, Provider, Type } from '@angular/core';

/**
 * QueryBuilder 主题接口
 *
 * @description
 * 定义各 UI 插槽的组件类型，允许替换为不同的 UI 库实现
 *
 * 主题组件需遵循以下约定：
 * - 接受标准 signal inputs（字段、操作符、值等）
 * - 同时支持 output() 事件和可选的 onXxx 回调 input（供 NgComponentOutlet 使用）
 */
export interface QueryBuilderTheme {
  /** 字段选择器组件 */
  fieldSelector: Type<unknown>;
  /** 操作符选择器组件 */
  operatorSelector: Type<unknown>;
  /** 值输入组件 */
  valueInput: Type<unknown>;
}

/**
 * QueryBuilder 主题注入 Token
 *
 * @example
 * ```typescript
 * // 在应用根模块提供自定义主题
 * providers: [provideQueryBuilderTheme(QUERY_BUILDER_XXX_THEME)]
 * ```
 */
export const QUERY_BUILDER_THEME = new InjectionToken<QueryBuilderTheme>('QUERY_BUILDER_THEME');

/**
 * 提供自定义主题
 */
export function provideQueryBuilderTheme(theme: QueryBuilderTheme): Provider {
  return { provide: QUERY_BUILDER_THEME, useValue: theme };
}
