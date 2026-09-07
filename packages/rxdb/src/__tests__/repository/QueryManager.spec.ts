import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { QueryManager, type MergeQueryTaskCreateFn } from '../../repository/QueryManager.js';
import { ENTITY_LOCAL_CREATE_EVENT, ENTITY_LOCAL_REMOVE_EVENT, ENTITY_LOCAL_UPDATE_EVENT } from '../../rxdb-events.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
import { METADATA } from '../../rxdb.private.js';

class TestEntity {
  static entityName = 'TestEntity';
  id!: string;
  name!: string;
  value?: number;
}

class RelatedEntity {
  static entityName = 'RelatedEntity';
  id!: string;
}

Object.assign(TestEntity, {
  [METADATA]: {
    name: 'TestEntity',
    namespace: 'public',
    sync: {
      type: SyncType.None,
      local: { adapter: 'local' }
    }
  }
});

Object.assign(RelatedEntity, {
  [METADATA]: {
    name: 'RelatedEntity',
    namespace: 'public',
    sync: {
      type: SyncType.None,
      local: { adapter: 'local' }
    }
  }
});

type CapturedEventListener = (event: unknown) => void;

const createMockRxDB = (eventListeners: Map<string, CapturedEventListener>) => ({
  addEventListener: vi.fn((event: string, handler: CapturedEventListener) => {
    eventListeners.set(event, handler);
  }),
  getAdapter: vi.fn(),
  entityManager: {
    // getEntityRef 未命中缓存返回 undefined，模拟"实体尚未缓存"——与 merge_create.spec.ts /
    // merge_tree_create.spec.ts / stale-event.utils.spec.ts 的约定一致。真实 #serialize 在
    // UPDATE 门控判定（need_refresh_update.ts）重建完整实体时也会调用它，缺失会直接抛错。
    getEntityRef: vi.fn(() => undefined),
    createEntityRef: vi.fn((_type: typeof TestEntity, data: TestEntity) => data)
  },
  schemaManager: {
    getEntityType: vi.fn((entity: string, namespace: string) => {
      if (entity === 'TestEntity' && namespace === 'public') return TestEntity;
      if (entity === 'RelatedEntity' && namespace === 'public') return RelatedEntity;
      return null;
    }),
    getEntityMetadata: vi.fn((entity: string, namespace: string) => {
      if (entity === 'TestEntity' && namespace === 'public') return getEntityMetadata(TestEntity);
      if (entity === 'RelatedEntity' && namespace === 'public') return getEntityMetadata(RelatedEntity);
      return undefined;
    })
  },
  options: {}
});

type MockRxDB = ReturnType<typeof createMockRxDB>;

// 创建有效查询选项的辅助函数。
const createFindOptions = (overrides = {}) => ({
  type: 'find' as const,
  options: {
    where: {
      combinator: 'and' as const,
      rules: []
    },
    ...overrides
  }
});

// 注意：当前未使用；需要时在调用处保留最小辅助逻辑。

