/**
 * @fileoverview US-218 阶段 B：`mergeChanges` 回执映射（T038 / T051）
 *
 * 覆盖 [contracts/remote-merge-result.md](../../../specs/007-us218-rls-push-integrity/contracts/remote-merge-result.md) §3
 * 与 [contracts/rxdb-mutations-receipts.md](../../../specs/007-us218-rls-push-integrity/contracts/rxdb-mutations-receipts.md) §5-6：
 * `mergeChanges` 如何把 `rxdb_mutations`（`p_receipts = true`）的回执（`change_id_mapping` + `entity_results`）
 * 翻译成 `RemoteMergeResult.results`，以及 `dependsOn` 的表引用如何反查回本地实体引用。
 *
 * 全程 mock `client.rpc`，不连远端。
 */

import { compactChanges, type IRxDBChange, type RxDB } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseDataError } from '../errors.js';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';

/**
 * `dependsOn` 反查目标夹具：与 Todo 同命名空间（`public`）的另一张表，用于验证跨实体反查。
 * 本文件的 `schemaManager` 是手搭的替身（见 {@link createRxdb}），只认 {@link EntityMetadataFixture}
 * 数组，不读真实的 `@Entity` 注册表，所以这里不需要、也不声明一个真正的实体类。
 */
interface EntityMetadataFixture {
  namespace: string;
  name: string;
  tableName: string;
}

/** 造一个仅包含本套件需要的字段的 `RxDB` 替身：`schemaManager` 按表名/实体名双向查表 */
function createRxdb(entities: EntityMetadataFixture[]): RxDB {
  return {
    context: { userId: 'test-user', clientId: 'local-client' },
    schemaManager: {
      getEntityMetadata: vi.fn((name: string, namespace: string) =>
        entities.find(item => item.name === name && item.namespace === (namespace || 'public'))
      ),
      getEntityMetadataByTableName: vi.fn((tableName: string, namespace: string) =>
        entities.find(item => item.tableName === tableName && item.namespace === (namespace || 'public'))
      )
    },
    reachability: { report: vi.fn() }
  } as unknown as RxDB;
}

const TODO_METADATA: EntityMetadataFixture = { namespace: 'public', name: 'Todo', tableName: 'todos' };
const PROJECT_METADATA: EntityMetadataFixture = { namespace: 'public', name: 'Project', tableName: 'projects' };

function createAdapter(entities: EntityMetadataFixture[] = [TODO_METADATA, PROJECT_METADATA]) {
  const rpc = vi.fn();
  const rxdb = createRxdb(entities);
  const adapter = new RxDBAdapterSupabase(rxdb, { client: { rpc } as never });
  return { adapter, rpc };
}

/** 一条最小的 Todo INSERT 源变更，`id` 即 `localId` */
function makeChange(overrides: Partial<IRxDBChange> = {}): IRxDBChange {
  return {
    id: 1,
    namespace: 'public',
    entity: 'Todo',
    entityId: 'todo-1',
    type: 'INSERT',
    branchId: 'main',
    patch: { title: 'x' },
    inversePatch: null,
    clientId: 'local-client',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides
  };
}

function callMergeChanges(adapter: RxDBAdapterSupabase, changes: IRxDBChange[]) {
  return adapter.mergeChanges(compactChanges(changes), 'main', changes);
}

describe('mergeChanges: p_receipts 参数', () => {
  it('mergeChanges 向 rxdb_mutations 传 p_receipts: true', async () => {
    const { adapter, rpc } = createAdapter();
    rpc.mockResolvedValueOnce({
      data: { max_change_id: 1, change_id_mapping: [{ localId: 1, remoteId: 100 }], entity_results: [] },
      error: null,
      status: 200
    });

    await callMergeChanges(adapter, [makeChange()]);

    expect(rpc).toHaveBeenCalledWith('rxdb_mutations', expect.objectContaining({ p_receipts: true }));
  });

  it('mutations() 向 rxdb_mutations 调用时不传 p_receipts（直写路径保持全有或全无）', async () => {
    const { adapter, rpc } = createAdapter();
    rpc.mockResolvedValueOnce({ data: { upserted: [{ id: 'todo-1' }] }, error: null, status: 200 });

    await adapter.mutations({
      create: new Map([[Todo, new Set([{ id: 'todo-1', title: 'x' } as unknown as Todo])]]),
      update: new Map(),
      remove: new Map()
    });

    const params = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(params).not.toHaveProperty('p_receipts');
  });
});

