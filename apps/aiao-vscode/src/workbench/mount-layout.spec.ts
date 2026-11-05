// @vitest-environment happy-dom
import { Orientation, type SerializedDockview } from 'dockview-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchProjectState } from './catalog.js';
import type { WorkbenchCompiler } from './compiler-client.js';
import type { WorkbenchEditorMount } from './editor.js';
import { mountWorkbench, type WorkbenchHandle } from './mount.js';
import type { WorkbenchBackend, WorkbenchFiles } from './session.js';
import type { WorkbenchLayoutStore } from './workbench-layout-url.js';

vi.mock('./preview/preview-sandbox.js', async () => {
  const actual = await vi.importActual<typeof import('./preview/preview-sandbox.js')>('./preview/preview-sandbox.js');
  return { ...actual, mountPreview: vi.fn(() => ({ iframe: document.createElement('iframe'), dispose: vi.fn() })) };
});

const instances: WorkbenchHandle[] = [];
afterEach(() => {
  instances.splice(0).forEach(handle => handle.dispose());
  document.body.replaceChildren();
});

const files: WorkbenchFiles = { 'src/main.ts': 'console.log(1)', 'src/label.ts': 'export const label = 1;' };
const restoredTabs: WorkbenchProjectState = { tabs: ['src/main.ts', 'src/label.ts'], activePath: 'src/label.ts' };

/** 两个编辑器左右拆分、侧栏隐藏，且没有底部面板与预览；右组里还有一个当前没打开的文件，激活的是左组。 */
const splitLayout: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      size: 800,
      data: [
        { type: 'leaf', size: 480, data: { id: '1', views: ['editor:src/main.ts'], activeView: 'editor:src/main.ts' } },
        {
          type: 'leaf',
          size: 480,
          data: { id: '2', views: ['editor:src/label.ts', 'editor:src/gone.ts'], activeView: 'editor:src/label.ts' }
        }
      ]
    },
    width: 960,
    height: 800,
    orientation: Orientation.HORIZONTAL
  },
  panels: {},
  activeGroup: '1',
  edgeGroups: { left: { size: 300, visible: false } }
};

function fixture(layoutStore: WorkbenchLayoutStore) {
  const backend: WorkbenchBackend = {
    open: vi.fn(async projectId => ({ projectId, revision: '1', files })),
    create: vi.fn<WorkbenchBackend['create']>(),
    save: vi.fn<WorkbenchBackend['save']>(),
    remove: vi.fn<WorkbenchBackend['remove']>(),
    rename: vi.fn<WorkbenchBackend['rename']>(),
    move: vi.fn<WorkbenchBackend['move']>(),
    status: vi.fn(async () => ({ branch: 'main', head: null, entries: [] })),
    stage: vi.fn<WorkbenchBackend['stage']>(),
    unstage: vi.fn<WorkbenchBackend['unstage']>(),
    readDiff: vi.fn<WorkbenchBackend['readDiff']>(),
    discardWorking: vi.fn<WorkbenchBackend['discardWorking']>(),
    commit: vi.fn<WorkbenchBackend['commit']>(),
    history: vi.fn(async () => []),
    restore: vi.fn<WorkbenchBackend['restore']>(),
    exportArchive: vi.fn<WorkbenchBackend['exportArchive']>(),
    importArchive: vi.fn<WorkbenchBackend['importArchive']>(),
    dispose: vi.fn()
  };
  const mountEditor = vi.fn<WorkbenchEditorMount>(() => ({ update: vi.fn(), replace: vi.fn(), dispose: vi.fn() }));
  const compiler: WorkbenchCompiler = { compile: vi.fn(async () => ({ js: '', css: '' })), dispose: vi.fn() };
  const catalog = {
    list: vi.fn(async () => [
      { id: 'one', name: '本地项目', template: 'vanilla' as const, entry: 'src/main.ts', updatedAt: 1 }
    ]),
    put: vi.fn(async () => undefined),
    getState: vi.fn(async () => restoredTabs),
    putState: vi.fn(async () => undefined)
  };
  const host = document.createElement('div');
  document.body.append(host);
  const handle = mountWorkbench(
    host,
    { backend, compiler, catalog, initialProjectId: 'one', layoutStore },
    mountEditor
  );
  instances.push(handle);
  return { host, handle };
}