describe('QueryManager', () => {
  let mockRxDB: MockRxDB;
  let queryManager: QueryManager<typeof TestEntity>;
  let eventListeners: Map<string, CapturedEventListener>;

  beforeEach(() => {
    eventListeners = new Map();

    mockRxDB = createMockRxDB(eventListeners);

    queryManager = new QueryManager(mockRxDB as unknown as RxDB, TestEntity);
  });

  describe('构造函数', () => {
    it('应使用 rxdb、EntityType 和 repository 初始化', () => {
      expect(queryManager).toBeDefined();
      expect(mockRxDB.addEventListener).toHaveBeenCalled();
    });

    it('应为实体变更注册事件监听器', () => {
      expect(eventListeners.has(ENTITY_LOCAL_CREATE_EVENT)).toBe(true);
      expect(eventListeners.has(ENTITY_LOCAL_UPDATE_EVENT)).toBe(true);
      expect(eventListeners.has(ENTITY_LOCAL_REMOVE_EVENT)).toBe(true);
    });
  });

  describe('createTask', () => {
    it('应创建具有唯一缓存键的新任务', async () => {
      const runner = vi.fn(() => of([{ id: '1', name: 'Test' }]));
      const getFingerprint = vi.fn(() => ['fingerprint']);

      const task = queryManager.createTask({
        options: createFindOptions(),
        runner,
        getFingerprint
      });

      expect(task).toBeDefined();
      expect(task.result$).toBeDefined();

      const result = await firstValueFrom(task.result$);
      expect(result).toEqual([{ id: '1', name: 'Test' }]);
    });

    it('应对相同查询选项重用缓存的任务', () => {
      const runner = vi.fn(() => of([{ id: '1', name: 'Test' }]));
      const getFingerprint = vi.fn(() => ['fingerprint']);
      const options = createFindOptions();

      const task1 = queryManager.createTask({ options, runner, getFingerprint });
      const task2 = queryManager.createTask({ options, runner, getFingerprint });

      expect(task1).toBe(task2);

      // 两个订阅同时活着，共享同一个任务，只查一次
      const subscriptions = [task1.result$.subscribe(), task2.result$.subscribe()];
      expect(runner).toHaveBeenCalledTimes(1);

      subscriptions.forEach(subscription => subscription.unsubscribe());
    });

    it('全部退订后重新订阅会重新查询', async () => {
      const runner = vi.fn(() => of([{ id: '1', name: 'Test' }]));
      const getFingerprint = vi.fn(() => ['fingerprint']);
      const options = createFindOptions();

      const task = queryManager.createTask({ options, runner, getFingerprint });

      // firstValueFrom 取到首个值就退订 —— 订阅者归零，任务随即被清理
      await firstValueFrom(task.result$);
      await firstValueFrom(task.result$);

      // 复用已清理的任务只会重放陈旧结果且永不更新，因此第二次必须重新查
      expect(runner).toHaveBeenCalledTimes(2);
    });

    it('全部退订后重建任务仍保留调用方声明的实体依赖', async () => {
      const runner = vi.fn(() => of([]));
      const mergeCreate = vi.fn<MergeQueryTaskCreateFn<typeof TestEntity>>(task => task.refresh());
      const task = queryManager.createTask({
        options: createFindOptions(),
        runner,
        getFingerprint: result => [result.length],
        relationEntityTypes: [RelatedEntity]
      });
      const createHandler = eventListeners.get(ENTITY_LOCAL_CREATE_EVENT);
      queryManager.registerMergeCreateFn('find', mergeCreate);
      vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
        callback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
        return 1;
      });
      const event = {
        type: ENTITY_LOCAL_CREATE_EVENT,
        entities: [
          {
            type: 'INSERT',
            namespace: 'public',
            entity: 'RelatedEntity',
            id: 'related-1',
            patch: { id: 'related-1' },
            inversePatch: null,
            recordAt: new Date(),
            origin: 'test'
          }
        ]
      };

      const first = task.result$.subscribe();
      createHandler!(event);
      await vi.waitFor(() => expect(mergeCreate).toHaveBeenCalledTimes(1));
      first.unsubscribe();

      const second = task.result$.subscribe();
      createHandler!(event);
      await vi.waitFor(() => expect(mergeCreate).toHaveBeenCalledTimes(2));
      second.unsubscribe();
      vi.unstubAllGlobals();
    });

    it('可关闭非实体结果的自动实体缓存', () => {
      const task = queryManager.createTask({
        options: createFindOptions(),
        runner: () => of([{ id: 'nested', node: { id: 'real' } }]),
        getFingerprint: result => [result.length],
        autoCache: false
      });

      const subscription = task.result$.subscribe();

      expect(task.resultEntityIds).toEqual(new Set());
      expect(task.resultEntitySet).toEqual(new Set());
      subscription.unsubscribe();
    });

    it('应为不同查询选项创建不同任务', async () => {
      const runner1 = vi.fn(() => of([{ id: '1', name: 'Test1' }]));
      const runner2 = vi.fn(() => of([{ id: '2', name: 'Test2' }]));
      const getFingerprint = vi.fn(() => ['fingerprint']);

      const task1 = queryManager.createTask({
        options: { type: 'find', options: { where: { combinator: 'and', rules: [] } } },
        runner: runner1,
        getFingerprint
      });

      const task2 = queryManager.createTask({
        options: { type: 'count', options: { where: { combinator: 'and', rules: [] } } },
        runner: runner2,
        getFingerprint
      });

      await firstValueFrom(task1.result$);
      await firstValueFrom(task2.result$);

      expect(runner1).toHaveBeenCalledTimes(1);
      expect(runner2).toHaveBeenCalledTimes(1);
    });

    it('应在运行器完成时发出结果', async () => {
      const runner = vi.fn(() => of([{ id: '1', name: 'Test' }]));
      const getFingerprint = vi.fn(() => ['fingerprint']);
      const options = createFindOptions();

      const task = queryManager.createTask({ options, runner, getFingerprint });

      const result = await firstValueFrom(task.result$);
      expect(result).toEqual([{ id: '1', name: 'Test' }]);
      expect(runner).toHaveBeenCalledTimes(1);
    });
  });

  describe('任务生命周期', () => {
    it('应在所有观察者取消订阅时清理任务', async () => {
      const runner = vi.fn(() => of([{ id: '1', name: 'Test' }]));
      const getFingerprint = vi.fn(() => ['fingerprint']);
      const options = createFindOptions();

      const task = queryManager.createTask({ options, runner, getFingerprint });

      const subscription1 = task.result$.subscribe();
      const subscription2 = task.result$.subscribe();

      expect(task.observerCount).toBe(2);

      subscription1.unsubscribe();
      expect(task.observerCount).toBe(1);

      subscription2.unsubscribe();
      expect(task.observerCount).toBe(0);
    });

    it('应向后加入的订阅者立即提供缓存结果', () => {
      const runner = vi.fn(() => of([{ id: '1', name: 'Test' }]));
      const getFingerprint = vi.fn(() => ['fingerprint']);
      const options = createFindOptions();

      const task = queryManager.createTask({ options, runner, getFingerprint });

      // 第一个订阅者触发执行
      let result1: unknown;
      const first = task.result$.subscribe(value => (result1 = value));

      // 任务仍活着时加入的订阅者直接拿缓存，不重复查询
      let result2: unknown;
      const second = task.result$.subscribe(value => (result2 = value));

      expect(result1).toEqual(result2);
      expect(runner).toHaveBeenCalledTimes(1);

      first.unsubscribe();
      second.unsubscribe();
    });
  });

  describe('实体变更事件', () => {
    it('应处理 ENTITY_LOCAL_CREATE_EVENT', () => {
      const createHandler = eventListeners.get(ENTITY_LOCAL_CREATE_EVENT);
      expect(createHandler).toBeDefined();

      const event = {
        type: ENTITY_LOCAL_CREATE_EVENT,
        entities: [
          {
            entity: 'TestEntity',
            namespace: 'public',
            id: 'new-1',
            patch: { id: 'new-1', name: 'New Entity' }
          }
        ]
      };

      // 处理事件时不应抛错。
      expect(() => createHandler!(event)).not.toThrow();
    });

    it('跨 tab typed CREATE 只刷新一次查询缓存', async () => {
      const createHandler = eventListeners.get(ENTITY_LOCAL_CREATE_EVENT);
      expect(createHandler).toBeDefined();

      const runner = vi.fn(() => of([]));
      const task = queryManager.createTask({
        options: createFindOptions(),
        runner,
        getFingerprint: vi.fn(result => [result.length])
      });
      const mergeCreate = vi.fn<MergeQueryTaskCreateFn<typeof TestEntity>>((activeTask, entities) => {
        const created = entities.map(entity => activeTask.serialize(entity));
        activeTask.next(created);
      });
      queryManager.registerMergeCreateFn('find', mergeCreate);
      const emissions: TestEntity[][] = [];
      const subscription = task.result$.subscribe(value => emissions.push(value));
      const payload = new Uint8Array([0, 255]);
      vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
        callback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
        return 1;
      });

      createHandler!({
        type: ENTITY_LOCAL_CREATE_EVENT,
        entities: [
          {
            type: 'INSERT',
            namespace: 'public',
            entity: 'TestEntity',
            id: 1n,
            patch: { id: 1n, name: 'typed', value: 9_007_199_254_740_993n, payload },
            inversePatch: null,
            recordAt: new Date(),
            origin: 'cross-tab'
          }
        ]
      });

      await vi.waitFor(() => expect(mergeCreate).toHaveBeenCalledTimes(1));
      expect(mockRxDB.entityManager.createEntityRef).toHaveBeenCalledTimes(1);
      const created = mockRxDB.entityManager.createEntityRef.mock.calls[0]?.[1] as unknown as Record<string, unknown>;
      expect(created['id']).toBe(1n);
      expect(created['value']).toBe(9_007_199_254_740_993n);
      expect(created['payload']).toEqual(new Uint8Array([0, 255]));
      expect(emissions).toHaveLength(2);

      subscription.unsubscribe();
      vi.unstubAllGlobals();
    });

    it('应处理 ENTITY_LOCAL_UPDATE_EVENT', () => {
      const updateHandler = eventListeners.get(ENTITY_LOCAL_UPDATE_EVENT);
      expect(updateHandler).toBeDefined();

      const event = {
        type: ENTITY_LOCAL_UPDATE_EVENT,
        entities: [
          {
            entity: 'TestEntity',
            namespace: 'public',
            id: 'test-1',
            patch: { name: 'Updated Name' }
          }
        ]
      };

      expect(() => updateHandler!(event)).not.toThrow();
    });

    it('应处理 ENTITY_LOCAL_REMOVE_EVENT', () => {
      const removeHandler = eventListeners.get(ENTITY_LOCAL_REMOVE_EVENT);
      expect(removeHandler).toBeDefined();

      const event = {
        type: ENTITY_LOCAL_REMOVE_EVENT,
        entities: [
          {
            entity: 'TestEntity',
            namespace: 'public',
            id: 'test-1',
            inversePatch: { id: 'test-1', name: 'Removed Entity' }
          }
        ]
      };

      expect(() => removeHandler!(event)).not.toThrow();
    });

    it('应在不存在任务时忽略事件', () => {
      const createHandler = eventListeners.get(ENTITY_LOCAL_CREATE_EVENT);

      const event = {
        type: ENTITY_LOCAL_CREATE_EVENT,
        entities: [
          {
            entity: 'TestEntity',
            namespace: 'public',
            id: 'new-1',
            patch: { id: 'new-1', name: 'New Entity' }
          }
        ]
      };

      // query_task_map 为空时不应处理事件。
      expect(() => createHandler!(event)).not.toThrow();
      expect(mockRxDB.entityManager.createEntityRef).not.toHaveBeenCalled();
    });

    it('应忽略不相关实体类型的事件', () => {
      mockRxDB.schemaManager.getEntityType.mockReturnValue(null);

      const createHandler = eventListeners.get(ENTITY_LOCAL_CREATE_EVENT);

      const event = {
        type: ENTITY_LOCAL_CREATE_EVENT,
        entities: [
          {
            entity: 'OtherEntity',
            namespace: 'public',
            id: 'other-1',
            patch: { id: 'other-1', name: 'Other' }
          }
        ]
      };

      expect(() => createHandler!(event)).not.toThrow();
    });

    it('应过滤掉仅 updatedAt 变更', () => {
      const updateHandler = eventListeners.get(ENTITY_LOCAL_UPDATE_EVENT);

      // 先创建任务。
      const runner = vi.fn(() => of([{ id: '1', name: 'Test' }]));
      const getFingerprint = vi.fn(() => ['fingerprint']);
      queryManager.createTask({
        options: createFindOptions(),
        runner,
        getFingerprint
      });

      const event = {
        type: ENTITY_LOCAL_UPDATE_EVENT,
        entities: [
          {
            entity: 'TestEntity',
            namespace: 'public',
            id: 'test-1',
            patch: { updatedAt: new Date() } // 仅 updatedAt 发生变化
          }
        ]
      };

      // 应过滤掉此变更。
      expect(() => updateHandler!(event)).not.toThrow();
    });

    it('应处理 DELETE 事件并使用 inversePatch', () => {
      const removeHandler = eventListeners.get(ENTITY_LOCAL_REMOVE_EVENT);
      expect(removeHandler).toBeDefined();

      // 先创建任务以触发 serialize。
      const runner = vi.fn(() => of([{ id: '1', name: 'Test' }]));
      const getFingerprint = vi.fn(() => ['fingerprint']);
      queryManager.createTask({
        options: createFindOptions(),
        runner,
        getFingerprint
      });

      // 订阅以确保任务处于活动状态。
      const task = queryManager.createTask({
        options: createFindOptions(),
        runner,
        getFingerprint
      });
      task.result$.subscribe();

      const event = {
        type: ENTITY_LOCAL_REMOVE_EVENT,
        entities: [
          {
            entity: 'TestEntity',
            namespace: 'public',
            id: 'test-1',
            type: 'DELETE',
            inversePatch: { id: 'test-1', name: 'Deleted Entity' }
          }
        ]
      };

      expect(() => removeHandler!(event)).not.toThrow();
    });

    it('应处理带有额外 patch 属性的 UPDATE 事件', () => {
      const updateHandler = eventListeners.get(ENTITY_LOCAL_UPDATE_EVENT);

      // 先创建任务。
      const runner = vi.fn(() => of([{ id: '1', name: 'Test' }]));
      const getFingerprint = vi.fn(() => ['fingerprint']);
      const task = queryManager.createTask({
        options: createFindOptions(),
        runner,
        getFingerprint
      });
      task.result$.subscribe();

      const event = {
        type: ENTITY_LOCAL_UPDATE_EVENT,
        entities: [
          {
            entity: 'TestEntity',
            namespace: 'public',
            id: 'test-1',
            type: 'UPDATE',
            patch: { name: 'Updated Name', value: 42 }
          }
        ]
      };

      expect(() => updateHandler!(event)).not.toThrow();
    });
  });

  describe('注册自定义合并函数', () => {
    it('应注册自定义创建合并函数', () => {
      const customMergeFn = vi.fn();
      queryManager.registerMergeCreateFn('customType', customMergeFn);

      // 验证不会抛错。
      expect(() => queryManager.registerMergeCreateFn('customType', customMergeFn)).not.toThrow();
    });

    it('应注册自定义更新合并函数', () => {
      const customMergeFn = vi.fn();
      queryManager.registerMergeUpdateFn('customType', customMergeFn);

      expect(() => queryManager.registerMergeUpdateFn('customType', customMergeFn)).not.toThrow();
    });

    it('应注册自定义删除合并函数', () => {
      const customMergeFn = vi.fn();
      queryManager.registerMergeRemoveFn('customType', customMergeFn);

      expect(() => queryManager.registerMergeRemoveFn('customType', customMergeFn)).not.toThrow();
    });
  });
});