describe('mergeChanges: change_id_mapping → applied', () => {
  it('localId 在 change_id_mapping 中 → applied，remoteId 照回执', async () => {
    const { adapter, rpc } = createAdapter();
    rpc.mockResolvedValueOnce({
      data: { max_change_id: 100, change_id_mapping: [{ localId: 1, remoteId: 100 }], entity_results: [] },
      error: null,
      status: 200
    });

    const result = await callMergeChanges(adapter, [makeChange({ id: 1 })]);

    expect(result.results).toEqual([{ localId: 1, status: 'applied', remoteId: 100 }]);
    expect(result.maxChangeId).toBe(100);
  });
});

describe('mergeChanges: entity_results rejected → rejected', () => {
  it('localId 只在被拒实体的 localIds 中 → rejected，code/reason/message 照回执，entity 取源变更自身', async () => {
    const { adapter, rpc } = createAdapter();
    rpc.mockResolvedValueOnce({
      data: {
        max_change_id: 100,
        change_id_mapping: [],
        entity_results: [
          {
            schema: 'public',
            table: 'todos',
            entityId: 'todo-1',
            op: 'INSERT',
            status: 'rejected',
            code: '42501',
            reason: 'denied',
            message: 'new row violates row-level security policy',
            localIds: [1]
          }
        ]
      },
      error: null,
      status: 200
    });

    const change = makeChange({ id: 1, namespace: 'public', entity: 'Todo', entityId: 'todo-1' });
    const result = await callMergeChanges(adapter, [change]);

    expect(result.results).toEqual([
      {
        localId: 1,
        status: 'rejected',
        rejection: {
          code: '42501',
          reason: 'denied',
          message: 'new row violates row-level security policy',
          entity: { namespace: 'public', entity: 'Todo', entityId: 'todo-1' }
        }
      }
    ]);
  });
});

describe('mergeChanges: 回执与本批不一致 → SupabaseDataError', () => {
  it('localId 既不在 change_id_mapping 也不在任何被拒实体的 localIds 中 → 抛错', async () => {
    const { adapter, rpc } = createAdapter();
    rpc.mockResolvedValueOnce({
      data: { max_change_id: 100, change_id_mapping: [], entity_results: [] },
      error: null,
      status: 200
    });

    await expect(callMergeChanges(adapter, [makeChange({ id: 1 })])).rejects.toThrow(SupabaseDataError);
  });

  it('localId 同时在 change_id_mapping 与某个被拒实体的 localIds 中 → 抛错', async () => {
    const { adapter, rpc } = createAdapter();
    rpc.mockResolvedValueOnce({
      data: {
        max_change_id: 100,
        change_id_mapping: [{ localId: 1, remoteId: 100 }],
        entity_results: [
          {
            schema: 'public',
            table: 'todos',
            entityId: 'todo-1',
            op: 'INSERT',
            status: 'rejected',
            code: '42501',
            reason: 'denied',
            message: 'denied',
            localIds: [1]
          }
        ]
      },
      error: null,
      status: 200
    });

    await expect(callMergeChanges(adapter, [makeChange({ id: 1 })])).rejects.toThrow(SupabaseDataError);
  });
});

describe('mergeChanges: entity_results 形状校验', () => {
  it.each([
    ['缺 entity_results 字段', { max_change_id: 1, change_id_mapping: [] }],
    ['entity_results 不是数组', { max_change_id: 1, change_id_mapping: [], entity_results: {} }],
    [
      'entity_results 元素缺 op',
      {
        max_change_id: 1,
        change_id_mapping: [],
        entity_results: [{ schema: 'public', table: 'todos', entityId: 'todo-1', status: 'applied', localIds: [1] }]
      }
    ],
    [
      'rejected 元素缺 code/reason/message',
      {
        max_change_id: 1,
        change_id_mapping: [],
        entity_results: [
          { schema: 'public', table: 'todos', entityId: 'todo-1', op: 'INSERT', status: 'rejected', localIds: [1] }
        ]
      }
    ],
    [
      'reason=dependency 但 dependsOn 既不是表引用也不是约束引用',
      {
        max_change_id: 1,
        change_id_mapping: [],
        entity_results: [
          {
            schema: 'public',
            table: 'todos',
            entityId: 'todo-1',
            op: 'INSERT',
            status: 'rejected',
            code: '23503',
            reason: 'dependency',
            message: 'fk violation',
            dependsOn: { foo: 'bar' },
            localIds: [1]
          }
        ]
      }
    ]
  ])('%s → validateMergeResponse 抛 SupabaseDataError', async (_label, data) => {
    const { adapter, rpc } = createAdapter();
    rpc.mockResolvedValueOnce({ data, error: null, status: 200 });

    await expect(callMergeChanges(adapter, [makeChange({ id: 1 })])).rejects.toThrow(SupabaseDataError);
  });
});

