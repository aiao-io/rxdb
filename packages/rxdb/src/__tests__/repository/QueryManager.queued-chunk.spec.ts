/**
 * 排进空闲分片的事件合并在**执行时**重新核对（RV-01a1ba9150447a238545367e7a1dc6ed）。
 *
 * `QueryManager` 收到实体事件时按当时挂着的表集筛一遍，再把合并排进 `requestIdleCallback`。
 * 分片执行之前实例可能已经换挂到另一套表、任务可能已经被清理：旧分片若仍拿着接收时筛好的
 * 负载，就会把主表上的行合进影子表的查询结果，并经 `createEntityRef` 打上新表集的身份。
 */
import { filter, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import { EntityLocalCreatedEvent } from '../../rxdb-events.js';
import { getEntityStatus } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { RxDBBranch } from '../../system/branch.js';
import { WorktreeTableSet } from '../../system/worktree-table-set.js';
import { createMockAdapter, type MockLocalAdapter } from '../fixtures/test-db-setup.js';

@Entity({ name: 'QueuedChunkRow', properties: [{ name: 'title', type: PropertyType.string }] })
class QueuedChunkRow extends EntityBase {
  title!: string;
}

@Entity({ name: 'QueuedChunkShared', properties: [{ name: 'title', type: PropertyType.string }] })
class QueuedChunkShared extends EntityBase {
  title!: string;
}

/** 手动放行的空闲回调队列：把「接收事件」与「分片执行」拆成两个时刻。 */
let idle: IdleRequestCallback[] = [];
const runIdle = (): void => {
  for (const callback of idle.splice(0)) callback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
};
const tick = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

let database: RxDB;
let adapter: MockLocalAdapter;

const insert = (entity: 'QueuedChunkRow' | 'QueuedChunkShared', id: string, title: string) => {
  const at = new Date('2026-11-08T08:00:00Z');
  return new EntityLocalCreatedEvent([
    {
      type: 'INSERT',
      namespace: 'public',
      entity,
      id,
      patch: { id, title, createdAt: at, updatedAt: at, createdBy: null, updatedBy: null },
      inversePatch: null,
      recordAt: at
    }
  ]);
};

beforeEach(async () => {
  idle = [];
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => idle.push(callback));
  database = new RxDB({
    dbName: `queued-chunk-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    entities: [QueuedChunkRow, QueuedChunkShared],
    multiInstance: false,
    sync: { local: { adapter: 'mock' }, type: SyncType.None }
  });
  database.adapter('mock', db => {
    adapter = createMockAdapter(db);
    // 影子表集挂得上：它持有一条分支
    adapter.stubEntityRepository(RxDBBranch, [{ id: 'held' } as never]);
    return adapter;
  });
  await database.connect('mock');
});

afterEach(async () => {
  await database.destroy();
  vi.unstubAllGlobals();
});

describe('排进空闲分片的事件合并在执行时重新核对', () => {
  it('换挂之前排队、换挂之后才执行的分片不把主表的行合进影子表的查询与身份缓存', async () => {
    const id = '00000000-0000-7000-8000-000000000001';
    const seen: string[][] = [];
    const subscription = database.entityManager
      .getRepository(QueuedChunkRow)
      .findByCursor({ where: { combinator: 'and', rules: [] }, orderBy: [{ field: 'id', sort: 'asc' }] })
      .subscribe(rows => seen.push(rows.map(row => row.title)));
    await tick();

    database.dispatchEvent(insert('QueuedChunkRow', id, 'from-main'));
    expect(idle).toHaveLength(1);

    await database.mountWorktreeTableSet(WorktreeTableSet.of('wt_queued', [QueuedChunkRow]));
    await tick();
    runIdle();
    await tick();

    expect(database.worktreeTableSet.suffix).toBe('wt_queued');
    expect(seen.flat()).not.toContain('from-main');
    expect(database.entityManager.getEntityRef(QueuedChunkRow, id)).toBeUndefined();
    subscription.unsubscribe();
  });

  it('换挂之后执行的分片仍合入不属于影子表集的共享实体（两套表读的是同一张主表）', async () => {
    const id = '00000000-0000-7000-8000-000000000002';
    const results = database.entityManager
      .getRepository(QueuedChunkShared)
      .findByCursor({ where: { combinator: 'and', rules: [] }, orderBy: [{ field: 'id', sort: 'asc' }] });
    const subscription = results.subscribe();
    await tick();

    database.dispatchEvent(insert('QueuedChunkShared', id, 'shared'));
    await database.mountWorktreeTableSet(WorktreeTableSet.of('wt_queued', [QueuedChunkRow]));
    await tick();
    runIdle();

    const rows = await firstValueFrom(results.pipe(filter(list => list.length > 0)));
    expect(rows.map(row => row.title)).toEqual(['shared']);
    expect(getEntityStatus(rows[0]).tableSet.suffix).toBe('wt_queued');
    subscription.unsubscribe();
  });

  it('排队期间任务已被清理时分片跳过它，不再往身份缓存里写', async () => {
    const id = '00000000-0000-7000-8000-000000000003';
    const subscription = database.entityManager
      .getRepository(QueuedChunkRow)
      .findByCursor({ where: { combinator: 'and', rules: [] }, orderBy: [{ field: 'id', sort: 'asc' }] })
      .subscribe();
    await tick();

    database.dispatchEvent(insert('QueuedChunkRow', id, 'after-clean'));
    expect(idle).toHaveLength(1);
    subscription.unsubscribe();
    runIdle();
    await tick();

    expect(database.entityManager.getEntityRef(QueuedChunkRow, id)).toBeUndefined();
  });
});
