import { describe, expect, it } from 'vitest';
import { calculateOrderBy, isEntityMatchWhere } from '../../query/query-matching.utils.js';

describe('review matching regression probes', () => {
  it('Q5 should sort nested keyValue paths by their actual values', () => {
    const values = [
      { id: 'a', settings: { rank: 20 } },
      { id: 'b', settings: { rank: 10 } }
    ];
    expect(calculateOrderBy(values, [{ field: 'settings.rank', sort: 'asc' }]).map(item => item.id)).toEqual([
      'b',
      'a'
    ]);
  });

  it('Q6 should reject a keyValue contains condition whose value does not match', () => {
    expect(
      isEntityMatchWhere(
        { settings: { theme: 'dark' } },
        {
          combinator: 'and',
          rules: [{ field: 'settings', operator: 'contains', value: { theme: 'light' } }]
        }
      )
    ).toBe(false);
  });
});
