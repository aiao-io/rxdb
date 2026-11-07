import type { OrbitInstance } from '@aiao/orbit';
import { describe, expect, it, vi } from 'vitest';
import { getDefinition, installApp } from '../core/catalog.js';
import { createFile } from '../core/files.js';
import { grantPermission } from '../core/permissions.js';
import { createState } from '../core/state.js';
import { DesktopTransfers } from '../core/transfers.js';
import { DesktopTransport } from '../core/transport.js';
import type { DesktopState, Identity } from '../core/types.js';
import { registerBridge } from './bridge.js';
import { Dialogs } from './dialogs.js';
import type { DesktopHost, RunningApp } from './runtime.js';
import { createWindowModel } from './windows.js';

function fixture(appId: string) {
  const handlers = new Map<string, Parameters<OrbitInstance['onRequest']>[1]>();
  const definition = getDefinition(appId);
  let state = createState('windows');
  const identity: Identity = {
    appId,
    origin: 'https://desktop.test',
    instanceId: 'one',
    capabilities: [...definition.capabilities, ...definition.optionalCapabilities]
  };
  for (const capability of definition.capabilities) grantPermission(state, identity, capability, '*', true);
  const app = {
    id: 'one',
    definition,
    route: '',
    navigation: { back: false, forward: false },
    handle: {
      onRequest: (name: string, handler: Parameters<OrbitInstance['onRequest']>[1]) => {
        handlers.set(name, handler);
        return () => handlers.delete(name);
      }
    }
  } as unknown as RunningApp;
  const launch = vi.fn();
  const dialogs = new Dialogs(() => undefined);
  const close = vi.fn(async () => true);
  const host = {
    get state() {
      return state;
    },
    instances: new Map([[app.id, app]]),
    ownership: { owned: true },
    identity: () => identity,
    authorize: async () => undefined,
    database: { read: async () => structuredClone(state) },
    mutate: async <T>(operation: (draft: DesktopState) => T) => {
      const draft = structuredClone(state);
      const result = operation(draft);
      state = draft;
      return result;
    },
    dialogs,
    launch,
    model: createWindowModel('windows'),
    changed: () => undefined,
    transfers: new DesktopTransfers(),
    changingApplications: new Set<string>(),
    prefetch: { cancel: () => undefined },
    applicationsChanged: () => undefined,
    closeInstances: close,
    notifyFiles: () => undefined,
    persistSession: async () => undefined,
    baseURL: () => new URL('https://desktop.test/')
  } as unknown as DesktopHost;
  registerBridge(host, app);
  const transport = new DesktopTransport(async (name, payload) => {
    const handler = handlers.get(name);
    if (!handler) throw new Error('缺少处理器');
    return handler(payload, new AbortController().signal);
  });
  return { host, close, transport, launch, dialogs };
}

async function scopedFiles() {
  const context = fixture('files');
  const entries = await context.host.mutate(state => {
    state.grants = [];
    const directory = createFile(state, { name: '授权目录', kind: 'directory' });
    const outside = createFile(state, { name: '其他目录', kind: 'directory' });
    const allowed = createFile(state, { name: '允许.txt', parentId: directory.id, bytes: 'QQ==' });
    const privateFile = createFile(state, { name: '不能猜测.txt', parentId: outside.id, bytes: 'Qg==' });
    return { directory, outside, allowed, privateFile };
  });
  const identity = context.host.identity(context.host.instances.get('one')!);
  return { ...context, ...entries, identity };
}

