import { get, isEqual, orderBy as orderByFn } from '@aiao/utils';
import { OrderBy } from '../repository/query-options.interface.js';
import { RuleGroup } from '../repository/query.interface.js';
import { RefreshMatchRules } from '../repository/QueryManager.interface.js';
import { RxDBError } from '../RxDBError.js';

/**
 * 计算结果
 */
export interface NeedRefreshResult {
  /**
   * 是否需要 sql 刷新
   */
  refresh: boolean;
  /**
   * 是否可以 JS 重新计算
   */
  recalculate: boolean;
}

interface RuntimeRule {
  field: string;
  operator: string;
  value?: unknown;
  where?: RuntimeRuleGroup;
}

interface RuntimeRuleGroup {
  combinator: 'and' | 'or';
  rules: Array<RuntimeRuleGroup | RuntimeRule>;
}

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

/**
 * 判断是否是 RuleGroup
 * @param value - 要检查的值
 * @returns 如果是 RuleGroup 则返回 true，否则返回 false
 */
export const isRuleGroup = (value: unknown): value is RuntimeRuleGroup =>
  isObject(value) && Boolean(Reflect.get(value, 'combinator'));

/**
 * 判断是否是 Rule
 * @param value - 要检查的值
 * @returns 如果是 Rule 则返回 true，否则返回 false
 */
export const isRule = (value: unknown): value is RuntimeRule => isObject(value) && Boolean(Reflect.get(value, 'field'));

/**
 * 判断是否是 EXISTS/NOT EXISTS 规则
 * @param rule - 要检查的规则
 * @returns 如果是 EXISTS/NOT EXISTS 规则则返回 true，否则返回 false
 */
export const isExistsRule = (
  rule: RuntimeRule
): rule is RuntimeRule & { operator: 'exists' | 'notExists'; where?: RuntimeRuleGroup } =>
  rule.operator === 'exists' || rule.operator === 'notExists';

const compareOrderValues = (left: unknown, right: unknown): number => {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  if ((left as string) < (right as string)) return -1;
  if ((left as string) > (right as string)) return 1;
  return 0;
};

const compareRuleValues = (left: unknown, right: unknown, operator: '>' | '>=' | '<' | '<='): boolean => {
  switch (operator) {
    case '>':
      return (left as string) > (right as string);
    case '>=':
      return (left as string) >= (right as string);
    case '<':
      return (left as string) < (right as string);
    case '<=':
      return (left as string) <= (right as string);
  }
};

/**
 * SQL 三值逻辑——NULL 参与比较的结果是 UNKNOWN，WHERE 只保留结果为 TRUE 的行，
 * UNKNOWN（不管外面是否套了 NOT）一律被排除。sqlite-core/pglite/supabase 三个适配器的
 * WHERE 构造器都只发出普通的取反操作符，没有为这些算子补 `OR col IS NULL`，字段缺失时
 * SQL 侧会排除该行；但 JS 侧此前是各算子零散的 fallback 行为（Array.includes(null) 恰好
 * false、null 被模板字符串转成 "null" 字符串、null 被 Number() 强转成 0 参与比较……）
 * 意外凑出和 SQL 不一致的结果，需要统一在这里短路。
 *
 * 不包含在这个集合里的操作符：
 * - `=`：isEqual(value, null) 已经正确处理——两边都是 null 时应该匹配（IS NULL 语义）。
 * - `null`/`notNull`：本来就是判空操作符。
 * - `exists`/`notExists`：判的是关系基数而非 SQL NULL 比较，关系未加载时 notExists 必须为 true。
 */
const NULL_EXCLUDED_OPERATORS = new Set([
  '!=',
  'in',
  'notIn',
  'between',
  'notBetween',
  'contains',
  'notContains',
  'startsWith',
  'notStartsWith',
  'endsWith',
  'notEndsWith',
  '>',
  '>=',
  '<',
  '<='
]);

/**
 * 判断实体数据是否匹配规则
 * @param rule - 规则
 * @param entity - 实体数据
 * @returns 如果匹配则返回 true，否则返回 false
 */
