/**
 * T011-T014: handle_rxdb_change 单元测试（红阶段）
 *
 * 测试 PGlite 变更事件到 RxDB 事件的转换
 * 这些测试在实施前应该全部失败
 */

import {
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  RxDB,
  RxDBChange
} from '@aiao/rxdb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handle_rxdb_change } from '../handle_rxdb_change.js';
import { PGliteChangeEvent, PGliteChangeType } from '../pglite.interface.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

// Mock 实体类型（参考 SQLite 测试）
class Todo {
  id!: string;
  title!: string;
  completed!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

describe('handle_rxdb_change - T011: 核心逻辑测试', () => {
  let adapter: RxDBAdapterPGlite;
  let rxdb: RxDB;
  let dispatchEventSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // 创建 mock RxDB 实例
    dispatchEventSpy = vi.fn();
    rxdb = {
      schemaManager: {
        getEntityType: vi.fn((name: string) => {
          if (name === 'Todo') return Todo;
          if (name === 'RxDBChange') return RxDBChange;
          return null;
        }),
        getEntityTypeByTableName: vi.fn((tableName: string) => {
          if (tableName === 'Todo' || tableName === 'todo' || tableName === 'todos') return Todo;
          if (tableName === 'RxDBChange' || tableName === 'rxdb_change') return RxDBChange;
          return null;
        }),
        getEntityMetadata: vi.fn((name: string, namespace?: string) => {
          if (name === 'Todo') {
            return {
              namespace: namespace || 'public',
              name: 'Todo',
              tableName: 'todos',
              propertyMap: new Map()
            };
          }
          if (name === 'RxDBChange') {
            return {
              namespace: 'public',
              name: 'RxDBChange',
              tableName: 'rxdb_change',
              propertyMap: new Map()
            };
          }
          return null;
        }),
        getEntityMetadataByTableName: vi.fn((tableName: string, namespace?: string) => {
          if (tableName === 'Todo' || tableName === 'todos') {
            return {
              namespace: namespace || 'public',
              name: 'Todo',
              tableName: 'todos',
              propertyMap: new Map()
            };
          }
          if (tableName === 'RxDBChange' || tableName === 'rxdb_change') {
            return {
              namespace: namespace || 'public',
              name: 'RxDBChange',
              tableName: 'rxdb_change',
              propertyMap: new Map()
            };
          }
          return null;
        })
      },
      dispatchEvent: dispatchEventSpy
    } as unknown as RxDB;

    adapter = new RxDBAdapterPGlite(rxdb, { store: 'memory' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('T011.1: 应该导出 handle_rxdb_change 函数', async () => {
    // 这个测试会失败，因为函数还不存在
    expect(handle_rxdb_change).toBeDefined();
    expect(typeof handle_rxdb_change).toBe('function');
  });

  it('T011.2: INSERT 事件应该触发 EntityLocalCreatedEvent', async () => {
    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test',
      tableName: 'public$Todo',
      rowIds: ['1', '2'],
      recordAt: new Date()
    };

    // 模拟 repository。
    const mockRepo = {
      findByRowIds: vi.fn().mockResolvedValue([
        { id: '1', title: 'Task 1', completed: false, createdAt: new Date(), updatedAt: new Date() },
        { id: '2', title: 'Task 2', completed: false, createdAt: new Date(), updatedAt: new Date() }
      ])
    };

    adapter.getRepository = vi.fn().mockReturnValue(mockRepo);

    await handle_rxdb_change(adapter, event);

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 10));

    // 验证触发了 EntityLocalCreatedEvent
    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(EntityLocalCreatedEvent));
    const callArg = dispatchEventSpy.mock.calls[0][0];
    expect(callArg.entities).toHaveLength(2);
    expect(callArg.entities[0].id).toBe('1');
    expect(callArg.entities[0].type).toBe('INSERT');
  });

