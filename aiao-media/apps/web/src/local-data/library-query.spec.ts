import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { libraryQuery, libraryWhere, type LocalWorkFilters, type LocalWorkQuery } from './library-query';

function whereInTimezone(timezone: string, filters: LocalWorkFilters): unknown {
  const fixture = resolve(process.cwd(), 'src/local-data/library-query-timezone.fixture.mjs');
  return JSON.parse(
    execFileSync(process.execPath, [fixture, JSON.stringify(filters)], {
      env: { ...process.env, TZ: timezone },
      encoding: 'utf8'
    })
  );
}

describe('本机作品库查询契约', () => {
  it('页查询默认 24 项且按创建时间和唯一 ID 倒序排列', () => {
    expect(libraryQuery({})).toEqual({
      where: { combinator: 'and', rules: [{ field: 'stage', operator: 'in', value: ['ready', 'broken'] }] },
      orderBy: [
        { field: 'createdAt', sort: 'desc' },
        { field: 'id', sort: 'desc' }
      ],
      offset: 0,
      limit: 24
    });
    expect(libraryQuery({ offset: 24, limit: 12 })).toMatchObject({ offset: 24, limit: 12 });
  });

  it('搜索和模型使用独立字面 contains 条件，计数与页查询共用筛选', () => {
    const filters = { search: "  100%_森林'  ", model: ' Model_A ' };
    expect(libraryWhere(filters).rules).toEqual([
      { field: 'stage', operator: 'in', value: ['ready', 'broken'] },
      { field: 'prompt', operator: 'contains', value: "100%_森林'" },
      { field: 'modelId', operator: 'contains', value: 'Model_A' }
    ]);
    expect(libraryQuery(filters).where).toEqual(libraryWhere(filters));
    expect(libraryWhere({ search: ' \n ', model: '  ' }).rules).toHaveLength(1);
  });

  it('本地日期范围包含 from 当日和 to 整天，终点采用次日排除', () => {
    expect(whereInTimezone('Asia/Shanghai', { from: '2026-10-24', to: '2026-10-25' })).toEqual({
      combinator: 'and',
      rules: [
        { field: 'stage', operator: 'in', value: ['ready', 'broken'] },
        { field: 'createdAt', operator: '>=', value: '2026-10-23T16:00:00.000Z' },
        { field: 'createdAt', operator: '<', value: '2026-10-25T16:00:00.000Z' }
      ]
    });
    expect(libraryWhere({ from: '', to: '' }).rules).toHaveLength(1);
  });

  it('夏令时前进与回退日分别覆盖 23 和 25 小时', () => {
    expect(whereInTimezone('America/New_York', { from: '2026-03-08', to: '2026-03-08' })).toEqual({
      combinator: 'and',
      rules: [
        { field: 'stage', operator: 'in', value: ['ready', 'broken'] },
        { field: 'createdAt', operator: '>=', value: '2026-03-08T05:00:00.000Z' },
        { field: 'createdAt', operator: '<', value: '2026-03-09T04:00:00.000Z' }
      ]
    });
    expect(whereInTimezone('America/New_York', { from: '2026-11-01', to: '2026-11-01' })).toEqual({
      combinator: 'and',
      rules: [
        { field: 'stage', operator: 'in', value: ['ready', 'broken'] },
        { field: 'createdAt', operator: '>=', value: '2026-11-01T04:00:00.000Z' },
        { field: 'createdAt', operator: '<', value: '2026-11-02T05:00:00.000Z' }
      ]
    });
  });

  it('拒绝非法日历日、隐式日期格式和反向范围', () => {
    for (const day of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-01', 'not-a-day'])
      expect(() => libraryWhere({ from: day })).toThrow('日期');
    expect(() => libraryWhere({ from: '2026-10-25', to: '2026-10-24' })).toThrow('日期');
    expect(() => libraryWhere({ from: '2024-02-29', to: '2024-02-29' })).not.toThrow();
  });

  it('拒绝非法分页参数，不将错误输入默默变成另一页', () => {
    for (const limit of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => libraryQuery({ limit })).toThrow('分页');
    for (const offset of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => libraryQuery({ offset })).toThrow('分页');
  });

  it('查询参数在编译后不被规则对象反向改写', () => {
    const input: LocalWorkQuery = { search: '森林', model: 'm', limit: 4, offset: 4 };
    const copy = structuredClone(input);
    libraryQuery(input);
    expect(input).toEqual(copy);
  });
});