const get_entity_match_rule = (rule: RuntimeRule, entity: object): boolean => {
  // rule.field 可能是关系穿透路径（如 'branch.activated'，见 SchemaManager.getFieldRelations），
  // 与 isEntityEffectOrderBy 的深路径取值保持一致，用 get() 而非 Reflect.get 的字面量键查找。
  const entityValue = get(entity, rule.field) as unknown;
  const { operator } = rule;

  if ((entityValue === null || entityValue === undefined) && NULL_EXCLUDED_OPERATORS.has(operator)) {
    return false;
  }

  switch (operator) {
    case 'in':
    case 'notIn': {
      // 类型守卫：这些操作符的规则一定有 value 属性
      const value = rule.value as unknown[] & { includes: (candidate: unknown) => boolean };
      // entityValue 本身是数组时（stringArray/numberArray 属性），SQL 侧用 json_each 做逐元素
      // IN 匹配（数组与候选列表有交集即命中）；不能把整个数组当一个候选值做 includes——
      // 那是拿数组引用去跟候选值做严格相等比较，结构相同的数组几乎不可能命中。
      const matches =
        Array.isArray(entityValue) ? entityValue.some(item => value.includes(item)) : value.includes(entityValue);
      return operator === 'in' ? matches : !matches;
    }
    case 'between':
    case 'notBetween': {
      const value = rule.value as readonly [unknown, unknown];
      const inRange = compareRuleValues(entityValue, value[0], '>=') && compareRuleValues(entityValue, value[1], '<=');
      return operator === 'between' ? inRange : !inRange;
    }
    case 'contains':
    case 'notContains': {
      const { value } = rule;
      const contains = `${entityValue}`.includes(`${value}`);
      return operator === 'contains' ? contains : !contains;
    }
    case 'startsWith':
    case 'notStartsWith': {
      const { value } = rule;
      const startsWith = `${entityValue}`.startsWith(`${value}`);
      return operator === 'startsWith' ? startsWith : !startsWith;
    }
    case 'endsWith':
    case 'notEndsWith': {
      const { value } = rule;
      const endsWith = `${entityValue}`.endsWith(`${value}`);
      return operator === 'endsWith' ? endsWith : !endsWith;
    }
    case '=':
    case '!=': {
      const { value } = rule;
      const equal = isEqual(value, entityValue);
      return operator === '=' ? equal : !equal;
    }
    case '>':
    case '>=':
    case '<':
    case '<=': {
      return compareRuleValues(entityValue, rule.value, operator);
    }
    case 'exists':
    case 'notExists': {
      // EXISTS/NOT EXISTS 需要访问关系数据
      // 在 JS 增量计算中，如果关系数据已加载到 entityValue 中
      // 则可以检查是否存在匹配的关联实体

      // 获取子查询的 where 条件
      const subWhere = isExistsRule(rule) ? rule.where : undefined;

      if (Array.isArray(entityValue)) {
        // ONE_TO_MANY 或 MANY_TO_MANY: entityValue 是数组
        let matchingEntities = entityValue;

        // 如果有 where 条件，过滤关联实体
        if (subWhere) {
          matchingEntities = entityValue.filter(
            relatedEntity => isObject(relatedEntity) && is_entity_match_rule_group_or_rule(subWhere, relatedEntity)
          );
        }

        const hasMatch = matchingEntities.length > 0;
        return operator === 'exists' ? hasMatch : !hasMatch;
      } else if (entityValue !== null && entityValue !== undefined) {
        // MANY_TO_ONE 或 ONE_TO_ONE: entityValue 是单个对象

        // 如果有 where 条件，检查关联实体是否匹配
        if (subWhere) {
          const matches = is_entity_match_rule_group_or_rule(subWhere, entityValue as object);
          return operator === 'exists' ? matches : !matches;
        }

        return operator === 'exists';
      } else {
        // 关系未加载或为 null
        return operator === 'notExists';
      }
    }
    case 'null':
    case 'notNull': {
      // null/notNull 是 RuleOperatorNullable 的合法操作符（query.interface.ts），
      // 与 EXISTS 分支一致地把 null 与 undefined 都视作"空"
      const isNull = entityValue === null || entityValue === undefined;
      return operator === 'null' ? isNull : !isNull;
    }
    default:
      throw new RxDBError(`Unknown operator: ${operator}`);
  }
};

/**
 * 判断实体数据是否匹配规则
 */
const is_entity_match_rule_group_or_rule = (
  ruleOrRuleGroup: RuntimeRuleGroup | RuntimeRule,
  entity: object
): boolean => {
  if (isRuleGroup(ruleOrRuleGroup)) {
    const { combinator, rules } = ruleOrRuleGroup;
    if (combinator === 'and') {
      return rules.every(rule => is_entity_match_rule_group_or_rule(rule, entity));
    } else {
      // sqlite-core/pglite/supabase 三个 SQL 适配器对空 rules 数组一律当"无过滤条件"
      // 处理（省略 WHERE 子句，匹配全部行），不区分 and/or。JS 侧空 and 组用 Array.every 的
      // 空数组语义恰好也是 true，与 SQL 一致；但空 or 组用 Array.some 的空数组语义是 false
      // （不匹配任何实体），和 SQL 的"匹配全部"正好相反，必须显式对齐。
      if (rules.length === 0) return true;
      return rules.some(rule => is_entity_match_rule_group_or_rule(rule, entity));
    }
  } else {
    return get_entity_match_rule(ruleOrRuleGroup, entity);
  }
};