  it('T011.3: UPDATE 事件应该触发 EntityLocalUpdatedEvent', async () => {
    const event: PGliteChangeEvent = {
      type: PGliteChangeType.UPDATE,
      dbName: 'test',
      tableName: 'public$Todo',
      rowIds: ['1'],
      recordAt: new Date()
    };

    const mockRepo = {
      findByRowIds: vi
        .fn()
        .mockResolvedValue([
          { id: '1', title: 'Updated', completed: true, createdAt: new Date(), updatedAt: new Date() }
        ])
    };

    adapter.getRepository = vi.fn().mockReturnValue(mockRepo);

    await handle_rxdb_change(adapter, event);

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(EntityLocalUpdatedEvent));
  });

  it('T011.4: DELETE 事件应该触发 EntityLocalRemovedEvent', async () => {
    const event: PGliteChangeEvent = {
      type: PGliteChangeType.DELETE,
      dbName: 'test',
      tableName: 'public$Todo',
      rowIds: ['1'],
      recordAt: new Date()
    };

    const mockRepo = {
      findByRowIds: vi
        .fn()
        .mockResolvedValue([
          { id: '1', title: 'Deleted', completed: false, createdAt: new Date(), updatedAt: new Date() }
        ])
    };

    adapter.getRepository = vi.fn().mockReturnValue(mockRepo);

    await handle_rxdb_change(adapter, event);

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(EntityLocalRemovedEvent));
  });
});

describe('handle_rxdb_change - T012: 事件转换测试', () => {
  let adapter: RxDBAdapterPGlite;
  let rxdb: RxDB;
  let dispatchEventSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    dispatchEventSpy = vi.fn();
    rxdb = {
      schemaManager: {
        getEntityType: vi.fn((name: string) => {
          if (name === 'Todo') return Todo;
          return null;
        }),
        getEntityTypeByTableName: vi.fn((tableName: string) => {
          if (tableName === 'Todo' || tableName === 'todo' || tableName === 'todos') return Todo;
          return null;
        }),
        getEntityMetadata: vi.fn().mockReturnValue({
          namespace: 'public',
          name: 'Todo',
          tableName: 'todos'
        }),
        getEntityMetadataByTableName: vi.fn().mockReturnValue({
          namespace: 'public',
          name: 'Todo',
          tableName: 'todos'
        })
      },
      dispatchEvent: dispatchEventSpy
    } as unknown as RxDB;

    adapter = new RxDBAdapterPGlite(rxdb, { store: 'memory' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('T012.1: 应该正确解析表名（namespace 和 entity）', async () => {
    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test',
      tableName: 'public$Todo',
      rowIds: ['1'],
      recordAt: new Date()
    };

    const mockRepo = {
      findByRowIds: vi
        .fn()
        .mockResolvedValue([{ id: '1', title: 'Task', completed: false, createdAt: new Date(), updatedAt: new Date() }])
    };

    adapter.getRepository = vi.fn().mockReturnValue(mockRepo);

    await handle_rxdb_change(adapter, event);

    // 验证 schemaManager.getEntityTypeByTableName 被正确调用
    expect(rxdb.schemaManager.getEntityTypeByTableName).toHaveBeenCalledWith('Todo', 'public');
  });

  it('T012.2: 应该批量处理多个 rowIds', async () => {
    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test',
      tableName: 'public$Todo',
      rowIds: ['1', '2', '3'],
      recordAt: new Date()
    };

    const mockEntities = [
      { id: '1', title: 'Task 1', completed: false, createdAt: new Date(), updatedAt: new Date() },
      { id: '2', title: 'Task 2', completed: false, createdAt: new Date(), updatedAt: new Date() },
      { id: '3', title: 'Task 3', completed: false, createdAt: new Date(), updatedAt: new Date() }
    ];

    const mockRepo = {
      findByRowIds: vi.fn().mockResolvedValue(mockEntities)
    };

    adapter.getRepository = vi.fn().mockReturnValue(mockRepo);

    await handle_rxdb_change(adapter, event);

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 10));

    // 验证 findByRowIds 接收了正确的 rowIds
    expect(mockRepo.findByRowIds).toHaveBeenCalledWith(['1', '2', '3']);

    // 验证事件包含所有实体
    const callArg = dispatchEventSpy.mock.calls[0][0];
    expect(callArg.entities).toHaveLength(3);
  });

  it('T012.3: 未找到 EntityType 时应该直接返回', async () => {
    // Mock getEntityType 返回 null
    rxdb.schemaManager.getEntityType = vi.fn().mockReturnValue(null);

    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test',
      tableName: 'public$UnknownEntity',
      rowIds: ['1'],
      recordAt: new Date()
    };

    await handle_rxdb_change(adapter, event);

    // 不应该触发任何事件
    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });
});

