// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchCatalog, WorkbenchProjectInfo } from './catalog.js';
import type { WorkbenchCompiler } from './compiler-client.js';
import { CompilationError } from './compiler/compiler-types.js';
import type { WorkbenchEditorMount } from './editor.js';
import { mountWorkbench, type WorkbenchHandle } from './mount.js';
import type { WorkbenchBackend, WorkbenchDiff, WorkbenchFiles } from './session.js';

const instances: WorkbenchHandle[] = [];
afterEach(() => {
  instances.splice(0).forEach(handle => handle.dispose());
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'showDirectoryPicker');
  document.body.replaceChildren();
});

const files = { 'src/main.ts': 'console.log(1)', 'src/label.ts': 'export const label = 1;' };
function fixture(
  withProject = true,
  assetBaseURL = '/browser-workbench-assets/',
  bootstrapGate?: Promise<void>,
  extraProjects: readonly WorkbenchProjectInfo[] = [],
  initialFiles: WorkbenchFiles = files
) {
  let currentFiles: WorkbenchFiles = { ...initialFiles };
  let revision = 1;
  const backend: WorkbenchBackend = {
    open: vi.fn(async projectId => ({ projectId, revision: String(revision), files: { ...currentFiles } })),
    create: vi.fn(async (projectId, value) => {
      currentFiles = value;
      revision = 1;
      return { projectId, revision: '1', files: value };
    }),
    save: vi.fn(async (projectId, value, expectedRevision) => {
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
    move: vi.fn<WorkbenchBackend['move']>(async (_id, from, to) => {
      const next: Record<string, string | Uint8Array> = { ...currentFiles };
      for (const path of Object.keys(currentFiles)) {
        if (path === from || path.startsWith(`${from}/`)) {
          next[`${to}${path.slice(from.length)}`] = currentFiles[path];
          delete next[path];
        }
      }
      currentFiles = next;
      revision++;
    }),
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
  const disposeEditor = vi.fn();
  const editorHandle = {
    update: vi.fn(),
    replace: vi.fn(),
    dispose: disposeEditor,
    runCommand: vi.fn(() => true),
    setIndentUnit: vi.fn(),
    setDiagnostics: vi.fn()
  };
  const mountEditor = vi.fn<WorkbenchEditorMount>(() => editorHandle);
  const compiler = {
    compile: vi.fn<WorkbenchCompiler['compile']>(async () => ({ js: '', css: '' })),
    dispose: vi.fn()
  };
  const catalog = {
    list: vi.fn(async () => {
      if (bootstrapGate) await bootstrapGate;
      return withProject ?
          [
            { id: 'one', name: '本地项目', template: 'vanilla' as const, entry: 'src/main.ts', updatedAt: 1 },
            ...extraProjects
          ]
        : extraProjects;
    }),
    put: vi.fn(async () => undefined),
    getState: vi.fn<WorkbenchCatalog['getState']>(async () => null),
    putState: vi.fn(async () => undefined)
  };
  const host = document.createElement('div');
  document.body.append(host);
  const handle = mountWorkbench(
    host,
    { backend, compiler, catalog, assetBaseURL, ...(withProject ? { initialProjectId: 'one' } : {}) },
    mountEditor
  );
  instances.push(handle);
  return { host, handle, backend, compiler, catalog, mountEditor, disposeEditor, editorHandle };
}

const click = async (host: HTMLElement, selector: string): Promise<void> => {
  const element = host.querySelector<HTMLButtonElement>(selector);
  if (!element) throw new Error(`Missing test control: ${selector}`);
  await vi.waitFor(() => expect(element instanceof HTMLButtonElement ? element.disabled : false).toBe(false));
  element.click();
};

/** 派发一次带 dataTransfer 桩的拖放事件；happy-dom 没有 DragEvent 构造器。 */
const drag = (
  type: string
): { event: Event; transfer: { effectAllowed: string; dropEffect: string; setData: ReturnType<typeof vi.fn> } } => {
  const transfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  return { event, transfer };
};

const treeRow = (host: HTMLElement, path: string): HTMLButtonElement => {
  const row = host.querySelector<HTMLButtonElement>(`button[data-tree-path="${path}"]`);
  if (!row) throw new Error(`树行缺失：${path}`);
  return row;
};

async function answer(host: HTMLElement, value: string | null): Promise<void> {
  await vi.waitFor(() => expect(host.querySelector('dialog')).not.toBeNull());
  const dialog = host.querySelector<HTMLDialogElement>('dialog');
  if (!dialog) throw new Error('Dialog missing');
  const input = dialog.querySelector<HTMLInputElement>('input');
  if (!input) throw new Error('Dialog input missing');
  if (value !== null) {
    input.value = value;
    dialog.querySelector('form')?.dispatchEvent(new Event('submit'));
  }
  dialog.close();
  await Promise.resolve();
}

async function inlineInput(host: HTMLElement, value: string | null): Promise<void> {
  await vi.waitFor(() => expect(host.querySelector('.wb-inline-input')).not.toBeNull());
  const input = host.querySelector<HTMLInputElement>('.wb-inline-input');
  if (!input) throw new Error('树内输入行缺失');
  if (value !== null) input.value = value;
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: value === null ? 'Escape' : 'Enter', bubbles: true, cancelable: true })
  );
  await vi.waitFor(() => expect(host.querySelector('.wb-inline-input')).toBeNull());
}

async function confirmAction(host: HTMLElement, accepted: boolean): Promise<void> {
  await vi.waitFor(() => expect(host.querySelector('.wb-confirm-dialog')).not.toBeNull());
  const button = host.querySelector<HTMLButtonElement>(
    accepted ? '.wb-confirm-dialog .wb-primary' : '.wb-confirm-dialog button'
  );
  if (!button) throw new Error('Confirm action control missing');
  button.click();
  await Promise.resolve();
}

function messageInput(host: HTMLElement, value: string): HTMLTextAreaElement {
  const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="提交说明"]');
  if (!input) throw new Error('SCM message input missing');
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return input;
}

function fakeFile(name: string, content: string | Uint8Array): FileSystemFileHandle {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return {
    kind: 'file',
    name,
    getFile: async () => new File([new Uint8Array(bytes)], name)
  } as unknown as FileSystemFileHandle;
}

function fakeDirectory(
  name: string,
  entries: Record<string, FileSystemDirectoryHandle | FileSystemFileHandle>
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    entries: async function* () {
      for (const [childName, handle] of Object.entries(entries))
        yield [childName, handle] as [string, FileSystemHandle];
    }
  } as unknown as FileSystemDirectoryHandle;
}

