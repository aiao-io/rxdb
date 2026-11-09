/**
 * 增量合并里「关系变更」与「只改时间戳」的判定（RV-01a1ba9150a27dc994910d10e82f80b1、
 * RV-01a1ba91510779a8b1e6f07d2417c724）。
 *
 * 1. 主查询实体总在自己的依赖集里，这不等于它对自己有关系依赖：没有自引用关系的普通实体，
 *    本表 CREATE 不该被当成关系变更送回 SQL 整查。
 * 2. 只改 `updatedAt` 的 UPDATE 只在查询完全不读任何 `updatedAt` 时才算无意义：
 *    `author.updatedAt` 这类关系路径与 EXISTS 子查询里的 `updatedAt` 同样是在读它。
 */
import type { Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import { EntityLocalCreatedEvent, EntityLocalUpdatedEvent } from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';
import { createMockAdapter, type MockLocalAdapter } from '../fixtures/test-db-setup.js';
import { Post, Tag, TEST_ENTITIES, User } from '../fixtures/test-entities.js';

let database: RxDB;
let adapter: MockLocalAdapter;
const subscriptions: Subscription[] = [];
const tick = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

beforeEach(async () => {
  // 分片同步执行：判定结论（增量 / 回 SQL）在派发事件后立刻可观测
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    callback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
    return 1;
  });
  database = new RxDB({
    dbName: `query-relation-change-filter-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    entities: TEST_ENTITIES,
    multiInstance: false,
    sync: { local: { adapter: 'mock' }, type: SyncType.None }
  });
  database.adapter('mock', db => {
    adapter = createMockAdapter(db);
    return adapter;
  });
  await database.connect('mock');
});

afterEach(async () => {
  for (const subscription of subscriptions.splice(0)) subscription.unsubscribe();
  await database.destroy();
  vi.unstubAllGlobals();
});

const at = (iso: string) => new Date(iso);

describe('普通实体的本表 CREATE 走 JS 增量', () => {
  const insertTag = (id: string) =>
    new EntityLocalCreatedEvent([
      {
        type: 'INSERT',
        namespace: 'public',
        entity: 'Tag',
        id,
        patch: {
          id,
          name: id,
          color: '#000000',
          createdAt: at('2026-11-09T00:00:00Z'),
          updatedAt: at('2026-11-09T00:00:00Z'),
          createdBy: null,
          updatedBy: null
        },
        inversePatch: null,
        recordAt: at('2026-11-09T00:00:00Z')
      }
    ]);

  it.each(['findAll', 'findByCursor'] as const)('%s：无关系实体收到 CREATE 不再回 SQL 整查', async kind => {
    const stub = adapter.stubEntityRepository(Tag, []);
    const repository = database.entityManager.getRepository(Tag);
    const where = { combinator: 'and' as const, rules: [] };
    const query =
      kind === 'findAll' ?
        repository.findAll({ where, orderBy: [{ field: 'id', sort: 'asc' }] })
      : repository.findByCursor({ where, orderBy: [{ field: 'id', sort: 'asc' }] });
    const seen: string[][] = [];
    subscriptions.push(query.subscribe(rows => seen.push(rows.map(row => row.id))));
    await vi.waitFor(() => expect(seen).toEqual([[]]));

    const id = '00000000-0000-7000-8000-00000000a001';
    database.dispatchEvent(insertTag(id));
    await tick();

    expect(seen).toEqual([[], [id]]);
    expect(stub.find).toHaveBeenCalledTimes(1);
  });
});

describe('只改 updatedAt 的关系实体变更', () => {
  const cutoff = at('2026-11-09T12:00:00Z');
  const bumpAuthor = (id: string) =>
    new EntityLocalUpdatedEvent([
      {
        type: 'UPDATE',
        namespace: 'public',
        entity: 'User',
        id,
        patch: { updatedAt: at('2026-11-09T13:00:00Z') },
        inversePatch: { updatedAt: at('2026-11-09T11:00:00Z') },
        recordAt: at('2026-11-09T13:00:00Z')
      }
    ]);

  const countPosts = (where: RuleGroup<InstanceType<typeof Post>>) => {
    const stub = adapter.stubEntityRepository(Post) as IRepository<typeof Post>;
    const count = vi.fn<IRepository<typeof Post>['count']>();
    count.mockResolvedValueOnce(0).mockResolvedValue(1);
    stub.count = count;
    const seen: number[] = [];
    subscriptions.push(
      database.entityManager
        .getRepository(Post)
        .count({ where })
        .subscribe(value => seen.push(value))
    );
    return { count, seen };
  };

  it.each([
    [
      '点号关系路径 author.updatedAt',
      { combinator: 'and', rules: [{ field: 'author.updatedAt', operator: '>', value: cutoff }] }
    ],
    [
      'EXISTS 子查询里的 updatedAt',
      {
        combinator: 'and',
        rules: [
          {
            field: 'author',
            operator: 'exists',
            where: { combinator: 'and', rules: [{ field: 'updatedAt', operator: '>', value: cutoff }] }
          }
        ]
      }
    ]
  ])('%s：作者只改 updatedAt 也要重算', async (_label, where) => {
    const { count, seen } = countPosts(where as RuleGroup<InstanceType<typeof Post>>);
    await vi.waitFor(() => expect(seen).toEqual([0]));

    database.dispatchEvent(bumpAuthor('00000000-0000-7000-8000-00000000b001'));

    await vi.waitFor(() => expect(seen).toEqual([0, 1]));
    expect(count).toHaveBeenCalledTimes(2);
  });

  it('对照：查询只读作者的 name，作者只改 updatedAt 不触发重算', async () => {
    const { count, seen } = countPosts({
      combinator: 'and',
      rules: [{ field: 'author.name', operator: '=', value: 'x' }]
    } as unknown as RuleGroup<InstanceType<typeof Post>>);
    await vi.waitFor(() => expect(seen).toEqual([0]));

    database.dispatchEvent(bumpAuthor('00000000-0000-7000-8000-00000000b002'));
    await tick();
    await tick();

    expect(count).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([0]);
  });
});

/** 确保 fixture 的关系声明没有被改成别的形态（本文件的判定前提）。 */
it('前提：Post.author 指向 User', () => {
  expect(database.schemaManager.getEntityMetadata('Post', 'public')?.relationMap.get('author')?.mappedEntity).toBe(
    'User'
  );
  expect(User).toBeDefined();
});
