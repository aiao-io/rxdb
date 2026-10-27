import { firstValueFrom, Observable, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { UUID } from '../../entity/entity.interface.js';
import { calculateOrderBy, isEntityMatchWhere } from '../../query/query-matching.utils.js';
import { getFingerprintByEntities, getFingerprintPrimitive } from '../../repository/fingerprint.utils.js';
import type { FindByCursorOptions } from '../../repository/query-options.interface.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import { QueryManager } from '../../repository/QueryManager.js';
import { EntityLocalUpdatedEvent } from '../../rxdb-events.js';
import { getEntityStatus } from '../../rxdb-utils.js';
import { createTestDB, flushMicrotasks } from '../fixtures/test-db-setup.js';
import { User } from '../fixtures/test-entities.js';

describe('代码评审仓储复现', () => {
  it('最后一个订阅者离开后，应退订仍存活的 runner', async () => {
    const { rxdb, cleanup } = await createTestDB({ entities: [User] });
    const manager = new QueryManager(rxdb, User);
    const release = vi.fn();
    const task = manager.createTask({
      options: { type: 'count', options: { where: { combinator: 'and', rules: [] } } },
      runner: () =>
        new Observable<number>(observer => {
          observer.next(1);
          return release;
        }),
      getFingerprint: getFingerprintPrimitive
    });
    try {
      expect(await firstValueFrom(task.result$)).toBe(1);
      expect(task.observerCount).toBe(0);
      expect(release).toHaveBeenCalledOnce();
    } finally {
      manager.destroy();
      await cleanup();
    }
  });

  it('再次查询已编辑实体后，save 仍应提交未保存补丁', async () => {
    const { rxdb, adapter, cleanup } = await createTestDB({ entities: [User] });
    const row = {
      id: '00000000-0000-0000-0000-000000000099' as UUID,
      name: '原始值',
      email: 'review@example.com',
      role: 'user',
      isActive: true
    };
    const local = adapter.stubEntityRepository(User);
    vi.mocked(local.find).mockImplementation(async () => [
      rxdb.entityManager.createEntityRef(User, row, { local: true, modified: false })
    ]);
    const repository = rxdb.entityManager.getRepository(User);
    try {
      const user = await firstValueFrom(repository.get(row.id));
      user.name = '未保存编辑';
      expect(getEntityStatus(user).modified).toBe(true);

      const same = await firstValueFrom(repository.get(row.id));
      expect(same).toBe(user);
      expect(same.name).toBe('未保存编辑');
      expect.soft(getEntityStatus(user).modified).toBe(true);
      await user.save();
      expect(local.update).toHaveBeenCalledOnce();
    } finally {
      await cleanup();
    }
  });

  it('updatedAt 单字段事件也应更新依赖该字段的 count 查询', async () => {
    const { rxdb, cleanup } = await createTestDB({ entities: [User] });
    const manager = new QueryManager(rxdb, User);
    const oldDate = new Date('2025-01-01T00:00:00.000Z');
    const newDate = new Date('2025-01-03T00:00:00.000Z');
    const cutoff = new Date('2025-01-02T00:00:00.000Z');
    const id = '00000000-0000-0000-0000-000000000098';
    rxdb.entityManager.createEntityRef(User, { id, updatedAt: oldDate }, { local: true, modified: false });
    let authoritativeCount = 0;
    const seen: number[] = [];
    const task = manager.createTask({
      options: {
        type: 'count',
        options: { where: { combinator: 'and', rules: [{ field: 'updatedAt', operator: '>', value: cutoff }] } }
      },
      runner: () => of(authoritativeCount),
      getFingerprint: getFingerprintPrimitive
    });
    const subscription = task.result$.subscribe(count => seen.push(count));
    try {
      expect(seen).toEqual([0]);
      authoritativeCount = 1;
      rxdb.dispatchEvent(
        new EntityLocalUpdatedEvent([
          {
            type: 'UPDATE',
            namespace: 'public',
            entity: 'User',
            id,
            recordAt: newDate,
            patch: { updatedAt: newDate },
            inversePatch: { updatedAt: oldDate }
          }
        ])
      );
      await vi.waitFor(() => expect(seen).toEqual([0, 1]), { timeout: 200 });
    } finally {
      subscription.unsubscribe();
      manager.destroy();
      await cleanup();
    }
  });

  it('updatedAt 排序查询收到时间戳事件后应重新排序', async () => {
    const { rxdb, cleanup } = await createTestDB({ entities: [User] });
    const manager = new QueryManager(rxdb, User);
    const oldDate = new Date('2026-01-01T00:00:00.000Z');
    const middleDate = new Date('2026-01-02T00:00:00.000Z');
    const newDate = new Date('2026-01-03T00:00:00.000Z');
    const a = rxdb.entityManager.createEntityRef(
      User,
      { id: '00000000-0000-0000-0000-000000000097' as UUID, updatedAt: oldDate },
      { local: true, modified: false }
    );
    const b = rxdb.entityManager.createEntityRef(
      User,
      { id: '00000000-0000-0000-0000-000000000096' as UUID, updatedAt: middleDate },
      { local: true, modified: false }
    );
    let current = [a, b];
    const task = manager.createTask({
      options: {
        type: 'find',
        // where 空组（匹配全部）是刻意的：本例要证的是**只靠 orderBy** 引用 updatedAt
        // 就足以留下单字段时间戳事件，where 里不能出现 updatedAt，否则测的是另一条分支。
        options: {
          where: { combinator: 'and', rules: [] },
          limit: 2,
          orderBy: [{ field: 'updatedAt', sort: 'asc' }]
        }
      },
      runner: () => of(current),
      getFingerprint: getFingerprintByEntities
    });
    const seen: string[][] = [];
    const subscription = task.result$.subscribe(rows => seen.push(rows.map(row => row.id)));
    try {
      current = [b, a];
      rxdb.dispatchEvent(
        new EntityLocalUpdatedEvent([
          {
            type: 'UPDATE',
            namespace: 'public',
            entity: 'User',
            id: a.id,
            recordAt: newDate,
            patch: { updatedAt: newDate },
            inversePatch: { updatedAt: oldDate }
          }
        ])
      );
      await vi.waitFor(() => expect(seen.at(-1)).toEqual([b.id, a.id]), { timeout: 300 });
    } finally {
      subscription.unsubscribe();
      manager.destroy();
      await cleanup();
    }
  });
});

/**
 * 评审场景：`orderBy [name asc, id asc]`、limit 10、两页活查询，把第 10 行（第 2 页的锚点）从 Jade
 * 改名 Jasmine。它仍排在 Iris 与 Kate 之间，第 1 页的尾行没换 —— 三端无限滚动只比 id、不会重开第 2 页，
 * 第 2 页回 SQL 重查时必须按锚点行此刻的位置切窗口。
 */
describe('findByCursor：锚点行的排序键被编辑后，下一页跟着这一行走', () => {
  const NAMES = [
    'Abby',
    'Bea',
    'Cara',
    'Dana',
    'Eve',
    'Faye',
    'Gina',
    'Hana',
    'Iris',
    'Jade',
    'Kate',
    'Lena',
    'Mia',
    'Nina',
    'Opal',
    'Pia',
    'Quinn',
    'Rose',
    'Sara',
    'Tess',
    'Uma',
    'Vera',
    'Wren',
    'Xena',
    'Yara'
  ];
  const BEFORE = new Date('2026-01-01T00:00:00.000Z');
  const AFTER = new Date('2026-01-02T00:00:00.000Z');

  interface Row {
    readonly id: UUID;
    readonly name: string;
    readonly email: string;
    readonly updatedAt: Date;
  }

  const rowId = (index: number): UUID => `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}` as UUID;

  const pageOptions = (after?: InstanceType<typeof User>): FindByCursorOptions<typeof User> => ({
    where: { combinator: 'and', rules: [] },
    orderBy: [
      { field: 'name', sort: 'asc' },
      { field: 'id', sort: 'asc' }
    ],
    limit: 10,
    after
  });

  /**
   * 开两页活查询；表按 where / orderBy / limit 真求值。
   *
   * @remarks
   * 读回的行与写后的新行都经 `createEntityRef` 回填身份缓存，与 sqlite 适配器的 `find` / `update`
   * （写后 `addQueryCache(result, true)`）同形 —— 第 2 页的锚点就是第 1 页结果里的那个实例。
   */
  const openTwoPages = async () => {
    const { rxdb, adapter, cleanup } = await createTestDB({ entities: [User] });
    const table = new Map<UUID, Row>(
      NAMES.map((name, index) => [
        rowId(index),
        { id: rowId(index), name, email: `${name}@example.com`, updatedAt: BEFORE }
      ])
    );
    const hydrate = (row: Row) =>
      rxdb.entityManager.createEntityRef(User, { ...row }, { local: true, modified: false });
    const local = adapter.stubEntityRepository(User);
    vi.mocked(local.find).mockImplementation(async options => {
      // 通用仓储接口把 where 收成 object，这里就是仓储下发的规则组
      const where = options.where as RuleGroup<Row>;
      const matched = [...table.values()].filter(row => isEntityMatchWhere(row, where));
      return calculateOrderBy(matched, options.orderBy ?? [])
        .slice(0, options.limit)
        .map(hydrate);
    });
    vi.mocked(local.update).mockImplementation(async (entity, patch) => {
      const row: Row = { ...table.get(entity.id)!, ...patch, updatedAt: AFTER };
      table.set(row.id, row);
      return hydrate(row);
    });
    const repository = rxdb.entityManager.getRepository(User);
    const pages: InstanceType<typeof User>[][] = [[], []];
    const first = repository.findByCursor(pageOptions()).subscribe(rows => (pages[0] = rows));
    await vi.waitFor(() => expect(pages[0]).toHaveLength(10));
    const anchor = pages[0][9];
    const second = repository.findByCursor(pageOptions(anchor)).subscribe(rows => (pages[1] = rows));
    await vi.waitFor(() => expect(pages[1]).toHaveLength(10));

    /** 等两页各回 SQL 重查一次（首查各一次，共 4 次）并把结果落地 */
    const settleRefresh = async (): Promise<void> => {
      await vi.waitFor(() => expect(local.find).toHaveBeenCalledTimes(4));
      await flushMicrotasks();
    };
    const close = async (): Promise<void> => {
      first.unsubscribe();
      second.unsubscribe();
      await cleanup();
    };
    return { rxdb, repository, table, pages, anchor, settleRefresh, close };
  };

  type TwoPages = Awaited<ReturnType<typeof openTwoPages>>;

  const renames: Record<'本实例保存' | '库外写入的变更通知', (ctx: TwoPages) => Promise<void>> = {
    // 仓储写库并回填身份缓存，随后适配器的变更捕获发出带前后值的 UPDATE
    本实例保存: async ({ rxdb, repository, anchor }) => {
      await repository.update(anchor, { name: 'Jasmine' });
      rxdb.dispatchEvent(
        new EntityLocalUpdatedEvent([
          {
            type: 'UPDATE',
            namespace: 'public',
            entity: 'User',
            id: anchor.id,
            recordAt: AFTER,
            patch: { name: 'Jasmine', updatedAt: AFTER },
            inversePatch: { name: 'Jade', updatedAt: BEFORE }
          }
        ])
      );
    },
    // 另一个标签页 / 绕过 ORM 的写：只有变更通知，身份缓存里的实例由增量合并就地更新
    库外写入的变更通知: async ({ rxdb, table, anchor }) => {
      table.set(anchor.id, { ...table.get(anchor.id)!, name: 'Jasmine', updatedAt: AFTER });
      rxdb.entityManager.notifyExternalUpdate(User, anchor.id, { name: 'Jasmine', updatedAt: AFTER });
    }
  };

  it.each(Object.keys(renames) as (keyof typeof renames)[])('%s：两页的并集不重复、不丢行', async path => {
    const ctx = await openTwoPages();
    try {
      await renames[path](ctx);
      await ctx.settleRefresh();

      expect(ctx.anchor.name).toBe('Jasmine');
      expect(ctx.pages[0].at(-1)).toBe(ctx.anchor);
      expect([...ctx.pages[0], ...ctx.pages[1]].map(row => row.name)).toEqual([
        ...NAMES.slice(0, 9),
        'Jasmine',
        ...NAMES.slice(10, 20)
      ]);
    } finally {
      await ctx.close();
    }
  });

  // 「跟着这一行走」跟的是它在库里的位置：未保存的编辑没挪动它，按编辑中的值切窗口，
  // 用户在锚点行上打字时，第 2 页每逢重查就会跟着跳
  it('锚点行有未保存的编辑时，下一页仍按它在库里的位置切窗口', async () => {
    const ctx = await openTwoPages();
    try {
      ctx.anchor.name = 'Zed';
      expect(getEntityStatus(ctx.anchor).modified).toBe(true);
      // 第 2 页里另一行被库外改名（位置不变），两页都回 SQL 重查
      const opal = rowId(14);
      ctx.table.set(opal, { ...ctx.table.get(opal)!, name: 'Opaline', updatedAt: AFTER });
      ctx.rxdb.entityManager.notifyExternalUpdate(User, opal, { name: 'Opaline', updatedAt: AFTER });
      await ctx.settleRefresh();

      expect(ctx.anchor.name).toBe('Zed');
      expect([...ctx.pages[0], ...ctx.pages[1]].map(row => row.id)).toEqual(NAMES.slice(0, 20).map((_, i) => rowId(i)));
    } finally {
      await ctx.close();
    }
  });
});