describe('VS Code 风格工作台', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLIFrameElement.prototype, 'credentialless', {
      configurable: true,
      writable: true,
      value: false
    });
  });

  it('初始化项目目录完成前禁用新建、导入和项目切换，避免迟到默认项目覆盖用户选择', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const { host, handle } = fixture(true, '/browser-workbench-assets/', gate);
    const create = host.querySelector<HTMLButtonElement>('[data-action="new-project"]');
    const upload = host.querySelector<HTMLButtonElement>('[data-action="import"]');
    const project = host.querySelector<HTMLSelectElement>('.wb-projects');
    expect(create?.disabled).toBe(true);
    expect(upload?.disabled).toBe(true);
    expect(project?.disabled).toBe(true);
    release();
    await handle.ready;
    expect(create?.disabled).toBe(false);
    expect(upload?.disabled).toBe(false);
    expect(project?.disabled).toBe(false);
    expect(handle.session.state.projectId).toBe('one');
  });

  it('首次打开空目录不初始化项目，资源管理器显示欢迎视图', async () => {
    const { host, handle, backend } = fixture(false);
    await handle.ready;
    expect(backend.create).not.toHaveBeenCalled();
    expect(handle.session.state.projectId).toBeNull();
    expect(host.querySelector('.wb-empty-view-hint')?.textContent).toBe('尚未打开项目');
    expect(host.querySelector('[data-welcome-action="open-folder"]')?.textContent).toBe('打开文件夹');
    expect(host.querySelector('[data-welcome-action="init-demo"]')?.textContent).toBe('初始化 Demo 项目');
    expect(host.querySelector('.wb-empty-view-recent')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[data-action="save"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-action="run"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-action="new-project"]')?.disabled).toBe(false);
  });

  it('欢迎视图初始化 Demo 项目：选择模板创建并打开', async () => {
    const { host, handle, backend } = fixture(false);
    await handle.ready;
    await click(host, '[data-welcome-action="init-demo"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-context-menu')).not.toBeNull());
    [...host.querySelectorAll<HTMLButtonElement>('.wb-context-menu button')]
      .find(button => button.textContent === 'React 最小 Demo')
      ?.click();
    await vi.waitFor(() => expect(handle.session.state.projectId).toBe('default-react'));
    expect(backend.create).toHaveBeenCalledWith(
      'default-react',
      expect.objectContaining({ 'src/main.tsx': expect.stringContaining('Hello React') })
    );
    expect(String(handle.session.state.files['workbench.project.json'])).toContain('"template": "react"');
    expect(host.querySelector('.wb-empty-view')).toBeNull();
  });

  it('欢迎视图初始化 Demo 项目：目录已登记同 id 项目时直接打开', async () => {
    const { host, handle, backend } = fixture(false, '/browser-workbench-assets/', undefined, [
      { id: 'default-react', name: 'React 最小 Demo', template: 'react' as const, entry: 'src/main.tsx', updatedAt: 5 }
    ]);
    await handle.ready;
    await click(host, '[data-welcome-action="init-demo"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-context-menu')).not.toBeNull());
    [...host.querySelectorAll<HTMLButtonElement>('.wb-context-menu button')]
      .find(button => button.textContent === 'React 最小 Demo')
      ?.click();
    await vi.waitFor(() => expect(handle.session.state.projectId).toBe('default-react'));
    expect(backend.create).not.toHaveBeenCalled();
  });

  it('欢迎视图列出最近项目，点击打开对应项目', async () => {
    const { host, handle } = fixture(false, '/browser-workbench-assets/', undefined, [
      { id: 'older', name: '旧项目', template: 'vue' as const, entry: 'src/main.ts', updatedAt: 2 },
      { id: 'newer', name: '新项目', template: 'react' as const, entry: 'src/main.tsx', updatedAt: 3 }
    ]);
    await handle.ready;
    const rows = [...host.querySelectorAll<HTMLButtonElement>('[data-welcome-recent]')];
    expect(rows.map(row => row.textContent)).toEqual(['新项目', '旧项目']);
    rows[0].click();
    await vi.waitFor(() => expect(handle.session.state.projectId).toBe('newer'));
    expect(host.querySelector('.wb-empty-view')).toBeNull();
  });

  it('欢迎视图打开文件夹：读取目录登记项目并打开', async () => {
    const { host, handle, backend, catalog } = fixture(false);
    await handle.ready;
    const picker = vi.fn(async () =>
      fakeDirectory('my-app', {
        'workbench.project.json': fakeFile(
          'workbench.project.json',
          JSON.stringify({ template: 'react', entry: 'src/main.tsx' })
        ),
        'src/main.tsx': fakeFile('main.tsx', 'export default () => <h1>hi</h1>'),
        'assets/logo.png': fakeFile('logo.png', new Uint8Array([0x89, 0x50]))
      })
    );
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: picker });
    await click(host, '[data-welcome-action="open-folder"]');
    await vi.waitFor(() => expect(handle.session.state.projectId).not.toBeNull());
    expect(backend.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        'src/main.tsx': expect.stringContaining('<h1>hi</h1>'),
        'assets/logo.png': expect.any(Uint8Array),
        'workbench.project.json': JSON.stringify({ template: 'react', entry: 'src/main.tsx' })
      })
    );
    expect(catalog.put).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'my-app', template: 'react', entry: 'src/main.tsx' })
    );
    expect(host.querySelector('.wb-empty-view')).toBeNull();
  });

  it('欢迎视图打开文件夹：取消选择不写入不报错，能力缺失给出提示', async () => {
    const { host, handle, backend } = fixture(false);
    await handle.ready;
    const cancel = vi.fn(async () => {
      throw new DOMException('user cancelled', 'AbortError');
    });
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: cancel });
    await click(host, '[data-welcome-action="open-folder"]');
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
    expect(backend.create).not.toHaveBeenCalled();
    expect(host.querySelector('.wb-log-error')).toBeNull();
    expect(handle.session.state.projectId).toBeNull();
    Reflect.deleteProperty(window, 'showDirectoryPicker');
    await click(host, '[data-welcome-action="open-folder"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-log-error')).not.toBeNull());
    expect(host.querySelector('.wb-log-error')?.textContent).toContain('不支持打开文件夹');
    expect(backend.create).not.toHaveBeenCalled();
  });

  it('打开项目的 Git 刷新延迟时，自动预览不保存用户已经输入的草稿', async () => {
    let bootstrap!: () => void;
    const gate = new Promise<void>(resolve => {
      bootstrap = resolve;
    });
    const { handle, backend, compiler, mountEditor } = fixture(true, '/browser-workbench-assets/', gate);
    let finishHistory!: () => void;
    vi.mocked(backend.history).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishHistory = () => resolve([]);
        })
    );
    bootstrap();
    await vi.waitFor(() => expect(backend.history).toHaveBeenCalledOnce());
    expect(compiler.compile).toHaveBeenCalledOnce();
    mountEditor.mock.calls[0][1].onChange('unsaved while opening');
    finishHistory();
    await handle.ready;
    await vi.waitFor(() => expect(compiler.compile).toHaveBeenCalledOnce());
    expect(backend.save).not.toHaveBeenCalled();
    expect(compiler.compile.mock.calls[0][0].files['src/main.ts']).toBe(files['src/main.ts']);
    expect(handle.session.state.files['src/main.ts']).toBe('unsaved while opening');
    expect(handle.session.state.dirty).toBe(true);
  });

  it('新建项目的 Git 刷新延迟时，自动预览不保存用户已经输入的草稿', async () => {
    const { host, handle, backend, compiler, mountEditor } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(handle.session.state.preview).not.toBeNull());
    compiler.compile.mockClear();
    let finishHistory!: () => void;
    vi.mocked(backend.history).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishHistory = () => resolve([]);
        })
    );
    const calls = vi.mocked(backend.history).mock.calls.length;
    await click(host, '[data-action="new-project"]');
    await answer(host, 'slow initial preview');
    await answer(host, 'vanilla');
    await vi.waitFor(() => expect(backend.history).toHaveBeenCalledTimes(calls + 1));
    expect(compiler.compile).toHaveBeenCalledOnce();
    const editor = mountEditor.mock.calls.at(-1)![1];
    const saved = editor.value;
    editor.onChange('unsaved while creating');
    finishHistory();
    await vi.waitFor(() => expect(compiler.compile).toHaveBeenCalledOnce());
    expect(backend.save).not.toHaveBeenCalled();
    expect(compiler.compile.mock.calls[0][0].files[handle.session.state.activePath!]).toBe(saved);
    expect(handle.session.state.files[handle.session.state.activePath!]).toBe('unsaved while creating');
    expect(handle.session.state.dirty).toBe(true);
  });

  it('读取 Git 历史不会阻止已打开编辑器的显式保存或取消其新预览', async () => {
    let bootstrap!: () => void;
    const gate = new Promise<void>(resolve => {
      bootstrap = resolve;
    });
    const { host, handle, backend, compiler, mountEditor } = fixture(true, '/browser-workbench-assets/', gate);
    let finishHistory!: () => void;
    vi.mocked(backend.history).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishHistory = () => resolve([]);
        })
    );
    bootstrap();
    await vi.waitFor(() => expect(backend.history).toHaveBeenCalledOnce());
    mountEditor.mock.calls[0][1].onChange('explicit save while loading history');
    try {
      await vi.waitFor(() =>
        expect(host.querySelector<HTMLButtonElement>('[data-action="save"]')?.disabled).toBe(false)
      );
      host
        .querySelector<HTMLElement>('.ao-workbench')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
      await vi.waitFor(() => expect(backend.save).toHaveBeenCalledOnce());
      await vi.waitFor(() =>
        expect(compiler.compile.mock.calls.at(-1)?.[0].files['src/main.ts']).toBe('explicit save while loading history')
      );
    } finally {
      finishHistory();
    }
    await handle.ready;
    expect(handle.session.state.dirty).toBe(false);
    expect(compiler.compile.mock.calls.at(-1)?.[0].files['src/main.ts']).toBe('explicit save while loading history');
  });
  it('自托管资源目录支持不带末尾斜杠，并加载官方Dockview和Codicons样式', async () => {
    const { host, handle } = fixture(true, '/custom-workbench-assets');
    await handle.ready;
    expect(host.querySelector<HTMLLinkElement>('[data-workbench-styles=dockview]')?.href).toBe(
      'http://localhost:3000/custom-workbench-assets/styles/dockview.css'
    );
    expect(host.querySelector<HTMLLinkElement>('[data-workbench-styles=codicon]')?.href).toBe(
      'http://localhost:3000/custom-workbench-assets/styles/codicon.css'
    );
    expect(host.querySelector('.codicon.codicon-files')).not.toBeNull();
    expect(host.querySelector('.dv-dockview')).not.toBeNull();
  });

  it('编辑器聚焦不渲染描边，与 vscode.dev 一致', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    expect(host.querySelector('.ao-workbench > style')?.textContent).toContain(
      '.ao-workbench .wb-editor-host .cm-editor.cm-focused{outline:none}'
    );
  });

  it('提供三端共用的编辑区、预览、面板和状态栏，释放时销毁资源', async () => {
    const { host, handle, backend, compiler, mountEditor, disposeEditor } = fixture();
    await handle.ready;
    for (const label of ['活动栏', '资源管理器', '工作区布局', '项目预览', '底部面板', '状态栏'])
      expect(host.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    expect(mountEditor).toHaveBeenCalled();
    handle.dispose();
    expect(disposeEditor).toHaveBeenCalled();
    expect(backend.dispose).toHaveBeenCalled();
    expect(compiler.dispose).toHaveBeenCalled();
    expect(host.childElementCount).toBe(0);
  });

  it('折叠侧栏与面板保留缓冲，文件切换保留独立内容', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    handle.session.edit('src/main.ts', 'unsaved');
    (host.querySelector('[aria-label="切换资源管理器"]') as HTMLButtonElement).click();
    expect(host.querySelector('[data-action=explorer]')?.getAttribute('aria-pressed')).toBe('false');
    (host.querySelector('[aria-label="切换底部面板"]') as HTMLButtonElement).click();
    expect(handle.session.state.files['src/main.ts']).toBe('unsaved');
    handle.session.select('src/label.ts');
    handle.session.select('src/main.ts');
    expect(handle.session.state.files['src/main.ts']).toBe('unsaved');
    handle.dispose();
  });

  it('重置布局会重新显示侧栏并同步活动栏选择状态', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    await click(host, '[data-action="explorer"]');
    expect(host.querySelector('[data-action="explorer"]')?.getAttribute('aria-pressed')).toBe('false');
    await click(host, '[data-action="reset-layout"]');
    await vi.waitFor(() =>
      expect(host.querySelector('[data-action="explorer"]')?.getAttribute('aria-pressed')).toBe('true')
    );
  });

  it('切换项目时重建同名文件编辑器，撤销历史不会串到另一个项目', async () => {
    const { handle, backend, mountEditor, disposeEditor } = fixture();
    await handle.ready;
    handle.session.edit('src/main.ts', 'old project');
    await handle.session.save();
    vi.mocked(backend.open).mockResolvedValueOnce({
      projectId: 'second',
      revision: '1',
      files: { 'src/main.ts': 'new project' }
    });
    await handle.session.open('second');
    expect(disposeEditor).toHaveBeenCalledOnce();
    expect(mountEditor).toHaveBeenCalledTimes(2);
    expect(mountEditor.mock.calls[1][1].value).toBe('new project');
    expect(handle.session.state.projectId).toBe('second');
  });

  it('编辑回调、快捷保存和运行使用当前文件，Git视图支持暂存与提交', async () => {
    const { host, handle, backend, compiler, mountEditor } = fixture();
    await handle.ready;
    const editor = mountEditor.mock.calls[0][1];
    editor.onChange('console.log(2)');
    editor.onCursor(4, 7);
    expect(host.querySelector('[data-slot="cursor"]')?.textContent).toContain('行 4，列 7');
    host
      .querySelector('.ao-workbench')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    await vi.waitFor(() => expect(backend.save).toHaveBeenCalled());
    expect(handle.session.state.dirty).toBe(false);
    await click(host, '[data-action="run"]');
    await vi.waitFor(() => expect(compiler.compile.mock.calls.at(-1)?.[0].files['src/main.ts']).toBe('console.log(2)'));
    await vi.waitFor(() => expect(host.querySelector('.wb-preview-content iframe')).not.toBeNull());
    vi.mocked(backend.status).mockResolvedValue({
      branch: 'main',
      head: 'a'.repeat(40),
      entries: [{ path: 'src/main.ts', index: ' ', worktree: 'M' }]
    });
    await click(host, '[data-action="git"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-scm-change')).not.toBeNull());
    vi.mocked(backend.status).mockResolvedValue({
      branch: 'main',
      head: 'a'.repeat(40),
      entries: [{ path: 'src/main.ts', index: 'M', worktree: ' ' }]
    });
    await click(host, '[data-scm-group="working"] [data-scm-action="stage"]');
    await vi.waitFor(() => expect(backend.stage).toHaveBeenCalledWith('one', ['src/main.ts']));
    await vi.waitFor(() =>
      expect(host.querySelector<HTMLButtonElement>('[data-scm-action="stage-all"]')?.disabled).toBe(true)
    );
    const input = messageInput(host, 'tested change');
    await click(host, '[data-scm-action="commit"]');
    await vi.waitFor(() => expect(backend.commit).toHaveBeenCalledWith('one', 'tested change'));
    await vi.waitFor(() => expect(input.value).toBe(''));
    handle.dispose();
  });

  it('新建文件夹在树内输入行创建目录占位文件并展开文件夹', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    await click(host, '[data-action="new-folder"]');
    await inlineInput(host, 'assets');
    await vi.waitFor(() => expect(handle.session.state.files['assets/.gitkeep']).toBe(''));
    expect(handle.session.state.dirty).toBe(true);
    const folderRow = host.querySelector<HTMLElement>('button[data-tree-path="assets"].wb-folder');
    expect(folderRow).not.toBeNull();
    expect(folderRow?.getAttribute('aria-expanded')).toBe('true');
    handle.dispose();
  });

  it('新建文件与重命名使用树内输入行，删除先取消再明确确认', async () => {
    const { host, handle, backend } = fixture();
    await handle.ready;
    await click(host, '[data-action="new-file"]');
    await inlineInput(host, 'src/created.ts');
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/created.ts'));
    expect(handle.session.state.dirty).toBe(true);
    await click(host, '[data-action="save"]');
    await vi.waitFor(() => expect(handle.session.state.dirty).toBe(false));
    await click(host, '[data-action="more-actions"]');
    await click(host, '.wb-context-menu [data-menu-id="rename"]');
    await inlineInput(host, 'renamed.ts');
    await vi.waitFor(() => expect(backend.rename).toHaveBeenCalledWith('one', 'src/created.ts', 'src/renamed.ts'));
    await vi.waitFor(() => expect(handle.session.state.files['src/renamed.ts']).toBeDefined());
    handle.session.select('src/renamed.ts');
    await click(host, '[data-action="more-actions"]');
    await click(host, '.wb-context-menu [data-menu-id="delete"]');
    await confirmAction(host, false);
    expect(backend.remove).not.toHaveBeenCalled();
    await click(host, '[data-action="more-actions"]');
    await click(host, '.wb-context-menu [data-menu-id="delete"]');
    await confirmAction(host, true);
    await vi.waitFor(() => expect(backend.remove).toHaveBeenCalledWith('one', 'src/renamed.ts'));
    await click(host, '[data-action="new-file"]');
    await inlineInput(host, null);
    expect(handle.session.state.dirty).toBe(false);
    handle.dispose();
  });

  it('F2 打开树内重命名输入，Esc 取消不写入，Enter 提交新路径', async () => {
    const { host, handle, backend } = fixture();
    await handle.ready;
    const tree = host.querySelector<HTMLElement>('[data-slot="files"]');
    if (!tree) throw new Error('文件树缺失');
    tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }));
    await inlineInput(host, null);
    expect(backend.rename).not.toHaveBeenCalled();
    tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }));
    await inlineInput(host, 'moved.ts');
    await vi.waitFor(() => expect(backend.rename).toHaveBeenCalledWith('one', 'src/main.ts', 'src/moved.ts'));
    handle.dispose();
  });

  const dragFiles = {
    'src/main.ts': 'console.log(1)',
    'src/lib/util.ts': 'export const x = 1;',
    'docs/readme.md': 'readme'
  };

  it('文件行拖到文件夹行上：整行高亮，放下后移动并展开目标文件夹', async () => {
    const { host, handle, backend } = fixture(true, '/browser-workbench-assets/', undefined, [], dragFiles);
    await handle.ready;
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/main.ts'));
    const fileRow = treeRow(host, 'src/main.ts');
    expect(fileRow.draggable).toBe(true);
    const folderRow = treeRow(host, 'docs');
    fileRow.dispatchEvent(drag('dragstart').event);
    expect(host.querySelector('.ao-workbench')?.classList.contains('wb-dragging')).toBe(true);
    const over = drag('dragover');
    folderRow.dispatchEvent(over.event);
    expect(over.transfer.dropEffect).toBe('move');
    expect(folderRow.classList.contains('wb-drop-into')).toBe(true);
    folderRow.dispatchEvent(drag('drop').event);
    expect(host.querySelector('.wb-drop-into')).toBeNull();
    await vi.waitFor(() => expect(backend.move).toHaveBeenCalledWith('one', 'src/main.ts', 'docs/main.ts'));
    await vi.waitFor(() => expect(handle.session.state.files['docs/main.ts']).toBe('console.log(1)'));
    expect(handle.session.state.files['src/main.ts']).toBeUndefined();
    expect(treeRow(host, 'docs').getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.ao-workbench')?.classList.contains('wb-dragging')).toBe(false);
    handle.dispose();
  });

  it('文件行拖到文件行上：移入目标文件的父目录', async () => {
    const { host, handle, backend } = fixture(true, '/browser-workbench-assets/', undefined, [], dragFiles);
    await handle.ready;
    await vi.waitFor(() => expect(treeRow(host, 'docs/readme.md')).not.toBeNull());
    treeRow(host, 'src/main.ts').dispatchEvent(drag('dragstart').event);
    const target = treeRow(host, 'docs/readme.md');
    target.dispatchEvent(drag('dragover').event);
    expect(target.classList.contains('wb-drop-into')).toBe(true);
    target.dispatchEvent(drag('drop').event);
    await vi.waitFor(() => expect(backend.move).toHaveBeenCalledWith('one', 'src/main.ts', 'docs/main.ts'));
    handle.dispose();
  });

  it('拖到树空白区放下：移入根目录，反馈落在最后一行', async () => {
    const { host, handle, backend } = fixture(true, '/browser-workbench-assets/', undefined, [], dragFiles);
    await handle.ready;
    await vi.waitFor(() => expect(treeRow(host, 'docs/readme.md')).not.toBeNull());
    treeRow(host, 'docs/readme.md').dispatchEvent(drag('dragstart').event);
    const tree = host.querySelector<HTMLElement>('[data-slot="files"]');
    if (!tree) throw new Error('文件树缺失');
    tree.dispatchEvent(drag('dragover').event);
    expect(treeRow(host, 'src/main.ts').classList.contains('wb-drop-into')).toBe(true);
    tree.dispatchEvent(drag('drop').event);
    await vi.waitFor(() => expect(backend.move).toHaveBeenCalledWith('one', 'docs/readme.md', 'readme.md'));
    await vi.waitFor(() => expect(handle.session.state.files['readme.md']).toBe('readme'));
    handle.dispose();
  });

  it('无效落点不给高亮也不移动：自身、后代行与同目录文件', async () => {
    const { host, handle, backend } = fixture(true, '/browser-workbench-assets/', undefined, [], dragFiles);
    await handle.ready;
    await vi.waitFor(() => expect(treeRow(host, 'docs/readme.md')).not.toBeNull());
    const invalidTargets: [string, string][] = [
      ['src/main.ts', 'src/main.ts'],
      ['src', 'src/main.ts'],
      ['src', 'src/lib'],
      ['src/lib/util.ts', 'src/lib']
    ];
    for (const [from, onto] of invalidTargets) {
      treeRow(host, from).dispatchEvent(drag('dragstart').event);
      const over = drag('dragover');
      treeRow(host, onto).dispatchEvent(over.event);
      expect(over.transfer.dropEffect).toBe('none');
      expect(host.querySelector('.wb-drop-into')).toBeNull();
      treeRow(host, onto).dispatchEvent(drag('drop').event);
    }
    expect(backend.move).not.toHaveBeenCalled();
    handle.dispose();
  });

  it('从打开的编辑器行拖出文件同样生效', async () => {
    const { host, handle, backend } = fixture(true, '/browser-workbench-assets/', undefined, [], dragFiles);
    await handle.ready;
    await vi.waitFor(() => expect(host.querySelector('.wb-editor-open')).not.toBeNull());
    const editorRow = host.querySelector<HTMLButtonElement>('button[data-tree-path="editor:src/main.ts"]');
    if (!editorRow) throw new Error('打开的编辑器行缺失');
    editorRow.dispatchEvent(drag('dragstart').event);
    treeRow(host, 'docs').dispatchEvent(drag('dragover').event);
    treeRow(host, 'docs').dispatchEvent(drag('drop').event);
    await vi.waitFor(() => expect(backend.move).toHaveBeenCalledWith('one', 'src/main.ts', 'docs/main.ts'));
    handle.dispose();
  });

  it('拖放悬停在折叠文件夹上一秒后自动展开', async () => {
    const { host, handle } = fixture(true, '/browser-workbench-assets/', undefined, [], dragFiles);
    await handle.ready;
    await vi.waitFor(() => expect(treeRow(host, 'docs/readme.md')).not.toBeNull());
    treeRow(host, 'src').click();
    expect(treeRow(host, 'src').getAttribute('aria-expanded')).toBe('false');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      treeRow(host, 'docs/readme.md').dispatchEvent(drag('dragstart').event);
      treeRow(host, 'src').dispatchEvent(drag('dragover').event);
      vi.advanceTimersByTime(999);
      expect(treeRow(host, 'src').getAttribute('aria-expanded')).toBe('false');
      vi.advanceTimersByTime(1);
      expect(treeRow(host, 'src').getAttribute('aria-expanded')).toBe('true');
      treeRow(host, 'docs/readme.md').dispatchEvent(drag('dragend').event);
    } finally {
      vi.useRealTimers();
    }
    handle.dispose();
  });

  it('资源管理器支持方向键导航：上下移动并打开文件，到达边界时停留', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/main.ts'));
    const tree = host.querySelector<HTMLElement>('[data-slot="files"]');
    if (!tree) throw new Error('文件树缺失');
    const press = (key: string): void => {
      tree
        .querySelector<HTMLElement>('[data-tree-section],[data-tree-path]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    };
    const rows = (): HTMLElement[] => [
      ...tree.querySelectorAll<HTMLElement>('button[data-tree-path],button[data-tree-section]')
    ];
    press('Home');
    expect(rows()[0].dataset['treeSection']).toBe('open-editors');
    press('ArrowDown');
    expect(rows()[1].dataset['treePath']).toBe('editor:src/main.ts');
    press('ArrowDown');
    expect(rows()[2].dataset['treeSection']).toBe('workspace');
    press('ArrowDown');
    expect(rows()[3].dataset['treePath']).toBe('src');
    press('ArrowDown');
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/label.ts'));
    press('ArrowDown');
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/main.ts'));
    press('ArrowDown');
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/main.ts'));
    press('ArrowUp');
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/label.ts'));
    handle.dispose();
  });

  it('节头支持点击与方向键折叠展开，打开的编辑器行可切换与关闭', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(handle.session.state.tabs).toContain('src/main.ts'));
    const tree = host.querySelector<HTMLElement>('[data-slot="files"]');
    if (!tree) throw new Error('文件树缺失');
    const section = (key: string): HTMLElement | null =>
      tree.querySelector<HTMLElement>(`button[data-tree-section="${key}"]`);
    expect(section('open-editors')?.textContent).toContain('打开的编辑器');
    expect(section('workspace')?.textContent).toContain('本地项目');
    section('workspace')?.click();
    await vi.waitFor(() => expect(tree.querySelector('button[data-tree-path="src"]')).toBeNull());
    expect(section('workspace')?.getAttribute('aria-expanded')).toBe('false');
    section('workspace')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    );
    await vi.waitFor(() => expect(tree.querySelector('button[data-tree-path="src"]')).not.toBeNull());
    // 打开第二个文件后出现对应编辑器行，点击切换活动文件，关闭按钮收起标签
    tree.querySelector<HTMLElement>('button[data-tree-path="src/label.ts"]')?.click();
    await vi.waitFor(() => expect(handle.session.state.tabs).toContain('src/label.ts'));
    const open = tree.querySelector<HTMLElement>('button[data-tree-path="editor:src/label.ts"]');
    expect(open).not.toBeNull();
    handle.session.select('src/main.ts');
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/main.ts'));
    open?.click();
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/label.ts'));
    open?.parentElement?.querySelector<HTMLElement>('.wb-editor-row-close')?.click();
    await vi.waitFor(() => expect(handle.session.state.tabs).not.toContain('src/label.ts'));
    // 悬停动作关闭全部编辑器，节随之消失
    tree.querySelector<HTMLElement>('[data-action="close-all-editors"]')?.click();
    await vi.waitFor(() => expect(handle.session.state.tabs).toHaveLength(0));
    expect(tree.querySelector('button[data-tree-section="open-editors"]')).toBeNull();
    handle.dispose();
  });

  it('活动栏切换视图更换标题与标题动作组，更多菜单按视图提供条目', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    await click(host, '[data-action="git"]');
    expect(host.querySelector('[data-slot="side-title"]')?.textContent).toBe('源代码管理');
    expect((host.querySelector('.wb-side-actions[data-view="git"]') as HTMLElement).hidden).toBe(false);
    expect((host.querySelector('.wb-side-actions[data-view="explorer"]') as HTMLElement).hidden).toBe(true);
    await click(host, '[data-action="more-actions"]');
    expect([...host.querySelectorAll<HTMLElement>('.wb-context-menu button')].map(item => item.textContent)).toEqual([
      '刷新',
      '始终显示操作'
    ]);
    host
      .querySelector<HTMLElement>('.wb-context-menu [data-menu-id="always-show-actions"]')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await vi.waitFor(() => expect(host.querySelector('.wb-scm-show-actions')).not.toBeNull());
    await click(host, '[data-action="explorer"]');
    expect(host.querySelector('[data-slot="side-title"]')?.textContent).toBe('资源管理器');
    await click(host, '[data-action="more-actions"]');
    expect([...host.querySelectorAll<HTMLElement>('.wb-context-menu button')].map(item => item.textContent)).toEqual([
      '重命名',
      '删除',
      '刷新资源管理器',
      '折叠资源管理器中的文件夹'
    ]);
    handle.dispose();
  });

  it('折叠资源管理器中的文件夹收起全部目录', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    const tree = host.querySelector<HTMLElement>('[data-slot="files"]');
    if (!tree) throw new Error('文件树缺失');
    expect(tree.querySelector('button[data-tree-path="src"]')?.getAttribute('aria-expanded')).toBe('true');
    await click(host, '[data-action="collapse-tree"]');
    await vi.waitFor(() =>
      expect(tree.querySelector('button[data-tree-path="src"]')?.getAttribute('aria-expanded')).toBe('false')
    );
    handle.dispose();
  });

  it('方向键左右与 Enter 折叠展开目录', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    const tree = host.querySelector<HTMLElement>('[data-slot="files"]');
    if (!tree) throw new Error('文件树缺失');
    const folder = () => tree.querySelector<HTMLElement>('button[data-tree-path="src"]');
    folder()?.click();
    await vi.waitFor(() => expect(folder()?.getAttribute('aria-expanded')).toBe('false'));
    folder()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(folder()?.getAttribute('aria-expanded')).toBe('true'));
    folder()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(folder()?.getAttribute('aria-expanded')).toBe('false'));
    folder()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(folder()?.getAttribute('aria-expanded')).toBe('true'));
  });

  it('文件行 Delete 弹出删除确认，右键菜单支持重命名与删除入口', async () => {
    const { host, handle, backend } = fixture();
    await handle.ready;
    const tree = host.querySelector<HTMLElement>('[data-slot="files"]');
    if (!tree) throw new Error('文件树缺失');
    const row = () => tree.querySelector<HTMLElement>('button[data-tree-path="src/main.ts"]');
    row()?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 })
    );
    await vi.waitFor(() => expect(host.querySelector('.wb-context-menu')).not.toBeNull());
    const items = () =>
      [...host.querySelectorAll<HTMLElement>('.wb-context-menu button')].map(item => item.textContent);
    expect(items()).toEqual(['重命名', '删除']);
    host
      .querySelector<HTMLElement>('.wb-context-menu')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(host.querySelector('.wb-context-menu')).toBeNull());
    row()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(host.querySelector('dialog')).not.toBeNull());
    await confirmAction(host, true);
    await vi.waitFor(() => expect(backend.remove).toHaveBeenCalledWith('one', 'src/main.ts'));
  });

  it('文件树显示 Git 状态字母：暂存优先，未跟踪显示 U', async () => {
    const { host, handle, backend } = fixture();
    await handle.ready;
    vi.mocked(backend.status).mockResolvedValue({
      branch: 'main',
      head: 'a'.repeat(40),
      entries: [
        { path: 'src/main.ts', index: 'M', worktree: ' ' },
        { path: 'src/label.ts', index: '?', worktree: '?' }
      ]
    });
    await click(host, '[data-action="git"]');
    await click(host, '[data-action="explorer"]');
    const rows = [...host.querySelectorAll<HTMLElement>('[data-slot="files"] [data-tree-path]')];
    const status = (path: string) =>
      rows.find(row => row.dataset['treePath'] === path)?.querySelector<HTMLElement>('.wb-file-status');
    await vi.waitFor(() => expect(status('src/main.ts')?.textContent).toBe('M'));
    expect(status('src/main.ts')?.dataset['status']).toBe('M');
    expect(status('src/label.ts')?.textContent).toBe('U');
    expect(status('src/label.ts')?.dataset['status']).toBe('U');
    handle.dispose();
  });

  it('打开项目恢复上次的标签与活动文件，切换后持久化会话状态', async () => {
    const { handle, catalog } = fixture();
    vi.mocked(catalog.getState).mockResolvedValue({
      tabs: ['src/label.ts', 'src/main.ts'],
      activePath: 'src/label.ts'
    });
    await handle.ready;
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/label.ts'));
    expect(handle.session.state.tabs).toEqual(['src/label.ts', 'src/main.ts']);
    expect(catalog.putState).not.toHaveBeenCalled();
    handle.session.select('src/main.ts');
    await vi.waitFor(() =>
      expect(catalog.putState).toHaveBeenCalledWith('one', {
        tabs: ['src/label.ts', 'src/main.ts'],
        activePath: 'src/main.ts'
      })
    );
    expect(catalog.putState).toHaveBeenCalledTimes(1);
    handle.dispose();
  });

  it('编译失败的问题条目可点击并跳转到文件行', async () => {
    const { host, handle, compiler, editorHandle } = fixture();
    await handle.ready;
    vi.mocked(compiler.compile).mockRejectedValueOnce(
      new CompilationError('Build failed', [{ file: 'src/main.ts', line: 3, column: 7, message: 'Unexpected "const"' }])
    );
    handle.session.edit('src/main.ts', 'broken');
    await click(host, '[data-action="save"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-log-problem')).not.toBeNull());
    const problem = host.querySelector<HTMLButtonElement>('.wb-log-problem');
    expect(problem?.textContent).toContain('src/main.ts:3:7');
    problem?.click();
    await vi.waitFor(() => expect(editorHandle.runCommand).toHaveBeenCalledWith('gotoLineAt', 3));
    await vi.waitFor(() =>
      expect(editorHandle.setDiagnostics).toHaveBeenCalledWith([{ line: 3, column: 7, message: 'Unexpected "const"' }])
    );
    handle.session.edit('src/main.ts', 'fixed');
    await click(host, '[data-action="save"]');
    await vi.waitFor(() => expect(editorHandle.setDiagnostics).toHaveBeenCalledWith([]));
    handle.dispose();
  });

  it('状态栏显示人类可读语言名，文档标题跟随文件与项目', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(host.querySelector('[data-slot="language"]')?.textContent).toBe('TypeScript'));
    expect(host.ownerDocument.title).toContain('main.ts');
    expect(host.ownerDocument.title).toContain('本地项目');
    handle.dispose();
  });

  it('SCM 视图的刷新按钮重新读取 Git 状态', async () => {
    const { host, handle, backend } = fixture();
    await handle.ready;
    await click(host, '[data-action="git"]');
    await vi.waitFor(() => expect(backend.status).toHaveBeenCalled());
    const before = vi.mocked(backend.status).mock.calls.length;
    await click(host, '[data-action="refresh-tree"]');
    await vi.waitFor(() => expect(vi.mocked(backend.status).mock.calls.length).toBeGreaterThan(before));
    handle.dispose();
  });

  it('同 basename 的多个标签用父目录消歧，与 VS Code 一致', async () => {
    const { host, handle } = fixture(true, '/browser-workbench-assets/', undefined, [], {
      'src/main.ts': 'console.log(1)',
      'lib/main.ts': 'export const x = 1;'
    });
    await handle.ready;
    handle.session.select('lib/main.ts');
    await vi.waitFor(() =>
      expect([...host.querySelectorAll('.wb-dock-tab-title')].map(item => item.textContent)).toEqual(
        expect.arrayContaining(['src/main.ts', 'lib/main.ts'])
      )
    );
    handle.dispose();
  });

  it('问题面板无问题时显示空状态提示', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    await vi.waitFor(() =>
      expect(host.querySelector('[data-log="problems"] .wb-panel-content')?.textContent).toContain('尚无问题')
    );
    handle.dispose();
  });

  it('状态栏点击：转到行、切 Git 视图、缩进选择器应用到编辑器', async () => {
    const { host, handle, editorHandle } = fixture();
    await handle.ready;
    await click(host, '[data-action="goto-line"]');
    await vi.waitFor(() => expect(editorHandle.runCommand).toHaveBeenCalledWith('gotoLine'));
    await click(host, '[data-action="show-scm"]');
    await vi.waitFor(() => expect((host.querySelector('[data-slot="git-view"]') as HTMLElement)?.hidden).toBe(false));
    await click(host, '[data-action="indent-picker"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-context-menu')).not.toBeNull());
    const item = [...host.querySelectorAll<HTMLElement>('.wb-context-menu button')].find(button =>
      button.textContent?.includes('4 个空格')
    );
    item?.click();
    await vi.waitFor(() => expect(editorHandle.setIndentUnit).toHaveBeenCalledWith('    '));
    expect(host.querySelector('[data-slot="indent"]')?.textContent).toBe('空格: 4');
    handle.dispose();
  });

  it('提交消息随会话状态持久化并在重开时恢复', async () => {
    const { host, handle, catalog } = fixture();
    vi.mocked(catalog.getState).mockResolvedValue({
      tabs: ['src/main.ts'],
      activePath: 'src/main.ts',
      commitMessage: '上次的提交说明'
    });
    await handle.ready;
    await click(host, '[data-action="git"]');
    const message = host.querySelector<HTMLTextAreaElement>('.wb-scm-commit-form textarea');
    await vi.waitFor(() => expect(message?.value).toBe('上次的提交说明'));
    handle.dispose();
  });

  it('切换项目遇到未保存缓冲时询问保存或放弃，取消保持不变', async () => {
    const { host, handle, backend } = fixture(true, '/browser-workbench-assets/', undefined, [
      { id: 'two', name: '第二个项目', template: 'vanilla' as const, entry: 'src/main.ts', updatedAt: 1 }
    ]);
    await handle.ready;
    handle.session.edit('src/main.ts', 'draft');
    const select = host.querySelector<HTMLSelectElement>('.wb-projects');
    if (!select) throw new Error('项目选择器缺失');
    const switchTo = (value: string): void => {
      select.value = value;
      select.dispatchEvent(new Event('change'));
    };
    const choose = async (label: string): Promise<void> => {
      await vi.waitFor(() => expect(host.querySelector('dialog')).not.toBeNull());
      const dialog = host.querySelector<HTMLDialogElement>('dialog');
      const button = [...(dialog?.querySelectorAll('button') ?? [])].find(item => item.textContent === label);
      if (!button) throw new Error(`缺少对话框按钮 ${label}`);
      button.click();
      await vi.waitFor(() => expect(host.querySelector('dialog')).toBeNull());
    };
    switchTo('two');
    await choose('取消');
    expect(handle.session.state.projectId).toBe('one');
    expect(handle.session.state.dirty).toBe(true);
    switchTo('two');
    await choose('放弃更改');
    await vi.waitFor(() => expect(handle.session.state.projectId).toBe('two'));
    expect(handle.session.state.dirty).toBe(false);
    handle.session.edit('src/main.ts', 'keep me');
    switchTo('one');
    await choose('保存并切换');
    await vi.waitFor(() => expect(handle.session.state.projectId).toBe('one'));
    expect(backend.save).toHaveBeenCalled();
    handle.dispose();
  });

  it('侧栏重命名与删除作用于树选中项而非活动编辑器', async () => {
    const { host, handle, backend } = fixture();
    await handle.ready;
    const tree = host.querySelector<HTMLElement>('[data-slot="files"]');
    if (!tree) throw new Error('文件树缺失');
    // 树内点击选中 src/label.ts（同时打开它），再把活动文件切回 main.ts
    tree.querySelector<HTMLElement>('button[data-tree-path="src/label.ts"]')?.click();
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/label.ts'));
    handle.session.select('src/main.ts');
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/main.ts'));
    await click(host, '[data-action="more-actions"]');
    await click(host, '.wb-context-menu [data-menu-id="rename"]');
    await inlineInput(host, 'moved.ts');
    await vi.waitFor(() => expect(backend.rename).toHaveBeenCalledWith('one', 'src/label.ts', 'src/moved.ts'));
    handle.dispose();
  });

  it('编辑器右键菜单提供格式化、转到行与命令面板', async () => {
    const { host, handle, editorHandle } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(host.querySelector('.wb-editor-host[data-editor-path]')).not.toBeNull());
    const editorHost = host.querySelector<HTMLElement>('.wb-editor-host');
    editorHost?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 })
    );
    await vi.waitFor(() => expect(host.querySelector('.wb-context-menu')).not.toBeNull());
    const labels = [...host.querySelectorAll<HTMLElement>('.wb-context-menu button')].map(item => item.textContent);
    expect(labels).toEqual(['格式化文档', '转到行', '命令面板']);
    [...host.querySelectorAll<HTMLElement>('.wb-context-menu button')]
      .find(item => item.textContent === '转到行')
      ?.click();
    await vi.waitFor(() => expect(editorHandle.runCommand).toHaveBeenCalledWith('gotoLine'));
    handle.dispose();
  });

  it('⌘/Ctrl+Shift+F 打开搜索视图并聚焦输入，命中点击跳转到活动编辑器', async () => {
    const { host, handle, editorHandle } = fixture();
    await handle.ready;
    const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'F',
        code: 'KeyF',
        keyCode: 70,
        bubbles: true,
        cancelable: true,
        shiftKey: true,
        ...modifier
      })
    );
    await vi.waitFor(() =>
      expect((host.querySelector('[data-slot="search-view"]') as HTMLElement)?.hidden).toBe(false)
    );
    expect(host.querySelector('[data-slot="side-title"]')?.textContent).toBe('搜索');
    const input = host.querySelector<HTMLInputElement>('.wb-search-input input')!;
    expect(host.ownerDocument.activeElement).toBe(input);
    input.value = 'log';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const rows = [...host.querySelectorAll<HTMLElement>('.wb-search-match')];
    expect(rows).toHaveLength(1);
    rows[0].click();
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/main.ts'));
    expect(editorHandle.runCommand).toHaveBeenCalledWith('gotoLineAt', 1);
    handle.dispose();
  });

  it('搜索视图点击组头替换文件，全部替换弹出确认后写入编辑缓冲', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    await click(host, '[data-action="search"]');
    await vi.waitFor(() =>
      expect((host.querySelector('[data-slot="search-view"]') as HTMLElement)?.hidden).toBe(false)
    );
    const input = host.querySelector<HTMLInputElement>('.wb-search-input input')!;
    input.value = '1';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const replaceInput = host.querySelector<HTMLInputElement>('.wb-search-replace input')!;
    replaceInput.value = '9';
    replaceInput.dispatchEvent(new Event('input', { bubbles: true }));
    host.querySelector<HTMLButtonElement>('[data-search-replace-file]')!.click();
    await vi.waitFor(() => expect(handle.session.state.files['src/main.ts']).toBe('console.log(9)'));
    host.querySelector<HTMLButtonElement>('[data-search-replace-all]')!.click();
    await vi.waitFor(() => expect(host.querySelector('dialog')).not.toBeNull());
    const dialog = host.querySelector<HTMLDialogElement>('dialog')!;
    const confirm = [...dialog.querySelectorAll('button')].find(button => button.textContent === '替换全部');
    expect(confirm).toBeDefined();
    dialog.close();
    handle.dispose();
  });

  it('命令面板提供编辑器查找命令并路由到活动编辑器', async () => {
    const { host, handle, editorHandle } = fixture();
    await handle.ready;
    await click(host, '[data-action="commands"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-quick-input input')).not.toBeNull());
    const input = host.querySelector<HTMLInputElement>('.wb-quick-input input')!;
    input.value = '>查找';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const item = [...host.querySelectorAll<HTMLElement>('.wb-quick-input-list button')].find(button =>
      button.textContent?.includes('编辑器: 查找')
    );
    expect(item).toBeDefined();
    item?.click();
    await vi.waitFor(() => expect(editorHandle.runCommand).toHaveBeenCalledWith('find'));
    handle.dispose();
  });

  it('控制台面板在无内容时显示空状态提示', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    expect(host.querySelector('[data-log="console"] .wb-panel-content')?.textContent).toContain('尚无控制台输出');
    handle.dispose();
  });

  it('Mod+S 只保存当前文件并从已保存快照更新预览，Save All 才保存其余缓冲', async () => {
    const { host, handle, backend, compiler } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(handle.session.state.preview).not.toBeNull());
    compiler.compile.mockClear();
    handle.session.edit('src/main.ts', 'saved main');
    handle.session.edit('src/label.ts', 'unsaved label');
    const root = host.querySelector<HTMLElement>('.ao-workbench')!;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(backend.save).toHaveBeenCalledOnce());
    expect(vi.mocked(backend.save).mock.calls[0][1]).toEqual({
      'src/main.ts': 'saved main',
      'src/label.ts': files['src/label.ts']
    });
    expect(handle.session.state.files['src/label.ts']).toBe('unsaved label');
    expect(handle.session.isModified('src/label.ts')).toBe(true);
    await vi.waitFor(() =>
      expect(compiler.compile.mock.calls.at(-1)?.[0].files).toEqual({
        'src/main.ts': 'saved main',
        'src/label.ts': files['src/label.ts']
      })
    );
    root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'S', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })
    );
    await vi.waitFor(() => expect(handle.session.state.dirty).toBe(false));
    expect(vi.mocked(backend.save).mock.calls.at(-1)?.[1]).toEqual({
      'src/main.ts': 'saved main',
      'src/label.ts': 'unsaved label'
    });
  });

  it('Shift+Alt+F 格式化当前文件：可撤销写入缓冲、标记未保存且不自动保存', async () => {
    const { host, handle, backend, mountEditor } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(handle.session.state.preview).not.toBeNull());
    vi.mocked(backend.save).mockClear();
    handle.session.edit('src/main.ts', 'const  x={a:1,}');
    const bridge = vi.mocked(mountEditor.mock.results[0].value);
    vi.mocked(bridge.replace).mockImplementation((value: string) => mountEditor.mock.calls[0][1].onChange(value));
    const editorHost = host.querySelector<HTMLElement>('[data-editor-path="src/main.ts"]')!;
    const event = new KeyboardEvent('keydown', {
      key: 'F',
      shiftKey: true,
      altKey: true,
      bubbles: true,
      cancelable: true
    });
    editorHost.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(bridge.replace).toHaveBeenCalledOnce());
    expect(handle.session.state.files['src/main.ts']).toBe('const x = { a: 1 };\n');
    expect(handle.session.isModified('src/main.ts')).toBe(true);
    expect(backend.save).not.toHaveBeenCalled();
  });

  it('格式已正确的文件重复执行不产生第二次写入', async () => {
    const { host, handle, mountEditor } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(handle.session.state.preview).not.toBeNull());
    handle.session.edit('src/main.ts', 'const  x={a:1,}');
    const bridge = vi.mocked(mountEditor.mock.results[0].value);
    vi.mocked(bridge.replace).mockImplementation((value: string) => mountEditor.mock.calls[0][1].onChange(value));
    const editorHost = host.querySelector<HTMLElement>('[data-editor-path="src/main.ts"]')!;
    const save = host.querySelector<HTMLButtonElement>('[data-action="save"]')!;
    const format = () =>
      editorHost.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', shiftKey: true, altKey: true, bubbles: true }));
    format();
    await vi.waitFor(() => expect(bridge.replace).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(save.disabled).toBe(false));
    format();
    await vi.waitFor(() => expect(save.disabled).toBe(false));
    expect(bridge.replace).toHaveBeenCalledOnce();
    expect(handle.session.isModified('src/main.ts')).toBe(true);
  });

  it('没有格式化器的文件只给出输出提示，不修改缓冲', async () => {
    const { host, handle, mountEditor } = fixture();
    await handle.ready;
    handle.session.edit('logo.svg', '<svg></svg>');
    handle.session.select('logo.svg');
    await vi.waitFor(() => expect(host.querySelector('[data-editor-path="logo.svg"]')).not.toBeNull());
    const editorHost = host.querySelector<HTMLElement>('[data-editor-path="logo.svg"]')!;
    editorHost.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', shiftKey: true, altKey: true, bubbles: true }));
    const output = host.querySelector('[data-log="output"] .wb-panel-content')!;
    await vi.waitFor(() => expect(output.textContent).toContain('没有可用于 logo.svg 的格式化器'));
    expect(handle.session.state.files['logo.svg']).toBe('<svg></svg>');
    expect(vi.mocked(mountEditor.mock.results[1].value).replace).not.toHaveBeenCalled();
  });

  it('二进制文件拒绝格式化并给出输出提示', async () => {
    const binary: WorkbenchFiles = { 'src/main.bin': new Uint8Array([1, 2, 3]) };
    const { host, handle } = fixture(true, '/browser-workbench-assets/', undefined, [], binary);
    await handle.ready;
    await vi.waitFor(() => expect(host.querySelector('[data-editor-path="src/main.bin"]')).not.toBeNull());
    const editorHost = host.querySelector<HTMLElement>('[data-editor-path="src/main.bin"]')!;
    editorHost.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', shiftKey: true, altKey: true, bubbles: true }));
    const output = host.querySelector('[data-log="output"] .wb-panel-content')!;
    await vi.waitFor(() => expect(output.textContent).toContain('二进制文件无法格式化'));
    expect(handle.session.state.files['src/main.bin']).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('保存不抢走编辑器激活状态，随后 Mod+W 关闭源码标签并保留预览', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    handle.session.edit('src/main.ts', 'saved code');
    const root = host.querySelector<HTMLElement>('.ao-workbench')!;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(handle.session.isModified('src/main.ts')).toBe(false));
    await vi.waitFor(() => expect(host.querySelector<HTMLButtonElement>('[data-action="save"]')?.disabled).toBe(false));
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(handle.session.state.tabs).not.toContain('src/main.ts'));
    expect(host.querySelector('.wb-preview')).not.toBeNull();
    expect(host.querySelector('[data-dock-panel="preview"]')).not.toBeNull();
  });

  it('切换底部面板后，Mod+W 仍关闭实际拥有键盘焦点的源码文件', async () => {
    const { host, handle } = fixture();
    await handle.ready;
    const content = document.createElement('div');
    content.setAttribute('contenteditable', 'true');
    content.tabIndex = 0;
    host.querySelector('[data-editor-path="src/main.ts"]')!.append(content);
    content.focus();
    await click(host, '[data-action="panel"]');
    await click(host, '[data-action="panel"]');
    await vi.waitFor(() => expect(host.querySelector<HTMLButtonElement>('[data-action="save"]')?.disabled).toBe(false));
    expect(document.activeElement).toBe(content);
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(handle.session.state.tabs).not.toContain('src/main.ts'));
    expect(host.querySelector('[data-dock-panel="preview"]')).not.toBeNull();
  });

  it('后台预览编译不会阻塞已保存文件的暂存动作', async () => {
    const { host, handle, backend, compiler } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(handle.session.state.preview).not.toBeNull());
    let finish!: (value: { js: string; css: string }) => void;
    compiler.compile.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const calls = compiler.compile.mock.calls.length;
    handle.session.edit('src/main.ts', 'latest saved');
    vi.mocked(backend.status).mockResolvedValue({
      branch: 'main',
      head: 'a'.repeat(40),
      entries: [{ path: 'src/main.ts', index: ' ', worktree: 'M' }]
    });
    await click(host, '[data-action="save"]');
    await vi.waitFor(() => expect(compiler.compile).toHaveBeenCalledTimes(calls + 1));
    await click(host, '[data-action="git"]');
    await click(host, '[data-scm-action="stage"]');
    await vi.waitFor(() => expect(backend.stage).toHaveBeenCalledWith('one', ['src/main.ts']));
    expect(host.querySelector('[data-slot="save-status"]')?.textContent).toContain('更新预览');
    finish({ js: 'latest saved', css: '' });
  });

  it('SCM 只提交明确暂存内容，未保存的其他文件不会被自动保存或暂存', async () => {
    const { host, handle, backend, compiler } = fixture();
    await handle.ready;
    await vi.waitFor(() => expect(handle.session.state.preview).not.toBeNull());
    vi.mocked(backend.save).mockClear();
    compiler.compile.mockClear();
    vi.mocked(backend.status).mockResolvedValue({
      branch: 'main',
      head: 'a'.repeat(40),
      entries: [{ path: 'src/main.ts', index: 'M', worktree: ' ' }]
    });
    await click(host, '[data-action="git"]');
    await vi.waitFor(() => expect(host.querySelector('[data-scm-group="staged"] .wb-scm-change')).not.toBeNull());
    handle.session.edit('src/label.ts', 'keep this buffer');
    const input = messageInput(host, 'commit explicit index');
    expect(host.querySelector<HTMLButtonElement>('[data-scm-action="commit"]')?.disabled).toBe(false);
    const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(backend.commit).toHaveBeenCalledWith('one', 'commit explicit index'));
    await vi.waitFor(() => expect(input.value).toBe(''));
    expect(backend.save).not.toHaveBeenCalled();
    expect(backend.stage).not.toHaveBeenCalled();
    expect(compiler.compile).not.toHaveBeenCalled();
    expect(handle.session.state.files['src/label.ts']).toBe('keep this buffer');
    expect(handle.session.isModified('src/label.ts')).toBe(true);
  });

  it('丢弃工作区文件使用确认按钮，仅替换指定路径并保留其他缓冲', async () => {
    const { host, handle, backend } = fixture();
    await handle.ready;
    vi.mocked(backend.status).mockResolvedValue({
      branch: 'main',
      head: 'a'.repeat(40),
      entries: [{ path: 'src/main.ts', index: ' ', worktree: 'M' }]
    });
    await click(host, '[data-action="git"]');
    await vi.waitFor(() => expect(host.querySelector('[data-scm-action="discard"]')).not.toBeNull());
    handle.session.edit('src/main.ts', 'discard this buffer');
    handle.session.edit('src/label.ts', 'preserve this buffer');
    await click(host, '[data-scm-action="discard"]');
    await confirmAction(host, false);
    expect(backend.discardWorking).not.toHaveBeenCalled();
    vi.mocked(backend.discardWorking).mockResolvedValueOnce({
      projectId: 'one',
      revision: '2',
      files: { ...files, 'src/main.ts': 'index contents' }
    });
    await click(host, '[data-scm-action="discard"]');
    await confirmAction(host, true);
    await vi.waitFor(() => expect(backend.discardWorking).toHaveBeenCalledWith('one', 'src/main.ts'));
    await vi.waitFor(() => expect(handle.session.state.files['src/main.ts']).toBe('index contents'));
    expect(handle.session.state.files['src/label.ts']).toBe('preserve this buffer');
    expect(handle.session.isModified('src/label.ts')).toBe(true);
  });

  it('差异刷新等待期间切项目，迟到的旧历史不能覆盖新项目历史', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const { host, handle, backend, compiler } = fixture(true, '/browser-workbench-assets/', gate, [
      { id: 'two', name: '第二项目', template: 'vanilla', entry: 'src/main.ts', updatedAt: 0 }
    ]);
    compiler.compile.mockImplementationOnce(() => new Promise(() => undefined));
    vi.mocked(backend.status).mockImplementation(async id => ({
      branch: 'main',
      head: 'a'.repeat(40),
      entries: id === 'one' ? [{ path: 'src/main.ts', index: ' ', worktree: 'M' }] : []
    }));
    vi.mocked(backend.history).mockImplementation(async id => [
      { oid: (id === 'one' ? 'a' : 'b').repeat(40), message: id === 'one' ? 'one old commit' : 'two current commit' }
    ]);
    release();
    await handle.ready;
    await click(host, '[data-action="git"]');
    await vi.waitFor(() => expect(host.querySelector('[data-scm-path="src/main.ts"]')).not.toBeNull());
    await click(host, '[data-scm-path="src/main.ts"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-diff .cm-content')).not.toBeNull());
    let finish!: (diff: WorkbenchDiff) => void;
    vi.mocked(backend.readDiff).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const reads = vi.mocked(backend.readDiff).mock.calls.length;
    await click(host, '[data-action="git"]');
    await vi.waitFor(() => expect(backend.readDiff).toHaveBeenCalledTimes(reads + 1));
    const select = host.querySelector<HTMLSelectElement>('.wb-projects')!;
    expect(select.disabled).toBe(false);
    select.value = 'two';
    select.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
      expect(host.querySelector('[data-slot="history"]')?.textContent).toContain('two current commit')
    );
    finish({
      projectId: 'one',
      path: 'src/main.ts',
      kind: 'working',
      base: { exists: true, binary: false, text: '', byteLength: 0 },
      modified: { exists: true, binary: false, text: 'old', byteLength: 3 }
    });
    await vi.waitFor(() =>
      expect(host.querySelector<HTMLButtonElement>('[data-action="new-project"]')?.disabled).toBe(false)
    );
    expect(host.querySelector('[data-slot="history"]')?.textContent).toContain('two current commit');
    expect(host.querySelector('[data-slot="history"]')?.textContent).not.toContain('one old commit');
    expect(handle.session.state.projectId).toBe('two');
  });

  it('未保存文件不能暂存，没有暂存内容不能提交；运行错误可见且允许清空', async () => {
    const { host, handle, backend, compiler } = fixture();
    await handle.ready;
    vi.mocked(backend.status).mockResolvedValue({
      branch: 'main',
      head: 'a'.repeat(40),
      entries: [{ path: 'src/main.ts', index: ' ', worktree: 'M' }]
    });
    await click(host, '[data-action="git"]');
    await vi.waitFor(() =>
      expect(host.querySelector('[data-scm-group="working"] [data-scm-action="stage"]')).not.toBeNull()
    );
    handle.session.edit('src/main.ts', 'unsaved');
    expect(host.querySelector<HTMLButtonElement>('[data-scm-action="stage-all"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-scm-action="stage"]')?.disabled).toBe(true);
    expect(backend.stage).not.toHaveBeenCalled();
    const input = messageInput(host, 'cannot commit unstaged data');
    expect(host.querySelector<HTMLButtonElement>('[data-scm-action="commit"]')?.disabled).toBe(true);
    input.closest('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(backend.commit).not.toHaveBeenCalled();
    handle.session.discard();
    vi.mocked(compiler.compile).mockRejectedValueOnce(new Error('bad module'));
    await click(host, '[data-action="run"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-panel-content')?.textContent).toContain('bad module'));
    await click(host, '[data-action="clear-logs"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-panel-content')?.textContent).toBe('尚无问题'));
    expect(host.querySelector('[data-slot="problem-count"]')?.textContent).toBe('0');
    handle.dispose();
  });

  it('新建固定模板项目，历史恢复通过明确按钮确认', async () => {
    const { host, handle, backend, catalog } = fixture();
    await handle.ready;
    catalog.put.mockClear();
    await click(host, '[data-action="new-project"]');
    await answer(host, 'New project');
    await answer(host, 'vue');
    await vi.waitFor(() => expect(catalog.put).toHaveBeenCalled());
    expect(backend.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ 'src/App.vue': expect.any(String), 'workbench.project.json': expect.any(String) })
    );
    vi.mocked(backend.history).mockResolvedValue([{ oid: 'a'.repeat(40), message: 'first' }]);
    await click(host, '[data-action="git"]');
    await vi.waitFor(() => expect(host.querySelector('[data-slot="history"] button')).not.toBeNull());
    await click(host, '[data-slot="history"] button');
    await confirmAction(host, false);
    expect(backend.restore).not.toHaveBeenCalled();
    await click(host, '[data-slot="history"] button');
    await confirmAction(host, true);
    await vi.waitFor(() =>
      expect(backend.restore).toHaveBeenCalledWith(handle.session.state.projectId, 'a'.repeat(40))
    );
    handle.dispose();
  });

  it('原生编辑器分组支持拆分，关闭标签保留未保存缓冲并释放编辑器', async () => {
    const { host, handle, disposeEditor } = fixture();
    await handle.ready;
    handle.session.select('src/label.ts');
    handle.session.edit('src/label.ts', 'unsaved label');
    await click(host, '[aria-label="向右拆分编辑器组"]');
    await click(host, '[aria-label="关闭 src/label.ts"]');
    await vi.waitFor(() => expect(handle.session.state.tabs).not.toContain('src/label.ts'));
    expect(disposeEditor).toHaveBeenCalledOnce();
    expect(handle.session.state.files['src/label.ts']).toBe('unsaved label');
    expect(handle.session.state.activePath).toBe('src/main.ts');
    handle.dispose();
  });

  it('导出先保存缓冲，导入模板归档后登记并打开新项目', async () => {
    const { host, handle, backend, catalog } = fixture();
    await handle.ready;
    catalog.put.mockClear();
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const createURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:archive');
    handle.session.edit('src/main.ts', 'saved before export');
    await click(host, '[data-action="export"]');
    await vi.waitFor(() => expect(backend.exportArchive).toHaveBeenCalledWith('one'));
    expect(backend.save).toHaveBeenCalled();
    expect(download).toHaveBeenCalled();
    expect(createURL).toHaveBeenCalled();
    const file = new File([new Uint8Array([1, 2, 3])], 'imported.zip', { type: 'application/zip' });
    const upload = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      if (this.type !== 'file') return;
      Object.defineProperty(this, 'files', { value: [file] });
      this.dispatchEvent(new Event('change'));
    });
    vi.mocked(backend.open).mockImplementation(async projectId => ({
      projectId,
      revision: '1',
      files: { ...files, 'workbench.project.json': JSON.stringify({ template: 'vanilla', entry: 'src/main.ts' }) }
    }));
    await click(host, '[data-action="import"]');
    await vi.waitFor(() =>
      expect(backend.importArchive).toHaveBeenCalledWith(expect.any(String), new Uint8Array([1, 2, 3]))
    );
    await vi.waitFor(() =>
      expect(catalog.put).toHaveBeenCalledWith(expect.objectContaining({ name: 'imported', template: 'vanilla' }))
    );
    expect(handle.session.state.projectId).not.toBe('one');
    handle.dispose();
    download.mockRestore();
    createURL.mockRestore();
    upload.mockRestore();
  });

  it('取消与非法模板不会创建项目，脏缓冲阻止切项目并触发离开确认', async () => {
    const { host, handle, backend } = fixture();
    await handle.ready;
    await click(host, '[data-action="new-project"]');
    await answer(host, null);
    expect(backend.create).not.toHaveBeenCalled();
    await click(host, '[data-action="new-project"]');
    await answer(host, 'Invalid');
    await answer(host, 'node');
    await vi.waitFor(() => expect(host.querySelector('.wb-panel-content')?.textContent).toContain('请选择'));
    expect(backend.create).not.toHaveBeenCalled();
    handle.session.edit('src/main.ts', 'unsaved');
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const select = host.querySelector<HTMLSelectElement>('.wb-projects');
    if (!select) throw new Error('Project select missing');
    select.value = 'one';
    select.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(host.querySelector('dialog')).not.toBeNull());
    const dialog = host.querySelector<HTMLDialogElement>('dialog');
    [...(dialog?.querySelectorAll('button') ?? [])].find(item => item.textContent === '取消')?.click();
    await vi.waitFor(() => expect(host.querySelector('dialog')).toBeNull());
    expect(handle.session.state.projectId).toBe('one');
    expect(handle.session.state.files['src/main.ts']).toBe('unsaved');
    handle.dispose();
    const released = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(released);
    expect(released.defaultPrevented).toBe(false);
  });

  it.each([
    { source: undefined, message: '归档缺少受控模板配置' },
    { source: 'null', message: '无效模板配置' },
    { source: JSON.stringify({ template: 'node', entry: 'src/main.ts' }), message: '导入归档不属于受控模板' },
    { source: JSON.stringify({ template: 'react', entry: 'missing.tsx' }), message: '导入归档不属于受控模板' }
  ])('导入后拒绝不受支持的模板描述：$message', async ({ source, message }) => {
    const { host, handle, backend, catalog } = fixture();
    await handle.ready;
    catalog.put.mockClear();
    const file = new File([new Uint8Array([1])], 'invalid.zip');
    const upload = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      if (this.type !== 'file') return;
      Object.defineProperty(this, 'files', { value: [file] });
      this.dispatchEvent(new Event('change'));
    });
    const imported: WorkbenchFiles =
      source === undefined ? { ...files } : { ...files, 'workbench.project.json': source };
    vi.mocked(backend.open).mockImplementation(async projectId => ({ projectId, revision: '1', files: imported }));
    await click(host, '[data-action="import"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-panel-content')?.textContent).toContain(message));
    expect(catalog.put).not.toHaveBeenCalled();
    expect(handle.session.state.projectId).toBe('one');
    handle.dispose();
    upload.mockRestore();
  });

  it('拒绝超大归档与脏状态导入，空提交说明不会调用Git', async () => {
    const { host, handle, backend } = fixture();
    await handle.ready;
    expect(host.querySelector<HTMLButtonElement>('[data-scm-action="commit"]')?.disabled).toBe(true);
    host.querySelector('.wb-scm-commit-form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(backend.commit).not.toHaveBeenCalled();
    handle.session.edit('src/main.ts', 'unsaved');
    await click(host, '[data-action="import"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-panel-content')?.textContent).toContain('存在未保存'));
    handle.session.discard();
    const file = new File([], 'oversized.zip');
    Object.defineProperty(file, 'size', { value: 25 * 1024 * 1024 });
    const upload = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      if (this.type !== 'file') return;
      Object.defineProperty(this, 'files', { value: [file] });
      this.dispatchEvent(new Event('change'));
    });
    await click(host, '[data-action="import"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-panel-content')?.textContent).toContain('24 MiB'));
    expect(backend.importArchive).not.toHaveBeenCalled();
    handle.dispose();
    upload.mockRestore();
  });
});

it('文件夹折叠保留编辑缓冲与编辑器实例', async () => {
  const { host, handle, mountEditor } = fixture();
  await handle.ready;
  handle.session.edit('src/main.ts', 'folder buffer');
  await click(host, '.wb-folder');
  expect(host.querySelector('[title="src/main.ts"].wb-file')).toBeNull();
  expect(handle.session.state.files['src/main.ts']).toBe('folder buffer');
  await click(host, '.wb-folder');
  expect(host.querySelector('[title="src/main.ts"].wb-file')).not.toBeNull();
  expect(mountEditor).toHaveBeenCalledOnce();
  handle.dispose();
});
