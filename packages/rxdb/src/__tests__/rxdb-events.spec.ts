import { describe, expect, it } from 'vitest';
import {
  ConflictDetectedEvent,
  ConflictPendingEvent,
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_NEW_EVENT,
  ENTITY_LOCAL_REMOVE_EVENT,
  ENTITY_LOCAL_UPDATE_EVENT,
  ENTITY_REMOTE_CREATE_EVENT,
  ENTITY_REMOTE_REMOVE_EVENT,
  ENTITY_REMOTE_UPDATE_EVENT,
  EntityLocalCreatedEvent,
  EntityLocalNewEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  EntityRemoteCreatedEvent,
  EntityRemoteRemovedEvent,
  EntityRemoteUpdatedEvent,
  RxDBEntityLocalCreatedEventData,
  RxDBEntityLocalNewEventData,
  RxDBEntityLocalRemovedEventData,
  RxDBEntityLocalUpdatedEventData,
  RxDBEntityRemoteCreatedEventData,
  RxDBEntityRemoteRemovedEventData,
  RxDBEntityRemoteUpdatedEventData,
  SYNC_COMPLETE_EVENT,
  SYNC_ERROR_EVENT,
  SyncCompleteEvent,
  SyncErrorEvent,
  TRANSACTION_BEGIN,
  TRANSACTION_COMMIT,
  TRANSACTION_ROLLBACK,
  TransactionBeginEvent,
  TransactionCommitEvent,
  TransactionRollbackEvent
} from '../rxdb-events.js';
import { IRxDBChange } from '../system/system.interface.js';

const createChange = (id: number, type: IRxDBChange['type'], entityId: string): IRxDBChange => ({
  id,
  namespace: 'public',
  entity: 'User',
  entityId,
  type,
  createdAt: new Date(),
  updatedAt: new Date()
});

