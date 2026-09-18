import { firstValueFrom, Observable, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { getFingerprintPrimitive } from '../../repository/fingerprint.utils.js';
import { QueryManager } from '../../repository/QueryManager.js';
import { EntityLocalUpdatedEvent } from '../../rxdb-events.js';
import { getEntityStatus } from '../../rxdb-utils.js';
import { createTestDB } from '../fixtures/test-db-setup.js';
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
      id: '00000000-0000-0000-0000-000000000099',
      name: '原始值',
      email: 'review@example.com',
      role: 'user',
      isActive: true
    };
    const local = adapter.stubEntityRepository(User);
    vi.mocked(local.find).mockImplementation(async () => [
      rxdb.entityManager.createEntityRef(User, row, { local: true, modified: false })
    ]);
    const repository = rxdb.getRepository(User);
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
});