describe('handle_rxdb_change - T013: RxDBChange 表特殊处理', () => {
  let adapter: RxDBAdapterPGlite;
  let rxdb: RxDB;
  let dispatchEventSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    dispatchEventSpy = vi.fn();
    rxdb = {
      schemaManager: {
        getEntityType: vi.fn((name: string) => {
          if (name === 'RxDBChange') return RxDBChange;
          return null;
        }),
        getEntityTypeByTableName: vi.fn((tableName: string) => {
          if (tableName === 'RxDBChange' || tableName === 'rxdb_change') return RxDBChange;
          return null;
        }),
        getEntityMetadata: vi.fn().mockReturnValue({
          namespace: 'public',
          name: 'RxDBChange',
          tableName: 'rxdb_change',
          propertyMap: new Map([
            ['type', {}],
            ['namespace', {}],
            ['entity', {}],
            ['entityId', {}],
            ['patch', {}],
            ['inversePatch', {}]
          ])
        }),
        getEntityMetadataByTableName: vi.fn().mockReturnValue({
          namespace: 'public',
          name: 'RxDBChange',
          tableName: 'rxdb_change',
          propertyMap: new Map([
            ['type', {}],
            ['namespace', {}],
            ['entity', {}],
            ['entityId', {}],
            ['patch', {}],
            ['inversePatch', {}]
          ])
        })
      },
      dispatchEvent: dispatchEventSpy
    } as unknown as RxDB;

    adapter = new RxDBAdapterPGlite(rxdb, { store: 'memory' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('T013.1: RxDBChange INSERT 应该触发两次事件', async () => {
    const now = new Date();
    const mockChanges = [
      {
        id: 1,
        type: 'INSERT',
        namespace: 'public',
        entity: 'Todo',
        entityId: '1',
        patch: { title: 'New Task' },
        inversePatch: null,
        createdAt: now
      }
    ];

    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test',
      tableName: 'public$RxDBChange',
      rowIds: [1],
      recordAt: now
    };

    const mockRepo = {
      findByRowIds: vi.fn().mockResolvedValue(mockChanges)
    };

    adapter.getRepository = vi.fn().mockReturnValue(mockRepo);

    await handle_rxdb_change(adapter, event);

    // 应该触发两次事件：
    // 1. EntityLocalCreatedEvent（针对被变更的实体）
    // 2. EntityLocalCreatedEvent（针对 RxDBChange 自己）
    expect(dispatchEventSpy).toHaveBeenCalledTimes(2);
    expect(dispatchEventSpy.mock.calls[0][0]).toBeInstanceOf(EntityLocalCreatedEvent);
    expect(dispatchEventSpy.mock.calls[1][0]).toBeInstanceOf(EntityLocalCreatedEvent);
  });

  it('T013.2: RxDBChange UPDATE 应该触发对应的 EntityLocalUpdatedEvent', async () => {
    const now = new Date();
    const mockChanges = [
      {
        id: 2,
        type: 'UPDATE',
        namespace: 'public',
        entity: 'Todo',
        entityId: '1',
        patch: { title: 'Updated Task' },
        inversePatch: { title: 'Old Task' },
        createdAt: now
      }
    ];

    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test',
      tableName: 'public$RxDBChange',
      rowIds: [2],
      recordAt: now
    };

    const mockRepo = {
      findByRowIds: vi.fn().mockResolvedValue(mockChanges)
    };

    adapter.getRepository = vi.fn().mockReturnValue(mockRepo);

    await handle_rxdb_change(adapter, event);

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 10));

    // 第一个事件应该是 EntityLocalUpdatedEvent（针对被变更的实体）
    expect(dispatchEventSpy.mock.calls[0][0]).toBeInstanceOf(EntityLocalUpdatedEvent);
    const updateEvent = dispatchEventSpy.mock.calls[0][0];
    expect(updateEvent.entities[0].type).toBe('UPDATE');
    expect(updateEvent.entities[0].patch).toEqual({ title: 'Updated Task' });
  });

  it('T013.3: RxDBChange DELETE 应该触发 EntityLocalRemovedEvent', async () => {
    const now = new Date();
    const mockChanges = [
      {
        id: 3,
        type: 'DELETE',
        namespace: 'public',
        entity: 'Todo',
        entityId: '1',
        patch: null,
        inversePatch: { title: 'Deleted Task' },
        createdAt: now
      }
    ];

    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test',
      tableName: 'public$RxDBChange',
      rowIds: [3],
      recordAt: now
    };

    const mockRepo = {
      findByRowIds: vi.fn().mockResolvedValue(mockChanges)
    };

    adapter.getRepository = vi.fn().mockReturnValue(mockRepo);

    await handle_rxdb_change(adapter, event);

    // 第一个事件应该是 EntityLocalRemovedEvent
    expect(dispatchEventSpy.mock.calls[0][0]).toBeInstanceOf(EntityLocalRemovedEvent);
  });

  it('统一数字和字符串 change id，避免重复读取同一变更', async () => {
    const now = new Date();
    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test',
      tableName: 'public$RxDBChange',
      rowIds: [1, '1'],
      recordAt: now
    };
    const change = {
      id: 1,
      type: 'INSERT',
      namespace: 'public',
      entity: 'Todo',
      entityId: '1',
      patch: { title: 'New Task' },
      inversePatch: null,
      createdAt: now
    };
    const mockRepo = { findByRowIds: vi.fn().mockResolvedValue([change]) };
    adapter.getRepository = vi.fn().mockReturnValue(mockRepo);

    await handle_rxdb_change(adapter, event);

    expect(mockRepo.findByRowIds).toHaveBeenCalledWith(['1']);
    expect(dispatchEventSpy).toHaveBeenCalledTimes(2);
  });
});

