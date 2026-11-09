/**
 * 增量合并把事件载荷里的日期还原成 `Date`。
 *
 * 合并/拉取路径（sqlite-core / PGlite 的 `execute_switch_actions`、`handle_rxdb_change`）派发实体事件时，
 * 载荷取的是变更记录里的原始 JSON：JSON 没有 `Date`，`createdAt` / `updatedAt` 等日期属性是 ISO 字符串。
 * `QueryManager.#serialize` 直接拿载荷造实体，活查询推给订阅者的行里 `updatedAt` 就成了字符串，
 * 订阅方按契约调 `row.updatedAt.getTime()` 当场抛 `TypeError`（P2P 示例的共享文件列表因此一直为空）。
 *
 * 这条路径从前被「同表 CREATE 一律整查」绕开；RV-01a1ba9150a27dc994910d10e82f80b1 之后同表 CREATE
 * 走 JS 增量合并，载荷里的类型问题才暴露出来。
 */
import type { Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { EntityLocalCreatedEvent } from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';
import { RxDBChange } from '../../system/change.js';
import { createMockAdapter, type MockLocalAdapter } from '../fixtures/test-db-setup.js';
import { TEST_ENTITIES } from '../fixtures/test-entities.js';

let database: RxDB;
let adapter: MockLocalAdapter;
const subscriptions: Subscription[] = [];
const tick = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

beforeEach(async () => {
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    callback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
    return 1;
  });
  database = new RxDB({
    dbName: `event-date-payload-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

/** 变更行的完整 JSON 形态：日期是 ISO 字符串，和远端响应 / `rxdb_change` 里存的一样。 */
const jsonChangeRow = (id: number) => ({
  id,
  remoteId: null,
  rejectedAt: null,
  rejection: null,
  type: 'INSERT',
  transactionId: null,
  namespace: 'public',
  entity: 'Post',
  entityId: '00000000-0000-7000-8000-00000000a0a0',
  inversePatch: null,
  patch: { title: 'hello' },
  createdAt: '2026-11-10T00:00:00.000Z',
  updatedAt: '2026-11-10T00:00:01.500Z',
  createdBy: null,
  updatedBy: null
});

const watchChanges = async () => {
  adapter.stubEntityRepository(RxDBChange, []);
  const seen: InstanceType<typeof RxDBChange>[][] = [];
  subscriptions.push(
    database.entityManager
      .getRepository(RxDBChange)
      .findAll({ where: { combinator: 'and', rules: [{ field: 'entity', operator: '=', value: 'Post' }] } })
      .subscribe(rows => seen.push(rows))
  );
  await vi.waitFor(() => expect(seen).toEqual([[]]));
  return seen;
};

describe('事件载荷里的日期', () => {
  it('JSON 形态的 CREATE 载荷（日期是 ISO 字符串）并进活查询后，日期属性是 Date', async () => {
    const seen = await watchChanges();
    const row = jsonChangeRow(11);

    database.dispatchEvent(
      new EntityLocalCreatedEvent([
        {
          type: 'INSERT',
          namespace: 'rxdb',
          entity: 'RxDBChange',
          id: 11,
          patch: row,
          inversePatch: null,
          recordAt: new Date(row.createdAt)
        }
      ] as never)
    );
    await tick();

    const [merged] = seen.at(-1) ?? [];
    expect(merged?.id).toBe(11);
    expect(merged?.createdAt).toBeInstanceOf(Date);
    expect(merged?.updatedAt).toBeInstanceOf(Date);
    expect(merged?.createdAt.toISOString()).toBe(row.createdAt);
    expect(merged?.updatedAt.getTime()).toBe(Date.parse(row.updatedAt));
  });

  it('非日期属性原样保留，已经是 Date 的载荷不被改写', async () => {
    const seen = await watchChanges();
    const created = new Date('2026-11-10T00:00:02.000Z');
    const row = { ...jsonChangeRow(12), createdAt: created, updatedAt: created };

    database.dispatchEvent(
      new EntityLocalCreatedEvent([
        {
          type: 'INSERT',
          namespace: 'rxdb',
          entity: 'RxDBChange',
          id: 12,
          patch: row,
          inversePatch: null,
          recordAt: created
        }
      ] as never)
    );
    await tick();

    const [merged] = seen.at(-1) ?? [];
    expect(merged?.createdAt).toBe(created);
    expect(merged?.entity).toBe('Post');
    expect(merged?.entityId).toBe(row.entityId);
  });
});
