import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductConflict, ProductRecord, ProductSyncResult } from '../local-data/product-sync-store';
import { WorkspaceRegistry, type WorkspaceRegistryPort } from '../local-data/workspace-registry';
import type { ProductClient } from './product-client';
import { ProductWorkspaceController, type ProductReplica, type ProductWorkspacePort } from './product-workspace';
import type { ProductAuthorization } from './supabase-auth';
import { WorkspaceSession } from './workspace-session';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const account = { projectOrigin: 'http://127.0.0.1:54321', userId: id(1) };
const access: ProductAuthorization = {
  config: { url: account.projectOrigin, anonKey: 'fixture-public' },
  userId: account.userId,
  session: {
    access_token: 'fixture-token',
    refresh_token: 'fixture-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    user: {
      id: account.userId,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-24T00:00:00Z'
    }
  }
};
async function rig(active = true) {
  let stored: { payload: string; revision: number } | null = null,
    next = 10;
  const persistence: WorkspaceRegistryPort = {
    read: async () => stored,
    write: async payload => {
      stored = { payload, revision: (stored?.revision ?? 0) + 1 };
    },
    exclusive: async action => action()
  };
  const registry = new WorkspaceRegistry(id(3), persistence, () => id(++next));
  if (active) {
    const intent = await registry.prepareBinding(account);
    await registry.activateBinding(account, intent.requestId, id(4));
  }
  let state = await registry.read();
  const result: ProductSyncResult = { records: [], conflicts: [], pending: 0 };
  const replica = {
    records: vi.fn<ProductReplica['records']>(async () => []),
    conflicts: vi.fn<ProductReplica['conflicts']>(async () => []),
    capture: vi.fn(async () => 0),
    synchronize: vi.fn(async (apply?: Parameters<ProductReplica['synchronize']>[0]) => {
      if (apply) await apply(result);
      return result;
    }),
    resolve: vi.fn(async () => result),
    enqueueReports: vi.fn(async () => undefined),
    deleteDraft: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  };
  const api = {
    authorization: vi.fn(async () => access),
    ownWorkspace: vi.fn<ProductClient['ownWorkspace']>(async () =>
      active ? { id: id(4), owner_id: account.userId } : null
    ),
    ensureWorkspace: vi.fn(async (_access: ProductAuthorization, requestId: string) => ({
      id: id(4),
      owner_id: account.userId,
      request_id: requestId,
      created: true
    }))
  };
  const port = {
    profile: () => state.profiles.find(profile => profile.id === state.selectedId)!,
    registry: (nextState: typeof state) => {
      state = nextState;
    },
    ready: vi.fn(async () => undefined),
    checkpoint: vi.fn(async () => undefined),
    busy: vi.fn(() => false),
    snapshot: vi.fn<ProductWorkspacePort['snapshot']>(async () => ({
      entries: [],
      localWorkIds: [],
      versions: { draft: null, providers: null }
    })),
    counts: vi.fn(async () => ({ drafts: 1, providers: 0, works: 0 })),
    project: vi.fn(async () => undefined),
    reports: vi.fn(async () => [])
  };
  const session = new WorkspaceSession(id(3), registry, {
    checkpoint: port.checkpoint,
    pause: () => controller?.pause(),
    open: async profileId => ({ id: profileId }),
    activate: () => undefined,
    discard: async () => undefined,
    selected: port.registry
  });
  const factory = vi.fn(async () => replica);
  const controller: ProductWorkspaceController = new ProductWorkspaceController(registry, session, api, port, factory);
  return { controller, registry, api, port, factory, replica, result };
}
afterEach(() => vi.useRealTimers());
describe('explicit workspace sync activation', () => {
  it('never opens replication or creates remote workspaces before confirmation, and cancellation has no binding side effects', async () => {
    const r = await rig(false);
    await r.controller.requestEnable();
    expect(r.controller.state.confirmation?.counts.drafts).toBe(1);
    expect(r.factory).not.toHaveBeenCalled();
    expect(r.api.ensureWorkspace).not.toHaveBeenCalled();
    r.controller.cancelEnable();
    expect((await r.registry.read()).profiles[0].binding).toBeNull();
  });
  it('leaves a durable pending intent if the first synchronization fails', async () => {
    const r = await rig(false);
    r.replica.synchronize.mockRejectedValueOnce(new Error('offline'));
    await r.controller.requestEnable();
    await r.controller.confirmEnable();
    expect((await r.registry.read()).profiles[0].binding?.state).toBe('pending');
    expect(r.controller.state.status).toBe('failed');
  });
  it('discards a late replica open after pausing the account', async () => {
    const r = await rig();
    let release!: (replica: typeof r.replica) => void;
    r.factory.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = resolve;
        })
    );
    const opening = r.controller.resume();
    await vi.waitFor(() => expect(r.factory).toHaveBeenCalledOnce());
    r.controller.pause();
    release(r.replica);
    await opening;
    expect(r.replica.close).toHaveBeenCalled();
    expect(r.port.project).not.toHaveBeenCalled();
  });
  it('does not apply a late synchronization reply to a paused workspace', async () => {
    const r = await rig();
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    r.replica.synchronize.mockImplementationOnce(async apply => {
      await gate;
      if (apply) await apply(r.result);
      return r.result;
    });
    const syncing = r.controller.resume();
    await vi.waitFor(() => expect(r.replica.synchronize).toHaveBeenCalledOnce());
    r.controller.pause();
    release();
    await syncing;
    expect(r.port.project).not.toHaveBeenCalled();
    expect(r.controller.state.status).toBe('paused');
  });
  it('requires a new confirmation when the displayed upload counts changed', async () => {
    const r = await rig(false);
    await r.controller.requestEnable();
    r.port.counts.mockResolvedValueOnce({ drafts: 2, providers: 0, works: 0 });
    await r.controller.confirmEnable();
    expect(r.api.ensureWorkspace).not.toHaveBeenCalled();
    expect(r.controller.state.confirmation?.counts.drafts).toBe(2);
  });
  it('重新扫描先确认本机输入和账号，再将恢复选项交给原生副本', async () => {
    const r = await rig();
    await r.controller.resume();
    r.replica.synchronize.mockClear();
    r.port.checkpoint.mockClear();
    await r.controller.synchronize({ rescan: true });
    expect(r.port.checkpoint).toHaveBeenCalledOnce();
    expect(r.replica.synchronize).toHaveBeenCalledWith(expect.any(Function), { rescan: true });
    expect(r.controller.state.status).toBe('synced');
  });
  it('重新扫描在授权失败时暂停，保留副本且不进入恢复同步', async () => {
    const r = await rig();
    await r.controller.resume();
    r.replica.synchronize.mockClear();
    r.api.authorization.mockRejectedValueOnce(new Error('revoked'));
    await r.controller.synchronize({ rescan: true });
    expect(r.replica.synchronize).not.toHaveBeenCalled();
    expect(r.replica.close).not.toHaveBeenCalled();
    expect(r.controller.state.status).toBe('failed');
  });
  it.each([
    { ...access, userId: id(2) },
    { ...access, config: { ...access.config, url: 'https://other-project.example.test' } }
  ])('重新扫描拒绝与当前副本不匹配的账号或项目', async authorization => {
    const r = await rig();
    await r.controller.resume();
    r.replica.synchronize.mockClear();
    r.api.authorization.mockResolvedValueOnce(authorization);
    await r.controller.synchronize({ rescan: true });
    expect(r.replica.synchronize).not.toHaveBeenCalled();
    expect(r.port.checkpoint).toHaveBeenCalledOnce();
    expect(r.controller.state.status).toBe('failed');
  });
});