describe('handle_rxdb_change - T014: 错误处理和边界情况', () => {
  let adapter: RxDBAdapterPGlite;
  let rxdb: RxDB;
  let dispatchEventSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    dispatchEventSpy = vi.fn();
    rxdb = {
      schemaManager: {
        getEntityType: vi.fn().mockReturnValue(Todo),
        getEntityTypeByTableName: vi.fn().mockReturnValue(Todo),
        getEntityMetadata: vi.fn().mockReturnValue({
          namespace: 'public',
          name: 'Todo',
          tableName: 'todos'
        }),
        getEntityMetadataByTableName: vi.fn().mockReturnValue({
          namespace: 'public',
          name: 'Todo',
          tableName: 'todos'
        })
      },
      dispatchEvent: dispatchEventSpy
    } as unknown as RxDB;

    adapter = new RxDBAdapterPGlite(rxdb, { store: 'memory' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('T014.1: findByRowIds 抛出错误时应该保留原始错误', async () => {
    const error = new Error('Database error');
    const mockRepo = {
      findByRowIds: vi.fn().mockRejectedValue(error)
    };

    adapter.getRepository = vi.fn().mockReturnValue(mockRepo);

    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test',
      tableName: 'public$Todo',
      rowIds: ['1'],
      recordAt: new Date()
    };

    await expect(handle_rxdb_change(adapter, event)).rejects.toBe(error);
  });

  it('T014.1b: PGlite 关闭中的错误应该静默忽略', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const mockRepo = {
      findByRowIds: vi.fn().mockRejectedValue(new Error('PGlite is closing'))
    };

    adapter.getRepository = vi.fn().mockReturnValue(mockRepo);

    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test',
      tableName: 'public$Todo',
      rowIds: ['1'],
      recordAt: new Date()
    };

    await expect(handle_rxdb_change(adapter, event)).resolves.toBeUndefined();

    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('T014.2: 空 rowIds 数组应该正常处理', async () => {
    const mockRepo = {
      findByRowIds: vi.fn().mockResolvedValue([])
    };

    adapter.getRepository = vi.fn().mockReturnValue(mockRepo);

    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test',
      tableName: 'public$Todo',
      rowIds: [],
      recordAt: new Date()
    };

    // 不应该抛出错误
    handle_rxdb_change(adapter, event);

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 10));

    // 不应该触发任何事件（因为空数组）
    expect(rxdb.dispatchEvent).not.toHaveBeenCalled();
  });

  it('T014.3: 部分 rowIds 找不到实体时应该继续处理找到的实体', async () => {
    // 请求 3 个 ID，但只返回 2 个
    const mockRepo = {
      findByRowIds: vi.fn().mockResolvedValue([
        { id: '1', title: 'Task 1', completed: false, createdAt: new Date(), updatedAt: new Date() },
        { id: '2', title: 'Task 2', completed: false, createdAt: new Date(), updatedAt: new Date() }
      ])
    };

    adapter.getRepository = vi.fn().mockReturnValue(mockRepo);

    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test',
      tableName: 'public$Todo',
      rowIds: ['1', '2', '999'], // '999' 不存在
      recordAt: new Date()
    };

    await handle_rxdb_change(adapter, event);

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 10));

    // 应该正常处理找到的 2 个实体
    expect(rxdb.dispatchEvent).toHaveBeenCalledWith(expect.any(EntityLocalCreatedEvent));
    const callArg = dispatchEventSpy.mock.calls[0][0];
    expect(callArg.entities).toHaveLength(2);
  });

  it('T014.4: 大批量 rowIds 应该去重并分块查询', async () => {
    const rowIds = Array.from({ length: 450 }, (_, index) => `${index + 1}`);
    const mockRepo = {
      findByRowIds: vi.fn(async (ids: string[]) =>
        ids.map(id => ({ id, title: `Task ${id}`, completed: false, createdAt: new Date(), updatedAt: new Date() }))
      )
    };

    adapter.getRepository = vi.fn().mockReturnValue(mockRepo);

    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test',
      tableName: 'public$Todo',
      rowIds: [...rowIds, '42', '100'],
      recordAt: new Date()
    };

    handle_rxdb_change(adapter, event);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockRepo.findByRowIds).toHaveBeenCalledTimes(3);
    expect(mockRepo.findByRowIds.mock.calls[0][0]).toHaveLength(200);
    expect(mockRepo.findByRowIds.mock.calls[1][0]).toHaveLength(200);
    expect(mockRepo.findByRowIds.mock.calls[2][0]).toHaveLength(50);

    const dispatchedEvent = dispatchEventSpy.mock.calls[0][0];
    expect(dispatchedEvent.entities).toHaveLength(450);
  });
});

