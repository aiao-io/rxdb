/**
 * 日期集合条件按时间点判定成员（RV-01a1bb09c0a77b9290e282880d8c1bf4）。
 *
 * `DateRules` 公开支持 `in` / `notIn`，SQL 按时间值匹配；JS 增量匹配若用 `Array.includes`
 * 的引用相等，实体水合出来的 `Date` 与规则里的 `Date` 永远不是同一个对象，已由 SQL 命中的行
 * 在一次无关更新之后被移出活查询。与 `=` 的日期分支同口径：任一侧为 `Date` 即按时间点比。
 */
import type { Subscription } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { isEntityMatchWhere } from '../../query/query-matching.utils.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import { EntityLocalUpdatedEvent } from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';
import { createMockAdapter, type MockLocalAdapter } from '../fixtures/test-db-setup.js';
import { Tag, TEST_ENTITIES } from '../fixtures/test-entities.js';

const instant = '2026-01-01T00:00:00.000Z';
const other = '2026-02-01T00:00:00.000Z';
const ruleOn = (operator: 'in' | 'notIn', value: unknown[]) =>
  ({ combinator: 'and', rules: [{ field: 'when', operator, value }] }) as unknown as RuleGroup<object>;

describe('in / notIn 的日期成员判定', () => {
  it('不同 Date 引用、同一时间点算命中', () => {
    expect(isEntityMatchWhere({ when: new Date(instant) }, ruleOn('in', [new Date(instant)]))).toBe(true);
    expect(isEntityMatchWhere({ when: new Date(instant) }, ruleOn('notIn', [new Date(instant)]))).toBe(false);
  });

  it('实体侧是触发器透传的 ISO 字符串、毫秒数时同样按时间点比', () => {
    expect(isEntityMatchWhere({ when: instant }, ruleOn('in', [new Date(instant)]))).toBe(true);
    expect(isEntityMatchWhere({ when: Date.parse(instant) }, ruleOn('in', [new Date(instant)]))).toBe(true);
    expect(isEntityMatchWhere({ when: instant }, ruleOn('notIn', [new Date(other)]))).toBe(true);
  });

  it('不同时间点不命中；候选里的 null 不参与日期比较', () => {
    expect(isEntityMatchWhere({ when: new Date(instant) }, ruleOn('in', [new Date(other)]))).toBe(false);
    expect(isEntityMatchWhere({ when: new Date(instant) }, ruleOn('in', [null, new Date(instant)]))).toBe(true);
  });

  it('普通标量保持原语义', () => {
    expect(isEntityMatchWhere({ when: 'a' }, ruleOn('in', ['a', 'b']))).toBe(true);
    expect(isEntityMatchWhere({ when: 1 }, ruleOn('in', ['1']))).toBe(false);
    expect(isEntityMatchWhere({ when: Number.NaN }, ruleOn('in', [Number.NaN]))).toBe(true);
    expect(isEntityMatchWhere({ when: ['x', 'y'] }, ruleOn('in', ['y']))).toBe(true);
  });
});

describe('日期 in 条件的活查询', () => {
  let database: RxDB;
  let adapter: MockLocalAdapter;
  const subscriptions: Subscription[] = [];

  afterEach(async () => {
    for (const subscription of subscriptions.splice(0)) subscription.unsubscribe();
    await database.destroy();
    vi.unstubAllGlobals();
  });

  it('SQL 已命中的行在无关字段的外部更新之后仍在结果里', async () => {
    vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
      callback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
      return 1;
    });
    database = new RxDB({
      dbName: `date-in-matching-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      entities: TEST_ENTITIES,
      multiInstance: false,
      sync: { local: { adapter: 'mock' }, type: SyncType.None }
    });
    database.adapter('mock', db => {
      adapter = createMockAdapter(db);
      return adapter;
    });
    await database.connect('mock');

    const id = '00000000-0000-7000-8000-00000000d001';
    const tag = database.entityManager.createEntityRef(
      Tag,
      {
        id,
        name: 'original',
        color: '#000000',
        createdAt: new Date(instant),
        updatedAt: new Date(instant),
        createdBy: null,
        updatedBy: null
      } as never,
      { modified: false, local: true }
    );
    const stub = adapter.stubEntityRepository(Tag, [tag]);
    const seen: string[][] = [];
    subscriptions.push(
      database.entityManager
        .getRepository(Tag)
        .findAll({
          where: {
            combinator: 'and',
            rules: [{ field: 'createdAt', operator: 'in', value: [new Date(instant)] }]
          }
        })
        .subscribe(rows => seen.push(rows.map(row => row.id)))
    );
    await vi.waitFor(() => expect(seen).toEqual([[id]]));

    database.dispatchEvent(
      new EntityLocalUpdatedEvent([
        {
          type: 'UPDATE',
          namespace: 'public',
          entity: 'Tag',
          id,
          patch: { name: 'external', updatedAt: new Date(other) },
          inversePatch: { name: 'original', updatedAt: new Date(instant) },
          recordAt: new Date(other)
        }
      ])
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(seen.at(-1)).toEqual([id]);
    expect(stub.find).toHaveBeenCalledTimes(1);
  });
});
