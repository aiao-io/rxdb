import { describe, expect, it } from 'vitest';

import { activeRuleCount, buildFilterRules, emptyFilterState, type RecipeFilterState } from './filter-rules';

const state = (patch: Partial<RecipeFilterState> = {}): RecipeFilterState => ({ ...emptyFilterState(), ...patch });

describe('buildFilterRules', () => {
  it('什么都没填时给出空规则组（后端编译成 1 = 1）', () => {
    expect(buildFilterRules(emptyFilterState())).toEqual({ combinator: 'and', rules: [] });
  });

  it('title 走 contains', () => {
    expect(buildFilterRules(state({ titleContains: 'Soup' })).rules).toEqual([
      { field: 'title', operator: 'contains', value: 'Soup' }
    ]);
  });

  it('status 走 =', () => {
    expect(buildFilterRules(state({ status: 'published' })).rules).toEqual([
      { field: 'status', operator: '=', value: 'published' }
    ]);
  });

  it('tags 走 in，且 value 是数组', () => {
    const [rule] = buildFilterRules(state({ tags: ['dessert', 'soup'] })).rules;
    expect(rule).toEqual({ field: 'tag', operator: 'in', value: ['dessert', 'soup'] });
  });

  it('price 上下界齐全时走 between，value 是 2 元组', () => {
    expect(buildFilterRules(state({ priceMin: '10', priceMax: '20' })).rules).toEqual([
      { field: 'price', operator: 'between', value: [10, 20] }
    ]);
  });

  it('tagIsNull 走 null，且不带 value 字段', () => {
    const [rule] = buildFilterRules(state({ tagIsNull: true })).rules;
    expect(rule).toEqual({ field: 'tag', operator: 'null' });
    expect(Object.hasOwn(rule as object, 'value')).toBe(false);
  });

  it('五类算子能同时组合出来（AC#3 的全集）', () => {
    const group = buildFilterRules(
      state({ titleContains: 'a', status: 'draft', tags: ['soup'], priceMin: '1', priceMax: '2' })
    );
    expect(group.combinator).toBe('and');
    expect(group.rules.map(rule => (rule as { operator: string }).operator)).toEqual([
      'contains',
      '=',
      'in',
      'between'
    ]);
  });

  describe('between 要求上下界成对', () => {
    it.each([
      ['只有下界', { priceMin: '10' }],
      ['只有上界', { priceMax: '20' }],
      ['下界不是数', { priceMin: 'abc', priceMax: '20' }],
      ['上界不是数', { priceMin: '10', priceMax: '' }]
    ])('%s → 整条不下发', (_label, patch) => {
      expect(buildFilterRules(state(patch)).rules).toEqual([]);
    });

    it('0 是合法边界，不能被当成"没填"', () => {
      expect(buildFilterRules(state({ priceMin: '0', priceMax: '0' })).rules).toEqual([
        { field: 'price', operator: 'between', value: [0, 0] }
      ]);
    });
  });

  it('tagIsNull 压过 tags：两者互斥，同时下发只会得到恒空结果集', () => {
    const group = buildFilterRules(state({ tagIsNull: true, tags: ['soup'] }));
    expect(group.rules).toEqual([{ field: 'tag', operator: 'null' }]);
  });
});

describe('activeRuleCount', () => {
  it('数的是真正下发的规则条数，不是填了几个控件', () => {
    // priceMin 填了但 priceMax 没填 → 不算一条
    expect(activeRuleCount(state({ status: 'draft', priceMin: '10' }))).toBe(1);
  });
});
