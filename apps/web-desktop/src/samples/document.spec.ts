import type { OrbitClient, OrbitValue } from '@aiao/orbit';
import { describe, expect, it, vi } from 'vitest';
import { AppSession } from '../apps/session.js';
import { encodeText } from '../core/bytes.js';
import { DesktopError } from '../core/errors.js';
import { createFile, readFile, writeFile } from '../core/files.js';
import { createState, defaultProfile } from '../core/state.js';
import type { VirtualFile } from '../core/types.js';
import { FrameworkDocument } from './document.js';

function fixture(initial?: VirtualFile) {
  const state = createState('windows');
  if (initial) state.files.push(initial);
  const handlers = new Map<string, Parameters<OrbitClient['onRequest']>[1]>();
  const disposers: (() => void)[] = [];
  const refused = new Set<string>();
  const request = vi.fn<(method: string, payload: unknown) => Promise<unknown>>(async (method, payload) => {
    if (refused.has(method)) throw new DesktopError('DENIED', '拒绝示例请求');
    const data = payload as Record<string, unknown>;
    let value: unknown = true;
    if (method === 'files.create')
      value = createFile(state, { name: String(data['name']), bytes: String(data['bytes']) });
    if (method === 'files.read') value = readFile(state, String(data['id']));
    if (method === 'files.write')
      value = writeFile(state, String(data['id']), Number(data['revision']), String(data['bytes']));
    return { type: 'inline', value };
  });
  const client = {
    context: {
      appId: 'sample-react',
      instanceId: 'one',
      version: '1.0.0',
      props: { profile: defaultProfile('windows'), route: '', fileId: initial?.id ?? null }
    },
    request,
    onRequest: (name: string, handler: Parameters<OrbitClient['onRequest']>[1]) => {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
    onDispose: (dispose: () => void) => disposers.push(dispose),
    bus: { $on: () => undefined, $off: () => undefined }
  } as unknown as OrbitClient;
  const session = new AppSession(client);
  const model = new FrameworkDocument(session, 'React 便签');
  const invoke = async (name: string, payload: OrbitValue = null) => {
    const handler = handlers.get(name);
    if (!handler) throw new Error('协议处理器未登记');
    return handler(payload, new AbortController().signal);
  };
  return { model, session, state, request, refused, invoke, dispose: () => disposers.forEach(dispose => dispose()) };
}

describe('DESKTOP-US-308 同任务文档契约', () => {
  it('独立运行可编辑和撤销重做，桌面保存明确不可用且保留正文', async () => {
    const model = new FrameworkDocument(null, '独立便签');
    await model.start();
    model.edit('独立中文 🌏');
    model.undo();
    expect(model.snapshot.text).toBe('');
    model.redo();
    expect(model.snapshot.text).toBe('独立中文 🌏');
    await expect(model.save()).resolves.toBe(false);
    expect(model.snapshot).toMatchObject({ desktop: false, dirty: true, text: '独立中文 🌏' });
    expect(model.snapshot.error).toContain('桌面托管文件不可用');
  });

  it('双实例独立保存并保留 UTF-8 字节，编辑和历史不串实例', async () => {
    const first = fixture();
    const second = fixture();
    await Promise.all([first.model.start(), second.model.start()]);
    first.model.rename('第一份.txt');
    second.model.rename('第二份.txt');
    first.model.edit('第一段中文 🌏');
    second.model.edit('第二段内容');
    await expect(first.model.save()).resolves.toBe(true);
    await expect(second.model.save()).resolves.toBe(true);
    expect(first.state.files[0]).toMatchObject({ name: '第一份.txt', bytes: encodeText('第一段中文 🌏') });
    expect(second.state.files[0]).toMatchObject({ name: '第二份.txt', bytes: encodeText('第二段内容') });
    first.model.edit('第一段修改');
    first.model.undo();
    expect(first.model.snapshot.text).toBe('第一段中文 🌏');
    expect(second.model.snapshot).toMatchObject({ text: '第二段内容', dirty: false });
  });

  it('拒绝保存或可选剪贴板请求不丢草稿，重新允许后提交原文档的新版本', async () => {
    const { model, state, refused } = fixture();
    await model.start();
    model.rename('保留.txt');
    model.edit('最初正文');
    await model.save();
    const before = structuredClone(state.files);
    model.edit('拒绝后仍在的草稿 🌏');
    refused.add('clipboard.write');
    await model.copy();
    expect(model.snapshot.error).toContain('DENIED');
    refused.add('files.write');
    await expect(model.save()).resolves.toBe(false);
    expect(model.snapshot).toMatchObject({ text: '拒绝后仍在的草稿 🌏', dirty: true });
    expect(state.files).toEqual(before);
    refused.clear();
    await expect(model.save()).resolves.toBe(true);
    expect(state.files[0]).toMatchObject({
      id: before[0].id,
      revision: before[0].revision + 1,
      bytes: encodeText('拒绝后仍在的草稿 🌏')
    });
  });

  it('按稳定文件身份恢复正文和完整位置，非法导航保留当前位置与草稿', async () => {
    const initial = createFile(createState('windows'), { name: '恢复.txt', bytes: encodeText('第一行\n第二行') });
    const { model, session } = fixture(initial);
    await model.start();
    expect(model.snapshot).toMatchObject({ name: '恢复.txt', text: '第一行\n第二行', dirty: false });
    const route = `/documents/${initial.id}?line=2#L2`;
    model.setLocation(route);
    await model.navigate();
    expect(session.navigation.state.route).toBe(route);
    model.edit('继续编辑');
    model.setLocation('/missing');
    await model.navigate();
    expect(model.snapshot).toMatchObject({ route, text: '继续编辑', dirty: true });
    expect(model.snapshot.error).toContain('UNSUPPORTED');
  });

  it('关闭保存、窗口命令与挂起采用同一文档状态', async () => {
    const { model, invoke, state } = fixture();
    await model.start();
    model.edit('窗口菜单保存');
    await expect(invoke('document.prepareClose')).resolves.toEqual({ dirty: true });
    await expect(invoke('application.suspend')).rejects.toThrow('DIRTY');
    await expect(invoke('command', { id: 'save' })).resolves.toBe(true);
    expect(state.files[0].bytes).toBe(encodeText('窗口菜单保存'));
    await expect(invoke('document.prepareClose')).resolves.toEqual({ dirty: false });
    await expect(invoke('application.suspend')).resolves.toEqual({ saved: true });
    await invoke('application.resume');
    await expect(invoke('command', { id: 'unknown' })).rejects.toThrow('UNSUPPORTED');
  });

  it('读取拒绝不暴露正文，重试后仍按同一文件恢复', async () => {
    const initial = createFile(createState('windows'), { name: '私有.txt', bytes: encodeText('拒绝时不能展示') });
    const { model, refused } = fixture(initial);
    refused.add('files.read');
    await model.start();
    expect(model.snapshot.text).toBe('');
    expect(model.snapshot.error).toContain('DENIED');
    refused.clear();
    await model.start();
    expect(model.snapshot).toMatchObject({ name: '私有.txt', text: '拒绝时不能展示', dirty: false });
  });
});

describe('DESKTOP-US-308 文档取消与生命周期边界', () => {
  it('取消宿主确认不会保存或修改正文，确认后仍保持原稿', async () => {
    const { model, request, state } = fixture();
    await model.start();
    model.edit('检查不能修改正文');
    const original = request.getMockImplementation()!;
    request.mockImplementation((method, payload) =>
      method === 'desktop.confirm' ? Promise.resolve({ type: 'inline', value: false }) : original(method, payload)
    );
    await model.check();
    expect(model.snapshot).toMatchObject({ text: '检查不能修改正文', dirty: true });
    expect(model.snapshot.error).toContain('CANCELLED');
    expect(state.files).toEqual([]);
    request.mockImplementation(original);
    await model.check();
    expect(model.snapshot.message).toContain('检查已确认');
    expect(model.snapshot.error).toBe('');
    expect(state.files).toEqual([]);
  });

  it('原文档读取未获授权时不能另建空文件冒充保存成功', async () => {
    const initial = createFile(createState('windows'), { name: '拒绝读取.txt', bytes: encodeText('原始私有正文') });
    const { model, refused, state } = fixture(initial);
    refused.add('files.read');
    await model.start();
    const before = structuredClone(state);
    await expect(model.save()).resolves.toBe(false);
    expect(model.snapshot.error).toContain('NOT_READY');
    expect(state).toEqual(before);
  });

  it('跨文件导航在有草稿时拒绝，保存后才读取目标文件并同步窗口身份', async () => {
    const initial = createFile(createState('windows'), { name: '原稿.txt', bytes: encodeText('原稿') });
    const { model, state } = fixture(initial);
    const target = createFile(state, { name: '目标.txt', bytes: encodeText('目标文件') });
    await model.start();
    model.edit('不能因导航丢失的草稿');
    const route = `/documents/${target.id}?line=2#L2`;
    model.setLocation(route);
    await model.navigate();
    expect(model.snapshot.error).toContain('DIRTY');
    expect(model.snapshot.text).toBe('不能因导航丢失的草稿');
    expect(model.snapshot.route).toBe(`/documents/${initial.id}`);
    await model.save();
    model.setLocation(route);
    await model.navigate();
    expect(model.snapshot).toMatchObject({ name: '目标.txt', text: '目标文件', dirty: false, route });
    expect(state.files.find(file => file.id === initial.id)?.bytes).toBe(encodeText('不能因导航丢失的草稿'));
  });

  it('销毁期间晚到的保存结果不再通知视图或发出窗口更新，处理器和订阅释放', async () => {
    const { model, request, state, invoke, dispose } = fixture();
    await model.start();
    model.edit('退出时尚在保存的正文');
    const original = request.getMockImplementation()!;
    let finish: ((value: unknown) => void) | null = null;
    request.mockImplementation((method, payload) =>
      method === 'files.create' ?
        new Promise(resolve => {
          finish = resolve;
        })
      : original(method, payload)
    );
    const changed = vi.fn();
    const unsubscribe = model.subscribe(changed);
    const pending = model.save();
    await vi.waitFor(() => expect(finish).not.toBeNull());
    model.dispose();
    model.dispose();
    dispose();
    const calls = request.mock.calls.length;
    const changes = changed.mock.calls.length;
    const file = createFile(state, { name: '未命名.txt', bytes: encodeText('退出时尚在保存的正文') });
    const resolveSave = finish as unknown as (value: unknown) => void;
    resolveSave({ type: 'inline', value: file });
    await expect(pending).resolves.toBe(false);
    model.edit('已销毁后不再编辑');
    await expect(model.save()).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(calls);
    expect(changed).toHaveBeenCalledTimes(changes);
    unsubscribe();
    await expect(invoke('document.prepareClose')).rejects.toThrow('协议处理器未登记');
  });

  it('重复保存只提交一次，完成后清除等待期间的 BUSY 提示', async () => {
    const { model, request, state } = fixture();
    await model.start();
    model.edit('只提交一次');
    const original = request.getMockImplementation()!;
    let finish: ((value: unknown) => void) | null = null;
    request.mockImplementation((method, payload) =>
      method === 'files.create' ?
        new Promise(resolve => {
          finish = resolve;
        })
      : original(method, payload)
    );
    const pending = model.save();
    await vi.waitFor(() => expect(finish).not.toBeNull());
    await expect(model.save()).resolves.toBe(false);
    expect(model.snapshot.error).toContain('BUSY');
    const resolveSave = finish as unknown as (value: unknown) => void;
    resolveSave({ type: 'inline', value: createFile(state, { name: '未命名.txt', bytes: encodeText('只提交一次') }) });
    await expect(pending).resolves.toBe(true);
    expect(request.mock.calls.filter(([method]) => method === 'files.create')).toHaveLength(1);
    expect(model.snapshot).toMatchObject({ dirty: false, busy: false, error: '' });
  });

  it('独立文档的局部样式和路由不改变另一个文档，桌面专属能力明确拒绝', async () => {
    const first = new FrameworkDocument(null, '第一个');
    const second = new FrameworkDocument(null, '第二个');
    await Promise.all([first.start(), second.start()]);
    first.toggleAccent();
    first.setLocation('/?line=2#L2');
    await first.navigate();
    expect(first.snapshot).toMatchObject({ accent: 'violet', route: '/?line=2#L2' });
    expect(second.snapshot).toMatchObject({ accent: 'blue', route: '/' });
    await first.copy();
    expect(first.snapshot.error).toContain('UNAVAILABLE');
    await first.check();
    expect(first.snapshot.error).toContain('UNAVAILABLE');
  });
});

it('DESKTOP-US-308 放弃更改只恢复当前实例已保存内容，不改持久文件', async () => {
  const { model, invoke, state } = fixture();
  await model.start();
  model.edit('已经保存的正文');
  await model.save();
  const saved = structuredClone(state.files);
  model.edit('尚未保存的修改');
  await expect(invoke('document.discard')).resolves.toBe(true);
  expect(model.snapshot).toMatchObject({ text: '已经保存的正文', dirty: false });
  expect(state.files).toEqual(saved);
  await expect(invoke('document.prepareClose')).resolves.toEqual({ dirty: false });
});
