/**
 * @fileoverview Query 转换服务
 * 在 QueryBuilder 状态和 RxDB Query 之间进行双向转换
 */

import type { Rule, RuleGroup } from '@aiao/rxdb';
import type { QueryBuilderRule, QueryBuilderRuleGroup, QueryBuilderState } from '../models/query-builder-state.js';
import { isRuleGroup } from '../models/query-builder-state.js';
import { generateId } from '../utils/id.js';

/**
 * 转换选项
 */
export interface QueryConverterOptions {
  /**
   * ID 生成器
   * @default generateId()
   */
  idGenerator?: () => string;
}

/**
 * Query 转换服务
 * 负责 QueryBuilder 状态与 RxDB Query 之间的双向转换
 */
export class QueryConverter<T = Record<string, unknown>> {
  private readonly idGenerator: () => string;

  /** 不需要 value 字段的操作符 */
  private readonly noValueOperators = new Set(['null', 'notNull', 'exists', 'notExists']);

  /** @param options - 转换器配置 */
  constructor(options: QueryConverterOptions = {}) {
    this.idGenerator = options.idGenerator ?? generateId;
  }

  /**
   * 将 QueryBuilder 状态转换为 RxDB Query
   *
   * @param state - QueryBuilder 状态
   * @returns RxDB RuleGroup 查询对象
   *
   * @example
   * ```typescript
   * const converter = new QueryConverter<User>();
   * const query = converter.toRxDBQuery(queryBuilderState);
   * // { combinator: 'and', rules: [...] }
   * ```
   */
  toRxDBQuery(state: QueryBuilderState<T>): RuleGroup<T> {
    return this.convertGroupToRxDB(state.rootGroup);
  }

  /**
   * 将 RxDB Query 转换为 QueryBuilder 状态
   *
   * @param query - RxDB RuleGroup 查询对象
   * @returns QueryBuilder 状态
   *
   * @example
   * ```typescript
   * const converter = new QueryConverter<User>();
   * const state = converter.fromRxDBQuery(rxdbQuery);
   * ```
   */
  fromRxDBQuery(query: RuleGroup<T>): QueryBuilderState<T> {
    if (!query) {
      return { rootGroup: { id: this.idGenerator(), combinator: 'and', rules: [] } };
    }
    return {
      rootGroup: this.convertGroupFromRxDB(query)
    };
  }

  /**
   * 转换单个规则组到 RxDB 格式
   */
  private convertGroupToRxDB(group: QueryBuilderRuleGroup<T>): RuleGroup<T> {
    const rules: Array<RuleGroup<T> | Rule<T>> = [];

    for (const item of group.rules) {
      if (isRuleGroup<T>(item)) {
        rules.push(this.convertGroupToRxDB(item));
      } else {
        rules.push(this.convertRuleToRxDB(item));
      }
    }

    return {
      combinator: group.combinator,
      rules
    };
  }

  /**
   * 转换单条规则到 RxDB 格式
   * 移除 QueryBuilder 特有的 id 字段，以及无值操作符的 value 字段
   */
  private convertRuleToRxDB(rule: QueryBuilderRule<T>): Rule<T> {
    const source = rule as unknown as Record<string, unknown>;
    const operator = source['operator'] as string;
    const omitValue = this.noValueOperators.has(operator);
    const result: Record<string, unknown> = {};
    for (const key in source) {
      if (key === 'id') continue;
      if (omitValue && key === 'value') continue;
      result[key] = source[key];
    }
    return result as unknown as Rule<T>;
  }

  /**
   * 从 RxDB 格式转换规则组
   */
  private convertGroupFromRxDB(group: RuleGroup<T>): QueryBuilderRuleGroup<T> {
    const rules: Array<QueryBuilderRuleGroup<T> | QueryBuilderRule<T>> = [];

    for (const item of group.rules ?? []) {
      if ('combinator' in item && 'rules' in item) {
        rules.push(this.convertGroupFromRxDB(item as RuleGroup<T>));
      } else {
        rules.push(this.convertRuleFromRxDB(item as Rule<T>));
      }
    }

    return {
      id: this.idGenerator(),
      combinator: group.combinator,
      rules
    };
  }

  /**
   * 从 RxDB 格式转换单条规则
   * 添加 QueryBuilder 需要的 id 字段
   */
  private convertRuleFromRxDB(rule: Rule<T>): QueryBuilderRule<T> {
    return {
      id: this.idGenerator(),
      ...rule
    } as QueryBuilderRule<T>;
  }
}

/**
 * 创建 QueryConverter 实例的工厂函数
 *
 * @param options - 转换选项
 * @returns 新的 QueryConverter 实例
 */
export function createQueryConverter<T = Record<string, unknown>>(options?: QueryConverterOptions): QueryConverter<T> {
  return new QueryConverter<T>(options);
}