describe('mergeChanges: PGRST202（旧 SQL，RPC 未升级）', () => {
  it('RPC 返回 PGRST202 → SupabaseDataError 且 code = PGRST202', async () => {
    const { adapter, rpc } = createAdapter();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Could not find the function public.rxdb_mutations', code: 'PGRST202' },
      status: 404
    });

    const failure: SupabaseDataError = await callMergeChanges(adapter, [makeChange({ id: 1 })]).catch(
      error => error
    );

    expect(failure).toBeInstanceOf(SupabaseDataError);
    expect(failure.code).toBe('PGRST202');
  });
});

describe('mergeChanges: dependsOn 反查（T051）', () => {
  it('dependsOn 为表引用 → 经 getEntityMetadataByTableName 反查成 RemoteEntityRef', async () => {
    const { adapter, rpc } = createAdapter();
    rpc.mockResolvedValueOnce({
      data: {
        max_change_id: 1,
        change_id_mapping: [],
        entity_results: [
          {
            schema: 'public',
            table: 'todos',
            entityId: 'todo-1',
            op: 'INSERT',
            status: 'rejected',
            code: '23503',
            reason: 'dependency',
            message: 'fk violation',
            dependsOn: { schema: 'public', table: 'projects', entityId: 'project-9' },
            localIds: [1]
          }
        ]
      },
      error: null,
      status: 200
    });

    const result = await callMergeChanges(adapter, [makeChange({ id: 1 })]);

    expect(result.results).toEqual([
      {
        localId: 1,
        status: 'rejected',
        rejection: expect.objectContaining({
          dependsOn: { namespace: 'public', entity: 'Project', entityId: 'project-9' }
        })
      }
    ]);
  });

  it('dependsOn 为 {constraint} → 原样透传，不经反查', async () => {
    const { adapter, rpc } = createAdapter();
    rpc.mockResolvedValueOnce({
      data: {
        max_change_id: 1,
        change_id_mapping: [],
        entity_results: [
          {
            schema: 'public',
            table: 'todos',
            entityId: 'todo-1',
            op: 'INSERT',
            status: 'rejected',
            code: '23503',
            reason: 'dependency',
            message: 'fk violation',
            dependsOn: { constraint: 'todos_project_id_fkey' },
            localIds: [1]
          }
        ]
      },
      error: null,
      status: 200
    });

    const result = await callMergeChanges(adapter, [makeChange({ id: 1 })]);

    expect(result.results).toEqual([
      {
        localId: 1,
        status: 'rejected',
        rejection: expect.objectContaining({ dependsOn: { constraint: 'todos_project_id_fkey' } })
      }
    ]);
  });

  it('dependsOn 表引用反查不到已注册实体 → 抛 SupabaseDataError（无 fallback 兜底）', async () => {
    const { adapter, rpc } = createAdapter();
    rpc.mockResolvedValueOnce({
      data: {
        max_change_id: 1,
        change_id_mapping: [],
        entity_results: [
          {
            schema: 'public',
            table: 'unregistered_table',
            entityId: 'todo-1',
            op: 'INSERT',
            status: 'rejected',
            code: '23503',
            reason: 'dependency',
            message: 'fk violation',
            dependsOn: { schema: 'public', table: 'unregistered_table', entityId: 'x-1' },
            localIds: [1]
          }
        ]
      },
      error: null,
      status: 200
    });

    await expect(callMergeChanges(adapter, [makeChange({ id: 1 })])).rejects.toThrow(SupabaseDataError);
  });
});
