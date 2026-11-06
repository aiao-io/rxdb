// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchCompiler } from './compiler-client.js';
import type { WorkbenchEditorMount } from './editor.js';
import { mountWorkbench, type WorkbenchHandle } from './mount.js';
import type { PreviewEvent } from './preview/preview-sandbox.js';
import type { WorkbenchBackend, WorkbenchFiles } from './session.js';

const { previewSpies } = vi.hoisted(() => ({
  previewSpies: { onEvent: undefined as undefined | ((event: PreviewEvent) => void) }
}));
vi.mock('./preview/preview-sandbox.js', async () => {
  const actual = await vi.importActual<typeof import('./preview/preview-sandbox.js')>('./preview/preview-sandbox.js');
  return {
    ...actual,
    mountPreview: vi.fn((_container: HTMLElement, _options: unknown, onEvent: (event: PreviewEvent) => void) => {
      previewSpies.onEvent = onEvent;
      return { iframe: document.createElement('iframe'), dispose: vi.fn() };
    })
  };
});

const instances: WorkbenchHandle[] = [];
afterEach(() => {
  instances.splice(0).forEach(handle => handle.dispose());
  previewSpies.onEvent = undefined;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const files: WorkbenchFiles = { 'src/main.ts': 'console.log(1)', 'src/label.ts': 'export const label = 1;' };
function fixture() {
  let currentFiles: WorkbenchFiles = { ...files };
  let revision = 1;
  const backend: WorkbenchBackend = {
    open: vi.fn(async projectId => ({ projectId, revision: String(revision), files: { ...currentFiles } })),
    create: vi.fn(async (projectId, value) => {
      currentFiles = value;
      revision = 1;
      return { projectId, revision: '1', files: value };
    }),
    save: vi.fn<WorkbenchBackend['save']>(async (projectId, value, expectedRevision) => {
      if (expectedRevision !== String(revision)) throw new Error('文件 revision 冲突');
      currentFiles = { ...currentFiles, ...value };
      revision++;
      return { projectId, revision: String(revision), files: { ...currentFiles } };
    }),
    remove: vi.fn<WorkbenchBackend['remove']>(async (_id, path) => {
      const next = { ...currentFiles };
      delete next[path];
      currentFiles = next;
      revision++;
    }),
    rename: vi.fn<WorkbenchBackend['rename']>(async (_id, from, to) => {
      const next: Record<string, string | Uint8Array> = { ...currentFiles, [to]: currentFiles[from] };
      delete next[from];
      currentFiles = next;
      revision++;
    }),
    move: vi.fn<WorkbenchBackend['move']>(async () => undefined),
    status: vi.fn(async () => ({ branch: 'main', head: null, entries: [] })),
    stage: vi.fn(async () => undefined),
    unstage: vi.fn(async () => undefined),
    readDiff: vi.fn<WorkbenchBackend['readDiff']>(async (projectId, path, kind) => ({
      projectId,
      path,
      kind,
      base: { exists: true, binary: false, text: '', byteLength: 0 },
      modified: { exists: true, binary: false, text: '', byteLength: 0 }
    })),
    discardWorking: vi.fn(async projectId => ({ projectId, revision: '2', files: {} })),
    commit: vi.fn(async () => 'oid'),
    history: vi.fn(async () => []),
    restore: vi.fn(async projectId => ({ projectId, revision: '3', files })),
    exportArchive: vi.fn(async () => new Uint8Array()),
    importArchive: vi.fn(async () => undefined),
    dispose: vi.fn()
  };
  const editorHandle = { update: vi.fn(), replace: vi.fn(), dispose: vi.fn(), runCommand: vi.fn(() => true) };
  const mountEditor = vi.fn<WorkbenchEditorMount>(() => editorHandle);
  const compiler: WorkbenchCompiler = {
    compile: vi.fn(async () => ({ js: '', css: '' })),
    dispose: vi.fn()
  };
  const catalog = {
    list: vi.fn(async () => [
      { id: 'one', name: '本地项目', template: 'vanilla' as const, entry: 'src/main.ts', updatedAt: 1 }
    ]),
    put: vi.fn(async () => undefined),
    getState: vi.fn(async () => null),
    putState: vi.fn(async () => undefined),
    getLayout: vi.fn(async () => null),
    putLayout: vi.fn(async () => undefined)
  };
  const host = document.createElement('div');
  document.body.append(host);
  const handle = mountWorkbench(host, { backend, compiler, catalog, initialProjectId: 'one' }, mountEditor);
  instances.push(handle);
  return { host, handle, backend, editorHandle };
}

const forward = (event: PreviewEvent): void => {
  if (!previewSpies.onEvent) throw new Error('预览尚未挂载，转发回调缺失');
  previewSpies.onEvent(event);
};

describe('预览转发与工作台全局快捷键', () => {
  it('预览内 Cmd+W 关闭当前编辑器标签，Cmd+S 触发保存', async () => {
    const { handle, backend } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(previewSpies.onEvent).toBeDefined());
    await vi.waitFor(() => expect(handle.session.state.tabs).toContain('src/main.ts'));
    handle.session.select('src/label.ts');
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/label.ts'));
    forward({
      sessionId: 'x',
      projectId: 'one',
      revision: 1,
      type: 'keydown',
      key: 'w',
      ctrlKey: false,
      metaKey: true,
      shiftKey: false
    });
    await vi.waitFor(() => expect(handle.session.state.tabs).not.toContain('src/label.ts'));
    expect(handle.session.state.tabs).toContain('src/main.ts');
    handle.session.edit('src/main.ts', 'edited main');
    forward({
      sessionId: 'x',
      projectId: 'one',
      revision: 1,
      type: 'keydown',
      key: 's',
      ctrlKey: false,
      metaKey: true,
      shiftKey: false
    });
    await vi.waitFor(() => expect(backend.save).toHaveBeenCalled());
    expect(vi.mocked(backend.save).mock.calls[0][1]).toEqual({
      'src/main.ts': 'edited main',
      'src/label.ts': files['src/label.ts']
    });
  }, 10000);

  it('焦点在页面主体时 Cmd+W 拦截浏览器默认动作并关闭当前标签', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(handle.session.state.tabs).toContain('src/main.ts'));
    handle.session.select('src/label.ts');
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/label.ts'));
    const event = new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true, cancelable: true });
    host.ownerDocument.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(handle.session.state.tabs).not.toContain('src/label.ts'));
    expect(handle.session.state.tabs).toContain('src/main.ts');
  }, 10000);

  it('Ctrl+Tab 与 Ctrl+Shift+Tab 在编辑器标签之间循环切换', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(handle.session.state.tabs).toContain('src/main.ts'));
    handle.session.select('src/label.ts');
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/label.ts'));
    const root = host.querySelector<HTMLElement>('.ao-workbench');
    if (!root) throw new Error('工作台根元素缺失');
    const press = (init: KeyboardEventInit): boolean => {
      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, ...init });
      root.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(press({ ctrlKey: true })).toBe(true);
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/main.ts'));
    expect(press({ ctrlKey: true, shiftKey: true })).toBe(true);
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/label.ts'));
    expect(press({ ctrlKey: true, shiftKey: true })).toBe(true);
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/main.ts'));
  }, 10000);

  it('编辑器内 Ctrl+G / Ctrl+L / Ctrl+Shift+Enter 拦截并转发对应编辑器命令', async () => {
    const { host, handle, editorHandle } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(handle.session.state.tabs).toContain('src/main.ts'));
    const root = host.querySelector<HTMLElement>('.ao-workbench');
    if (!root) throw new Error('工作台根元素缺失');
    const editorHost = root.querySelector<HTMLElement>('[data-editor-path="src/main.ts"]');
    if (!editorHost) throw new Error('编辑器宿主缺失');
    const press = (init: KeyboardEventInit): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      editorHost.dispatchEvent(event);
      return event;
    };
    expect(press({ key: 'g', ctrlKey: true }).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(editorHandle.runCommand).toHaveBeenCalledWith('gotoLine'));
    expect(press({ key: 'l', ctrlKey: true }).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(editorHandle.runCommand).toHaveBeenCalledWith('selectLine'));
    expect(press({ key: 'Enter', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(editorHandle.runCommand).toHaveBeenCalledWith('insertLineAbove'));
  }, 10000);

  it('输入框内 Ctrl+G 不拦截，保留编辑器的搜索语义', async () => {
    const { host, handle, editorHandle } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(handle.session.state.tabs).toContain('src/main.ts'));
    const root = host.querySelector<HTMLElement>('.ao-workbench');
    if (!root) throw new Error('工作台根元素缺失');
    const input = document.createElement('input');
    root.append(input);
    const event = new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(editorHandle.runCommand).not.toHaveBeenCalled();
  }, 10000);

  it('Ctrl+Shift+E / G 切换资源管理器与 Git 视图，Ctrl+Shift+M / U 打开对应底部面板', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(handle.session.state.tabs).toContain('src/main.ts'));
    const root = host.querySelector<HTMLElement>('.ao-workbench');
    if (!root) throw new Error('工作台根元素缺失');
    const press = (init: KeyboardEventInit): boolean => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      root.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(press({ key: 'g', ctrlKey: true, shiftKey: true })).toBe(true);
    await vi.waitFor(() => expect((root.querySelector('[data-slot="git-view"]') as HTMLElement)?.hidden).toBe(false));
    expect(root.querySelector('[data-slot="side-title"]')?.textContent).toBe('源代码管理');
    expect(press({ key: 'e', ctrlKey: true, shiftKey: true })).toBe(true);
    await vi.waitFor(() => expect((root.querySelector('[data-slot="git-view"]') as HTMLElement)?.hidden).toBe(true));
    expect(root.querySelector('[data-slot="side-title"]')?.textContent).toBe('资源管理器');
    // 面板激活的真实切换由浏览器端验证（happy-dom 不渲染 dockview 激活标签类），此处只断言快捷键路由
    expect(press({ key: 'm', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(press({ key: 'u', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(root.querySelector('[data-slot="side-title"]')?.textContent).toBe('资源管理器');
  }, 10000);

  it('键盘关闭网页（⌘ 按着时卸载）弹出浏览器确认，点标签页 × 不弹，释放后不再拦截', async () => {
    const { handle } = fixture();
    await handle.ready;
    const unload = (): boolean => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true, bubbles: true, cancelable: true }));
    expect(unload()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta', bubbles: true, cancelable: true }));
    expect(unload()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true, bubbles: true, cancelable: true }));
    handle.dispose();
    expect(unload()).toBe(false);
  }, 10000);

  it('焦点在预览 iframe 里按着 ⌘ 关闭网页同样确认：预览经消息上报修饰键状态', async () => {
    const { handle } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(previewSpies.onEvent).toBeDefined());
    const unload = (): boolean => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    forward({ sessionId: 'x', projectId: 'one', revision: 1, type: 'modifiers', pressed: true });
    expect(unload()).toBe(true);
    forward({ sessionId: 'x', projectId: 'one', revision: 1, type: 'modifiers', pressed: false });
    expect(unload()).toBe(false);
  }, 10000);
});
