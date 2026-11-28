/**
 * @fileoverview 读远端变更历史（US-229）：`getEntityHistory` 怎么调 `rxdb_entity_history`、怎么交出结果
 *
 * @remarks
 * 只验适配器这一侧：参数、日期、形状与错误。可见性、脱敏与写入点由 SQL 回归 `change-history` 与真栈用例覆盖。
 */
import { Entity, EntityBase, getEntityMetadata, PropertyType, ReachabilityMonitor, type RxDB } from '@aiao/rxdb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseDataError } from '../errors.js';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';

@Entity({ name: 'HistoryProbe', namespace: 'shop', properties: [{ name: 'title', type: PropertyType.string }] })
class HistoryProbe extends EntityBase {
  declare title: string;
}

const row = {
  id: 7,
  changeId: 41,
  namespace: 'shop',
  entity: 'HistoryProbe',
  entityId: 'probe-1',
  bucket: null,
  type: 'UPDATE',
  patch: { title: 'after' },
  inversePatch: { title: 'before' },
  beforeData: { id: 'probe-1', title: 'before' },
  afterData: { id: 'probe-1', title: 'after' },
  actor: '00000000-0000-4000-8000-0000000000a1',
  role: 'authenticated',
  source: 'push',
  clientId: 'client-1',
  localId: 3,
  branchId: 'main',
  createdAt: '2026-11-26T08:00:00.123+00:00'
};

const monitors: ReachabilityMonitor[] = [];
afterEach(() => {
  while (monitors.length) monitors.pop()?.destroy();
});

function createAdapter(response: { data: unknown; error: unknown; status: number }) {
  const reachability = new ReachabilityMonitor({
    navigatorOnLine: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  });
  monitors.push(reachability);
  const rxdb = {
    context: { userId: 'test-user', clientId: 'local-client' },
    config: { entities: [HistoryProbe] },
    schemaManager: { getEntityMetadata: vi.fn(() => getEntityMetadata(HistoryProbe)) },
    dispatchEvent: vi.fn(),
    reachability
  } as unknown as RxDB;
  const rpc = vi.fn(() => Promise.resolve({ ...response, statusText: 'OK' }));
  const adapter = new RxDBAdapterSupabase(rxdb, { client: { rpc, from: vi.fn(), schema: vi.fn() } as never });
  return { adapter, rpc };
}

describe('RxDBAdapterSupabase.getEntityHistory（US-229）', () => {
  it('按实体的命名空间与名字调读取 RPC，日期转成 Date，其余字段原样交出', async () => {
    const { adapter, rpc } = createAdapter({ data: [row], error: null, status: 200 });

    const history = await adapter.getEntityHistory(HistoryProbe, 'probe-1');

    expect(rpc).toHaveBeenCalledWith('rxdb_entity_history', {
      p_namespace: 'shop',
      p_entity: 'HistoryProbe',
      p_entity_id: 'probe-1'
    });
    expect(history).toEqual([{ ...row, createdAt: new Date('2026-11-26T08:00:00.123Z') }]);
  });

  it('翻页：afterId 与 limit 原样交给 RPC', async () => {
    const { adapter, rpc } = createAdapter({ data: [], error: null, status: 200 });

    await adapter.getEntityHistory(HistoryProbe, 'probe-1', { afterId: 7, limit: 20 });

    expect(rpc).toHaveBeenCalledWith('rxdb_entity_history', {
      p_namespace: 'shop',
      p_entity: 'HistoryProbe',
      p_entity_id: 'probe-1',
      p_after_id: 7,
      p_limit: 20
    });
  });

  it('远端拒绝（例如 anon 没有执行权）时抛 SupabaseDataError', async () => {
    const { adapter } = createAdapter({
      data: null,
      error: { code: '42501', message: 'permission denied for function rxdb_entity_history' },
      status: 401
    });

    await expect(adapter.getEntityHistory(HistoryProbe, 'probe-1')).rejects.toBeInstanceOf(SupabaseDataError);
  });

  it('返回的不是历史数组时抛 SupabaseDataError，不把坏数据交出去', async () => {
    const { adapter } = createAdapter({ data: [{ ...row, source: 'forged' }], error: null, status: 200 });

    await expect(adapter.getEntityHistory(HistoryProbe, 'probe-1')).rejects.toThrow(
      'Failed to read entity history: invalid response data'
    );
  });
});