const draftRecord: ProductRecord = {
  id: id(20),
  sourceId: 'main',
  workspaceId: id(4),
  kind: 'draft',
  revision: 1,
  deleted: false,
  payload: { version: 1, state: { document: { type: 'doc', content: [] }, fields: [], values: {} } }
};
const conflict: ProductConflict = {
  id: id(21),
  recordId: draftRecord.id,
  local: draftRecord,
  remote: { ...draftRecord, revision: 2 },
  latestRemote: null,
  reason: 'revision'
};

describe('sync confirmation and failure boundaries', () => {
  it('activates the binding only after the first confirmed round and retains its operation ID', async () => {
    const r = await rig(false);
    await r.controller.requestEnable();
    await r.controller.confirmEnable();
    const profile = (await r.registry.read()).profiles.find(profile => profile.binding);
    expect(profile?.binding).toMatchObject({ initialized: true, state: 'active', remoteWorkspaceId: id(4) });
    expect(r.api.ensureWorkspace).toHaveBeenCalledWith(access, profile?.binding?.requestId);
    expect(r.replica.capture).toHaveBeenCalledTimes(1);
    expect(r.controller.state.status).toBe('synced');
    expect(r.controller.state.confirmation).toBeNull();
    r.controller.close();
  });

  it('joins an existing remote workspace without uploading the unconfirmed local copy', async () => {
    const r = await rig(false);
    r.api.ownWorkspace.mockResolvedValue({ id: id(4), owner_id: account.userId, request_id: id(99) });
    await r.controller.requestEnable();
    expect(r.controller.state.confirmation?.existing).toBe(true);
    await r.controller.confirmEnable();
    expect(r.replica.capture).not.toHaveBeenCalled();
    expect(r.replica.synchronize).toHaveBeenCalledTimes(1);
    expect(r.controller.state.status).toBe('synced');
    r.controller.close();
  });

  it('does not enable synchronization while an input or file operation is active', async () => {
    const r = await rig(false);
    await r.controller.requestEnable();
    r.port.busy.mockReturnValue(true);
    await r.controller.confirmEnable();
    await r.controller.resume();
    expect(r.api.ensureWorkspace).not.toHaveBeenCalled();
    expect(r.factory).not.toHaveBeenCalled();
    r.controller.close();
  });

  it('drops confirmation that arrives after the user cancels the request', async () => {
    const r = await rig(false);
    let release!: () => void;
    r.port.counts.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () => resolve({ drafts: 1, providers: 0, works: 0 });
        })
    );
    const enabling = r.controller.requestEnable();
    await vi.waitFor(() => expect(r.port.counts).toHaveBeenCalled());
    r.controller.cancelEnable();
    release();
    await enabling;
    await r.controller.confirmEnable();
    expect(r.api.ensureWorkspace).not.toHaveBeenCalled();
    expect(r.controller.state.confirmation).toBeNull();
    r.controller.close();
  });

  it('retains a local workspace and reports a failed verification without opening replication', async () => {
    const r = await rig(false);
    r.api.authorization.mockRejectedValue(new Error('revoked'));
    await r.controller.requestEnable();
    expect(r.controller.state.status).toBe('failed');
    expect(r.factory).not.toHaveBeenCalled();
    r.controller.close();
  });

  it('marks an idle unbound copy local and an initialized copy paused', async () => {
    const local = await rig(false);
    local.controller.selection();
    expect(local.controller.state.status).toBe('local');
    const bound = await rig();
    bound.controller.selection();
    expect(bound.controller.state.status).toBe('paused');
    local.controller.close();
    bound.controller.close();
  });
});

