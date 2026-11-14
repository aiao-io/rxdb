import { describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../core/database.js';
import { createFile } from '../core/files.js';
import { DesktopHost } from './runtime.js';
import { changeApplication } from './updates.js';

async function fixture() {
  const host = new DesktopHost();
  const name = `desktop-updates-${crypto.randomUUID()}`;
  host.ownership.owned = true;
  host.phase = 'ready';
  host.database = await openDatabase(() => host.ownership.owned, 'windows', name);
  await host.mutate(state => {
    state.installations.find(app => app.appId === 'editor')!.resourceVersion = 'a'.repeat(64);
    state.appData.push({ appId: 'editor', schemaVersion: 1, key: 'draft', value: '私有数据' });
    createFile(state, { name: '保存的文档.txt', bytes: 'QQ==' });
  });
  const prepare = vi.spyOn(host.resources, 'prepare').mockResolvedValue();
  vi.spyOn(host.resources, 'find').mockImplementation((appId, version) => ({
    appId,
    version,
    key: (version === '1.0.0' ? 'a' : 'b').repeat(64),
    entry: `${appId}.html`,
    resources: []
  }));
  const close = vi.spyOn(host, 'closeInstances').mockResolvedValue(true);
  return {
    host,
    prepare,
    close,
    dispose: async () => {
      await host.dispose();
      indexedDB.deleteDatabase(name);
    }
  };
}

async function waitDialog(host: DesktopHost, title: string) {
  await vi.waitFor(() => expect(host.dialogs.current?.options.title).toBe(title));
}

describe('DESKTOP-US-204 更新取消与失败保护', () => {
  it('未启动应用且后台预取未完成时，更新自行固定旧版后保留完整回退资源', async () => {
    const { host, prepare, dispose } = await fixture();
    vi.stubEnv('DEV', false);
    vi.spyOn(host.resources, 'prune').mockResolvedValue([]);
    try {
      await host.mutate(state => {
        state.installations.find(app => app.appId === 'editor')!.resourceVersion = null;
      });
      const task = changeApplication(host, 'editor', false);
      await waitDialog(host, '更新 文本编辑器');
      host.dialogs.answer('continue');
      await waitDialog(host, '新增必需权限');
      host.dialogs.answer('allow');
      await expect(task).resolves.toBe(true);
      expect(prepare.mock.calls.map(([pin]) => pin.version)).toEqual(['1.0.0', '1.1.0']);
      expect(host.state.installations.find(app => app.appId === 'editor')).toMatchObject({
        version: '1.1.0',
        resourceVersion: 'b'.repeat(64),
        previousVersion: '1.0.0',
        previousResourceVersion: 'a'.repeat(64)
      });
    } finally {
      vi.unstubAllEnvs();
      await dispose();
    }
  });
  it('未固定旧版且下载失败时不下载新版、不关闭实例，安装与数据保持不变', async () => {
    const { host, prepare, close, dispose } = await fixture();
    vi.stubEnv('DEV', false);
    vi.spyOn(host.resources, 'prune').mockResolvedValue([]);
    try {
      await host.mutate(state => {
        state.installations.find(app => app.appId === 'editor')!.resourceVersion = null;
      });
      const before = structuredClone(host.state);
      prepare.mockRejectedValueOnce(new Error('OFFLINE: 旧版不可用'));
      const task = changeApplication(host, 'editor', false);
      const rejected = expect(task).rejects.toThrow('旧版不可用');
      await waitDialog(host, '更新 文本编辑器');
      host.dialogs.answer('continue');
      await rejected;
      expect(prepare.mock.calls.map(([pin]) => pin.version)).toEqual(['1.0.0']);
      expect(close).not.toHaveBeenCalled();
      expect(host.state).toEqual(before);
    } finally {
      vi.unstubAllEnvs();
      await dispose();
    }
  });
  it('稍后处理不下载、不关闭、不扩展旧授权', async () => {
    const { host, prepare, close, dispose } = await fixture();
    try {
      const before = structuredClone(host.state);
      const task = changeApplication(host, 'editor', false);
      await waitDialog(host, '更新 文本编辑器');
      expect(host.dialogs.current?.options.message).toContain('clipboard');
      host.dialogs.answer('cancel');
      await expect(task).resolves.toBe(false);
      expect(prepare).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
      expect(host.state).toEqual(before);
    } finally {
      await dispose();
    }
  });
  it('资源失败或新增必需权限被拒绝时，旧版本和数据保持不变', async () => {
    const { host, prepare, close, dispose } = await fixture();
    try {
      const before = structuredClone(host.state);
      prepare.mockRejectedValueOnce(new Error('INTEGRITY: 不完整'));
      const failed = changeApplication(host, 'editor', false);
      const rejection = expect(failed).rejects.toThrow('INTEGRITY');
      await waitDialog(host, '更新 文本编辑器');
      host.dialogs.answer('continue');
      await rejection;
      expect(close).not.toHaveBeenCalled();
      expect(host.state).toEqual(before);
      const denied = changeApplication(host, 'editor', false);
      await waitDialog(host, '更新 文本编辑器');
      host.dialogs.answer('continue');
      await waitDialog(host, '新增必需权限');
      host.dialogs.answer('cancel');
      await expect(denied).resolves.toBe(false);
      expect(close).not.toHaveBeenCalled();
      expect(host.state).toEqual(before);
    } finally {
      await dispose();
    }
  });
  it('未保存关闭取消不授予新权限；同意后更新，显式回退保留文件与私有数据', async () => {
    const { host, close, dispose } = await fixture();
    try {
      close.mockResolvedValueOnce(false);
      const cancelled = changeApplication(host, 'editor', false);
      await waitDialog(host, '更新 文本编辑器');
      host.dialogs.answer('continue');
      await waitDialog(host, '新增必需权限');
      host.dialogs.answer('allow');
      await expect(cancelled).resolves.toBe(false);
      expect(host.state.grants).toEqual([]);
      const task = changeApplication(host, 'editor', false);
      await waitDialog(host, '更新 文本编辑器');
      host.dialogs.answer('continue');
      await waitDialog(host, '新增必需权限');
      host.dialogs.answer('allow');
      await expect(task).resolves.toBe(true);
      expect(host.state.installations.find(app => app.appId === 'editor')?.version).toBe('1.1.0');
      expect(host.state.grants).toHaveLength(1);
      const rollback = changeApplication(host, 'editor', true);
      await waitDialog(host, '回退 文本编辑器');
      host.dialogs.answer('continue');
      await expect(rollback).resolves.toBe(true);
      expect(host.state.installations.find(app => app.appId === 'editor')?.version).toBe('1.0.0');
      expect(host.state.appData[0].value).toBe('私有数据');
      expect(host.state.files[0].name).toBe('保存的文档.txt');
      expect((await host.database!.read()).installations.find(app => app.appId === 'editor')?.version).toBe('1.0.0');
    } finally {
      await dispose();
    }
  });
});
