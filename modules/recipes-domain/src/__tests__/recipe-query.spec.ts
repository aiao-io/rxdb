import { describe, expect, it } from 'vitest';

import type { RecipeRowLike } from '../recipe-query.js';
import { RECIPE_ORDER_BY, buildRecipePageQuery, toRecipeMetadataRow, toRecipeWireRow } from '../recipe-query.js';

/**
 * 前后端共用的 wire 序列化与分页查询构造器（A9）。
 *
 * @remarks
 * 这几个函数是**两端约定的形状定义**：改错了前端和后端一起错，而且要到跑起来才发现。
 * 因此这份 spec 钉的是「对外承诺」而不是实现——字段集恰好是哪几个、时间戳是什么形态、
 * 排序常量是什么、调用方拿到的 `orderBy` 能不能安全改。
 */

const CREATED_AT = new Date('2026-03-01T08:30:00.000Z');
const UPDATED_AT = new Date('2026-03-02T09:45:12.345Z');

const row: RecipeRowLike = {
  id: 'recipe-1',
  title: '番茄炒蛋',
  status: 'published',
  price: 12.5,
  tag: null,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT
};

describe('RECIPE_ORDER_BY', () => {
  it('是 updatedAt 升序 + id 升序——同 updatedAt 的行靠 id 定序，跨页才稳定', () => {
    expect(RECIPE_ORDER_BY).toEqual([
      { field: 'updatedAt', sort: 'asc' },
      { field: 'id', sort: 'asc' }
    ]);
  });
});

describe('buildRecipePageQuery', () => {
  it('原样带上 where / limit / offset，并附上共用排序', () => {
    const where = { combinator: 'and', rules: [{ field: 'status', operator: '=', value: 'draft' }] };

    expect(buildRecipePageQuery(where, 20, 40)).toEqual({
      where,
      orderBy: [
        { field: 'updatedAt', sort: 'asc' },
        { field: 'id', sort: 'asc' }
      ],
      limit: 20,
      offset: 40
    });
  });

  it('limit / offset 为 0 时原样透传，不被当成「没给」吞掉', () => {
    const query = buildRecipePageQuery(undefined, 0, 0);

    expect(query.limit).toBe(0);
    expect(query.offset).toBe(0);
  });

  it('where 原样透传同一个引用，不做拷贝或归一', () => {
    const where = { combinator: 'and', rules: [] };

    expect(buildRecipePageQuery(where, 1, 0).where).toBe(where);
  });

  it('每次给出可改的 orderBy 副本，调用方改它不会污染共享常量或彼此', () => {
    const first = buildRecipePageQuery(undefined, 10, 0);
    const second = buildRecipePageQuery(undefined, 10, 0);

    expect(first.orderBy).not.toBe(RECIPE_ORDER_BY);
    expect(first.orderBy).not.toBe(second.orderBy);
    expect(first.orderBy[0]).not.toBe(second.orderBy[0]);

    first.orderBy.pop();

    expect(second.orderBy).toEqual([
      { field: 'updatedAt', sort: 'asc' },
      { field: 'id', sort: 'asc' }
    ]);
    expect(RECIPE_ORDER_BY).toEqual([
      { field: 'updatedAt', sort: 'asc' },
      { field: 'id', sort: 'asc' }
    ]);
  });
});

describe('toRecipeWireRow', () => {
  it('给出完整 wire 行，时间戳定型成 ISO 串', () => {
    expect(toRecipeWireRow(row)).toEqual({
      id: 'recipe-1',
      title: '番茄炒蛋',
      status: 'published',
      price: 12.5,
      tag: null,
      createdAt: '2026-03-01T08:30:00.000Z',
      updatedAt: '2026-03-02T09:45:12.345Z'
    });
  });

  it('字段集恰好是这七个：实体上的审计字段不得漏到 wire 上', () => {
    const withAudit: RecipeRowLike & { createdBy: string; updatedBy: string; branchId: string } = {
      ...row,
      createdBy: 'user-1',
      updatedBy: 'user-2',
      branchId: 'main'
    };

    expect(Object.keys(toRecipeWireRow(withAudit)).sort()).toEqual([
      'createdAt',
      'id',
      'price',
      'status',
      'tag',
      'title',
      'updatedAt'
    ]);
  });

  it('tag 的 null 原样保留，不塌成空串或 undefined', () => {
    expect(toRecipeWireRow({ ...row, tag: null }).tag).toBeNull();
    expect(toRecipeWireRow({ ...row, tag: '快手菜' }).tag).toBe('快手菜');
  });
});

describe('toRecipeMetadataRow', () => {
  it('只回 id 与 updatedAt——协议要的就是做新鲜度比较的最小集合', () => {
    expect(toRecipeMetadataRow(row)).toEqual({ id: 'recipe-1', updatedAt: '2026-03-02T09:45:12.345Z' });
    expect(Object.keys(toRecipeMetadataRow(row)).sort()).toEqual(['id', 'updatedAt']);
  });

  it('updatedAt 与完整行逐字一致——两端拿 metadata 比新鲜度的前提', () => {
    expect(toRecipeMetadataRow(row).updatedAt).toBe(toRecipeWireRow(row).updatedAt);
  });

  it('毫秒不被截断：同秒内的两次写入必须给出不同的 updatedAt', () => {
    const earlier = toRecipeMetadataRow({ ...row, updatedAt: new Date('2026-03-02T09:45:12.001Z') });
    const later = toRecipeMetadataRow({ ...row, updatedAt: new Date('2026-03-02T09:45:12.002Z') });

    expect(earlier.updatedAt).toBe('2026-03-02T09:45:12.001Z');
    expect(later.updatedAt).not.toBe(earlier.updatedAt);
  });
});
