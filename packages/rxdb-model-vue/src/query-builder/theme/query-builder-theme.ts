import { provide, type Component, type InjectionKey } from 'vue';

/**
 * QueryBuilder 主题接口（对齐 Angular 侧的 `QueryBuilderTheme`）。
 *
 * 定义各 UI 插槽的组件类型，允许替换为不同的 UI 库实现。
 * 主题组件需遵循以下约定：
 * - 接受标准 props（字段、操作符、值等）；
 * - 同时支持 emit 事件和可选的 `xxxFn` 回调 prop（供动态组件注入使用）。
 */
export interface QueryBuilderTheme {
  /** 字段选择器组件 */
  fieldSelector: Component;
  /** 操作符选择器组件 */
  operatorSelector: Component;
  /** 值输入组件 */
  valueInput: Component;
}

/**
 * QueryBuilder 主题注入键（对齐 Angular 侧的 `QUERY_BUILDER_THEME` DI 令牌）。
 *
 * 应用层通过 {@link provideQueryBuilderTheme} 提供自定义主题；未提供时
 * 组件回退到 {@link DEFAULT_QUERY_BUILDER_THEME}。
 */
export const QUERY_BUILDER_THEME: InjectionKey<QueryBuilderTheme> = Symbol('QUERY_BUILDER_THEME');

/**
 * 提供自定义查询构建器主题（须在组件的 `setup` 阶段调用）。
 *
 * @param theme - 主题配置
 *
 * @example
 * ```typescript
 * // 在应用根组件提供自定义主题
 * setup() {
 *   provideQueryBuilderTheme(MY_QUERY_BUILDER_THEME);
 * }
 * ```
 */
export function provideQueryBuilderTheme(theme: QueryBuilderTheme): void {
  provide(QUERY_BUILDER_THEME, theme);
}
