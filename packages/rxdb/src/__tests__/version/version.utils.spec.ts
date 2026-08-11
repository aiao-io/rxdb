/**
 * @fileoverview version.utils.ts 的测试套件
 *
 * 测试版本工具函数，包括：
 * - remote_change_to_local 转换函数
 */

import { describe, expect, it } from 'vitest';
import type { RemoteChange } from '../../system/system.interface.js';
import { remote_change_to_local } from '../../version/version.utils.js';

function makeRemoteChange(
  overrides: Partial<RemoteChange> & Pick<RemoteChange, 'id' | 'entity' | 'entityId' | 'type'>
): RemoteChange {
  return {
    namespace: 'public',
    patch: null,
    inversePatch: null,
    transactionId: null,
    localId: null,
    clientId: 'client-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides
  };
}

describe('version.utils', () => {
  describe('remote_change_to_local', () => {
    it('应当将空数组转换为空数组', () => {
      const result = remote_change_to_local([], {});
      expect(result).toEqual([]);
    });

    it('应当将单个远程变更转换为本地变更', () => {
      const remoteChange = makeRemoteChange({
        id: 1,
        entity: 'User',
        entityId: 'user-123',
        type: 'INSERT',
        patch: { name: 'Test User' },
        clientId: 'client-1'
      });

      const result = remote_change_to_local([remoteChange], {});

      expect(result.length).toBe(1);
      expect(result[0].entity).toBe('User');
      expect(result[0].entityId).toBe('user-123');
      expect(result[0].type).toBe('INSERT');
      expect(result[0].remoteId).toBe(1);
      expect(result[0]).not.toHaveProperty('clientId');
    });

    it('应当保留原始数据', () => {
      const remoteChange = makeRemoteChange({
        id: 2,
        entity: 'Post',
        entityId: 'post-456',
        type: 'UPDATE',
        patch: { title: 'Test Post', content: 'Content' },
        clientId: 'client-2'
      });

      const result = remote_change_to_local([remoteChange], {});

      expect(result[0].patch).toEqual({ title: 'Test Post', content: 'Content' });
    });

    it('应当使用 base 覆盖属性', () => {
      const remoteChange = makeRemoteChange({
        id: 3,
        entity: 'Comment',
        entityId: 'comment-789',
        type: 'DELETE',
        patch: null,
        clientId: 'client-3'
      });

      const base = {
        branchId: 'branch-main'
      };

      const result = remote_change_to_local([remoteChange], base);

      expect(result[0].branchId).toBe('branch-main');
    });

    it('应当使用 base.entityId 覆盖远程 entityId', () => {
      const remoteChange = makeRemoteChange({
        id: 4,
        entity: 'User',
        entityId: 'remote-entity-id',
        type: 'INSERT',
        patch: {},
        clientId: 'client-4'
      });

      const base = {
        entityId: 'local-entity-id' as `${string}-${string}-${string}-${string}-${string}`
      };

      const result = remote_change_to_local([remoteChange], base);

      expect(result[0].entityId).toBe('local-entity-id');
    });

    it('应当将远程 id 映射到 remoteId', () => {
      const remoteChange = makeRemoteChange({
        id: 999,
        entity: 'User',
        entityId: 'user-1',
        type: 'INSERT',
        patch: {},
        clientId: 'client-x'
      });

      const result = remote_change_to_local([remoteChange], {});

      expect(result[0].remoteId).toBe(999);
      expect(result[0]).not.toHaveProperty('id');
    });

    it('应当处理多个远程变更', () => {
      const remoteChanges: RemoteChange[] = [
        makeRemoteChange({
          id: 1,
          entity: 'User',
          entityId: 'user-1',
          type: 'INSERT',
          patch: { name: 'User 1' },
          clientId: 'client-1'
        }),
        makeRemoteChange({
          id: 2,
          entity: 'User',
          entityId: 'user-2',
          type: 'INSERT',
          patch: { name: 'User 2' },
          clientId: 'client-1'
        }),
        makeRemoteChange({
          id: 3,
          entity: 'Post',
          entityId: 'post-1',
          type: 'INSERT',
          patch: { title: 'Post 1' },
          clientId: 'client-1'
        })
      ];

      const result = remote_change_to_local(remoteChanges, {});

      expect(result.length).toBe(3);
      expect(result[0].remoteId).toBe(1);
      expect(result[1].remoteId).toBe(2);
      expect(result[2].remoteId).toBe(3);
    });

    it('应当移除 clientId 字段', () => {
      const remoteChange = makeRemoteChange({
        id: 5,
        entity: 'User',
        entityId: 'user-5',
        type: 'UPDATE',
        patch: {},
        clientId: 'should-be-removed'
      });

      const result = remote_change_to_local([remoteChange], {});

      expect(result[0]).not.toHaveProperty('clientId');
    });

    it('应当保留操作类型', () => {
      const operations = ['INSERT', 'UPDATE', 'DELETE'] as const;

      for (const operation of operations) {
        const remoteChange = makeRemoteChange({
          id: 1,
          entity: 'User',
          entityId: 'user-1',
          type: operation,
          patch: operation === 'DELETE' ? null : {},
          clientId: 'client-1'
        });

        const result = remote_change_to_local([remoteChange], {});
        expect(result[0].type).toBe(operation);
      }
    });
  });
});