describe('rxdb-events', () => {
  describe('事件常量', () => {
    it('应定义所有事件类型常量', () => {
      expect(ENTITY_LOCAL_NEW_EVENT).toBe('ENTITY_LOCAL_NEW');
      expect(ENTITY_LOCAL_CREATE_EVENT).toBe('ENTITY_LOCAL_CREATE');
      expect(ENTITY_LOCAL_UPDATE_EVENT).toBe('ENTITY_LOCAL_UPDATE');
      expect(ENTITY_LOCAL_REMOVE_EVENT).toBe('ENTITY_LOCAL_REMOVE');
      expect(TRANSACTION_BEGIN).toBe('TRANSACTION_BEGIN');
      expect(TRANSACTION_COMMIT).toBe('TRANSACTION_COMMIT');
      expect(TRANSACTION_ROLLBACK).toBe('TRANSACTION_ROLLBACK');
    });
  });

  describe('EntityLocalNewEvent', () => {
    it('应创建实体初始化事件', () => {
      const eventData: RxDBEntityLocalNewEventData[] = [
        {
          type: 'NEW',
          namespace: 'test',
          entity: 'User',
          id: 'user-1',
          patch: { id: 'user-1', name: 'John' },
          inversePatch: null,
          recordAt: new Date()
        }
      ];

      const event = new EntityLocalNewEvent(eventData);
      expect(event.type).toBe(ENTITY_LOCAL_NEW_EVENT);
      expect(event.entities).toBe(eventData);
      expect(event.entities).toHaveLength(1);
    });

    it('应处理空实体列表', () => {
      const event = new EntityLocalNewEvent([]);
      expect(event.entities).toHaveLength(0);
    });

    it('应处理多个实体', () => {
      const eventData: RxDBEntityLocalNewEventData[] = [
        {
          type: 'NEW',
          namespace: 'test',
          entity: 'User',
          id: 'user-1',
          patch: { id: 'user-1', name: 'John' },
          inversePatch: null,
          recordAt: new Date()
        },
        {
          type: 'NEW',
          namespace: 'test',
          entity: 'User',
          id: 'user-2',
          patch: { id: 'user-2', name: 'Jane' },
          inversePatch: null,
          recordAt: new Date()
        }
      ];

      const event = new EntityLocalNewEvent(eventData);
      expect(event.entities).toHaveLength(2);
    });
  });

  describe('EntityLocalCreatedEvent', () => {
    it('应创建实体创建事件', () => {
      const eventData: RxDBEntityLocalCreatedEventData[] = [
        {
          type: 'INSERT',
          namespace: 'test',
          entity: 'User',
          id: 'user-1',
          patch: { id: 'user-1', name: 'John' },
          inversePatch: null,
          recordAt: new Date()
        }
      ];

      const event = new EntityLocalCreatedEvent(eventData);
      expect(event.type).toBe(ENTITY_LOCAL_CREATE_EVENT);
      expect(event.entities).toBe(eventData);
    });

    it('应包含完整实体数据', () => {
      const fullData = {
        id: 'user-1',
        name: 'John',
        email: 'john@example.com',
        age: 30
      };

      const eventData: RxDBEntityLocalCreatedEventData[] = [
        {
          type: 'INSERT',
          namespace: 'test',
          entity: 'User',
          id: 'user-1',
          patch: fullData,
          inversePatch: null,
          recordAt: new Date()
        }
      ];

      const event = new EntityLocalCreatedEvent(eventData);
      expect(event.entities[0].patch).toEqual(fullData);
    });
  });

  describe('EntityLocalUpdatedEvent', () => {
    it('应创建实体更新事件', () => {
      const eventData: RxDBEntityLocalUpdatedEventData[] = [
        {
          type: 'UPDATE',
          namespace: 'test',
          entity: 'User',
          id: 'user-1',
          patch: { id: 'user-1', name: 'John Doe' },
          inversePatch: { id: 'user-1', name: 'John' },
          recordAt: new Date()
        }
      ];

      const event = new EntityLocalUpdatedEvent(eventData);
      expect(event.type).toBe(ENTITY_LOCAL_UPDATE_EVENT);
      expect(event.entities).toBe(eventData);
    });

    it('应包含正向和反向补丁', () => {
      const eventData: RxDBEntityLocalUpdatedEventData[] = [
        {
          type: 'UPDATE',
          namespace: 'test',
          entity: 'User',
          id: 'user-1',
          patch: { id: 'user-1', name: 'John Doe', age: 31 },
          inversePatch: { id: 'user-1', name: 'John', age: 30 },
          recordAt: new Date()
        }
      ];

      const event = new EntityLocalUpdatedEvent(eventData);
      expect(event.entities[0].patch).toMatchObject({ name: 'John Doe', age: 31 });
      expect(event.entities[0].inversePatch).toMatchObject({ name: 'John', age: 30 });
    });

    it('应支持部分字段更新', () => {
      const eventData: RxDBEntityLocalUpdatedEventData[] = [
        {
          type: 'UPDATE',
          namespace: 'test',
          entity: 'User',
          id: 'user-1',
          patch: { id: 'user-1', name: 'Updated Name' },
          inversePatch: { id: 'user-1', name: 'Original Name' },
          recordAt: new Date()
        }
      ];

      const event = new EntityLocalUpdatedEvent(eventData);
      expect(event.entities[0].patch).toHaveProperty('name');
    });
  });

  describe('EntityLocalRemovedEvent', () => {
    it('应创建实体删除事件', () => {
      const eventData: RxDBEntityLocalRemovedEventData[] = [
        {
          type: 'DELETE',
          namespace: 'test',
          entity: 'User',
          id: 'user-1',
          patch: null,
          inversePatch: { id: 'user-1', name: 'John', age: 30 },
          recordAt: new Date()
        }
      ];

      const event = new EntityLocalRemovedEvent(eventData);
      expect(event.type).toBe(ENTITY_LOCAL_REMOVE_EVENT);
      expect(event.entities).toBe(eventData);
    });

    it('删除事件的 patch 应为 null', () => {
      const eventData: RxDBEntityLocalRemovedEventData[] = [
        {
          type: 'DELETE',
          namespace: 'test',
          entity: 'User',
          id: 'user-1',
          patch: null,
          inversePatch: { id: 'user-1', name: 'John' },
          recordAt: new Date()
        }
      ];

      const event = new EntityLocalRemovedEvent(eventData);
      expect(event.entities[0].patch).toBeNull();
    });

    it('应包含 inversePatch 用于恢复', () => {
      const deletedData = {
        id: 'user-1',
        name: 'John',
        email: 'john@example.com',
        age: 30
      };

      const eventData: RxDBEntityLocalRemovedEventData[] = [
        {
          type: 'DELETE',
          namespace: 'test',
          entity: 'User',
          id: 'user-1',
          patch: null,
          inversePatch: deletedData,
          recordAt: new Date()
        }
      ];

      const event = new EntityLocalRemovedEvent(eventData);
      expect(event.entities[0].inversePatch).toEqual(deletedData);
    });
  });

  describe('TransactionBeginEvent', () => {
    it('应创建事务开始事件', () => {
      const event = new TransactionBeginEvent();
      expect(event.type).toBe(TRANSACTION_BEGIN);
    });

    // RXD-062：事务事件除 type 外只携带事务身份，且身份是可选的——
    // 不带身份时必须仍是 undefined，否则并发事务上下文会按一个假身份分组。
    it('事务开始事件除事务身份外不携带数据', () => {
      const anonymous = new TransactionBeginEvent();
      // 键顺序是构造函数参数属性的转译细节，按集合比对
      expect(Object.keys(anonymous).sort()).toEqual(['transactionId', 'type']);
      expect(anonymous.transactionId).toBeUndefined();

      const identified = new TransactionBeginEvent('tx-1');
      expect(identified.transactionId).toBe('tx-1');
    });
  });

  describe('TransactionCommitEvent', () => {
    it('应创建事务提交事件', () => {
      const event = new TransactionCommitEvent();
      expect(event.type).toBe(TRANSACTION_COMMIT);
    });

    // RXD-062：事务事件除 type 外只携带事务身份，且身份是可选的——
    // 不带身份时必须仍是 undefined，否则并发事务上下文会按一个假身份分组。
    it('事务提交事件除事务身份外不携带数据', () => {
      const anonymous = new TransactionCommitEvent();
      // 键顺序是构造函数参数属性的转译细节，按集合比对
      expect(Object.keys(anonymous).sort()).toEqual(['transactionId', 'type']);
      expect(anonymous.transactionId).toBeUndefined();

      const identified = new TransactionCommitEvent('tx-1');
      expect(identified.transactionId).toBe('tx-1');
    });
  });

  describe('TransactionRollbackEvent', () => {
    it('应创建事务回滚事件', () => {
      const event = new TransactionRollbackEvent();
      expect(event.type).toBe(TRANSACTION_ROLLBACK);
    });

    // RXD-062：事务事件除 type 外只携带事务身份，且身份是可选的——
    // 不带身份时必须仍是 undefined，否则并发事务上下文会按一个假身份分组。
    it('事务回滚事件除事务身份外不携带数据', () => {
      const anonymous = new TransactionRollbackEvent();
      // 键顺序是构造函数参数属性的转译细节，按集合比对
      expect(Object.keys(anonymous).sort()).toEqual(['transactionId', 'type']);
      expect(anonymous.transactionId).toBeUndefined();

      const identified = new TransactionRollbackEvent('tx-1');
      expect(identified.transactionId).toBe('tx-1');
    });
  });

  describe('事件数据接口', () => {
    it('应正确标识不同类型的事件数据', () => {
      const newData: RxDBEntityLocalNewEventData = {
        type: 'NEW',
        namespace: 'test',
        entity: 'User',
        id: 'user-1',
        patch: { id: 'user-1', name: 'John' },
        inversePatch: null,
        recordAt: new Date()
      };

      const createdData: RxDBEntityLocalCreatedEventData = {
        type: 'INSERT',
        namespace: 'test',
        entity: 'User',
        id: 'user-1',
        patch: { id: 'user-1', name: 'John' },
        inversePatch: null,
        recordAt: new Date()
      };

      const updatedData: RxDBEntityLocalUpdatedEventData = {
        type: 'UPDATE',
        namespace: 'test',
        entity: 'User',
        id: 'user-1',
        patch: { id: 'user-1', name: 'John Doe' },
        inversePatch: { id: 'user-1', name: 'John' },
        recordAt: new Date()
      };

      const removedData: RxDBEntityLocalRemovedEventData = {
        type: 'DELETE',
        namespace: 'test',
        entity: 'User',
        id: 'user-1',
        patch: null,
        inversePatch: { id: 'user-1', name: 'John' },
        recordAt: new Date()
      };

      expect(newData.type).toBe('NEW');
      expect(createdData.type).toBe('INSERT');
      expect(updatedData.type).toBe('UPDATE');
      expect(removedData.type).toBe('DELETE');
    });

    it('应包含必要的元数据', () => {
      const now = new Date();
      const eventData: RxDBEntityLocalCreatedEventData = {
        type: 'INSERT',
        namespace: 'myapp',
        entity: 'User',
        id: 'user-123',
        patch: { id: 'user-123', name: 'John' },
        inversePatch: null,
        recordAt: now
      };

      expect(eventData.namespace).toBe('myapp');
      expect(eventData.entity).toBe('User');
      expect(eventData.id).toBe('user-123');
      expect(eventData.recordAt).toBe(now);
    });
  });

  describe('批量操作事件', () => {
    it('应支持批量创建', () => {
      const eventData: RxDBEntityLocalCreatedEventData[] = Array.from({ length: 10 }, (_, i) => ({
        type: 'INSERT',
        namespace: 'test',
        entity: 'User',
        id: `user-${i}`,
        patch: { id: `user-${i}`, name: `User ${i}` },
        inversePatch: null,
        recordAt: new Date()
      }));

      const event = new EntityLocalCreatedEvent(eventData);
      expect(event.entities).toHaveLength(10);
    });

    it('应支持批量更新', () => {
      const eventData: RxDBEntityLocalUpdatedEventData[] = Array.from({ length: 5 }, (_, i) => ({
        type: 'UPDATE',
        namespace: 'test',
        entity: 'User',
        id: `user-${i}`,
        patch: { id: `user-${i}`, name: `Updated ${i}` },
        inversePatch: { id: `user-${i}`, name: `Original ${i}` },
        recordAt: new Date()
      }));

      const event = new EntityLocalUpdatedEvent(eventData);
      expect(event.entities).toHaveLength(5);
    });

    it('应支持批量删除', () => {
      const eventData: RxDBEntityLocalRemovedEventData[] = Array.from({ length: 3 }, (_, i) => ({
        type: 'DELETE',
        namespace: 'test',
        entity: 'User',
        id: `user-${i}`,
        patch: null,
        inversePatch: { id: `user-${i}`, name: `User ${i}` },
        recordAt: new Date()
      }));

      const event = new EntityLocalRemovedEvent(eventData);
      expect(event.entities).toHaveLength(3);
    });
  });

  describe('远程实体事件', () => {
    it('应定义远程事件类型常量', () => {
      expect(ENTITY_REMOTE_CREATE_EVENT).toBe('ENTITY_REMOTE_CREATE');
      expect(ENTITY_REMOTE_UPDATE_EVENT).toBe('ENTITY_REMOTE_UPDATE');
      expect(ENTITY_REMOTE_REMOVE_EVENT).toBe('ENTITY_REMOTE_REMOVE');
    });

    it('应创建远程创建事件', () => {
      const eventData: RxDBEntityRemoteCreatedEventData[] = [
        {
          type: 'INSERT',
          namespace: 'test',
          entity: 'User',
          id: 'user-1',
          data: { id: 'user-1' },
          recordAt: new Date()
        }
      ];

      const event = new EntityRemoteCreatedEvent(eventData);
      expect(event.type).toBe(ENTITY_REMOTE_CREATE_EVENT);
      expect(event.entities).toBe(eventData);
      expect(event.entities[0].data).toBeDefined();
    });

    it('应创建远程更新事件', () => {
      const eventData: RxDBEntityRemoteUpdatedEventData[] = [
        {
          type: 'UPDATE',
          namespace: 'test',
          entity: 'User',
          id: 'user-1',
          data: { id: 'user-1' },
          recordAt: new Date()
        }
      ];

      const event = new EntityRemoteUpdatedEvent(eventData);
      expect(event.type).toBe(ENTITY_REMOTE_UPDATE_EVENT);
      expect(event.entities).toBe(eventData);
    });

    it('应创建远程删除事件', () => {
      const eventData: RxDBEntityRemoteRemovedEventData[] = [
        {
          type: 'DELETE',
          namespace: 'test',
          entity: 'User',
          id: 'user-1',
          data: { id: 'user-1' },
          recordAt: new Date()
        }
      ];

      const event = new EntityRemoteRemovedEvent(eventData);
      expect(event.type).toBe(ENTITY_REMOTE_REMOVE_EVENT);
      expect(event.entities).toBe(eventData);
    });
  });

  describe('同步事件', () => {
    it('应定义同步事件类型常量', () => {
      expect(SYNC_COMPLETE_EVENT).toBe('SYNC_COMPLETE');
      expect(SYNC_ERROR_EVENT).toBe('SYNC_ERROR');
    });

    it('应创建同步完成事件 (pull)', () => {
      const pullResult = {
        pulled: 10,
        compacted: 0,
        applied: 10,
        hasMore: false,
        conflictsResolved: 0,
        conflictsDeferred: 0,
        persistedProgress: true,
        historyInvalidated: true,
        failures: []
      };
      const event = new SyncCompleteEvent('pull', pullResult);

      expect(event.type).toBe(SYNC_COMPLETE_EVENT);
      expect(event.direction).toBe('pull');
      expect(event.result).toBe(pullResult);
    });

    it('应创建同步完成事件 (push)', () => {
      const pushResult = { pushed: 5, failed: 0, compacted: 0, originalCount: 5, failures: [] };
      const event = new SyncCompleteEvent('push', pushResult);

      expect(event.type).toBe(SYNC_COMPLETE_EVENT);
      expect(event.direction).toBe('push');
      expect(event.result).toBe(pushResult);
    });

    it('应创建同步错误事件', () => {
      const error = new Error('Network error');
      const event = new SyncErrorEvent('pull', error);

      expect(event.type).toBe(SYNC_ERROR_EVENT);
      expect(event.direction).toBe('pull');
      expect(event.error).toBe(error);
    });
  });

  describe('冲突事件', () => {
    it('应创建冲突检测事件', () => {
      const conflicts = [
        {
          entityKey: 'public:User:user-1',
          local: createChange(1, 'UPDATE', 'user-1'),
          remote: createChange(2, 'UPDATE', 'user-1')
        }
      ];

      const event = new ConflictDetectedEvent(conflicts, 1, 0);

      expect(event.type).toBe('CONFLICT_DETECTED');
      expect(event.conflicts).toBe(conflicts);
      expect(event.resolved).toBe(1);
      expect(event.deferred).toBe(0);
    });

    it('应创建冲突待处理事件', () => {
      const conflicts = [
        {
          entityKey: 'public:User:user-2',
          local: createChange(3, 'DELETE', 'user-2'),
          remote: createChange(4, 'UPDATE', 'user-2')
        }
      ];

      const event = new ConflictPendingEvent(conflicts);

      expect(event.type).toBe('CONFLICT_PENDING');
      expect(event.conflicts).toBe(conflicts);
    });
  });
});
