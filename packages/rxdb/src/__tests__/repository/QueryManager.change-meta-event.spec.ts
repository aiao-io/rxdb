/**
 * 增量合并按事件负载的形态取值，不按负载里的 `type`。
 *
 * 适配器派发 `RxDBChange` 元事件时（sqlite-core `build_rxdb_change_meta_event`），负载的 `type`
 * 写的是这条变更行记录的业务操作（`INSERT` / `UPDATE` / `DELETE`），不是这条元事件本身：
 * 记录一次业务删除的变更行，它的 CREATE 元事件 `type` 是 `'DELETE'`，而 `patch` 是完整的变更行、
 * `inversePatch` 是 `null`（CREATE 的负载契约）。`QueryManager.#serialize` 若按 `type` 取
 * `inversePatch`，合并进活查询的就是一个只有 `id` 的实体，历史插件读 `createdAt.getTime()` 直接抛错。
 *
 * RV-01a1ba9150a27dc994910d10e82f80b1 之后普通实体（含 `RxDBChange`）的本表 CREATE 走 JS 增量合并，
 * 这条从前被一律整查绕开的路径才真正走到。
 */
import type { Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { EntityLocalCreatedEvent, EntityLocalUpdatedEvent } from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';
import { RxDBChange } from '../../system/change.js';
import { createMockAdapter, type MockLocalAdapter } from '../fixtures/test-db-setup.js';
import { TEST_ENTITIES } from '../fixtures/test-entities.js';

let database: RxDB;
let adapter: MockLocalAdapter;
const subscriptions: Subscription[] = [];
const tick = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));
const at = new Date('2026-11-10T00:00:00.000Z');

beforeEach(async () => {
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    callback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
    return 1;
  });
  database = new RxDB({
    dbName: `change-meta-event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

/** 一条记录业务删除的变更行（`type: 'DELETE'`），完整字段。 */
const deleteChangeRow = (id: number) => ({
  id,
  remoteId: null,
  rejectedAt: null,
  rejection: null,
  type: 'DELETE' as const,
  transactionId: null,
  namespace: 'public',
  entity: 'Post',
  entityId: '00000000-0000-7000-8000-00000000a0a0',
  inversePatch: { title: 'gone' },
  patch: null,
  createdAt: at,
  updatedAt: at,
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

describe('RxDBChange 元事件的增量合并', () => {
  it('记录业务删除的变更行以 CREATE 元事件到达（负载 type 为 DELETE）：并入的实体字段完整', async () => {
    const seen = await watchChanges();
    const row = deleteChangeRow(7);

    database.dispatchEvent(
      new EntityLocalCreatedEvent([
        { type: 'DELETE', namespace: 'rxdb', entity: 'RxDBChange', id: 7, patch: row, inversePatch: null, recordAt: at }
      ] as never)
    );
    await tick();

    const [merged] = seen.at(-1) ?? [];
    expect(merged?.id).toBe(7);
    expect(merged?.createdAt).toBeInstanceOf(Date);
    expect(merged?.type).toBe('DELETE');
    expect(merged?.entityId).toBe(row.entityId);
  });

  it('变更行的 UPDATE 元事件（负载 type 为 DELETE、patch 是整行）同样按 patch 回填身份缓存', async () => {
    const seen = await watchChanges();
    const row = deleteChangeRow(8);
    database.dispatchEvent(
      new EntityLocalCreatedEvent([
        { type: 'DELETE', namespace: 'rxdb', entity: 'RxDBChange', id: 8, patch: row, inversePatch: null, recordAt: at }
      ] as never)
    );
    await tick();
    // 持有实例：身份缓存是 WeakRef，没人持有时会被回收
    const [cached] = seen.at(-1) ?? [];
    expect(cached?.createdAt).toBeInstanceOf(Date);

    // 元 UPDATE 的 inversePatch 为空、前态未知，门控回 SQL；回填身份缓存发生在判定之前
    const reverted = new Date('2026-11-10T00:00:01.000Z');
    database.dispatchEvent(
      new EntityLocalUpdatedEvent([
        {
          type: 'DELETE',
          namespace: 'rxdb',
          entity: 'RxDBChange',
          id: 8,
          patch: { ...row, redoInvalidatedAt: reverted, updatedAt: reverted },
          inversePatch: {},
          recordAt: reverted
        }
      ] as never)
    );
    await tick();

    const updated = database.entityManager.getEntityRef(RxDBChange, 8);
    expect(updated).toBe(cached);
    expect(updated?.redoInvalidatedAt).toEqual(reverted);
    expect(updated?.createdAt).toBeInstanceOf(Date);
  });
});
