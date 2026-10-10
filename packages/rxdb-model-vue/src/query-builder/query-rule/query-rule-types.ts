import type { QueryBuilderRuleGroup, UIRule } from '@aiao/rxdb-model';

/**
 * 带 where 子查询的 UI 规则（exists / notExists 规则的形状）。
 *
 * SFC 无法导出符号，拆到本模块（对齐 React 侧 `query-rule.tsx` 的
 * `export type UIRuleWithWhere` / Angular 侧 `QueryRuleComponent` 同名导出）。
 */
export type UIRuleWithWhere = UIRule & {
  where?: QueryBuilderRuleGroup<Record<string, unknown>>;
};
