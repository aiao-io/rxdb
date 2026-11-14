import { productPayloadText, type PublicWorkPayload } from '@aiao-media/api-contracts';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductSyncStore, type ProductConflict, type ProductRecord } from './product-sync-store';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const sourceId = '10000000-0000-4000-8000-000000000002';
const recordId = '10000000-0000-4000-8000-000000000003';
const conflictId = '10000000-0000-4000-8000-000000000004';
const payload: PublicWorkPayload = {
  version: 1,
  jobId: sourceId,
  prompt: '保留冲突原图',
  modelId: 'fixture',
  providerInstanceId: '10000000-0000-4000-8000-000000000005',
  mimeType: 'image/png',
  width: 1,
  height: 1,
  bytes: 10,
  sha256: 'a'.repeat(64),
  createdAt: '2026-11-14T00:00:00Z'
};
const record: ProductRecord = {
  id: recordId,
  sourceId,
  workspaceId,
  kind: 'work',
  payload,
  revision: 1,
  deleted: false
};
class Row {
  id = crypto.randomUUID() as string;
  recordId = '';
  sourceId = '';
  workspaceId = '';
  kind = 'work';
  status = '';
  payload = '';
  revision = 1;
  baseRevision = 0;
  deleted = false;
}
class RecordToken {}
class ConflictToken {}
class BaselineToken {}
class AcknowledgedToken {}
class ReportToken {}
class PublishedToken {}
const types = {
  Record: RecordToken,
  ConflictRow: ConflictToken,
  Baseline: BaselineToken,
  Acknowledged: AcknowledgedToken,
  ReportOutbox: ReportToken,
  PublishedWork: PublishedToken
};
function rig() {
  const tables = new Map<unknown, Row[]>(Object.values(types).map(type => [type, []]));
  const rows = tables.get(ConflictToken)!;
  let remote = structuredClone(record);
  let supported = true;
  let releaseFails = false;
  let retentionFails = false;
  const getRepository = (type: unknown) => ({
    find: vi.fn(async (options: { where: { rules: { field: string; value: unknown }[] } }) =>
      (tables.get(type) ?? []).filter(row =>
        options.where.rules.every(rule => Reflect.get(row, rule.field) === rule.value)
      )
    ),
    create: vi.fn(async (row: Row) => {
      tables.get(type)!.push(row);
      return row;
    }),
    update: vi.fn(async (row: Row, patch: Partial<Row>) => Object.assign(row, patch))
  });
  const adapter = {
    getRepository,
    transaction: async (operation: (executor: { getRepository: typeof getRepository }) => Promise<unknown>) =>
      operation({ getRepository })
  };
  const rpc = vi.fn(async (name: string): Promise<{ data: unknown; error: unknown }> => {
    if (name === 'media_sync_capabilities')
      return {
        data: { protocol: 1, rls: true, metadataOnly: true, ...(supported ? { imageReferences: 1 } : {}) },
        error: null
      };
    if (name === 'media_retain_image_conflict' && retentionFails) return { data: null, error: { code: 'offline' } };
    if (name === 'media_release_image_conflict' && releaseFails) return { data: null, error: { code: 'offline' } };
    return { data: null, error: null };
  });
  const client = {
    rpc,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: workspaceId }, error: null }),
          maybeSingle: async () => ({
            data:
              table === 'media_sync_records' ?
                { ...remote, payload: productPayloadText('work', remote.payload) }
              : null,
            error: null
          })
        })
      })
    })
  };
  const syncManager = {
    pull: vi.fn(async () => ({ failures: [] })),
    push: vi.fn(async () => ({ failed: 0, failures: [], rejected: 0 })),
    getRepositorySyncStatus: vi.fn(async () => ({ pushableCount: 0 }))
  };
  const db = {
    localAdapter$: of(adapter),
    syncManager,
    syncState: { snapshot: { lastRejections: [] } },
    entityManager: { instantiate: (_type: unknown, value: Partial<Row>) => Object.assign(new Row(), value) }
  };
  vi.stubGlobal('navigator', {
    locks: { request: async (_name: string, operation: () => Promise<unknown>) => operation() }
  });
  const store = Reflect.construct(ProductSyncStore, [
    db,
    client,
    types,
    'fixture-profile',
    workspaceId,
    new AbortController()
  ]) as ProductSyncStore;
  const conflict: ProductConflict = {
    id: conflictId,
    recordId,
    local: record,
    remote: record,
    latestRemote: record,
    reason: '并发修订'
  };
  rows.push(
    Object.assign(new Row(), { id: conflictId, recordId, status: 'pending', payload: JSON.stringify(conflict) })
  );
  tables
    .get(RecordToken)!
    .push(Object.assign(new Row(), { ...record, payload: productPayloadText('work', record.payload) }));
  return {
    store,
    rows,
    rpc,
    syncManager,
    remote: (value: ProductRecord) => {
      remote = value;
    },
    support: (value: boolean) => {
      supported = value;
    },
    failRelease: (value: boolean) => {
      releaseFails = value;
    },
    failRetention: (value: boolean) => {
      retentionFails = value;
    }
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('图片冲突远端引用', () => {
  it('同步每次重试持久冲突登记，远端修订不变也不能跳过失败的引用', async () => {
    const r = rig();
    r.failRetention(true);
    await expect(r.store.synchronize()).rejects.toThrow('引用');
    expect(r.rows[0].status).toBe('pending');
    expect(r.syncManager.push).not.toHaveBeenCalled();
    r.failRetention(false);
    await r.store.synchronize();
    expect(r.rpc.mock.calls.filter(([name]) => name === 'media_retain_image_conflict')).toHaveLength(2);
    expect(r.rpc).toHaveBeenCalledWith('media_retain_image_conflict', {
      p_workspace_id: workspaceId,
      p_conflict_id: conflictId,
      p_source_id: sourceId,
      p_hashes: [payload.sha256]
    });
  });
  it('原本双方与最新远端摘要去重保留，最新远端更新不会覆盖本机原始副本', async () => {
    const r = rig();
    const old = JSON.parse(r.rows[0].payload) as ProductConflict;
    old.remote = { ...record, payload: { ...payload, sha256: 'b'.repeat(64) } };
    r.rows[0].payload = JSON.stringify(old);
    r.remote({ ...record, revision: 2, payload: { ...payload, sha256: 'c'.repeat(64) } });
    await r.store.synchronize();
    expect(r.rpc).toHaveBeenCalledWith(
      'media_retain_image_conflict',
      expect.objectContaining({ p_hashes: [payload.sha256, 'b'.repeat(64), 'c'.repeat(64)] })
    );
    expect((await r.store.conflicts())[0]).toMatchObject({
      local: record,
      remote: old.remote,
      latestRemote: { revision: 2 }
    });
  });
  it('显式解决成功且远端版本核对后才释放；释放应答丢失由持久 resolved 状态重试', async () => {
    const r = rig();
    r.failRelease(true);
    await expect(r.store.resolve(conflictId, 'remote')).rejects.toThrow('引用');
    expect(r.rows[0].status).toBe('resolved-remote');
    r.failRelease(false);
    await r.store.synchronize();
    expect(r.rpc).toHaveBeenCalledWith('media_release_image_conflict', {
      p_workspace_id: workspaceId,
      p_conflict_id: conflictId,
      p_source_id: sourceId,
      p_work_revision: 1
    });
    expect(r.rows[0].status).toBe('released-remote');
    await r.store.synchronize();
    expect(r.rpc.mock.calls.filter(([name]) => name === 'media_release_image_conflict')).toHaveLength(2);
  });
  it('尚未推送、再次冲突或远端内容不同都不能释放已保留的引用', async () => {
    const r = rig();
    r.syncManager.getRepositorySyncStatus.mockResolvedValue({ pushableCount: 1 });
    await r.store.resolve(conflictId, 'remote');
    expect(r.rows[0].status).toBe('resolved-remote');
    expect(r.rpc.mock.calls.some(([name]) => name === 'media_release_image_conflict')).toBe(false);
    r.syncManager.getRepositorySyncStatus.mockResolvedValue({ pushableCount: 0 });
    r.remote({ ...record, revision: 2, payload: { ...payload, sha256: 'b'.repeat(64) } });
    await r.store.synchronize();
    expect(r.rpc.mock.calls.some(([name]) => name === 'media_release_image_conflict')).toBe(false);
  });
  it('只支持元数据的旧服务继续同步，不调用不存在的引用协议', async () => {
    const r = rig();
    r.support(false);
    await r.store.synchronize();
    expect(
      r.rpc.mock.calls.some(
        ([name]) => name === 'media_retain_image_conflict' || name === 'media_release_image_conflict'
      )
    ).toBe(false);
    expect(r.syncManager.push).toHaveBeenCalledOnce();
  });
});
