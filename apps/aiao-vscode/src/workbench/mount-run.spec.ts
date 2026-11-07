// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchCompiler } from './compiler-client.js';
import type { WorkbenchEditorMount } from './editor.js';
import { mountWorkbench, type BrowserWorkbenchOptions, type WorkbenchHandle } from './mount.js';
import type { WorkbenchBackend, WorkbenchFiles } from './session.js';
import type { WorkbenchPreferences } from './workbench-state.js';

const terminal = vi.hoisted(() => ({
  show: vi.fn(async () => undefined),
  runProject: vi.fn(async () => undefined),
  flush: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
  clear: vi.fn(),
  fit: vi.fn(),
  dispose: vi.fn()
}));
/** 工作台交给终端的选项，用来检查选中的运行方式对应哪个运行时。 */
const terminalOptions = vi.hoisted(() => ({ current: undefined as undefined | { adapter: () => { id: string } } }));
vi.mock('./terminal/workbench-terminal.js', () => ({
  createWorkbenchTerminal: (_host: HTMLElement, options: { adapter: () => { id: string } }) => {
    terminalOptions.current = options;
    return terminal;
  }
}));

const instances: WorkbenchHandle[] = [];
afterEach(() => {
  instances.splice(0).forEach(handle => handle.dispose());
  vi.resetAllMocks();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  document.body.replaceChildren();
});

const files: WorkbenchFiles = { 'src/main.ts': 'console.log(1)', 'src/label.ts': 'export const label = 1;' };
function fixture(preferences: WorkbenchPreferences | null = null, extra: Partial<BrowserWorkbenchOptions> = {}) {
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
    getPreferences: vi.fn(async () => preferences),
    putPreferences: vi.fn(async () => undefined),
    putLayout: vi.fn(async () => undefined)
  };
  const host = document.createElement('div');
  document.body.append(host);
  const handle = mountWorkbench(host, { ...extra, backend, compiler, catalog, initialProjectId: 'one' }, mountEditor);
  instances.push(handle);
  return { host, handle, backend, compiler, catalog };
}

async function runButton(host: HTMLElement): Promise<HTMLButtonElement> {
  return vi.waitFor(() => {
    const button = host.querySelector<HTMLButtonElement>('[data-action="run"]');
    if (!button) throw new Error('运行按钮缺失');
    expect(button.disabled).toBe(false);
    return button;
  });
}

describe('顶部运行启动当前项目终端', () => {
  it('保存全部草稿后打开底部终端并启动项目，不调用受控编译', async () => {
    const { host, handle, backend, compiler } = fixture();
    await handle.ready;
    const button = await runButton(host);
    vi.mocked(compiler.compile).mockClear();
    handle.session.edit('src/main.ts', 'new main');
    handle.session.edit('src/label.ts', 'new label');
    terminal.runProject.mockImplementationOnce(async () => {
      expect(handle.session.state.dirty).toBe(false);
      expect(handle.session.getSavedSnapshot().files['src/main.ts']).toBe('new main');
      expect(handle.session.getSavedSnapshot().files['src/label.ts']).toBe('new label');
      expect(terminal.show).toHaveBeenCalled();
    });
    button.click();
    await vi.waitFor(() => expect(terminal.runProject).toHaveBeenCalledOnce());
    expect(backend.save).toHaveBeenCalledOnce();
    expect(compiler.compile).not.toHaveBeenCalled();
  });

  it('底部面板关闭时运行会重新打开终端', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    const button = await runButton(host);
    const toggle = host.querySelector<HTMLButtonElement>('.wb-title-actions [data-action="panel"]');
    await vi.waitFor(() => expect(toggle?.getAttribute('aria-pressed')).toBe('false'));
    button.click();
    await vi.waitFor(() => expect(terminal.runProject).toHaveBeenCalledOnce());
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    expect(terminal.show).toHaveBeenCalled();
  });

  it('保存失败时不启动进程并显示错误', async () => {
    const { host, handle, backend } = fixture();
    await handle.ready;
    const button = await runButton(host);
    handle.session.edit('src/main.ts', 'new main');
    vi.mocked(backend.save).mockRejectedValueOnce(new Error('磁盘保存失败'));
    button.click();
    await vi.waitFor(() => expect(host.textContent).toContain('磁盘保存失败'));
    expect(terminal.runProject).not.toHaveBeenCalled();
  });

  it('保存期间仍有新草稿时不启动旧快照', async () => {
    const { host, handle, backend } = fixture();
    await handle.ready;
    const button = await runButton(host);
    handle.session.edit('src/main.ts', 'first draft');
    const save = vi.mocked(backend.save).getMockImplementation();
    if (!save) throw new Error('保存实现缺失');
    vi.mocked(backend.save).mockImplementationOnce(async (...args) => {
      handle.session.edit('src/main.ts', 'newer draft');
      return save(...args);
    });
    button.click();
    await vi.waitFor(() => expect(host.textContent).toContain('保存期间内容发生变化'));
    expect(terminal.runProject).not.toHaveBeenCalled();
    expect(handle.session.state.dirty).toBe(true);
  });

  it('项目启动失败对用户可见且可重试', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    const button = await runButton(host);
    terminal.runProject.mockRejectedValueOnce(new Error('项目启动失败'));
    button.click();
    await vi.waitFor(() => expect(host.textContent).toContain('项目启动失败'));
    (await runButton(host)).click();
    await vi.waitFor(() => expect(terminal.runProject).toHaveBeenCalledTimes(2));
  });
});

