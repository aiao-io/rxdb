import { describe, expect, it } from 'vitest';

import { PropertyType } from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { isRuleGroup } from '../../query/query-matching.utils.js';
import { whereUsesRelations } from '../../query/query-relation.utils.js';
import type { RuleGroup } from '../../repository/query.interface.js';

/**
 * `isRuleGroup` 是**公开导出**的类型谓词（`index.ts:61`），断言 `value is RuntimeRuleGroup`
 * ——那个类型要求 `combinator` 取值只能是 `'and' | 'or'`，且 `rules` 是数组。
 *
 * 谓词一旦比它断言的类型宽，下游就会拿着一个类型系统说「已经验过」的值去访问
 * 根本不存在的成员。本文件钉住两条：谓词不得比 `RuntimeRuleGroup` 宽，
 * 以及紧邻的消费方 `whereUsesRelations` 不会因为放行而在 `rules` 上抛 TypeError。
 *
 * 同一个包里另有一份**深校验**的私有同名副本（`repository/QueryTask.ts`），
 * 那份还要逐条递归校验 `rules` 的元素。两份职责不同（浅层判别 vs 深层校验），
 * 但浅层这份也必须把它声明的形状校验完整，而不是只看 `combinator` 真不真。
 */
describe('isRuleGroup 不得比它断言的类型宽', () => {
  it('combinator 不在 and/or 里就不是 RuleGroup', () => {
    expect(isRuleGroup({ combinator: 'xor', rules: [] })).toBe(false);
    expect(isRuleGroup({ combinator: 'AND', rules: [] })).toBe(false);
    expect(isRuleGroup({ combinator: 1, rules: [] })).toBe(false);
  });

  it('缺 rules 数组就不是 RuleGroup', () => {
    expect(isRuleGroup({ combinator: 'and' })).toBe(false);
    expect(isRuleGroup({ combinator: 'and', rules: 'nope' })).toBe(false);
  });

  it('合法的 RuleGroup 仍然放行（含空 rules 与嵌套）', () => {
    expect(isRuleGroup({ combinator: 'and', rules: [] })).toBe(true);
    expect(isRuleGroup({ combinator: 'or', rules: [{ field: 'a', operator: '=', value: 1 }] })).toBe(true);
    expect(isRuleGroup({ combinator: 'and', rules: [{ combinator: 'or', rules: [] }] })).toBe(true);
  });

  it('非对象一律不是 RuleGroup', () => {
    expect(isRuleGroup(null)).toBe(false);
    expect(isRuleGroup(undefined)).toBe(false);
    expect(isRuleGroup('and')).toBe(false);
  });

  it('放行残缺形状会让 whereUsesRelations 抛 TypeError（这是收紧的直接理由）', () => {
    const metadata = transitionMetadata({
      namespace: 'test',
      name: 'Guarded',
      tableName: 'guarded',
      properties: [{ name: 'id', type: PropertyType.string, primary: true }],
      relations: []
    });

    // `{ combinator: 'and' }` 没有 rules：旧谓词放行后 `for (const rule of rg.rules)` 直接炸
    const malformed = { combinator: 'and' } as unknown as RuleGroup<object>;
    expect(() => whereUsesRelations(malformed, metadata)).not.toThrow();
    expect(whereUsesRelations(malformed, metadata)).toBe(false);
  });
});
