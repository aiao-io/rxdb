/**
 * @fileoverview 实体元数据层的声明式存储约束类型
 *
 * CHECK（属性级 / 实体级）、条件唯一索引的 `where` 与区间排他共用的声明形状。
 * 复用的是查询 {@link RuleGroupBase} 的递归壳——CHECK 只看单行，操作符收窄为白名单，
 * 另补查询规则里没有的字段对字段比较 `ref`。声明校验见 `metadata-validate.ts`，
 * DDL 编译见 {@link ./check-sql.ts}。
 */

import type { RuleGroupBase } from '../repository/query.interface.js';

/**
 * CHECK 与条件唯一 `where` 允许的操作符白名单
 *
 * 只收单行确定性比较：`exists` 系要子查询，`contains` / `startsWith` / `endsWith`
 * 系在两后端的单行语义不一致，一律在元数据期拒绝。
 */
export type CheckOperatorName = '=' | '!=' | '<' | '>' | '<=' | '>=' | 'in' | 'notIn' | 'between' | 'notBetween' | 'null' | 'notNull';

/**
 * 单行约束规则（CHECK / `where` 的叶子）
 *
 * 比较操作符（`=` `!=` `<` `>` `<=` `>=`）二选一取值：同实体另一列用 `ref`，字面量用 `value`；
 * `in` / `notIn` 用 `values`，`between` / `notBetween` 用 `low` / `high`，`null` / `notNull` 不带值。
 * 字面量只进 DDL，不占位符，按 {@link ../system/sql-literal.ts} 的口径「转不动就拒绝」。
 */
export interface CheckRule {
  /** 本实体属性名（属性级 `check` 省略，编译时回填）。 */
  field: string;
  operator: CheckOperatorName;
  /** 比较操作符的字面量。 */
  value?: unknown;
  /** `in` / `notIn` 的字面量列表。 */
  values?: unknown[];
  /** `between` / `notBetween` 的下界。 */
  low?: unknown;
  /** `between` / `notBetween` 的上界。 */
  high?: unknown;
  /** 字段对字段比较：指向同实体的另一列，只配比较操作符。 */
  ref?: string;
}

/**
 * CHECK 规则组
 *
 * 复用查询 {@link RuleGroupBase} 的递归形状（`combinator` + `rules`），叶子收窄为 {@link CheckRule}。
 */
export type CheckRuleGroup = RuleGroupBase<unknown, string, CheckRule>;

/**
 * 属性级 `check`：省略 `field` 的单条规则，编译成以属性名为 `name` 的实体级 CHECK。
 */
export type PropertyCheckRule = Omit<CheckRule, 'field'>;

/**
 * 实体级 CHECK 声明
 */
export interface EntityCheckMetadataOptions {
  /**
   * 约束名
   *
   * 限 `[a-z][a-z0-9_]*`，完整约束名（`ck_` + 表名 + 本名 + 表达式哈希）不得超 63 UTF-8 字节。
   * 继承时同名项子实体覆盖父实体。
   */
  name: Uncapitalize<string>;
  rule: CheckRuleGroup;
}

/**
 * 区间排他的一个区间维
 *
 * 区间列只接受时间类与整数列；端点 NULL 即该侧无界，两后端一致。
 */
export interface ExclusionRangeDimension {
  /** 区间起点列。 */
  from: string;
  /** 区间终点列。 */
  to: string;
  /** 端点闭合性：`[)` 半开（相邻不冲突）或 `[]` 全闭。 */
  bounds: '[)' | '[]';
}

/**
 * 区间排他声明：「相等列 + 区间维」，全部维同时相交才算冲突
 */
export interface EntityExclusionMetadataOptions {
  /**
   * 约束名
   *
   * 同 {@link EntityCheckMetadataOptions.name}，完整约束名以 `ex_` 起头；
   * SQLite 侧的触发器名为约束名加 `_i` / `_u`，同进漂移比对。
   */
  name: Uncapitalize<string>;
  /** 相等列，至少一列；NULL 与 NULL 不相等（与 PG `EXCLUDE` 一致）。 */
  equal: [string, ...string[]];
  /** 区间维，至少一维。 */
  ranges: [ExclusionRangeDimension, ...ExclusionRangeDimension[]];
}
