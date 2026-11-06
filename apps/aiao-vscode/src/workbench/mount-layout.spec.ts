// @vitest-environment happy-dom
import { Orientation, type SerializedDockview } from 'dockview-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchCatalog, WorkbenchProjectState } from './catalog.js';
import type { WorkbenchCompiler } from './compiler-client.js';
import type { WorkbenchEditorMount } from './editor.js';
import { mountWorkbench, type WorkbenchHandle } from './mount.js';
import type { WorkbenchBackend, WorkbenchFiles } from './session.js';

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

/** 两个本地项目共用同一份文件与标签；布局按项目 id 存取，默认打开最近的「one」。 */
function fixture(layouts: Readonly<Record<string, unknown>> = {}) {
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
      { id: 'one', name: '项目一', template: 'vanilla' as const, entry: 'src/main.ts', updatedAt: 2 },
      { id: 'two', name: '项目二', template: 'vanilla' as const, entry: 'src/main.ts', updatedAt: 1 }
    ]),
    put: vi.fn(async () => undefined),
    getState: vi.fn(async () => restoredTabs),
    putState: vi.fn(async () => undefined),
    getLayout: vi.fn<WorkbenchCatalog['getLayout']>(async projectId => layouts[projectId] ?? null),
    putLayout: vi.fn<WorkbenchCatalog['putLayout']>(async () => undefined)
  };
  const host = document.createElement('div');
  document.body.append(host);
  const handle = mountWorkbench(host, { backend, compiler, catalog, initialProjectId: 'one' }, mountEditor);
  instances.push(handle);
  return { host, handle, catalog };
}

const pressed = (host: HTMLElement, selector: string) => host.querySelector(selector)?.getAttribute('aria-pressed');
const groupOf = (host: HTMLElement, path: string) =>
  host.querySelector(`[data-editor-tab-path="${path}"]`)?.closest('.dv-groupview');
const settle = () => new Promise(resolve => setTimeout(resolve, 500));
function button(host: HTMLElement, selector: string): HTMLButtonElement {
  const element = host.querySelector<HTMLButtonElement>(selector);
  if (!element) throw new Error(`缺少按钮 ${selector}`);
  return element;
}

describe('按项目保存与恢复工作台布局', () => {
  it('打开项目时按该项目保存的布局排布已打开的标签，活动文件以会话为准，恢复本身不写回', async () => {
    const { host, handle, catalog } = fixture({ one: splitLayout });
    await handle.ready;
    expect(catalog.getLayout).toHaveBeenCalledWith('one');
    expect(groupOf(host, 'src/main.ts')).toBeTruthy();
    expect(groupOf(host, 'src/main.ts')).not.toBe(groupOf(host, 'src/label.ts'));
    expect(host.querySelector('[data-editor-tab-path="src/gone.ts"]')).toBeNull();
    expect(pressed(host, '[data-action="toggle-sidebar"]')).toBe('false');
    expect(pressed(host, '.wb-title-actions [data-action="panel"]')).toBe('false');
    expect(pressed(host, '.wb-title-actions [data-action="preview"]')).toBe('false');
    expect(host.querySelector('[data-slot="panel-staging"] .wb-preview')).not.toBeNull();
    expect(handle.session.state.tabs).toEqual(restoredTabs.tabs);
    expect(handle.session.state.activePath).toBe('src/label.ts');
    const label = host.querySelector('[data-editor-tab-path="src/label.ts"]');
    expect(label?.closest('.dv-tab')?.classList.contains('dv-active-tab')).toBe(true);
    expect(groupOf(host, 'src/label.ts')?.classList.contains('dv-active-group')).toBe(true);
    await settle();
    expect(catalog.putLayout).not.toHaveBeenCalled();
  });

  it('布局变化防抖写进当前项目，销毁时丢弃待写的布局', async () => {
    const { host, handle, catalog } = fixture();
    await handle.ready;
    const panel = button(host, '.wb-title-actions [data-action="panel"]');
    panel.click();
    expect(catalog.putLayout).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(catalog.putLayout).toHaveBeenCalledOnce());
    const [projectId, layout] = catalog.putLayout.mock.calls[0] ?? [];
    expect(projectId).toBe('one');
    expect(layout?.panels).not.toHaveProperty('problems');
    expect(layout?.panels).toHaveProperty('editor:src/main.ts');
    panel.click();
    handle.dispose();
    await settle();
    expect(catalog.putLayout).toHaveBeenCalledOnce();
  });

  it('切换项目前把待写的布局落到原项目，再恢复目标项目自己的布局', async () => {
    const { host, handle, catalog } = fixture({ two: splitLayout });
    await handle.ready;
    button(host, '[data-action="toggle-sidebar"]').click();
    const workspace = button(host, '[data-action="workspace"]');
    await vi.waitFor(() => expect(workspace.disabled).toBe(false));
    workspace.click();
    await vi.waitFor(() => expect(host.querySelector('.wb-context-menu')).not.toBeNull());
    const switchItem = host.querySelector<HTMLButtonElement>('.wb-context-menu [data-menu-id="project:two"]');
    if (!switchItem) throw new Error('工作区菜单缺少项目 two');
    switchItem.click();
    await vi.waitFor(() => expect(handle.session.state.projectId).toBe('two'));
    await vi.waitFor(() => expect(pressed(host, '.wb-title-actions [data-action="panel"]')).toBe('false'));
    expect(groupOf(host, 'src/main.ts')).not.toBe(groupOf(host, 'src/label.ts'));
    await settle();
    expect(catalog.putLayout).toHaveBeenCalledOnce();
    const [projectId, layout] = catalog.putLayout.mock.calls[0] ?? [];
    expect(projectId).toBe('one');
    expect(layout?.edgeGroups?.left?.visible).toBe(false);
    expect(layout?.panels).toHaveProperty('problems');
  });

  it('项目布局记录非法时在输出面板提示，并保留当前布局', async () => {
    const { host, handle } = fixture({ one: { grid: 'broken' } });
    await handle.ready;
    expect(host.querySelector('[data-log="output"]')?.textContent).toContain('项目布局记录无效');
    expect(pressed(host, '.wb-title-actions [data-action="panel"]')).toBe('true');
    expect(pressed(host, '[data-action="toggle-sidebar"]')).toBe('true');
  });

  it('读取项目布局失败记入问题面板，项目与标签照常恢复', async () => {
    const { host, handle, catalog } = fixture();
    catalog.getLayout.mockRejectedValue(new Error('读取布局失败'));
    await handle.ready;
    expect(host.querySelector('[data-log="problems"]')?.textContent).toContain('读取布局失败');
    expect(handle.session.state.projectId).toBe('one');
    expect(handle.session.state.tabs).toEqual(restoredTabs.tabs);
  });
});
