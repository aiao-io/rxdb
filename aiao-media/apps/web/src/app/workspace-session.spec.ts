import { describe, expect, it, vi } from 'vitest';
import { WorkspaceRegistry, type WorkspaceRegistryPort } from '../local-data/workspace-registry';
import { WorkspaceSession } from './workspace-session';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const a = { projectOrigin: 'http://127.0.0.1:54321', userId: id(1) },
  b = { ...a, userId: id(2) };
async function rig() {
  let row: { payload: string; revision: number } | null = null,
    next = 10;
  const storage: WorkspaceRegistryPort = {
    read: async () => row,
    write: async payload => {
      row = { payload, revision: (row?.revision ?? 0) + 1 };
    },
    exclusive: async action => action()
  };
  const registry = new WorkspaceRegistry(id(3), storage, () => id(++next));
  const binding = await registry.prepareBinding(a);
  await registry.activateBinding(a, binding.requestId, id(4));
  const events: string[] = [];
  const port = {
    checkpoint: vi.fn(async () => {
      events.push('checkpoint');
    }),
    pause: vi.fn(() => {
      events.push('pause');
    }),
    open: vi.fn(async (profileId: string) => ({ id: profileId })),
    activate: vi.fn((store: { id: string }) => {
      events.push(`activate:${store.id}`);
    }),
    discard: vi.fn(async () => undefined),
    selected: vi.fn(),
    canActivate: vi.fn(() => true),
    transition: vi.fn()
  };
  return { registry, events, port, session: new WorkspaceSession(id(3), registry, port) };
}
describe('workspace activation and late response isolation', () => {
  it('saves current input before opening and activating B, leaving A registered', async () => {
    const r = await rig();
    await r.session.select(b);
    expect(r.events.slice(0, 2)).toEqual(['pause', 'checkpoint']);
    expect(r.port.activate).toHaveBeenCalledOnce();
    expect((await r.registry.read()).profiles.some(profile => profile.id === id(3))).toBe(true);
  });
  it('keeps the current store when input cannot be durably checkpointed', async () => {
    const r = await rig();
    r.port.checkpoint.mockRejectedValueOnce(new Error('disk full'));
    await expect(r.session.select(b)).rejects.toThrow('disk full');
    expect(r.port.open).not.toHaveBeenCalled();
    expect((await r.registry.read()).selectedId).toBe(id(3));
  });
  it('discards an opened store when a newer account selection overtakes it', async () => {
    const r = await rig();
    let release!: (store: { id: string }) => void;
    r.port.open.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = resolve;
        })
    );
    const first = r.session.select(b);
    await vi.waitFor(() => expect(r.port.open).toHaveBeenCalledOnce());
    const second = r.session.select(a);
    release({ id: id(99) });
    await Promise.all([first, second]);
    expect(r.port.discard).toHaveBeenCalledWith({ id: id(99) });
    expect(r.port.activate).not.toHaveBeenCalled();
    expect((await r.registry.read()).selectedId).toBe(id(3));
  });
  it('keeps activation unchanged if a new backend fails to open', async () => {
    const r = await rig();
    r.port.open.mockRejectedValueOnce(new Error('unavailable'));
    await expect(r.session.select(b)).rejects.toThrow('unavailable');
    expect(r.port.activate).not.toHaveBeenCalled();
    expect((await r.registry.read()).profiles.some(profile => profile.id === id(3))).toBe(true);
  });
});

describe('authorized workspace activation', () => {
  it('does not open a selected workspace when the current identity cannot activate it', async () => {
    const r = await rig();
    r.port.canActivate.mockReturnValue(false);
    await r.session.select(b);
    expect(r.port.open).not.toHaveBeenCalled();
    expect(r.port.activate).not.toHaveBeenCalled();
    expect(r.port.selected).toHaveBeenCalled();
    expect(r.port.transition.mock.calls).toEqual([[true], [false]]);
  });

  it('discards a store if authorization changes while it is opening', async () => {
    const r = await rig();
    r.port.open.mockImplementationOnce(async profileId => {
      r.port.canActivate.mockReturnValue(false);
      return { id: profileId };
    });
    await r.session.select(b);
    expect(r.port.discard).toHaveBeenCalledTimes(1);
    expect(r.port.activate).not.toHaveBeenCalled();
  });

  it('follows a separately selected profile without recreating its data', async () => {
    const r = await rig();
    const next = await r.registry.selectAccount(b);
    await r.session.follow();
    expect(r.port.activate).toHaveBeenCalledWith(
      { id: next.selectedId },
      expect.objectContaining({ id: next.selectedId })
    );
    await r.session.selectLocal(id(3));
    expect(r.port.activate).toHaveBeenCalledWith({ id: id(3) }, expect.objectContaining({ id: id(3) }));
  });

  it('cancels a selection before it can mutate the registry if the session closes during checkpointing', async () => {
    const r = await rig();
    let release!: () => void;
    r.port.checkpoint.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = resolve;
        })
    );
    const selecting = r.session.select(b);
    await vi.waitFor(() => expect(r.port.checkpoint).toHaveBeenCalled());
    r.session.close();
    release();
    await selecting;
    expect(r.port.open).not.toHaveBeenCalled();
    expect((await r.registry.read()).selectedId).toBe(id(3));
    await r.session.follow();
    expect(r.port.open).not.toHaveBeenCalled();
  });
});