describe('local changes, deletion and conflict handling', () => {
  it('coalesces capture requests and marks unsent changes pending without a network round', async () => {
    const r = await rig();
    await r.controller.resume();
    vi.useFakeTimers();
    r.replica.capture.mockClear().mockResolvedValue(1);
    r.replica.synchronize.mockClear();
    r.controller.captureSoon();
    r.controller.captureSoon();
    await vi.advanceTimersByTimeAsync(350);
    expect(r.replica.capture).toHaveBeenCalledTimes(1);
    expect(r.replica.synchronize).not.toHaveBeenCalled();
    expect(r.controller.state.status).toBe('pending');
    r.controller.close();
  });

  it('cancels scheduled capture after account pause and refuses capture for a busy copy', async () => {
    const r = await rig();
    await r.controller.resume();
    vi.useFakeTimers();
    r.replica.capture.mockClear();
    r.controller.captureSoon();
    r.controller.pause();
    await vi.advanceTimersByTimeAsync(350);
    expect(r.replica.capture).not.toHaveBeenCalled();
    expect(r.replica.close).toHaveBeenCalledTimes(1);
    r.controller.close();
  });

  it('reports capture failures while preserving the active replica', async () => {
    const r = await rig();
    await r.controller.resume();
    vi.useFakeTimers();
    r.replica.capture.mockRejectedValue(new Error('local write failed'));
    r.controller.captureSoon();
    await vi.advanceTimersByTimeAsync(350);
    expect(r.controller.state.status).toBe('failed');
    expect(r.replica.close).not.toHaveBeenCalled();
    r.controller.close();
  });

  it('uploads task reports only after binding and explicit reporting', async () => {
    const r = await rig();
    await r.controller.reportTasks();
    expect(r.port.reports).not.toHaveBeenCalled();
    await r.controller.resume();
    await r.controller.reportTasks();
    expect(r.port.reports).toHaveBeenCalledWith(id(4));
    expect(r.replica.enqueueReports).toHaveBeenCalledWith([]);
    r.port.reports.mockRejectedValue(new Error('journal failed'));
    await r.controller.reportTasks();
    expect(r.controller.state.status).toBe('failed');
    r.controller.close();
  });

  it('checkpoints the local draft before sending a deletion marker and never deletes before binding', async () => {
    const r = await rig();
    await r.controller.deleteDraft();
    expect(r.replica.deleteDraft).not.toHaveBeenCalled();
    await r.controller.resume();
    r.port.checkpoint.mockClear();
    await r.controller.deleteDraft();
    expect(r.port.checkpoint).toHaveBeenCalled();
    expect(r.replica.deleteDraft).toHaveBeenCalledTimes(1);
    r.port.checkpoint.mockRejectedValue(new Error('unsaved input'));
    await r.controller.deleteDraft();
    expect(r.replica.deleteDraft).toHaveBeenCalledTimes(1);
    expect(r.controller.state.status).toBe('failed');
    r.controller.close();
  });

  it.each(['local', 'remote'] as const)('resolves a retained conflict using the explicit %s choice', async choice => {
    const r = await rig();
    r.result.conflicts.push(conflict);
    await r.controller.resume();
    expect(r.controller.state.status).toBe('conflict');
    expect(r.port.project).toHaveBeenCalledWith([], new Set([draftRecord.id]), expect.any(Object), undefined);
    await r.controller.resolveConflict(conflict.id, choice);
    expect(r.replica.resolve).toHaveBeenCalledWith(
      conflict.id,
      choice,
      choice === 'local' ? { payload: draftRecord.payload, deleted: true } : undefined,
      expect.any(Function)
    );
    r.controller.close();
  });

  it('uses the current local payload when a conflict is explicitly resolved locally', async () => {
    const r = await rig();
    r.result.conflicts.push(conflict);
    await r.controller.resume();
    r.port.snapshot.mockResolvedValue({
      entries: [{ kind: 'draft', sourceId: 'main', payload: draftRecord.payload }],
      localWorkIds: [],
      versions: { draft: null, providers: null }
    });
    await r.controller.resolveConflict(conflict.id, 'local');
    expect(r.replica.resolve).toHaveBeenCalledWith(
      conflict.id,
      'local',
      { payload: draftRecord.payload, deleted: false },
      expect.any(Function)
    );
    r.controller.close();
  });

  it('preserves both conflict copies after a failed resolution', async () => {
    const r = await rig();
    r.result.conflicts.push(conflict);
    r.replica.conflicts.mockResolvedValue([conflict]);
    await r.controller.resume();
    r.replica.resolve.mockRejectedValue(new Error('remote revision changed'));
    await r.controller.resolveConflict(conflict.id, 'remote');
    expect(r.controller.state.conflicts).toEqual([conflict]);
    expect(r.controller.state.status).toBe('conflict');
    expect(r.controller.state.message).toContain('双方版本保留');
    expect(r.controller.state.busy).toBe(false);
    r.controller.close();
  });

  it('distinguishes pending uploads and a confirmed remote draft deletion', async () => {
    const r = await rig();
    r.result.pending = 2;
    r.result.records.push({ ...draftRecord, deleted: true });
    await r.controller.resume();
    expect(r.controller.state.status).toBe('pending');
    expect(r.controller.state.pending).toBe(2);
    expect(r.controller.state.draftDeleted).toBe(true);
    r.controller.close();
  });

  it('ignores unknown conflict IDs and all mutations after closing the controller', async () => {
    const r = await rig();
    await r.controller.resume();
    await r.controller.resolveConflict('unknown', 'remote');
    expect(r.replica.resolve).not.toHaveBeenCalled();
    r.controller.close();
    r.replica.synchronize.mockClear();
    await r.controller.synchronize();
    expect(r.replica.synchronize).not.toHaveBeenCalled();
  });
});