describe('handle residual uncovered paths', () => {
  it('resolves system table namespace and skips unknown tables / empty results', async () => {
    const dispatchEvent = vi.fn();
    const rxdb = {
      schemaManager: {
        getEntityTypeByTableName: vi.fn((name: string, ns?: string) => {
          if (name === 'rxdb_change' && ns === 'rxdb') return RxDBChange;
          return null;
        }),
        getEntityMetadataByTableName: vi.fn(),
        getEntityMetadata: vi.fn()
      },
      dispatchEvent
    } as unknown as RxDB;
    const adapter = new RxDBAdapterPGlite(rxdb, { store: 'memory' });

    await expect(
      handle_rxdb_change(adapter, {
        type: PGliteChangeType.INSERT,
        dbName: 't',
        tableName: 'unknown_table',
        rowIds: ['1'],
        recordAt: new Date()
      })
    ).resolves.toBeUndefined();

    // 不带 $ 的系统表使用 rxdb 命名空间。
    rxdb.schemaManager.getEntityTypeByTableName = vi.fn((name: string, ns?: string) => {
      if (name === 'rxdb_change' && ns === 'rxdb') return RxDBChange;
      return null;
    }) as never;
    rxdb.schemaManager.getEntityMetadataByTableName = vi.fn().mockReturnValue(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await handle_rxdb_change(adapter, {
      type: PGliteChangeType.INSERT,
      dbName: 't',
      tableName: 'rxdb_change',
      rowIds: ['1'],
      recordAt: new Date()
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('covers emitChangeEvent warnings and entity id fallbacks', async () => {
    const dispatchEvent = vi.fn();
    const changeMeta = {
      namespace: 'rxdb',
      name: 'RxDBChange',
      tableName: 'rxdb_change'
    };
    const todoMeta = {
      namespace: 'public',
      name: 'Todo',
      tableName: 'todos',
      propertyMap: new Map()
    };
    const rxdb = {
      schemaManager: {
        getEntityTypeByTableName: vi.fn((table: string) => {
          if (table === 'rxdb_change') return RxDBChange;
          if (table === 'todos') return Todo;
          return null;
        }),
        getEntityMetadataByTableName: vi.fn((table: string) => {
          if (table === 'rxdb_change') return changeMeta;
          if (table === 'todos') return todoMeta;
          return null;
        }),
        getEntityMetadata: vi.fn((name: string) => {
          if (name === 'Todo') return todoMeta;
          if (name === 'Missing') return null;
          return todoMeta;
        })
      },
      dispatchEvent
    } as unknown as RxDB;
    const adapter = new RxDBAdapterPGlite(rxdb, { store: 'memory' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // 没有 id 的实体。
    adapter.getRepository = vi.fn().mockReturnValue({
      findByRowIds: vi.fn().mockResolvedValue([{ title: 'no-id' }, { id: 'ok', title: 'x', createdAt: 'bad' }])
    });
    await handle_rxdb_change(adapter, {
      type: PGliteChangeType.INSERT,
      dbName: 't',
      tableName: 'public$todos',
      rowIds: ['1', '2'],
      recordAt: new Date()
    });

    // 实体表的 DELETE 路径。
    adapter.getRepository = vi.fn().mockReturnValue({
      findByRowIds: vi.fn().mockResolvedValue([{ id: 'd1', title: 'gone' }])
    });
    await handle_rxdb_change(adapter, {
      type: PGliteChangeType.DELETE,
      dbName: 't',
      tableName: 'public$todos',
      rowIds: ['d1'],
      recordAt: new Date()
    });

    // UPDATE 路径。
    adapter.getRepository = vi.fn().mockReturnValue({
      findByRowIds: vi.fn().mockResolvedValue([{ id: 'u1', title: 'u' }])
    });
    await handle_rxdb_change(adapter, {
      type: PGliteChangeType.UPDATE,
      dbName: 't',
      tableName: 'public$todos',
      rowIds: ['u1'],
      recordAt: new Date()
    });

    // RxDBChange 无效且缺少字段。
    adapter.getRepository = vi.fn().mockReturnValue({
      findByRowIds: vi.fn().mockResolvedValue([
        {
          id: 1,
          type: 'INSERT',
          namespace: '',
          entity: 'Todo',
          entityId: '1',
          patch: { title: 'a' },
          createdAt: new Date()
        },
        {
          id: 2,
          type: 'INSERT',
          namespace: 'public',
          entity: 'Missing',
          entityId: '2',
          patch: null,
          createdAt: new Date()
        },
        {
          id: 3,
          type: 'UPDATE',
          namespace: 'public',
          entity: 'Todo',
          entityId: '3',
          patch: { title: 'x' },
          inversePatch: null,
          createdAt: new Date()
        },
        {
          id: 4,
          type: 'DELETE',
          namespace: 'public',
          entity: 'Todo',
          entityId: '4',
          inversePatch: null,
          createdAt: new Date()
        },
        {
          id: 5,
          type: 'INSERT',
          namespace: 'public',
          entity: 'Todo',
          entityId: '5',
          patch: { title: 'ok' },
          createdAt: new Date()
        },
        { id: 'bad', type: 'INSERT' }
      ])
    });
    await handle_rxdb_change(adapter, {
      type: PGliteChangeType.INSERT,
      dbName: 't',
      tableName: 'rxdb$rxdb_change',
      rowIds: [1, 2, 3, 4, 5, 6],
      recordAt: new Date()
    });

    // rxdb_change 表事件上的 UPDATE。
    adapter.getRepository = vi.fn().mockReturnValue({
      findByRowIds: vi.fn().mockResolvedValue([
        {
          id: 10,
          type: 'UPDATE',
          namespace: 'public',
          entity: 'Todo',
          entityId: '10',
          patch: { title: 'p' },
          inversePatch: { title: 'o' },
          createdAt: new Date()
        }
      ])
    });
    await handle_rxdb_change(adapter, {
      type: PGliteChangeType.UPDATE,
      dbName: 't',
      tableName: 'rxdb_change',
      rowIds: [10],
      recordAt: new Date()
    });

    expect(warn).toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalled();
    warn.mockRestore();
  });
});
