import { isRule, isRuleGroup, type QueryBuilderRule, type QueryBuilderRuleGroup } from './query-builder-state.js';

describe('isRuleGroup', () => {
  it('returns true for a rule group', () => {
    const group: QueryBuilderRuleGroup = {
      id: 'g1',
      combinator: 'and',
      rules: []
    };
    expect(isRuleGroup(group)).toBe(true);
  });

  it('returns false for a rule', () => {
    const rule: QueryBuilderRule = {
      id: 'r1',
      field: 'name',
      operator: '=',
      value: 'Ada'
    };
    expect(isRuleGroup(rule as QueryBuilderRule | QueryBuilderRuleGroup)).toBe(false);
  });

  it('returns true for nested group', () => {
    const group: QueryBuilderRuleGroup = {
      id: 'g2',
      combinator: 'or',
      rules: [
        { id: 'r1', field: 'name', operator: '=', value: 'Ada' },
        { id: 'g3', combinator: 'and', rules: [] }
      ]
    };
    expect(isRuleGroup(group)).toBe(true);
    expect(isRuleGroup(group.rules[0])).toBe(false);
    expect(isRuleGroup(group.rules[1])).toBe(true);
  });
});

describe('isRule', () => {
  it('returns true for a rule', () => {
    const rule: QueryBuilderRule = {
      id: 'r1',
      field: 'age',
      operator: '>',
      value: 18
    };
    expect(isRule(rule as QueryBuilderRule | QueryBuilderRuleGroup)).toBe(true);
  });

  it('returns false for a rule group', () => {
    const group: QueryBuilderRuleGroup = {
      id: 'g1',
      combinator: 'and',
      rules: []
    };
    expect(isRule(group)).toBe(false);
  });

  it('returns true for rule with where subquery', () => {
    const rule: QueryBuilderRule = {
      id: 'r1',
      field: 'orders',
      operator: 'exists'
    };
    expect(isRule(rule as QueryBuilderRule | QueryBuilderRuleGroup)).toBe(true);
  });
});