describe('DESKTOP-US-601/AC5 文件作用域服务提交边界', () => {
  it('单文件授权允许读写该文件，不需要扩大到所有文件', async () => {
    const { host, transport, allowed, identity } = await scopedFiles();
    await host.mutate(state => grantPermission(state, identity, 'files', allowed.id, false));
    await expect(transport.request('files.read', { id: allowed.id })).resolves.toMatchObject({
      id: allowed.id,
      bytes: 'QQ=='
    });
    await expect(
      transport.request('files.write', { id: allowed.id, revision: allowed.revision, bytes: 'Qw==' })
    ).resolves.toMatchObject({ id: allowed.id, bytes: 'Qw==', revision: allowed.revision + 1 });
    expect(host.state.grants.map(grant => grant.scope)).toEqual([allowed.id]);
  });

  it.each(['read', 'write', 'rename', 'move', 'list', 'directories', 'trash', 'open'] as const)(
    '单文件授权不能通过 files.%s 越过作用域，拒绝不修改原数据',
    async method => {
      const { host, transport, allowed, privateFile, outside, identity, launch, dialogs } = await scopedFiles();
      await host.mutate(state => grantPermission(state, identity, 'files', allowed.id, false));
      const before = structuredClone(host.state);
      const requests = {
        read: { id: privateFile.id },
        write: { id: privateFile.id, revision: privateFile.revision, bytes: 'WA==' },
        rename: { id: privateFile.id, name: '不能覆盖.txt' },
        move: { id: allowed.id, parentId: outside.id },
        list: { parentId: outside.id },
        directories: {},
        trash: { id: privateFile.id },
        open: { id: privateFile.id }
      };
      await expect(transport.request(`files.${method}`, requests[method])).rejects.toThrow('DENIED');
      expect(host.state).toEqual(before);
      expect(launch).not.toHaveBeenCalled();
      expect(dialogs.current).toBeNull();
    }
  );

  it.each(['../private', 'allowed/../private', '/private'])(
    '路径形式 %s 不能绕过不透明文件身份和单文件授权',
    async path => {
      const { host, transport, allowed, identity } = await scopedFiles();
      await host.mutate(state => grantPermission(state, identity, 'files', allowed.id, false));
      const before = structuredClone(host.state);
      await expect(transport.request('files.read', { id: path })).rejects.toThrow('DENIED');
      await expect(transport.request('files.rename', { id: allowed.id, name: path })).rejects.toThrow('INVALID');
      expect(host.state).toEqual(before);
    }
  );

  it('目录授权只能在该目录创建，创建文件继承对应的精确文件授权', async () => {
    const { host, transport, directory, outside, identity } = await scopedFiles();
    await host.mutate(state => grantPermission(state, identity, 'files', `directory:${directory.id}`, true));
    await expect(
      transport.request('files.create', { name: '新文件.txt', parentId: directory.id, bytes: 'Qw==' })
    ).resolves.toMatchObject({ name: '新文件.txt', parentId: directory.id });
    const created = host.state.files.find(file => file.name === '新文件.txt')!;
    await expect(transport.request('files.read', { id: created.id })).resolves.toMatchObject({ bytes: 'Qw==' });
    expect(host.state.grants.map(grant => grant.scope)).toEqual([`directory:${directory.id}`, created.id]);
    const before = structuredClone(host.state);
    await expect(transport.request('files.create', { name: '越界.txt', parentId: outside.id })).rejects.toThrow(
      'DENIED'
    );
    await expect(transport.request('files.list', { parentId: outside.id })).rejects.toThrow('DENIED');
    expect(host.state).toEqual(before);
  });

  it('移动已确认目标目录后撤销其授权，提交时再次检查且原文件不移动', async () => {
    const { host, transport, allowed, outside, identity } = await scopedFiles();
    const target = `directory:${outside.id}`;
    await host.mutate(state => {
      grantPermission(state, identity, 'files', allowed.id, false);
      grantPermission(state, identity, 'files', target, false);
    });
    const before = structuredClone(host.state.files);
    const authorize = vi.spyOn(host, 'authorize').mockImplementation(async (_app, _capability, scope) => {
      if (scope === allowed.id)
        await host.mutate(state => {
          state.grants = state.grants.filter(grant => grant.scope !== target);
        });
    });
    await expect(transport.request('files.move', { id: allowed.id, parentId: outside.id })).rejects.toThrow(
      '目标目录授权已撤销'
    );
    expect(host.state.files).toEqual(before);
    expect(authorize.mock.calls.map(call => call[2])).toEqual([target, allowed.id]);
  });
});

