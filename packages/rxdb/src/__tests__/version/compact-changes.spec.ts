import { beforeEach, describe, expect, it } from 'vitest';
import { RxDBChange } from '../../system/change.js';
import { compactChanges } from '../../version/compact-changes.js';
import { getRxDBChangeKey } from '../../version/VersionManager.utils.js';

/**
 * compactChanges 函数单元测试（Push 场景专用）
 *
 * 测试变更压缩逻辑：
 * - INSERT → DELETE (inversePatch=null) = 抵消（本地新建，不需要 push）
 * - INSERT → DELETE (inversePatch!=null) = DELETE（服务器有旧数据，需要 push）
 * - INSERT → UPDATE* = INSERT (合并 patch)
 * - UPDATE → UPDATE* = UPDATE (合并 patch)
 * - UPDATE* → DELETE = DELETE（服务器必须知道删除）
 */
describe('compactChanges', () => {
  // 自增 ID 计数器
  let nextId = 1;

  // 每个测试前重置 ID 计数器
  beforeEach(() => {
    nextId = 1;
  });

  // 辅助函数：创建模拟 RxDBChange（自动递增 id 确保顺序）
  function createChange(
    type: 'INSERT' | 'UPDATE' | 'DELETE',
    entityId: string,
    patch: Record<string, unknown> | null,
    createdAt: Date = new Date(),
    inversePatch: Record<string, unknown> | null = null
  ): RxDBChange {
    return {
      id: nextId++,
      namespace: 'public',
      entity: 'User',
      entityId,
      type,
      patch,
      inversePatch,
      createdAt,
      updatedAt: createdAt
    } as RxDBChange;
  }

  describe('empty input', () => {
    it('should return empty actions for empty input', () => {
      const result = compactChanges([]);
      expect(result.inserts.size).toBe(0);
      expect(result.updates.size).toBe(0);
      expect(result.deletes.size).toBe(0);
    });
  });

  describe('single change', () => {
    it('should pass through single INSERT', () => {
      const changes = [createChange('INSERT', '1', { name: 'Alice' })];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      expect(actions.inserts.size).toBe(1);
      expect(actions.inserts.get(key)?.patch).toEqual({ name: 'Alice' });
      expect(actions.updates.size).toBe(0);
      expect(actions.deletes.size).toBe(0);
    });

    it('should pass through single UPDATE', () => {
      const changes = [createChange('UPDATE', '1', { name: 'Bob' })];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      expect(actions.updates.size).toBe(1);
      expect(actions.updates.get(key)?.patch).toEqual({ name: 'Bob' });
      expect(actions.inserts.size).toBe(0);
      expect(actions.deletes.size).toBe(0);
    });

    it('should pass through single DELETE', () => {
      const changes = [createChange('DELETE', '1', null)];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      expect(actions.deletes.size).toBe(1);
      expect(actions.deletes.get(key)?.patch).toBeNull();
      expect(actions.inserts.size).toBe(0);
      expect(actions.updates.size).toBe(0);
    });
  });

  describe('INSERT → DELETE = discard (local-only)', () => {
    it('should discard INSERT followed by DELETE (local new entity, inversePatch=null)', () => {
      const changes = [
        createChange('INSERT', '1', { name: 'Alice' }, new Date('2025-01-01T10:00:00Z'), null),
        createChange('DELETE', '1', null, new Date('2025-01-01T10:01:00Z'), null)
      ];
      const actions = compactChanges(changes);

      // INSERT → DELETE (inversePatch=null) 被抵消，本地新建后删除，服务器从未见过
      expect(actions.inserts.size).toBe(0);
      expect(actions.updates.size).toBe(0);
      expect(actions.deletes.size).toBe(0);
    });

    it('should discard INSERT → UPDATE* → DELETE (local new entity)', () => {
      const changes = [
        createChange('INSERT', '1', { name: 'Alice' }, new Date('2025-01-01T10:00:00Z'), null),
        createChange('UPDATE', '1', { name: 'Bob' }, new Date('2025-01-01T10:01:00Z'), { name: 'Alice' }),
        createChange('UPDATE', '1', { age: 30 }, new Date('2025-01-01T10:02:00Z'), { name: 'Bob' }),
        createChange('DELETE', '1', null, new Date('2025-01-01T10:03:00Z'), { name: 'Bob', age: 30 })
      ];
      const actions = compactChanges(changes);

      // INSERT (inversePatch=null) → UPDATE* → DELETE 被抵消，本地新建
      expect(actions.inserts.size).toBe(0);
      expect(actions.updates.size).toBe(0);
      expect(actions.deletes.size).toBe(0);
    });

    it('should keep DELETE when INSERT has inversePatch (server had old data)', () => {
      const changes = [
        createChange('INSERT', '1', { name: 'Alice' }, new Date('2025-01-01T10:00:00Z'), { name: 'OldName' }),
        createChange('DELETE', '1', null, new Date('2025-01-01T10:01:00Z'), { name: 'Alice' })
      ];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      // INSERT 有 inversePatch → 服务器有旧数据，DELETE 必须 push
      expect(actions.inserts.size).toBe(0);
      expect(actions.updates.size).toBe(0);
      expect(actions.deletes.size).toBe(1);
      expect(actions.deletes.get(key)?.patch).toBeNull();
    });
  });

  describe('INSERT → UPDATE* = INSERT (merge)', () => {
    it('should merge INSERT followed by UPDATE', () => {
      const changes = [
        createChange('INSERT', '1', { name: 'Alice' }, new Date('2025-01-01T10:00:00Z'), null),
        createChange('UPDATE', '1', { age: 25 }, new Date('2025-01-01T10:01:00Z'), { name: 'Alice' })
      ];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      expect(actions.inserts.size).toBe(1);
      expect(actions.inserts.get(key)?.patch).toEqual({ name: 'Alice', age: 25 });
      expect(actions.updates.size).toBe(0);
      expect(actions.deletes.size).toBe(0);
    });

    it('should merge INSERT followed by multiple UPDATEs', () => {
      const changes = [
        createChange('INSERT', '1', { name: 'Alice' }, new Date('2025-01-01T10:00:00Z'), null),
        createChange('UPDATE', '1', { age: 25 }, new Date('2025-01-01T10:01:00Z'), { name: 'Alice' }),
        createChange('UPDATE', '1', { email: 'alice@test.com' }, new Date('2025-01-01T10:02:00Z'), {
          name: 'Alice',
          age: 25
        }),
        createChange('UPDATE', '1', { name: 'Alice Updated' }, new Date('2025-01-01T10:03:00Z'), {
          name: 'Alice',
          age: 25,
          email: 'alice@test.com'
        })
      ];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      expect(actions.inserts.size).toBe(1);
      expect(actions.inserts.get(key)?.patch).toEqual({
        name: 'Alice Updated',
        age: 25,
        email: 'alice@test.com'
      });
    });

    it('should use last value when same field is updated multiple times', () => {
      const changes = [
        createChange('INSERT', '1', { name: 'Alice' }, new Date('2025-01-01T10:00:00Z')),
        createChange('UPDATE', '1', { name: 'Bob' }, new Date('2025-01-01T10:01:00Z')),
        createChange('UPDATE', '1', { name: 'Charlie' }, new Date('2025-01-01T10:02:00Z'))
      ];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      expect(actions.inserts.size).toBe(1);
      expect(actions.inserts.get(key)?.patch).toEqual({ name: 'Charlie' });
    });
  });

  describe('UPDATE → UPDATE* = UPDATE (merge)', () => {
    it('should merge multiple UPDATEs', () => {
      const changes = [
        createChange('UPDATE', '1', { name: 'Bob' }, new Date('2025-01-01T10:00:00Z')),
        createChange('UPDATE', '1', { age: 30 }, new Date('2025-01-01T10:01:00Z'))
      ];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      expect(actions.updates.size).toBe(1);
      expect(actions.updates.get(key)?.patch).toEqual({ name: 'Bob', age: 30 });
      expect(actions.inserts.size).toBe(0);
      expect(actions.deletes.size).toBe(0);
    });

    it('should take last value for same field in multiple UPDATEs', () => {
      const changes = [
        createChange('UPDATE', '1', { count: 1 }, new Date('2025-01-01T10:00:00Z')),
        createChange('UPDATE', '1', { count: 2 }, new Date('2025-01-01T10:01:00Z')),
        createChange('UPDATE', '1', { count: 3 }, new Date('2025-01-01T10:02:00Z'))
      ];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      expect(actions.updates.size).toBe(1);
      expect(actions.updates.get(key)?.patch).toEqual({ count: 3 });
    });
  });

  describe('UPDATE* → DELETE = DELETE', () => {
    it('should simplify UPDATE followed by DELETE to DELETE', () => {
      const changes = [
        createChange('UPDATE', '1', { name: 'Bob' }, new Date('2025-01-01T10:00:00Z'), { name: 'Alice' }),
        createChange('DELETE', '1', null, new Date('2025-01-01T10:01:00Z'), { name: 'Bob' })
      ];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      expect(actions.deletes.size).toBe(1);
      expect(actions.deletes.get(key)?.patch).toBeNull();
      expect(actions.inserts.size).toBe(0);
      expect(actions.updates.size).toBe(0);
    });

    it('should simplify multiple UPDATEs followed by DELETE to DELETE', () => {
      const changes = [
        createChange('UPDATE', '1', { name: 'Bob' }, new Date('2025-01-01T10:00:00Z'), { name: 'Alice' }),
        createChange('UPDATE', '1', { age: 30 }, new Date('2025-01-01T10:01:00Z'), { name: 'Bob' }),
        createChange('DELETE', '1', null, new Date('2025-01-01T10:02:00Z'), { name: 'Bob', age: 30 })
      ];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      expect(actions.deletes.size).toBe(1);
      expect(actions.deletes.get(key)?.patch).toBeNull();
      expect(actions.inserts.size).toBe(0);
      expect(actions.updates.size).toBe(0);
    });
  });

  describe('multiple entities', () => {
    it('should handle changes to different entities independently', () => {
      const change1 = createChange('INSERT', '1', { name: 'Alice' }, new Date('2025-01-01T10:00:00Z'), null);
      const change2 = createChange('INSERT', '2', { name: 'Bob' }, new Date('2025-01-01T10:01:00Z'), null);
      const change3 = createChange('UPDATE', '1', { age: 25 }, new Date('2025-01-01T10:02:00Z'), { name: 'Alice' });
      const change4 = createChange('DELETE', '2', null, new Date('2025-01-01T10:03:00Z'), null); // inversePatch=null 表示本地新建

      const changes = [change1, change2, change3, change4];
      const actions = compactChanges(changes);

      const key1 = getRxDBChangeKey(change1);
      const key2 = getRxDBChangeKey(change2);

      // Entity 1：INSERT + UPDATE = INSERT（已合并）。
      expect(actions.inserts.get(key1)?.patch).toEqual({ name: 'Alice', age: 25 });

      // Entity 2: INSERT + DELETE = 抵消
      expect(actions.inserts.has(key2)).toBe(false);
      expect(actions.updates.has(key2)).toBe(false);
      expect(actions.deletes.has(key2)).toBe(false);
    });

    it('should handle interleaved changes to multiple entities', () => {
      const change1a = createChange('INSERT', '1', { name: 'User1' }, new Date('2025-01-01T10:00:00Z'), null);
      const change2a = createChange('INSERT', '2', { name: 'User2' }, new Date('2025-01-01T10:00:01Z'), null);
      const change1b = createChange('UPDATE', '1', { status: 'active' }, new Date('2025-01-01T10:00:02Z'), {
        name: 'User1'
      });
      const change2b = createChange('UPDATE', '2', { status: 'active' }, new Date('2025-01-01T10:00:03Z'), {
        name: 'User2'
      });
      const change1c = createChange('UPDATE', '1', { level: 1 }, new Date('2025-01-01T10:00:04Z'), {
        name: 'User1',
        status: 'active'
      });

      const changes = [change1a, change2a, change1b, change2b, change1c];
      const actions = compactChanges(changes);

      const key1 = getRxDBChangeKey(change1a);
      const key2 = getRxDBChangeKey(change2a);

      expect(actions.inserts.get(key1)?.patch).toEqual({ name: 'User1', status: 'active', level: 1 });
      expect(actions.inserts.get(key2)?.patch).toEqual({ name: 'User2', status: 'active' });
    });
  });

  describe('edge cases', () => {
    it('should handle null patch in UPDATE', () => {
      const changes = [
        createChange('UPDATE', '1', null, new Date('2025-01-01T10:00:00Z')),
        createChange('UPDATE', '1', { name: 'Bob' }, new Date('2025-01-01T10:01:00Z'))
      ];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      // 第一个 UPDATE patch 为 null，不会创建 update
      // 第二个 UPDATE 创建新的 update
      expect(actions.updates.get(key)?.patch).toEqual({ name: 'Bob' });
    });

    it('should handle changes with missing createdAt', () => {
      const changes = [
        { ...createChange('INSERT', '1', { name: 'Alice' }), createdAt: undefined },
        { ...createChange('UPDATE', '1', { age: 25 }), createdAt: undefined }
      ] as unknown as RxDBChange[];

      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      expect(actions.inserts.size).toBe(1);
      expect(actions.inserts.get(key)?.patch).toEqual({ name: 'Alice', age: 25 });
    });
  });

  describe('sorting', () => {
    it('should sort changes by id before processing', () => {
      // 按 id 顺序创建：INSERT(id=1) → UPDATE(id=2) → UPDATE(id=3)
      const change1 = createChange('INSERT', '1', { name: 'Alice' }, new Date('2025-01-01T10:00:00Z'));
      const change2 = createChange('UPDATE', '1', { name: 'Bob' }, new Date('2025-01-01T10:01:00Z'));
      const change3 = createChange('UPDATE', '1', { age: 30 }, new Date('2025-01-01T10:02:00Z'));

      // 提供乱序的 changes（数组顺序与 id 顺序不同）
      const changes = [change3, change1, change2];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(change1);

      // 应该按 id 排序处理：INSERT → UPDATE → UPDATE
      expect(actions.inserts.size).toBe(1);
      expect(actions.inserts.get(key)?.patch).toEqual({ name: 'Bob', age: 30 });
    });
  });

  describe('UPDATE inversePatch 合并顺序 (RXD-033)', () => {
    it('should keep the earliest inversePatch value on overlapping fields, not overwrite with a later intermediate value', () => {
      const changes = [
        createChange('UPDATE', '1', { name: 'Bob' }, new Date('2025-01-01T10:00:00Z'), { name: 'Alice' }),
        createChange('UPDATE', '1', { name: 'Charlie' }, new Date('2025-01-01T10:01:00Z'), { name: 'Bob' })
      ];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      // patch 取最新值
      expect(actions.updates.get(key)?.patch).toEqual({ name: 'Charlie' });
      // inversePatch 必须保留批次开始前的真实旧值（Alice），
      // 而不是被批内中间态（Bob）覆盖 —— 否则 revert 会把数据还原到批次中间而非批次之前
      expect(actions.updates.get(key)?.inversePatch).toEqual({ name: 'Alice' });
    });

    it('should still pick up inversePatch fields not yet tracked by the existing UPDATE', () => {
      const changes = [
        createChange('UPDATE', '1', { name: 'Bob' }, new Date('2025-01-01T10:00:00Z'), { name: 'Alice' }),
        createChange('UPDATE', '1', { age: 30 }, new Date('2025-01-01T10:01:00Z'), { age: 20 })
      ];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      expect(actions.updates.get(key)?.inversePatch).toEqual({ name: 'Alice', age: 20 });
    });
  });

  describe('DELETE → INSERT 同 key 碰撞 (RXD-033)', () => {
    it('should not leave the same key in both deletes and inserts when an INSERT follows a DELETE', () => {
      const changes = [
        createChange('DELETE', '1', null, new Date('2025-01-01T10:00:00Z'), { name: 'Alice' }),
        createChange('INSERT', '1', { name: 'AliceReborn' }, new Date('2025-01-01T10:01:00Z'), null)
      ];
      const actions = compactChanges(changes);
      const key = getRxDBChangeKey(changes[0]);

      expect(actions.inserts.has(key)).toBe(true);
      expect(actions.inserts.get(key)?.patch).toEqual({ name: 'AliceReborn' });
      // 同一个 key 不能同时挂在 deletes 里，否则下游 push 批次会把同一批原始变更算两次
      expect(actions.deletes.has(key)).toBe(false);
    });
  });
});
