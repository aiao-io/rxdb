// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchCompiler } from './compiler-client.js';
import type { WorkbenchEditorMount } from './editor.js';
import { mountWorkbench } from './mount.js';
import type { WorkspaceBackend, WorkspaceFiles } from './session.js';

const files = { 'src/main.ts': 'console.log(1)', 'src/label.ts': 'export const label = 1;' };
function fixture(withProject = true) {
  let currentFiles: WorkspaceFiles = { ...files };
  let revision = 1;
  const backend: WorkspaceBackend = {
    open: vi.fn(async projectId => ({ projectId, revision: String(revision), files: { ...currentFiles } })),
    create: vi.fn(async (projectId, value) => {
      currentFiles = value;
      revision = 1;
      return { projectId, revision: '1', files: value };
    }),
    save: vi.fn(async (projectId, value) => {
      currentFiles = value;
      revision++;
      return { projectId, revision: String(revision), files: value };
    }),
    remove: vi.fn<WorkspaceBackend['remove']>(async (_id, path) => {
      const next = { ...currentFiles };
      delete next[path];
      currentFiles = next;
      revision++;
    }),
    rename: vi.fn<WorkspaceBackend['rename']>(async (_id, from, to) => {
      const next: Record<string, string | Uint8Array> = { ...currentFiles, [to]: currentFiles[from] };
      delete next[from];
      currentFiles = next;
      revision++;
    }),
    status: vi.fn(async () => ({ branch: 'main', head: null, entries: [] })),
    stage: vi.fn(async () => undefined),
    commit: vi.fn(async () => 'oid'),
    history: vi.fn(async () => []),
    restore: vi.fn(async projectId => ({ projectId, revision: '3', files })),
    exportArchive: vi.fn(async () => new Uint8Array()),
    importArchive: vi.fn(async () => undefined),
    dispose: vi.fn()
  };
  const disposeEditor = vi.fn();
  const mountEditor = vi.fn<WorkbenchEditorMount>(() => ({ update: vi.fn(), dispose: disposeEditor }));
  const compiler = {
    compile: vi.fn<WorkbenchCompiler['compile']>(async () => ({ js: '', css: '' })),
    dispose: vi.fn()
  };
  const catalog = {
    list: vi.fn(async () =>
      withProject ? [{ id: 'one', name: '本地项目', template: 'vanilla' as const, entry: 'src/main.ts', updatedAt: 1 }] : []
    ),
    put: vi.fn(async () => undefined)
  };
  const host = document.createElement('div');
  document.body.append(host);
  const handle = mountWorkbench(host, { backend, compiler, catalog }, mountEditor);
  return { host, handle, backend, compiler, catalog, mountEditor, disposeEditor };
}