const pressed = (host: HTMLElement, selector: string) => host.querySelector(selector)?.getAttribute('aria-pressed');

describe('工作台布局的恢复与写回', () => {
  it('打开项目恢复标签后按存储的布局排布，并保持会话的活动文件', async () => {
    const store = { load: vi.fn(async () => splitLayout), save: vi.fn<WorkbenchLayoutStore['save']>() };
    const { host, handle } = fixture(store);
    await handle.ready;
    const tab = (path: string) => host.querySelector(`[data-editor-tab-path="${path}"]`);
    expect(tab('src/main.ts')?.closest('.dv-groupview')).toBeTruthy();
    expect(tab('src/main.ts')?.closest('.dv-groupview')).not.toBe(tab('src/label.ts')?.closest('.dv-groupview'));
    expect(tab('src/gone.ts')).toBeNull();
    expect(pressed(host, '[data-action="toggle-sidebar"]')).toBe('false');
    expect(pressed(host, '.wb-title-actions [data-action="panel"]')).toBe('false');
    expect(pressed(host, '.wb-title-actions [data-action="preview"]')).toBe('false');
    expect(host.querySelector('[data-slot="panel-staging"] .wb-preview')).not.toBeNull();
    expect(handle.session.state.tabs).toEqual(restoredTabs.tabs);
    expect(handle.session.state.activePath).toBe('src/label.ts');
    expect(tab('src/label.ts')?.closest('.dv-tab')?.classList.contains('dv-active-tab')).toBe(true);
    expect(tab('src/label.ts')?.closest('.dv-groupview')?.classList.contains('dv-active-group')).toBe(true);
    expect(store.save).not.toHaveBeenCalled();
  });

  it('恢复完成前不写回；之后的布局变化防抖写回，销毁时丢弃待写的布局', async () => {
    const gate = Promise.withResolvers<unknown>();
    const store = { load: vi.fn(() => gate.promise), save: vi.fn<WorkbenchLayoutStore['save']>(async () => undefined) };
    const { host, handle } = fixture(store);
    await vi.waitFor(() => expect(handle.session.state.projectId).toBe('one'));
    const panel = host.querySelector<HTMLButtonElement>('.wb-title-actions [data-action="panel"]');
    if (!panel) throw new Error('缺少底部面板开关');
    panel.click();
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(store.save).not.toHaveBeenCalled();
    gate.resolve(null);
    await handle.ready;
    panel.click();
    await vi.waitFor(() => expect(store.save).toHaveBeenCalledOnce());
    const saved = store.save.mock.calls[0]?.[0];
    expect(saved?.panels).toHaveProperty('problems');
    expect(saved?.panels).toHaveProperty('editor:src/main.ts');
    panel.click();
    handle.dispose();
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(store.save).toHaveBeenCalledOnce();
  });

  it('存储里的布局非法时在输出面板提示，并保留默认布局', async () => {
    const store = { load: vi.fn(async () => ({ grid: 'broken' })), save: vi.fn<WorkbenchLayoutStore['save']>() };
    const { host, handle } = fixture(store);
    await handle.ready;
    expect(host.querySelector('[data-log="output"]')?.textContent).toContain('布局记录无效');
    expect(pressed(host, '.wb-title-actions [data-action="panel"]')).toBe('true');
    expect(pressed(host, '[data-action="toggle-sidebar"]')).toBe('true');
  });

  it('读取布局失败记入问题面板，工作台照常就绪', async () => {
    const store = {
      load: vi.fn(async () => {
        throw new Error('读取布局失败');
      }),
      save: vi.fn<WorkbenchLayoutStore['save']>()
    };
    const { host, handle } = fixture(store);
    await handle.ready;
    expect(host.querySelector('[data-log="problems"]')?.textContent).toContain('读取布局失败');
    expect(handle.session.state.projectId).toBe('one');
  });
});
