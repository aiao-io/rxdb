/**
 * @fileoverview 关系嵌入的别名规划：select 构建与过滤编译共用同一份结果。
 */

import { isRuleGroup } from '@aiao/rxdb';

/** 规划只读到的规则形状（exists 的 `where` 是同形的子组） */
interface PlannedRule {
  readonly field?: unknown;
  readonly operator?: unknown;
  readonly where?: PlannedRuleGroup;
}

/** 规划只读到的规则组形状 */
interface PlannedRuleGroup {
  readonly rules?: readonly unknown[];
}

/**
 * 显式 exists / notExists 规则 → 它在所属嵌入层里的别名。
 *
 * 不在表里的规则（点路径展开出来的 exists）用关系名本身。
 */
export type ExistsAliases = ReadonlyMap<object, string>;

/**
 * 给同一嵌入层里共用关系的显式 exists 分配各自的别名。
 *
 * @param ruleGroup - 查询条件
 * @returns 每条显式 exists / notExists 规则（按对象身份）的嵌入别名
 *
 * @remarks
 * PostgREST 把挂在同一条嵌入上的过滤当作对同一行关联记录的条件。两条 exists 落到同一个嵌入上，
 * 「存在一笔满足 A 的、也存在一笔满足 B 的」就成了「存在一笔同时满足 A 与 B 的」，静默漏行；
 * SQLite / PGlite 把每条 exists 编成各自独立的 EXISTS 子查询。点路径过滤在那两端走 JOIN，同一关系上的
 * 点路径落在同一行，这里沿用关系名、共用一个嵌入，口径一致。
 *
 * 所以一层里某关系只被一条显式 exists 用到、且没有点路径用它时沿用关系名（单条 exists 的 select 与过滤不变）；
 * 否则这一层里它的每条显式 exists 各取 `<关系名>__<序号>`（序号是它在同名显式 exists 里的位置，从 1 起）。
 * 嵌套 exists 在父 exists 的嵌入里按同样规则再分配一次。select 构建与过滤编译都调用本函数，同一份
 * 条件得出同一份别名，嵌入与挂在它上面的过滤才对得上。
 */
export function assign_exists_aliases(ruleGroup: PlannedRuleGroup | undefined): ExistsAliases {
  const aliases = new Map<object, string>();
  assign_scope(ruleGroup, aliases);
  return aliases;
}

/** 一层嵌入里：按关系名归拢的显式 exists，以及被点路径用到的关系名 */
interface ScopeUsage {
  readonly existsByRelation: Map<string, PlannedRule[]>;
  readonly dottedRelations: Set<string>;
}

function assign_scope(ruleGroup: PlannedRuleGroup | undefined, aliases: Map<object, string>): void {
  const usage: ScopeUsage = { existsByRelation: new Map(), dottedRelations: new Set() };
  collect_scope_usage(ruleGroup, usage);
  for (const [relationName, rules] of usage.existsByRelation) {
    const exclusive = rules.length === 1 && !usage.dottedRelations.has(relationName);
    rules.forEach((rule, index) => {
      aliases.set(rule, exclusive ? relationName : `${relationName}__${index + 1}`);
      assign_scope(rule.where, aliases);
    });
  }
}

/** 收集一层嵌入里的关系用法；子组（AND / OR）与本层同属一个嵌入层 */
function collect_scope_usage(ruleGroup: PlannedRuleGroup | undefined, usage: ScopeUsage): void {
  for (const rule of ruleGroup?.rules ?? []) {
    if (isRuleGroup(rule)) {
      collect_scope_usage(rule as PlannedRuleGroup, usage);
      continue;
    }
    const { field, operator } = rule as PlannedRule;
    if (typeof field !== 'string') continue;
    if (field.includes('.')) {
      usage.dottedRelations.add(field.split('.')[0]);
      continue;
    }
    if (operator !== 'exists' && operator !== 'notExists') continue;
    const rules = usage.existsByRelation.get(field) ?? [];
    rules.push(rule as PlannedRule);
    usage.existsByRelation.set(field, rules);
  }
}
