/**
 * 迟到的 CREATE 不能把已经删除 / 改过的行加回结果。
 *
 * 变更事件分批投递，不同写入路径之间不保序：撤销直接派发的 DELETE 可以先于原先那次保存的
 * CREATE 送达（wa-sqlite 实测 DELETE 10ms、CREATE 14ms）。本表 CREATE 走 JS 增量合并时
 * （RV-01a1ba9150a27dc994910d10e82f80b1 之后普通实体不再一律回 SQL），这条过期的 CREATE
 * 若照单全收，结果里就多出一行库里已经不存在的数据。
 */
import type { Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import { EntityLocalCreatedEvent, EntityLocalRemovedEvent, EntityLocalUpdatedEvent } from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';
import { createMockAdapter, type MockLocalAdapter } from '../fixtures/test-db-setup.js';
import { Post, TEST_ENTITIES } from '../fixtures/test-entities.js';

let database: RxDB;
let adapter: MockLocalAdapter;
const subscriptions: Subscription[] = [];
const tick = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));
const saved = new Date('2026-11-10T00:00:00.000Z');
const later = new Date('2026-11-10T00:00:01.000Z');
const id = '00000000-0000-7000-8000-00000000f001';

beforeEach(async () => {
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    callback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
    return 1;
  });
  database = new RxDB({
    dbName: `late-create-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

const row = (updatedAt: Date) => ({
  id,
  title: 'row',
  content: 'content',
  published: true,
  authorId: null,
  createdAt: saved,
  updatedAt,
  createdBy: null,
  updatedBy: null
});
const created = (updatedAt: Date) =>
  new EntityLocalCreatedEvent([
    {
      type: 'INSERT',
      namespace: 'public',
      entity: 'Post',
      id,
      patch: row(updatedAt),
      inversePatch: null,
      recordAt: updatedAt
    }
  ]);
const removed = (updatedAt: Date) =>
  new EntityLocalRemovedEvent([
    {
      type: 'DELETE',
      namespace: 'public',
      entity: 'Post',
      id,
      patch: null,
      inversePatch: row(updatedAt),
      recordAt: later
    }
  ]);
const updated = (published: boolean, updatedAt: Date, before: Date) =>
  new EntityLocalUpdatedEvent([
    {
      type: 'UPDATE',
      namespace: 'public',
      entity: 'Post',
      id,
      patch: { published, updatedAt },
      inversePatch: { published: !published, updatedAt: before },
      recordAt: updatedAt
    }
  ]);

/** 订阅 published = true 的活查询；底层 find 先返回空，之后的重查同样为空（库里没有这一行）。 */
const watchPublished = async () => {
  const stub = adapter.stubEntityRepository(Post, []);
  const seen: string[][] = [];
  const where: RuleGroup<InstanceType<typeof Post>> = {
    combinator: 'and',
    rules: [{ field: 'published', operator: '=', value: true }]
  };
  subscriptions.push(
    database.entityManager
      .getRepository(Post)
      .findAll({ where })
      .subscribe(rows => seen.push(rows.map(entity => entity.id)))
  );
  await vi.waitFor(() => expect(seen).toEqual([[]]));
  return { stub, seen };
};

describe('迟到的 CREATE', () => {
  it('同一行的 DELETE 先到：之后送达的 CREATE（不新于被删的那一版）不把它加回结果，交回 SQL 重算', async () => {
    const { stub, seen } = await watchPublished();

    database.dispatchEvent(removed(saved));
    database.dispatchEvent(created(saved));
    await tick();

    expect(seen.at(-1)).toEqual([]);
    expect(stub.find).toHaveBeenCalledTimes(2);
  });

  it('同一行更新的 UPDATE 先到：之后送达的旧 CREATE 交回 SQL 重算，而不是按旧负载并入', async () => {
    const { stub, seen } = await watchPublished();

    database.dispatchEvent(updated(false, later, saved));
    database.dispatchEvent(created(saved));
    await tick();

    expect(seen.at(-1)).toEqual([]);
    expect(stub.find).toHaveBeenCalledTimes(2);
  });

  it('对照：删除之后再新建（redo，时间戳更新）照常走 JS 增量，不多回 SQL', async () => {
    const { stub, seen } = await watchPublished();

    database.dispatchEvent(removed(saved));
    database.dispatchEvent(created(later));
    await tick();

    expect(seen.at(-1)).toEqual([id]);
    expect(stub.find).toHaveBeenCalledTimes(1);
  });

  it('对照：没有见过同一行的更新或删除，CREATE 照常走 JS 增量', async () => {
    const { stub, seen } = await watchPublished();

    database.dispatchEvent(created(saved));
    await tick();

    expect(seen.at(-1)).toEqual([id]);
    expect(stub.find).toHaveBeenCalledTimes(1);
  });
});