const click = async (host: HTMLElement, selector: string): Promise<void> => {
  const element = host.querySelector<HTMLButtonElement>(selector);
  if (!element) throw new Error(`Missing test control: ${selector}`);
  await vi.waitFor(() => expect(element.disabled).toBe(false));
  element.click();
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

describe('VS Code 风格工作台', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLIFrameElement.prototype, 'credentialless', {
      configurable: true,
      writable: true,
      value: false
    });
  });

  it('首次打开空目录自动创建最小 React、Vue、Angular Demo', async () => {
    const { handle, backend, catalog } = fixture(false);
    await handle.ready;
    expect(backend.create).toHaveBeenCalledTimes(3);
    expect(backend.create).toHaveBeenCalledWith('default-react', expect.objectContaining({
      'src/main.tsx': expect.stringContaining('Hello React')
    }));
    expect(backend.create).toHaveBeenCalledWith('default-vue', expect.objectContaining({
      'src/App.vue': expect.stringContaining('Hello Vue')
    }));
    expect(backend.create).toHaveBeenCalledWith('default-angular', expect.objectContaining({
      'src/app.ts': expect.stringContaining('Hello Angular')
    }));
    expect(catalog.put).toHaveBeenCalledTimes(4);
    expect(handle.session.state.projectId).toBe('default-react');
    handle.dispose();
  });
  it('提供三端共用的编辑区、预览、面板和状态栏，释放时销毁资源', async () => {
    const { host, handle, backend, compiler, mountEditor, disposeEditor } = fixture();
    await handle.ready;
    for (const label of ['活动栏', '资源管理器', '编辑标签', '项目预览', '底部面板', '状态栏'])
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
    expect((host.querySelector('.wb-side') as HTMLElement).hidden).toBe(true);
    (host.querySelector('[aria-label="切换底部面板"]') as HTMLButtonElement).click();
    expect(handle.session.state.files['src/main.ts']).toBe('unsaved');
    handle.session.select('src/label.ts');
    handle.session.select('src/main.ts');
    expect(handle.session.state.files['src/main.ts']).toBe('unsaved');
    handle.dispose();
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
    await vi.waitFor(() => expect(compiler.compile).toHaveBeenCalled());
    expect(compiler.compile.mock.calls[0][0].files['src/main.ts']).toBe('console.log(2)');
    await vi.waitFor(() => expect(host.querySelector('.wb-preview-content iframe')).not.toBeNull());
    vi.mocked(backend.status).mockResolvedValue({
      branch: 'main',
      head: 'a'.repeat(40),
      entries: [{ path: 'src/main.ts', index: ' ', worktree: 'M' }]
    });
    await click(host, '[data-action="git"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-change')).not.toBeNull());
    await click(host, '.wb-change button');
    await vi.waitFor(() => expect(backend.stage).toHaveBeenCalledWith('one', ['src/main.ts']));
    await click(host, '[data-action="stage-all"]');
    await vi.waitFor(() => expect(backend.stage).toHaveBeenCalledTimes(2));
    const input = host.querySelector<HTMLInputElement>('[name="message"]');
    if (!input) throw new Error('Commit input missing');
    input.value = 'tested change';
    host.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(backend.commit).toHaveBeenCalledWith('one', 'tested change'));
    expect(input.value).toBe('');
    await click(host, '[data-panel="output"]');
    expect(host.querySelector('.wb-panel-content')?.textContent).toContain('已提交');
    handle.dispose();
  });

  it('新建文件、重命名、删除和丢弃缓冲要求明确输入', async () => {
    const { host, handle, backend } = fixture();
    await handle.ready;
    await click(host, '[data-action="new-file"]');
    await answer(host, 'src/created.ts');
    await vi.waitFor(() => expect(handle.session.state.activePath).toBe('src/created.ts'));
    expect(handle.session.state.dirty).toBe(true);
    await click(host, '[data-action="save"]');
    await vi.waitFor(() => expect(handle.session.state.dirty).toBe(false));
    await click(host, '[data-action="rename"]');
    await answer(host, 'src/renamed.ts');
    await vi.waitFor(() => expect(backend.rename).toHaveBeenCalledWith('one', 'src/created.ts', 'src/renamed.ts'));
    await vi.waitFor(() => expect(handle.session.state.files['src/renamed.ts']).toBeDefined());
    handle.session.select('src/renamed.ts');
    await click(host, '[data-action="delete"]');
    await answer(host, 'DELETE');
    await vi.waitFor(() => expect(backend.remove).toHaveBeenCalledWith('one', 'src/renamed.ts'));
    handle.session.edit('src/main.ts', 'unsaved');
    await click(host, '[data-action="discard"]');
    await answer(host, 'DISCARD');
    await vi.waitFor(() => expect(handle.session.state.dirty).toBe(false));
    await click(host, '[data-action="new-file"]');
    await answer(host, null);
    expect(handle.session.state.dirty).toBe(false);
    handle.dispose();
  });

  it('拒绝脏状态暂存与提交，将失败写进问题面板并允许清空', async () => {
    const { host, handle, backend, compiler } = fixture();
    await handle.ready;
    handle.session.edit('src/main.ts', 'unsaved');
    await click(host, '[data-action="stage-all"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-panel-content')?.textContent).toContain('请先保存'));
    expect(backend.stage).not.toHaveBeenCalled();
    await click(host, '[data-action="commit"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-panel-content')?.textContent).toContain('存在未保存'));
    handle.session.discard();
    vi.mocked(compiler.compile).mockRejectedValueOnce(new Error('bad module'));
    await click(host, '[data-action="run"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-panel-content')?.textContent).toContain('bad module'));
    await click(host, '[data-action="clear-logs"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-panel-content')?.textContent).toBe(''));
    expect(host.querySelector('[data-slot="problem-count"]')?.textContent).toBe('0');
    handle.dispose();
  });

  it('新建固定模板项目并在历史恢复时要求RESTORE确认', async () => {
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
    await answer(host, 'RESTORE');
    await vi.waitFor(() =>
      expect(backend.restore).toHaveBeenCalledWith(handle.session.state.projectId, 'a'.repeat(40))
    );
    handle.dispose();
  });

  it('拖动与键盘调整区域，关闭编辑标签会释放该编辑器', async () => {
    const { host, handle, disposeEditor } = fixture();
    await handle.ready;
    const sidebar = host.querySelector<HTMLElement>('[data-resize="sidebar"]');
    const panel = host.querySelector<HTMLElement>('[data-resize="panel"]');
    sidebar?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    expect((host.querySelector('.wb-side') as HTMLElement).style.width).toBe('150px');
    panel?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true }));
    expect((host.querySelector('.wb-panel') as HTMLElement).style.height).toBe('80px');
    sidebar?.dispatchEvent(new PointerEvent('pointerdown', { clientX: 50 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 350 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect((host.querySelector('.wb-side') as HTMLElement).style.width).toBe('300px');
    await click(host, '[aria-label="关闭 src/main.ts"]');
    expect(disposeEditor).toHaveBeenCalledOnce();
    expect(handle.session.state.activePath).toBeNull();
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
    await vi.waitFor(() => expect(host.querySelector('.wb-panel-content')?.textContent).toContain('存在未保存'));
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
    const imported: WorkspaceFiles =
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
    await click(host, '[data-action="commit"]');
    await vi.waitFor(() => expect(host.querySelector('.wb-panel-content')?.textContent).toContain('请填写提交说明'));
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