describe('DESKTOP-US-401/402 宿主服务边界', () => {
  it('实例更新保留 path/query/hash，非法位置在改标题或持久化前拒绝', async () => {
    const { transport, host } = fixture('editor');
    const app = host.instances.get('one')!;
    await transport.request('window.update', {
      route: '/documents/one?line=2#L2',
      navigation: { back: true, forward: false }
    });
    expect(app.route).toBe('/documents/one?line=2#L2');
    expect(app.navigation).toEqual({ back: true, forward: false });
    await expect(
      transport.request('window.update', { title: '不能修改', route: '/?access_token=secret' })
    ).rejects.toThrow('凭据');
    expect(app.title).not.toBe('不能修改');
    expect(app.route).toBe('/documents/one?line=2#L2');
  });
  it('系统应用卸载在关闭协商之前拒绝，不能先破坏其窗口', async () => {
    const { transport, close } = fixture('catalog');
    await expect(transport.request('apps.uninstall', { id: 'files' })).rejects.toThrow('DENIED');
    expect(close).not.toHaveBeenCalled();
  });
  it.each([{ bytes: 1 }, { kind: 'executable' }, { mime: false }])(
    '显式非法文件字段不能被静默默认 %j',
    async invalid => {
      const { transport, host } = fixture('files');
      await expect(transport.request('files.create', { name: 'invalid.txt', ...invalid })).rejects.toThrow('INVALID');
      expect(host.state.files).toEqual([]);
    }
  );
  it('调用身份不能伪造，未授予的可选能力不能越过服务层', async () => {
    const { transport, host } = fixture('files');
    await expect(transport.request('files.create', { appId: 'editor', name: 'fake.txt' })).rejects.toThrow('DENIED');
    await expect(transport.request('notification.post', { title: '越权', body: '' })).rejects.toThrow('DENIED');
    host.ownership.owned = false;
    await expect(transport.request('files.list', null)).rejects.toThrow('OWNERSHIP');
  });
  it('打开方式只列出已安装兼容应用，明确选择后持久保存默认', async () => {
    const { transport, host, dialogs, launch } = fixture('files');
    await host.mutate(state => installApp(state, 'notes'));
    const file = await host.mutate(state => createFile(state, { name: 'a.txt', mime: 'text/plain' }));
    const pending = transport.request('files.open', { id: file.id, choose: true });
    await vi.waitFor(() => expect(dialogs.current?.options.title).toBe('选择打开方式'));
    dialogs.answer('open', { app: 'notes', default: 'yes' });
    await expect(pending).resolves.toBe(true);
    expect(host.state.associations['text/plain']).toBe('notes');
    expect(launch).toHaveBeenCalledWith('notes', false, file.id);
  });

  it('显式指定不兼容打开应用时拒绝，不偷偷改成其他应用', async () => {
    const { transport, host, dialogs, launch } = fixture('files');
    const file = await host.mutate(state => createFile(state, { name: 'a.txt', mime: 'text/plain' }));
    await expect(transport.request('files.open', { id: file.id, appId: 'settings' })).rejects.toThrow('UNSUPPORTED');
    expect(dialogs.current).toBeNull();
    expect(launch).not.toHaveBeenCalled();
  });

  it.each(['created', 'loading', 'failed', 'destroyed'] as const)(
    '消息目标处于 %s 时明确拒绝，不能往未连接端口发送',
    async status => {
      const { transport, host } = fixture('editor');
      await host.mutate(state =>
        grantPermission(state, host.identity(host.instances.get('one')!), 'messages', 'editor', true)
      );
      const emit = vi.fn();
      const source = host.instances.get('one')!;
      host.instances.set('target', { ...source, id: 'target', status, handle: { ...source.handle, emit } });
      await expect(
        transport.request('message.send', {
          targetInstanceId: 'target',
          channel: 'documents',
          payload: { text: '消息' }
        })
      ).rejects.toThrow('NOT_READY');
      expect(emit).not.toHaveBeenCalled();
    }
  );

  it('只重置配置在第二次确认前保持原样，确认后保留共享文件、授权和实例', async () => {
    const { transport, host, dialogs, close } = fixture('settings');
    await host.mutate(state => {
      createFile(state, { name: '保留.txt', bytes: 'QQ==' });
      state.profile.scale = 200;
      state.profile.theme = 'dark';
    });
    const before = structuredClone(host.state);
    const cancelled = transport.request('backup.reset', { scope: 'configuration' });
    await vi.waitFor(() => expect(dialogs.current?.options.title).toBe('只重置桌面配置'));
    dialogs.answer('next');
    await vi.waitFor(() => expect(dialogs.current?.options.title).toBe('最终确认'));
    expect(host.state).toEqual(before);
    dialogs.answer('cancel');
    await expect(cancelled).rejects.toThrow('CANCELLED');
    expect(host.state).toEqual(before);
    const reset = transport.request('backup.reset', { scope: 'configuration' });
    await vi.waitFor(() => expect(dialogs.current).not.toBeNull());
    dialogs.answer('next');
    await vi.waitFor(() => expect(dialogs.current?.options.title).toBe('最终确认'));
    dialogs.answer('reset');
    await expect(reset).resolves.toBe(true);
    expect(host.state.profile).toMatchObject({ scale: 100, theme: 'system' });
    expect(host.state.files).toEqual(before.files);
    expect(host.state.grants).toEqual(before.grants);
    expect(close).not.toHaveBeenCalled();
  });
  it('未知重置范围在显示确认和写入之前拒绝', async () => {
    const { transport, dialogs } = fixture('settings');
    await expect(transport.request('backup.reset', { scope: 'unknown' })).rejects.toThrow('INVALID');
    expect(dialogs.current).toBeNull();
  });
  it.each([
    ['QQ==', 1],
    ['QUI=', 2],
    ['QUJD', 3]
  ] as const)('文件列表显示原始字节长度，排除 base64 填充 %s', async (bytes, size) => {
    const { transport, host } = fixture('files');
    await host.mutate(state => createFile(state, { name: 'size.txt', bytes }));
    await expect(transport.request('files.list', null)).resolves.toMatchObject([{ name: 'size.txt', size }]);
  });
  it.each([true, false])('超过 1 MiB 的剪贴板请求仍校验提交时授权：%s', async granted => {
    const { transport, host } = fixture('editor');
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const text = '中文🌏'.repeat(150000);
    try {
      if (granted)
        await host.mutate(state =>
          grantPermission(state, host.identity(host.instances.get('one')!), 'clipboard', 'write', true)
        );
      const pending = transport.request('clipboard.write', { text });
      if (granted) {
        await expect(pending).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith(text);
      } else {
        await expect(pending).rejects.toThrow('DENIED');
        expect(writeText).not.toHaveBeenCalled();
      }
      expect(host.transfers.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('大文本分块完成后授权已撤销，不能写入剪贴板，缓冲区释放', async () => {
    const { transport, host } = fixture('editor');
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await host.mutate(state =>
      grantPermission(state, host.identity(host.instances.get('one')!), 'clipboard', 'write', true)
    );
    const collect = host.transfers.collect.bind(host.transfers);
    vi.spyOn(host.transfers, 'collect').mockImplementationOnce(async (owner, id) => {
      const value = await collect(owner, id);
      await host.mutate(state => {
        state.grants = state.grants.filter(grant => grant.capability !== 'clipboard');
      });
      return value;
    });
    try {
      await expect(transport.request('clipboard.write', { text: '中文🌏'.repeat(150000) })).rejects.toThrow('DENIED');
      expect(writeText).not.toHaveBeenCalled();
      expect(host.transfers.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