describe('运行方式', () => {
  it('选即时编译（esbuild-wasm）时运行只刷新本地项目预览，不启动终端', async () => {
    const { host, handle, compiler } = fixture({
      indentUnit: '  ',
      alwaysShowScmActions: false,
      runtime: 'esbuild-wasm',
      editorEngine: 'codemirror'
    });
    await handle.ready;
    const button = await runButton(host);
    vi.mocked(compiler.compile).mockClear();
    button.click();
    await vi.waitFor(() => expect(compiler.compile).toHaveBeenCalled());
    expect(terminal.runProject).not.toHaveBeenCalled();
  });

  it('地址参数 ?runtime= 只覆盖当前页面，不写回设置', async () => {
    window.history.replaceState(null, '', '/?runtime=esbuild-wasm');
    try {
      const { host, handle, compiler, catalog } = fixture();
      await handle.ready;
      const button = await runButton(host);
      vi.mocked(compiler.compile).mockClear();
      button.click();
      await vi.waitFor(() => expect(compiler.compile).toHaveBeenCalled());
      expect(terminal.runProject).not.toHaveBeenCalled();
      expect(catalog.putPreferences).not.toHaveBeenCalledWith(expect.objectContaining({ runtime: 'esbuild-wasm' }));
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('设置里切换运行方式会停止当前终端并保存', async () => {
    const { host, handle, catalog } = fixture();
    await handle.ready;
    host.querySelector<HTMLButtonElement>('[data-action="settings"]')?.click();
    const dialog = await vi.waitFor(() => {
      const candidate = host.querySelector<HTMLDialogElement>('dialog[aria-label="设置"]');
      if (!candidate) throw new Error('设置对话框缺失');
      return candidate;
    });
    const select = dialog.querySelector<HTMLSelectElement>('select[name="runtime"]');
    if (!select) throw new Error('运行方式设置缺失');
    select.value = 'esbuild-wasm';
    dialog.querySelector('form')?.dispatchEvent(new Event('submit'));
    await vi.waitFor(() =>
      expect(catalog.putPreferences).toHaveBeenCalledWith(expect.objectContaining({ runtime: 'esbuild-wasm' }))
    );
    expect(terminal.stop).toHaveBeenCalled();
  });

  async function runtimeSelect(host: HTMLElement): Promise<HTMLSelectElement> {
    host.querySelector<HTMLButtonElement>('[data-action="settings"]')?.click();
    return vi.waitFor(() => {
      const select = host.querySelector<HTMLSelectElement>('dialog[aria-label="设置"] select[name="runtime"]');
      if (!select) throw new Error('运行方式设置缺失');
      return select;
    });
  }
  const preferences = (runtime: 'vivari' | 'nodepod') =>
    ({ indentUnit: '  ', alwaysShowScmActions: false, runtime, editorEngine: 'codemirror' }) as const;

  it.each(['vivari', 'nodepod'] as const)('配置了宿主源时设置里可以选 %s，终端按它启动', async runtime => {
    const { host, handle } = fixture(preferences(runtime), {
      runtimeHosts: { vivari: 'http://localhost:4331', nodepod: 'http://localhost:4332' }
    });
    await handle.ready;
    const select = await runtimeSelect(host);
    expect([...select.options].filter(option => !option.disabled).map(option => option.value)).toEqual([
      'esbuild-wasm',
      'webcontainer',
      'vivari',
      'nodepod'
    ]);
    expect(select.value).toBe(runtime);
    expect(terminalOptions.current?.adapter().id).toBe(runtime);
  });

  it('没有配置宿主源的运行方式不可选，已保存的选择在启动终端时明确报错', async () => {
    const { host, handle } = fixture(preferences('nodepod'), { runtimeHosts: { vivari: 'http://localhost:4331' } });
    await handle.ready;
    const select = await runtimeSelect(host);
    expect([...select.options].find(option => option.value === 'vivari')?.disabled).toBe(false);
    expect([...select.options].find(option => option.value === 'nodepod')?.disabled).toBe(true);
    expect(() => terminalOptions.current?.adapter()).toThrow('没有给「Nodepod」配置宿主源');
  });
});
