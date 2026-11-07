import type { OrbitInstance, OrbitState } from '@aiao/orbit';
import { describe, expect, it, vi } from 'vitest';
import { getDefinition } from '../core/catalog.js';
import { openDatabase } from '../core/database.js';
import { createFile } from '../core/files.js';
import { grantPermission } from '../core/permissions.js';
import { DesktopHost, type RunningApp } from './runtime.js';
import { Suspension } from './suspension.js';
import { openWindow } from './windows.js';

function instance(status: OrbitState, fileId: string | null = null) {
  const emit = vi.fn(() => {
    if (status !== 'ready' && status !== 'hidden') throw new Error('NOT_READY');
  });
  const setProps = vi.fn(() => {
    if (status === 'failed' || status === 'destroyed') throw new Error('DESTROYED');
  });
  const app: RunningApp = {
    id: status,
    status,
    definition: getDefinition('editor'),
    resourceVersion: null,
    resourceLifetime: new AbortController(),
    background: new Suspension(
      false,
      async () => undefined,
      () => undefined
    ),
    fileId,
    dirty: false,
    title: '文档',
    route: '',
    navigation: { back: false, forward: false },
    error: null,
    commands: [],
    mounted: false,
    handle: { emit, setProps, hide: () => undefined, show: () => undefined } as unknown as OrbitInstance
  };
  return { app, emit, setProps };
}

const states: OrbitState[] = ['created', 'loading', 'ready', 'hidden', 'failed', 'destroyed'];

describe('DESKTOP-US-301/401/602 宿主生命周期分发', () => {
  it('文件提交只通知已连接实例，其他实例不能把成功事务变成失败', async () => {
    const host = new DesktopHost();
    try {
      const file = createFile(host.state, { name: 'a.txt' });
      const fixtures = states.map(status => instance(status, file.id));
      for (const { app } of fixtures) {
        host.instances.set(app.id, app);
        grantPermission(host.state, host.identity(app), 'files', file.id, false);
      }
      expect(() => host.notifyFiles('writer')).not.toThrow();
      for (const { app, emit } of fixtures) {
        expect(emit).toHaveBeenCalledTimes(app.status === 'ready' || app.status === 'hidden' ? 2 : 0);
      }
    } finally {
      await host.dispose();
    }
  });
  it('偏好更新允许准备中的实例接收 props，跳过已失败或销毁实例', async () => {
    const host = new DesktopHost();
    const name = `desktop-lifecycle-${crypto.randomUUID()}`;
    host.ownership.owned = true;
    host.database = await openDatabase(() => host.ownership.owned, 'windows', name);
    host.state = await host.database.read();
    const fixtures = states.map(status => instance(status));
    for (const { app } of fixtures) host.instances.set(app.id, app);
    try {
      await expect(host.updateProfile({ scale: 200 })).resolves.toBeUndefined();
      expect((await host.database.read()).profile.scale).toBe(200);
      for (const { app, emit, setProps } of fixtures) {
        expect(setProps).toHaveBeenCalledTimes(app.status === 'failed' || app.status === 'destroyed' ? 0 : 1);
        expect(emit).toHaveBeenCalledTimes(app.status === 'ready' || app.status === 'hidden' ? 1 : 0);
      }
    } finally {
      await host.dispose();
      indexedDB.deleteDatabase(name);
    }
  });
  it('资源准备失败只标记目标实例失败，保留可重试的窗口与启动诊断', async () => {
    const host = new DesktopHost();
    const { app } = instance('created');
    app.resourceVersion = 'a'.repeat(64);
    const mount = vi.fn();
    app.handle = { ...app.handle, mount } as unknown as OrbitInstance;
    host.instances.set(app.id, app);
    vi.spyOn(host.resources, 'prepare').mockRejectedValue(new Error('OFFLINE: 缓存缺失'));
    try {
      await host.mount(app, document.createElement('div'));
      expect(app.status).toBe('failed');
      expect(app.error).toContain('OFFLINE');
      expect(host.instances.get(app.id)).toBe(app);
      expect(mount).not.toHaveBeenCalled();
      expect(host.errors[0].category).toBe('STARTUP_FAILED');
    } finally {
      await host.dispose();
    }
  });
  it('持久化会话时原子移除已退出实例授权，其他实例与持久授权保留', async () => {
    const host = new DesktopHost();
    const name = `desktop-grant-cleanup-${crypto.randomUUID()}`;
    host.ownership.owned = true;
    host.database = await openDatabase(() => host.ownership.owned, 'windows', name);
    host.state = await host.database.read();
    const { app } = instance('ready');
    host.instances.set(app.id, app);
    try {
      await host.mutate(state => {
        grantPermission(state, { ...host.identity(app), instanceId: 'retired' }, 'files', '*', false);
        grantPermission(state, host.identity(app), 'files', '*', false);
        grantPermission(state, host.identity(app), 'storage', '*', true);
      });
      await host.persistSession();
      const saved = await host.database.read();
      expect(saved.grants.map(grant => grant.instanceId)).toEqual([app.id, null]);
    } finally {
      await host.dispose();
      indexedDB.deleteDatabase(name);
    }
  });
});

describe('DESKTOP-US-305 宿主目标实例导航', () => {
  it('只更新目标实例的位置与历史状态，失效实例的迟到回复不能写入', async () => {
    const host = new DesktopHost();
    const { app } = instance('ready');
    host.ownership.owned = true;
    host.instances.set(app.id, app);
    const persist = vi.spyOn(host, 'persistSession').mockResolvedValue();
    const request = vi.fn(async () => ({ route: '/documents/one?line=2#L2', back: true, forward: false }));
    app.handle = { ...app.handle, request } as unknown as OrbitInstance;
    try {
      await host.navigateApplication(app, { type: 'push', route: '/documents/one?line=2#L2' });
      expect(request).toHaveBeenCalledWith('navigation.navigate', { type: 'push', route: '/documents/one?line=2#L2' });
      expect(app.route).toBe('/documents/one?line=2#L2');
      expect(app.navigation).toEqual({ back: true, forward: false });
      expect(persist).toHaveBeenCalledTimes(1);
      request.mockImplementationOnce(async () => {
        host.instances.delete(app.id);
        return { route: '/late', back: false, forward: false };
      });
      await expect(host.navigateApplication(app, { type: 'back' })).rejects.toThrow('OWNERSHIP');
      expect(app.route).toBe('/documents/one?line=2#L2');
      expect(persist).toHaveBeenCalledTimes(1);
    } finally {
      await host.dispose();
    }
  });
});

describe('DESKTOP-US-501 恢复失败项重试', () => {
  it('重试保留该窗口的路由、工作区、边界和状态', async () => {
    const host = new DesktopHost();
    const { app } = instance('failed', 'saved-file');
    app.route = '/documents/saved-file?line=3#L3';
    host.instances.set(app.id, app);
    const win = openWindow(host.model, app.id, app.definition.id, host.area());
    win.workspaceId = 'research';
    win.normalBounds = { x: 12, y: 24, width: 600, height: 400 };
    win.state = 'left';
    vi.spyOn(host, 'closeInstances').mockResolvedValue(true);
    const launch = vi.spyOn(host, 'launch').mockReturnValue(app);
    try {
      await host.retry(app);
      expect(launch).toHaveBeenCalledWith('editor', true, 'saved-file', {
        appId: 'editor',
        fileId: 'saved-file',
        route: '/documents/saved-file?line=3#L3',
        workspaceId: 'research',
        bounds: win.normalBounds,
        state: 'left'
      });
    } finally {
      await host.dispose();
    }
  });
});
