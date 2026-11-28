import { describe, expect, it } from 'vitest';
import { bucketLabel, bucketOf, groupByBucket } from './catalog-view';

const tenants = [
  { id: 'jiguang', name: '极光百货' },
  { id: 'xinghe', name: '星河零售' }
];

describe('bucketOf', () => {
  it('与服务端的生成列同一口径：公开在 public 区，内部商品在所属租户的区', () => {
    expect(bucketOf({ visibility: 'public', tenantId: 'xinghe' })).toBe('public');
    expect(bucketOf({ visibility: 'tenant', tenantId: 'xinghe' })).toBe('tenant:xinghe');
  });
});

describe('bucketLabel', () => {
  it('公开区、租户区、个人区与不认识的区', () => {
    expect(bucketLabel('public', tenants)).toBe('公开');
    expect(bucketLabel('tenant:xinghe', tenants)).toBe('租户 · 星河零售');
    expect(bucketLabel('tenant:unknown', tenants)).toBe('租户 · unknown');
    expect(bucketLabel('user:00000000-0000-4000-8000-0000000000a1', tenants)).toBe('个人区');
    expect(bucketLabel('other', tenants)).toBe('other');
  });
});

describe('groupByBucket', () => {
  it('公开区在前，租户区按名字排；组内保持原顺序', () => {
    const items = [
      { id: '1', visibility: 'tenant' as const, tenantId: 'xinghe' },
      { id: '2', visibility: 'public' as const, tenantId: 'jiguang' },
      { id: '3', visibility: 'tenant' as const, tenantId: 'jiguang' },
      { id: '4', visibility: 'public' as const, tenantId: 'xinghe' }
    ];

    expect(
      groupByBucket(items, tenants).map(group => ({ label: group.label, ids: group.items.map(item => item.id) }))
    ).toEqual([
      { label: '公开', ids: ['2', '4'] },
      { label: '租户 · 极光百货', ids: ['3'] },
      { label: '租户 · 星河零售', ids: ['1'] }
    ]);
  });

  it('没有行就没有分组', () => {
    expect(groupByBucket([], tenants)).toEqual([]);
  });
});
