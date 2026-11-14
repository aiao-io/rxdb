import { describe, expect, it, vi } from 'vitest';
import { installApp } from '../core/catalog.js';
import { openDatabase } from '../core/database.js';
import { DesktopError } from '../core/errors.js';
import { createFile } from '../core/files.js';
import { createState } from '../core/state.js';
import type { SavedWindow } from '../core/types.js';
import { DesktopHost } from './runtime.js';

async function fixture() {
  const host = new DesktopHost();
  const name = `desktop-pending-${crypto.randomUUID()}`;
  host.ownership.owned = true;
  host.database = await openDatabase(() => host.ownership.owned, 'windows', name);
  await host.database.transact(state => {
    const file = createFile(state, { name: '恢复.txt', bytes: '5L+d55WZCg==' });
    const win: SavedWindow = {
      id: 'pending-a',
      appId: 'notes',
      fileId: file.id,
      route: `/documents/${file.id}?line=2#L2`,
      workspaceId: 'first',
      bounds: { x: 90, y: 48, width: 600, height: 400 },
      state: 'minimized',
      previousState: 'right',
      beforeMinimized: 'maximized'
    };
    state.session = [win, { ...win, id: 'pending-b' }, { ...win, id: 'working', appId: 'editor', state: 'normal' }];
    state.navigation.activeWindows['first'] = 2;
  });
  host.state = await host.database.read();
  host.phase = 'ready';
  try {
    host.restoreSession();
  } catch (error) {
    await host.dispose();
    indexedDB.deleteDatabase(name);
    throw error;
  }
  return {
    host,
    dispose: async () => {
      await host.dispose();
      indexedDB.deleteDatabase(name);
    }
  };
}

describe('DESKTOP-US-501/AC2 未安装应用恢复项', () => {
  it('两个相同快照保持不同身份，其他窗口恢复并在保存布局后保留失败项', async () => {
    const { host, dispose } = await fixture();
    try {
      const original = structuredClone(host.state.session);
      expect(host.recovery.size).toBe(2);
      expect(host.model.windows.map(win => win.id)).toEqual(['working']);
      expect(host.model.activeId).toBe('working');
      await host.persistSession();
      const current = await host.database!.read();
      expect(current.session.map(win => win.id)).toEqual(['working', 'pending-a', 'pending-b']);
      expect(current.session.slice(1)).toEqual(original.slice(0, 2));
      expect(current.navigation.activeWindows['first']).toBe(0);
    } finally {
      await dispose();
    }
  });

  it('未安装时重试保留快照；安装后只恢复目标身份及完整布局', async () => {
    const { host, dispose } = await fixture();
    try {
      await expect(host.retryRecovery('pending-a')).resolves.toBe(false);
      expect(host.recovery.get('pending-a')?.error).toContain('NOT_FOUND');
      expect(host.recovery.size).toBe(2);
      await host.mutate(state => installApp(state, 'notes'));
      await expect(host.retryRecovery('pending-a')).resolves.toBe(true);
      const win = host.model.windows.find(item => item.id === 'pending-a');
      expect(win).toMatchObject({
        appId: 'notes',
        state: 'minimized',
        previousState: 'right',
        beforeMinimized: 'maximized'
      });
      expect(host.recovery.has('pending-a')).toBe(false);
      expect(host.recovery.has('pending-b')).toBe(true);
      const state = await host.database!.read();
      expect(state.session.map(item => item.id).sort()).toEqual(['pending-a', 'pending-b', 'working']);
      expect(state.files[0].name).toBe('恢复.txt');
    } finally {
      await dispose();
    }
  });

  it('移除失败时保留项，成功只移除选中快照并修正原焦点索引', async () => {
    const { host, dispose } = await fixture();
    try {
      const before = await host.database!.read();
      vi.spyOn(host, 'mutate').mockRejectedValueOnce(new DesktopError('QUOTA', '模拟写入失败'));
      await expect(host.removeRecovery('pending-a')).resolves.toBe(false);
      expect(host.recovery.has('pending-a')).toBe(true);
      expect(await host.database!.read()).toEqual(before);
      await expect(host.removeRecovery('pending-a')).resolves.toBe(true);
      expect(host.recovery.has('pending-a')).toBe(false);
      expect(host.recovery.has('pending-b')).toBe(true);
      const state = await host.database!.read();
      expect(state.session.map(win => win.id)).toEqual(['pending-b', 'working']);
      expect(state.navigation.activeWindows['first']).toBe(1);
      expect(state.files).toEqual(before.files);
    } finally {
      await dispose();
    }
  });

  it('配置事务更新后的快照为准，显式重置清除恢复项且不重新注入旧会话', async () => {
    const { host, dispose } = await fixture();
    try {
      await host.mutate(state => {
        state.workspaces.push({ id: 'moved', name: '迁移区' });
        state.navigation.activeWindows['moved'] = null;
        state.session[0].workspaceId = 'moved';
      });
      await host.persistSession();
      expect(host.state.session.find(win => win.id === 'pending-a')?.workspaceId).toBe('moved');
      await host.mutate(state => Object.assign(state, createState('windows')));
      expect(host.recovery.size).toBe(0);
    } finally {
      await dispose();
    }
  });
  it('并发移除只提交一次，删除最后一项后关闭面板且不再恢复旧快照', async () => {
    const { host, dispose } = await fixture();
    try {
      const first = host.removeRecovery('pending-a');
      await expect(host.removeRecovery('pending-a')).rejects.toThrow('BUSY');
      await expect(host.retryRecovery('pending-a')).rejects.toThrow('BUSY');
      await expect(first).resolves.toBe(true);
      await expect(host.removeRecovery('pending-a')).rejects.toThrow('NOT_FOUND');
      await expect(host.removeRecovery('pending-b')).resolves.toBe(true);
      expect(host.recovery.size).toBe(0);
      expect(host.recoveryOpen).toBe(false);
      await host.persistSession();
      expect((await host.database!.read()).session.map(win => win.id)).toEqual(['working']);
    } finally {
      await dispose();
    }
  });

  it('失去写入权时拒绝重试和删除，恢复项与文件保持原样', async () => {
    const { host, dispose } = await fixture();
    try {
      const before = await host.database!.read();
      host.ownership.owned = false;
      await expect(host.retryRecovery('pending-a')).rejects.toThrow('OWNERSHIP');
      await expect(host.removeRecovery('pending-a')).rejects.toThrow('OWNERSHIP');
      expect(host.recovery.size).toBe(2);
      expect(await host.database!.read()).toEqual(before);
    } finally {
      await dispose();
    }
  });
});
