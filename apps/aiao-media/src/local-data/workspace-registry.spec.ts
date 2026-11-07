import { describe, expect, it } from 'vitest';
import { WorkspaceRegistry, type WorkspaceRegistryPort } from './workspace-registry';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const a = { projectOrigin: 'http://127.0.0.1:54321', userId: id(1) };
const b = { ...a, userId: id(2) };
function rig() {
  let stored: { payload: string; revision: number } | null = null;
  let next = 10;
  const port: WorkspaceRegistryPort = {
    read: async () => structuredClone(stored),
    write: async (payload, revision) => {
      if ((stored?.revision ?? null) !== revision) throw new Error('conflict');
      stored = { payload, revision: (revision ?? 0) + 1 };
    },
    exclusive: async operation => operation()
  };
  return { registry: new WorkspaceRegistry(id(3), port, () => id(++next)), persisted: () => stored?.payload ?? '' };
}
describe('local workspace account registry', () => {
  it('keeps an anonymous workspace unchanged when signing in before explicit confirmation', async () => {
    const r = rig();
    const selected = await r.registry.selectAccount(a);
    expect(selected.selectedId).toBe(id(3));
    expect(selected.profiles[0].account).toBeNull();
    expect(selected.profiles[0].binding).toBeNull();
  });
  it('persists an idempotent pending intent and requires the exact receipt to activate it', async () => {
    const r = rig();
    const first = await r.registry.prepareBinding(a);
    expect(await r.registry.prepareBinding(a)).toEqual(first);
    await expect(r.registry.activateBinding(a, id(99), id(4))).rejects.toThrow();
    await r.registry.activateBinding(a, first.requestId, id(4));
    const profile = (await r.registry.read()).profiles[0];
    expect(profile.binding).toMatchObject({ state: 'active', remoteWorkspaceId: id(4) });
    expect(profile.account).toEqual(a);
  });
  it('keeps A on disk during logout and gives B an independent profile, then restores A', async () => {
    const r = rig();
    const intent = await r.registry.prepareBinding(a);
    await r.registry.activateBinding(a, intent.requestId, id(4));
    expect((await r.registry.selectAccount(null)).selectedId).toBe(id(3));
    const selectedB = await r.registry.selectAccount(b);
    expect(selectedB.selectedId).not.toBe(id(3));
    expect(selectedB.profiles.find(profile => profile.id === selectedB.selectedId)?.account).toEqual(b);
    const selectedA = await r.registry.selectAccount(a);
    expect(selectedA.selectedId).toBe(id(3));
    expect(selectedA.profiles.find(profile => profile.id === id(3))?.binding?.state).toBe('paused');
    expect(selectedA.profiles).toHaveLength(2);
  });
  it('isolates identical user IDs from different projects', async () => {
    const r = rig();
    const intent = await r.registry.prepareBinding(a);
    await r.registry.activateBinding(a, intent.requestId, id(4));
    const other = await r.registry.selectAccount({ ...a, projectOrigin: 'http://127.0.0.1:54325' });
    expect(other.selectedId).not.toBe(id(3));
  });
  it('does not attach a stale A receipt to B after switching', async () => {
    const r = rig();
    const intent = await r.registry.prepareBinding(a);
    await r.registry.selectAccount(b);
    await expect(r.registry.activateBinding(a, intent.requestId, id(4))).rejects.toThrow();
    expect((await r.registry.read()).profiles.some(profile => profile.binding?.state === 'active')).toBe(false);
  });
  it('refuses corrupt registry data without overwriting it', async () => {
    let writes = 0;
    const registry = new WorkspaceRegistry(id(3), {
      read: async () => ({ payload: '{broken', revision: 1 }),
      write: async () => {
        writes++;
      },
      exclusive: async operation => operation()
    });
    await expect(registry.selectAccount(a)).rejects.toThrow();
    expect(writes).toBe(0);
  });
  it('persists only declared identity fields', async () => {
    const r = rig();
    await r.registry.prepareBinding({
      ...a,
      access_token: 'do-not-persist',
      email: 'private@example.test'
    } as typeof a);
    expect(r.persisted()).not.toContain('do-not-persist');
    expect(r.persisted()).not.toContain('private@example.test');
  });
});

it('拒绝缺失模式或初始化状态的绑定，不重写注册表', async () => {
  const base = rig();
  await base.registry.prepareBinding(a);
  const state = JSON.parse(base.persisted());
  for (const field of ['mode', 'initialized']) {
    const invalid = structuredClone(state);
    delete invalid.profiles[0].binding[field];
    const registry = new WorkspaceRegistry(id(3), {
      read: async () => ({ payload: JSON.stringify(invalid), revision: 1 }),
      write: async () => {
        throw new Error('不应重写');
      },
      exclusive: async operation => operation()
    });
    await expect(registry.read()).rejects.toThrow('绑定记录无效');
  }
});

it('拒绝损坏的空值身份或绑定，避免将旧副本当成未绑定数据重新分配', async () => {
  const baseline = await rig().registry.read();
  for (const patch of [
    { account: false },
    { account: 0 },
    { account: undefined },
    { binding: false },
    { binding: 0 },
    { binding: undefined }
  ]) {
    const state = structuredClone(baseline);
    Object.assign(state.profiles[0], patch);
    let writes = 0;
    const registry = new WorkspaceRegistry(id(3), {
      read: async () => ({ payload: JSON.stringify(state), revision: 1 }),
      write: async () => {
        writes++;
      },
      exclusive: async operation => operation()
    });
    await expect(registry.selectAccount(b)).rejects.toThrow();
    expect(writes).toBe(0);
  }
});
