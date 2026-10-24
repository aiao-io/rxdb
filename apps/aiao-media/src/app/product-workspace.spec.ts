import { describe, expect, it, vi } from 'vitest';
import type { ProductSyncResult } from '../local-data/product-sync-store';
import { WorkspaceRegistry, type WorkspaceRegistryPort } from '../local-data/workspace-registry';
import { ProductWorkspaceController, type ProductReplica } from './product-workspace';
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
    records: vi.fn(async () => []),
    conflicts: vi.fn(async () => []),
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
    ownWorkspace: vi.fn(async () => (active ? { id: id(4), owner_id: account.userId } : null)),
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
    busy: () => false,
    snapshot: vi.fn(async () => ({ entries: [], localWorkIds: [], versions: { draft: null, providers: null } })),
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
});
