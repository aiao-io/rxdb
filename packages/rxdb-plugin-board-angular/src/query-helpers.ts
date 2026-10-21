import type { RuleGroup } from '@aiao/rxdb';

/** `field = value` 规则（与核心包 `eq` 同语义，绑定层不依赖核心包查询辅助导出）。 */
export const eq = (field: string, value: string): RuleGroup<never> =>
  ({ combinator: 'and', rules: [{ field, operator: '=', value }] }) as RuleGroup<never>;

/** `field IN [...]` 规则。 */
export const inRule = (field: string, values: readonly string[]): RuleGroup<never> =>
  ({ combinator: 'and', rules: [{ field, operator: 'in', value: [...values] }] }) as RuleGroup<never>;