/**
 * 判断实体是否匹配规则组
 */
export const isEntityMatchWhere = <T>(entity: object | null | undefined, ruleGroup: RuleGroup<T>): boolean => {
  // INSERT 的 inversePatch 和 DELETE 的 patch 都是 null
  // null 不匹配任何 where 条件（因为实体不存在）
  if (entity === null || entity === undefined) {
    return false;
  }
  return is_entity_match_rule_group_or_rule(ruleGroup as unknown as RuntimeRuleGroup, entity);
};

/**
 * 判断实体是否有可能在排序后的结果中
 * @param entities 排序后的结果
 * @param entity 需要判断的实体
 * @param orderBy 排序
 * @returns
 */
const _is_entity_effect_order_by = <T>(entity: T, result: T[], orderBy: OrderBy<string>): undefined | boolean => {
  const { field, sort } = orderBy;
  const entityValue = get(entity, field);
  const direction = sort === 'asc' ? 1 : -1;
  let everyStrictlyBeyond = true;
  for (const item of result) {
    const comparison = compareOrderValues(entityValue, get(item, field)) * direction;
    if (comparison < 0) return true;
    if (comparison === 0) everyStrictlyBeyond = false;
  }
  return everyStrictlyBeyond ? false : undefined;
};

/**
 * 判断 entity 是否影响排序后的结果中
 * @param entities 排序后的结果
 * @param entity 需要判断的实体
 * @param orderByArray 排序数组
 * @returns 是否影响；判定不出来时返回 `true`（宁可多刷一次，不可漏刷）
 *
 * @remarks
 * 逐个排序键收敛：某个键判不出来（与结果集中的行并列）就把结果集裁到并列的那些行，
 * 再看下一个键。所有键都并列时位置无法确定 —— 新实体可能落在结果集中间任意位置，
 * 必须按「影响」处理。这里返回 `undefined` 会被调用方的 `.some(...)` 当成 `false`，
 * 查询不刷新，新建实体永远不出现在结果里。
 */
export const isEntityEffectOrderBy = <T extends object>(
  entity: object | null | undefined,
  result: T[],
  orderByArray: OrderBy<string>[]
): boolean => {
  if (!orderByArray || orderByArray.length === 0 || result.length === 0 || !entity) return true;
  for (let i = 0; i < orderByArray.length; i++) {
    const order_by = orderByArray[i];
    const is_effect = _is_entity_effect_order_by(entity, result, order_by);
    if (is_effect === undefined) {
      // 如果无法判断则继续看下面一个排序是否有影响。
      // 收窄并列集必须用与并列判定同一个**按值**的 comparator：用 `===` 是对象引用比较，
      // 两个表示同一时刻的不同 Date 对象会被判成不并列，并列集被清空，
      // 第二排序键从此不再参与判定（`createdAt asc, id asc` 下同时刻更小 id 的新行
      // 会被判成「无影响」，当前页不刷新）
      const { field } = order_by;
      const entityValue = get(entity, field);
      result = result.filter(e => compareOrderValues(get(e, field), entityValue) === 0);
    } else {
      return is_effect;
    }
  }
  return true;
};

/**
 * 计算排序
 * @param result
 * @param orderByArray
 * @returns
 */
export const calculateOrderBy = <T>(result: T[], orderBy: OrderBy<string>[]) =>
  orderByFn(
    result,
    orderBy.map(o => o.field),
    orderBy.map(o => o.sort)
  );

export const runMatches = (
  matches: { [key: string]: () => boolean },
  refresh_rules: RefreshMatchRules,
  recalculate_rules: RefreshMatchRules
): NeedRefreshResult => {
  // 判断是否需要 JS 重新计算
  const need_recalculate = run_matches(matches, recalculate_rules);
  // 判断是否需要 sql 刷新
  const need_refresh = need_recalculate === false && run_matches(matches, refresh_rules);

  return {
    refresh: need_refresh,
    recalculate: need_recalculate
  };
};

const run_matches = (matches: { [key: string]: () => boolean }, rules: RefreshMatchRules) =>
  rules.some(r => r.every(rule => matches[rule]()));
