// @vitest-environment happy-dom
import type { SerializedDockview } from 'dockview-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkbenchDockview, type WorkbenchDockview } from './workbench-dockview.js';
import { SIDEBAR_WIDTH } from './workbench-layout-state.js';

type GridNode = SerializedDockview['grid']['root'];

const instances: WorkbenchDockview[] = [];

function fixture(width = 1200, height = 800, withPanels = true) {
  const root = document.createElement('section');
  root.innerHTML =
    '<main data-slot="dockview"></main><div data-slot="panel-staging" hidden><aside class="wb-side">资源</aside><template data-slot="welcome"><div class="wb-welcome">欢迎</div></template><section class="wb-preview"><div class="wb-preview-content"></div></section><section class="wb-panel" data-log="problems">问题日志</section><section class="wb-panel" data-log="output">输出日志</section><section class="wb-panel" data-log="console">控制台日志</section><section class="wb-panel" data-log="terminal">终端内容</section></div>';
  document.body.append(root);
  const callbacks = {
    onSelectEditor: vi.fn(),
    onPreviewMarkdown: vi.fn(),
    onCloseEditor: vi.fn(),
    onCloseOthers: vi.fn(),
    onCloseRight: vi.fn(),
    onSelectTool: vi.fn(),
    onToggleTool: vi.fn(),
    onClosePreview: vi.fn(),
    onCloseAuxiliary: vi.fn(),
    onCloseSidebar: vi.fn()
  };
  const dock = createWorkbenchDockview(root, callbacks);
  if (withPanels) dock.resetLayout();
  if (width > 0 && height > 0) dock.api.layout(width, height);
  instances.push(dock);
  return { root, dock, callbacks };
}

afterEach(() => {
  for (const dock of instances.splice(0)) dock.dispose();
  document.body.replaceChildren();
  vi.useRealTimers();
});

const pointer = (type: string, init: Record<string, unknown> = {}): PointerEvent =>
  new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerType: 'touch',
    button: 0,
    clientX: 20,
    clientY: 30,
    pointerId: 7,
    ...init
  });

/** 主网格里没有面板的组；侧栏所在的边缘组不算。 */
const emptyGridGroups = (dock: WorkbenchDockview) =>
  dock.api.groups.filter(group => group.api.location.type === 'grid' && group.panels.length === 0);
/** 界面上正在展示的欢迎背景（空编辑组的水印）。 */
const welcomes = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('.wb-welcome')];
const tabTitles = (root: ParentNode) =>
  [...root.querySelectorAll('.wb-dock-tab-title')].map(title => title.textContent);

/** 与某个组同处最内层网格分支的组 id（含自己），用来断言补建的编辑区与预览并排成一行。 */
function siblingGroupIds(dock: WorkbenchDockview, groupId: string): string[] {
  const search = (node: GridNode): string[] | undefined => {
    if (!Array.isArray(node.data)) return undefined;
    const ids = node.data.flatMap(child => (Array.isArray(child.data) ? [] : [child.data.id]));
    if (ids.includes(groupId)) return ids;
    for (const child of node.data) {
      const found = search(child);
      if (found) return found;
    }
    return undefined;
  };
  return search(dock.api.toJSON().grid.root) ?? [];
}

describe('Dockview 工作台布局', () => {
  it('零尺寸挂载后的侧栏留在边缘组内容中，布局恢复后不进入浮层', () => {
    const { root, dock } = fixture(0, 0);
    dock.api.layout(1200, 800);
    const sidebar = root.querySelector('.wb-side');
    expect(dock.api.getPanel('sidebar')?.group.element.contains(sidebar)).toBe(true);
    expect(sidebar?.closest('.dv-render-overlay')).toBeNull();
    expect(dock.applyLayout(dock.serializeLayout())).toBe(true);
    expect(dock.api.getPanel('sidebar')?.group.element.contains(sidebar)).toBe(true);
  });

  it('强制重布局采用容器首次非零尺寸', () => {
    const { root, dock } = fixture(0, 0);
    const container = root.querySelector('[data-slot="dockview"]');
    Object.defineProperties(container, {
      clientWidth: { value: 1200 },
      clientHeight: { value: 800 }
    });
    dock.refreshLayout();
    expect(dock.api.width).toBe(1200 - SIDEBAR_WIDTH);
    expect(dock.api.height).toBe(800);
  });

  it('空工作区只有侧栏面板，编辑区是展示欢迎背景的空组而不是标签，工具和预览按需打开', () => {
    const { root, dock } = fixture(1200, 800, false);
    expect(dock.api.panels.map(panel => panel.id)).toEqual(['sidebar']);
    expect(tabTitles(root)).not.toContain('欢迎');
    const [area, ...others] = emptyGridGroups(dock);
    expect(others).toEqual([]);
    expect(welcomes(root)).toHaveLength(1);
    expect(area?.element.contains(welcomes(root)[0] ?? null)).toBe(true);
    expect(dock.isToolsVisible()).toBe(false);
    expect(dock.isPreviewOpen()).toBe(false);
    dock.showTool('output');
    expect(dock.isToolsVisible()).toBe(true);
    expect(dock.api.getPanel('terminal')).toBeDefined();
    dock.showPreview();
    expect(dock.isPreviewOpen()).toBe(true);
  });

  it('终端与日志共用工具区域，关闭重开和移动保留同一宿主', () => {
    const { root, dock, callbacks } = fixture();
    const host = root.querySelector('[data-log="terminal"]');
    dock.showTool('terminal');
    expect(dock.api.getPanel('terminal')?.group).toBe(dock.api.getPanel('output')?.group);
    expect(callbacks.onSelectTool).toHaveBeenCalledWith('terminal');
    dock.toggleTools();
    dock.showTool('terminal');
    expect(root.querySelector('[data-log="terminal"]')).toBe(host);
    expect(host?.textContent).toBe('终端内容');
  });

  it('中键点击标签关闭面板，与关闭按钮走同一生命周期', async () => {
    const { dock, callbacks } = fixture();
    dock.ensureEditor('main.ts');
    dock.selectEditor('main.ts');
    const tab = document.querySelector<HTMLElement>('[data-editor-tab-path="main.ts"]');
    if (!tab) throw new Error('编辑器标签缺失');
    tab.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
    await Promise.resolve();
    await Promise.resolve();
    expect(callbacks.onCloseEditor).toHaveBeenCalledWith('main.ts');
    expect(dock.api.getPanel('editor:main.ts')).toBeUndefined();
  });

  it('编辑器标签右键菜单提供关闭、关闭其他与关闭右侧', async () => {
    const { dock, callbacks } = fixture();
    dock.ensureEditor('first.ts');
    dock.ensureEditor('second.ts');
    dock.ensureEditor('third.ts');
    const tab = document.querySelector<HTMLElement>('[data-editor-tab-path="second.ts"]');
    if (!tab) throw new Error('编辑器标签缺失');
    tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 60 }));
    const menu = document.querySelector<HTMLElement>('.wb-context-menu');
    expect(menu).not.toBeNull();
    const labels = [...(menu?.querySelectorAll('button') ?? [])].map(item => item.textContent);
    expect(labels).toEqual(['关闭', '关闭其他', '关闭右侧']);
    [...(menu?.querySelectorAll('button') ?? [])].find(item => item.textContent === '关闭其他')?.click();
    await Promise.resolve();
    expect(callbacks.onCloseOthers).toHaveBeenCalledWith('second.ts');
    tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 60 }));
    const secondMenu = document.querySelector<HTMLElement>('.wb-context-menu');
    [...(secondMenu?.querySelectorAll('button') ?? [])].find(item => item.textContent === '关闭右侧')?.click();
    await Promise.resolve();
    expect(callbacks.onCloseRight).toHaveBeenCalledWith('second.ts');
    tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 60 }));
    document
      .querySelector<HTMLElement>('.wb-context-menu')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.querySelector('.wb-context-menu')).toBeNull();
  });

  it('辅助差异面板使用独立 id 与官方图标，选择不改变 Session 编辑器', () => {
    const { root, dock, callbacks } = fixture();
    const source = dock.ensureEditor('src/main.ts');
    dock.selectEditor('src/main.ts');
    const diff = dock.ensureAuxiliary('diff:working:src/main.ts', 'main.ts · 工作区差异');
    diff.textContent = 'diff content';
    expect(dock.ensureAuxiliary('diff:working:src/main.ts', 'main.ts · 工作区差异')).toBe(diff);
    expect(diff.dataset['editorPath']).toBeUndefined();
    expect(dock.api.getPanel('diff:working:src/main.ts')?.api.renderer).toBe('always');
    expect(dock.api.getPanel('diff:working:src/main.ts')?.api.isActive).toBe(true);
    expect(root.querySelector('[data-auxiliary-id="diff:working:src/main.ts"] .codicon-git-compare')).not.toBeNull();
    expect(callbacks.onSelectEditor).not.toHaveBeenCalled();
    expect(dock.ensureEditor('src/main.ts')).toBe(source);
  });

  it('用户关闭辅助面板只通知辅助生命周期，程序移除不会再次回调', async () => {
    const { dock, callbacks } = fixture();
    dock.ensureAuxiliary('diff:working:file.ts', 'file.ts');
    dock.api.getPanel('diff:working:file.ts')?.api.close();
    await Promise.resolve();
    expect(callbacks.onCloseAuxiliary).toHaveBeenCalledExactlyOnceWith('diff:working:file.ts');
    expect(callbacks.onCloseEditor).not.toHaveBeenCalled();
    dock.ensureAuxiliary('diff:staged:file.ts', 'file.ts');
    dock.removeAuxiliary('diff:staged:file.ts');
    dock.removeAuxiliary('diff:staged:file.ts');
    await Promise.resolve();
    expect(callbacks.onCloseAuxiliary).toHaveBeenCalledTimes(1);
  });

  it('差异面板是编辑区最后一个内容时，关闭或移除它后编辑区回到欢迎背景', async () => {
    const { root, dock, callbacks } = fixture();
    dock.ensureAuxiliary('diff:working:file.ts', 'file.ts');
    const area = dock.api.getPanel('diff:working:file.ts')?.group;
    expect(welcomes(root)).toHaveLength(0);
    root.querySelector<HTMLButtonElement>('[aria-label="关闭 file.ts"]')?.click();
    await Promise.resolve();
    expect(callbacks.onCloseAuxiliary).toHaveBeenCalledExactlyOnceWith('diff:working:file.ts');
    expect(emptyGridGroups(dock)).toEqual([area]);
    expect(welcomes(root)).toHaveLength(1);
    dock.ensureAuxiliary('diff:staged:file.ts', 'file.ts');
    expect(dock.api.getPanel('diff:staged:file.ts')?.group).toBe(area);
    expect(welcomes(root)).toHaveLength(0);
    dock.removeAuxiliary('diff:staged:file.ts');
    expect(emptyGridGroups(dock)).toEqual([area]);
    expect(welcomes(root)).toHaveLength(1);
  });

  it('只有差异面板时打开编辑器，落进差异所在的编辑区而不是预览或工具组', () => {
    const { dock } = fixture();
    dock.ensureAuxiliary('diff:working:file.ts', 'file.ts');
    dock.ensureEditor('main.ts');
    const group = dock.api.getPanel('diff:working:file.ts')?.group;
    expect(dock.api.getPanel('editor:main.ts')?.group).toBe(group);
    expect(group).not.toBe(dock.api.getPanel('preview')?.group);
    expect(group).not.toBe(dock.api.getPanel('problems')?.group);
  });

  it('重置布局把辅助面板归入编辑组，保留同一差异 DOM', () => {
    const { dock, callbacks } = fixture();
    dock.ensureEditor('main.ts');
    dock.selectEditor('main.ts');
    const diff = dock.ensureAuxiliary('diff:working:main.ts', 'main.ts');
    const content = document.createElement('textarea');
    diff.append(content);
    const panel = dock.api.getPanel('diff:working:main.ts')!;
    panel.api.moveTo({ group: panel.group, position: 'right' });
    dock.resetLayout();
    expect(dock.ensureAuxiliary('diff:working:main.ts', 'main.ts')).toBe(diff);
    expect(diff.firstChild).toBe(content);
    expect(panel.group).toBe(dock.api.getPanel('editor:main.ts')?.group);
    expect(callbacks.onCloseAuxiliary).not.toHaveBeenCalled();
    expect(callbacks.onCloseEditor).not.toHaveBeenCalled();
  });

  it('首次非零布局把底部设为工作台高度的 1/3，后续尺寸变化保留用户调整', async () => {
    const { dock } = fixture(1200, 900);
    const bottom = dock.api.getPanel('problems')?.group;
    if (!bottom) throw new Error('工具group缺失');
    await vi.waitFor(() => expect(bottom.api.height).toBeCloseTo(300, 0));
    bottom.api.setSize({ height: 200 });
    await vi.waitFor(() => expect(bottom.api.height).toBeCloseTo(200, 0));
    dock.api.layout(1400, 900);
    await Promise.resolve();
    expect(bottom.api.height).toBeCloseTo(200, 0);
    dock.api.layout(1400, 1200);
    await Promise.resolve();
    expect(bottom.api.height).not.toBeCloseTo(400, 0);
  });

  it('矮工作台的底部面板保底 180px', async () => {
    const { dock } = fixture(1200, 450);
    const bottom = dock.api.getPanel('problems')?.group;
    if (!bottom) throw new Error('工具group缺失');
    await vi.waitFor(() => expect(bottom.api.height).toBeCloseTo(180, 0));
  });

  it('重置布局与关闭全部工具后重开，底部面板按工作台高度的 1/3 展开', async () => {
    const { dock } = fixture(1200, 900);
    await vi.waitFor(() => expect(dock.api.getPanel('problems')?.group.api.height).toBeCloseTo(300, 0));
    dock.api.getPanel('problems')?.group.api.setSize({ height: 200 });
    dock.resetLayout();
    expect(dock.api.getPanel('terminal')?.group.api.height).toBeCloseTo(300, 0);
    dock.toggleTools();
    await Promise.resolve();
    expect(dock.api.getPanel('terminal')).toBeUndefined();
    dock.api.layout(1200, 600);
    dock.showTool('terminal');
    expect(dock.api.getPanel('terminal')?.group.api.height).toBeCloseTo(200, 0);
  });

  it('使用原生edge侧栏、右侧预览与底部共享工具group', () => {
    const { root, dock, callbacks } = fixture();
    expect(dock.api.getEdgeGroup('left')).toBeDefined();
    expect(dock.api.getGroup('sidebar')?.model.header.hidden).toBe(true);
    expect(dock.api.getGroup('sidebar')?.api.locked).toBe('no-drop-target');
    const problems = dock.api.getPanel('problems');
    expect(problems?.group).toBe(dock.api.getPanel('output')?.group);
    expect(problems?.group).toBe(dock.api.getPanel('console')?.group);
    expect(dock.api.getPanel('preview')?.api.renderer).toBe('always');
    expect(root.querySelector('[data-slot="dockview"]')?.contains(root.querySelector('.wb-side'))).toBe(true);
    expect(callbacks.onSelectEditor).not.toHaveBeenCalled();
  });

  it('增加与程序选择编辑器不回调Session，也不替换已有编辑宿主', () => {
    const { root, dock, callbacks } = fixture();
    const first = dock.ensureEditor('src/main.ts');
    const child = document.createElement('textarea');
    first.append(child);
    const second = dock.ensureEditor('src/other.ts');
    expect(first.dataset['editorPath']).toBe('src/main.ts');
    expect(dock.ensureEditor('src/main.ts')).toBe(first);
    expect(first.firstChild).toBe(child);
    expect(dock.api.getPanel('editor:src/main.ts')?.api.renderer).toBe('always');
    expect(welcomes(root)).toHaveLength(0);
    expect(dock.api.getPanel('editor:src/main.ts')?.api.isActive).toBe(true);
    expect(dock.api.getPanel('editor:src/other.ts')?.api.isActive).toBe(false);
    dock.selectEditor('src/main.ts');
    expect(callbacks.onSelectEditor).not.toHaveBeenCalled();
    dock.api.getPanel('editor:src/other.ts')?.api.setActive();
    expect(callbacks.onSelectEditor).toHaveBeenCalledWith('src/other.ts');
    expect(dock.ensureEditor('src/other.ts')).toBe(second);
    dock.setEditorTitle('src/main.ts', 'main.ts •');
    expect(dock.api.getPanel('editor:src/main.ts')?.title).toBe('main.ts •');
    const tab = root.querySelector<HTMLElement>('[data-editor-tab-path="src/main.ts"]');
    expect(tab?.querySelector('.wb-dock-tab-title')?.textContent).toBe('main.ts');
    expect(tab?.querySelector<HTMLElement>('.codicon-circle-filled')?.hidden).toBe(false);
    expect(tab?.textContent).not.toContain('•');
    dock.setEditorTitle('src/main.ts', 'main.ts');
    expect(tab?.querySelector<HTMLElement>('.codicon-circle-filled')?.hidden).toBe(true);
  });

  it('欢迎是编辑区的默认背景而不是标签，打开第一个文件时才出现第一个标签', () => {
    const { root, dock } = fixture();
    const [area] = emptyGridGroups(dock);
    expect(tabTitles(root)).not.toContain('欢迎');
    expect(root.querySelector('[data-editor-tab-path]')).toBeNull();
    expect(welcomes(root)).toHaveLength(1);
    dock.ensureEditor('first.ts');
    expect(welcomes(root)).toHaveLength(0);
    expect(root.querySelectorAll('[data-editor-tab-path]')).toHaveLength(1);
    expect(dock.api.getPanel('editor:first.ts')?.group).toBe(area);
    expect(emptyGridGroups(dock)).toEqual([]);
    dock.ensureEditor('second.ts');
    expect(welcomes(root)).toHaveLength(0);
    expect(root.querySelectorAll('[data-editor-tab-path]')).toHaveLength(2);
  });

  it('点标签关闭最后一个编辑器，编辑区原地回到欢迎背景，其余分组不动，重开复用同一个组', async () => {
    const { root, dock, callbacks } = fixture();
    dock.ensureEditor('first.ts');
    dock.ensureEditor('second.ts');
    const area = dock.api.getPanel('editor:first.ts')?.group;
    const groups = dock.api.groups.map(group => group.id);
    root.querySelector<HTMLButtonElement>('[aria-label="关闭 first.ts"]')?.click();
    await Promise.resolve();
    expect(welcomes(root)).toHaveLength(0);
    root.querySelector<HTMLButtonElement>('[aria-label="关闭 second.ts"]')?.click();
    await Promise.resolve();
    expect(callbacks.onCloseEditor).toHaveBeenCalledTimes(2);
    expect(emptyGridGroups(dock)).toEqual([area]);
    expect(dock.api.groups.map(group => group.id)).toEqual(groups);
    expect(welcomes(root)).toHaveLength(1);
    expect(area?.element.contains(welcomes(root)[0] ?? null)).toBe(true);
    dock.ensureEditor('again.ts');
    expect(dock.api.getPanel('editor:again.ts')?.group).toBe(area);
    expect(welcomes(root)).toHaveLength(0);
  });

  it('原生 close 关掉最后一个编辑器、分组被 Dockview 收走时，欢迎背景补回编辑区并贴着预览左侧', async () => {
    const { root, dock, callbacks } = fixture();
    dock.ensureEditor('only.ts');
    dock.api.getPanel('editor:only.ts')?.api.close();
    await Promise.resolve();
    expect(callbacks.onCloseEditor).toHaveBeenCalledExactlyOnceWith('only.ts');
    const [area, ...others] = emptyGridGroups(dock);
    expect(others).toEqual([]);
    expect(welcomes(root)).toHaveLength(1);
    expect(area?.element.contains(welcomes(root)[0] ?? null)).toBe(true);
    expect(area).not.toBe(dock.api.getPanel('preview')?.group);
    expect(area).not.toBe(dock.api.getPanel('problems')?.group);
    // 与预览并排成一行，工具组仍独占底部整行，而不是堆成编辑区 / 预览 / 工具三行
    expect(siblingGroupIds(dock, area?.id ?? '').sort()).toEqual(
      [area?.id, dock.api.getPanel('preview')?.group.id].sort()
    );
    dock.ensureEditor('again.ts');
    expect(dock.api.getPanel('editor:again.ts')?.group).toBe(area);
  });

  it('没有预览时补建的编辑区落在底部工具组上方，工具组高度回到默认的 1/3', async () => {
    const { root, dock } = fixture(1200, 900);
    const bottom = dock.api.getPanel('problems')?.group;
    await vi.waitFor(() => expect(bottom?.api.height).toBeCloseTo(300, 0));
    dock.api.getPanel('preview')?.api.close();
    await Promise.resolve();
    dock.ensureEditor('only.ts');
    dock.api.getPanel('editor:only.ts')?.api.close();
    await Promise.resolve();
    const [area, ...others] = emptyGridGroups(dock);
    expect(others).toEqual([]);
    expect(welcomes(root)).toHaveLength(1);
    expect(siblingGroupIds(dock, area?.id ?? '').sort()).toEqual([area?.id, bottom?.id].sort());
    expect(bottom?.api.height).toBeCloseTo(300, 0);
  });

  it('程序移除最后一个编辑器同样回到欢迎背景，不触发关闭回调', () => {
    const { root, dock, callbacks } = fixture();
    dock.ensureEditor('a.ts');
    const area = dock.api.getPanel('editor:a.ts')?.group;
    dock.removeEditor('a.ts');
    expect(emptyGridGroups(dock)).toEqual([area]);
    expect(welcomes(root)).toHaveLength(1);
    expect(callbacks.onCloseEditor).not.toHaveBeenCalled();
  });

  it('重置布局时无编辑器只留一个展示欢迎背景的空编辑组，有编辑器则不留空组', () => {
    const { root, dock } = fixture();
    dock.resetLayout();
    expect(emptyGridGroups(dock)).toHaveLength(1);
    expect(welcomes(root)).toHaveLength(1);
    dock.ensureEditor('main.ts');
    dock.selectEditor('main.ts');
    dock.resetLayout();
    expect(emptyGridGroups(dock)).toEqual([]);
    expect(welcomes(root)).toHaveLength(0);
  });

  it('重置布局时 lastEditor 已不在则回到欢迎背景', async () => {
    const { root, dock } = fixture();
    dock.ensureEditor('gone.ts');
    dock.selectEditor('gone.ts');
    dock.api.getPanel('editor:gone.ts')?.api.close();
    await Promise.resolve();
    dock.resetLayout();
    expect(emptyGridGroups(dock)).toHaveLength(1);
    expect(welcomes(root)).toHaveLength(1);
  });

  it('程序移除不重复close，用户关闭只在Dock移除完成后通知一次', async () => {
    const { dock, callbacks } = fixture();
    dock.ensureEditor('program.ts');
    dock.removeEditor('program.ts');
    dock.removeEditor('program.ts');
    await Promise.resolve();
    expect(callbacks.onCloseEditor).not.toHaveBeenCalled();
    dock.ensureEditor('user.ts');
    callbacks.onCloseEditor.mockImplementation(path => dock.removeEditor(path));
    dock.api.getPanel('editor:user.ts')?.api.close();
    await Promise.resolve();
    expect(callbacks.onCloseEditor).toHaveBeenCalledExactlyOnceWith('user.ts');
    expect(dock.api.getPanel('editor:user.ts')).toBeUndefined();
  });

  it('官方Codicon关闭按钮走Dock原生close', async () => {
    const { root, dock, callbacks } = fixture();
    dock.ensureEditor('closable.ts');
    dock.selectEditor('closable.ts');
    const close = root.querySelector<HTMLButtonElement>('[aria-label="关闭 closable.ts"]');
    expect(close?.querySelector('.codicon.codicon-close')).not.toBeNull();
    close?.click();
    await Promise.resolve();
    expect(callbacks.onCloseEditor).toHaveBeenCalledWith('closable.ts');
  });

  it('关闭期间的活动标签回调触发会话重绘时，不重新创建正在关闭的面板', async () => {
    const { dock, callbacks } = fixture();
    dock.ensureEditor('first.ts');
    dock.ensureEditor('second.ts');
    dock.selectEditor('first.ts');
    callbacks.onSelectEditor.mockImplementation(() => {
      dock.ensureEditor('first.ts');
      dock.ensureEditor('second.ts');
    });
    dock.api.getPanel('editor:first.ts')?.api.close();
    await Promise.resolve();
    expect(callbacks.onCloseEditor).toHaveBeenCalledExactlyOnceWith('first.ts');
    expect(dock.api.getPanel('editor:first.ts')).toBeUndefined();
  });

  it('原生隐藏侧栏保留group，工具关闭后可以复用原日志host重开', async () => {
    const { root, dock, callbacks } = fixture();
    const side = dock.api.getEdgeGroup('left');
    dock.setSidebarVisible(false);
    expect(dock.isSidebarVisible()).toBe(false);
    dock.setSidebarVisible(true);
    expect(dock.isSidebarVisible()).toBe(true);
    expect(dock.api.getEdgeGroup('left')).toBe(side);
    const consoleHost = root.querySelector('[data-log="console"]');
    dock.api.getPanel('console')?.api.close();
    await Promise.resolve();
    dock.showTool('console');
    expect(root.querySelector('[data-log="console"]')).toBe(consoleHost);
    expect(consoleHost?.textContent).toBe('控制台日志');
    expect(callbacks.onSelectTool).toHaveBeenCalledWith('console');
    dock.toggleTools();
    await Promise.resolve();
    expect(dock.api.getPanel('console')).toBeUndefined();
    expect(callbacks.onToggleTool).toHaveBeenLastCalledWith(false);
    dock.toggleTools();
    expect(dock.api.getPanel('console')).toBeDefined();
    expect(callbacks.onToggleTool).toHaveBeenLastCalledWith(true);
  });

  it('分组与重置复用编辑器和预览节点，不关闭Session标签', () => {
    const { root, dock, callbacks } = fixture();
    const first = dock.ensureEditor('first.ts');
    const second = dock.ensureEditor('second.ts');
    dock.selectEditor('second.ts');
    dock.splitEditor();
    expect(dock.api.getPanel('editor:first.ts')?.group).not.toBe(dock.api.getPanel('editor:second.ts')?.group);
    const preview = root.querySelector('.wb-preview');
    const previewParent = preview?.parentElement;
    dock.api.getEdgeGroup('left')?.collapse();
    dock.showPreview();
    dock.resetLayout();
    expect(dock.ensureEditor('first.ts')).toBe(first);
    expect(dock.ensureEditor('second.ts')).toBe(second);
    expect(dock.api.getPanel('editor:first.ts')?.group).toBe(dock.api.getPanel('editor:second.ts')?.group);
    expect(root.querySelector('.wb-preview')).toBe(preview);
    expect(preview?.parentElement).toBe(previewParent);
    expect(dock.api.getEdgeGroup('left')?.isCollapsed()).toBe(false);
    expect(callbacks.onCloseEditor).not.toHaveBeenCalled();
  });

  it('编辑组右侧原生header action用官方图标拆分当前编辑器', () => {
    const { root, dock, callbacks } = fixture();
    dock.ensureEditor('first.ts');
    dock.ensureEditor('second.ts');
    dock.selectEditor('second.ts');
    const group = dock.api.getPanel('editor:second.ts')?.group;
    const actions = root.querySelector<HTMLElement>(`.wb-dock-group-actions[data-group-id="${group?.id}"]`);
    const split = actions?.querySelector<HTMLButtonElement>('[aria-label="向右拆分编辑器组"]');
    expect(split).toBeDefined();
    expect(split).not.toBeNull();
    expect(split?.querySelector('.codicon-split-horizontal')).not.toBeNull();
    split?.click();
    expect(dock.api.getPanel('editor:first.ts')?.group).not.toBe(dock.api.getPanel('editor:second.ts')?.group);
    expect(callbacks.onCloseEditor).not.toHaveBeenCalled();
  });

  it('工具组右侧header action可原生最大化、还原并关闭该工具面板', async () => {
    const { root, dock, callbacks } = fixture();
    const group = dock.api.getPanel('problems')?.group;
    const actions = root.querySelector<HTMLElement>(`.wb-dock-group-actions[data-group-id="${group?.id}"]`);
    const maximize = actions?.querySelector<HTMLButtonElement>('[aria-label="展开面板"]');
    expect(maximize).toBeDefined();
    expect(maximize).not.toBeNull();
    maximize?.click();
    expect(group?.api.isMaximized()).toBe(true);
    actions?.querySelector<HTMLButtonElement>('[aria-label="还原面板大小"]')?.click();
    expect(group?.api.isMaximized()).toBe(false);
    actions?.querySelector<HTMLButtonElement>('[aria-label="关闭面板"]')?.click();
    await Promise.resolve();
    expect(dock.api.getPanel('problems')).toBeUndefined();
    expect(dock.api.getPanel('output')).toBeUndefined();
    expect(dock.api.getPanel('console')).toBeUndefined();
    expect(dock.api.getPanel('preview')).toBeDefined();
    expect(callbacks.onToggleTool).toHaveBeenLastCalledWith(false);
    expect(callbacks.onCloseEditor).not.toHaveBeenCalled();
  });

  it('用户关闭预览通知宿主并回存staging，重开复用section', async () => {
    const { root, dock, callbacks } = fixture();
    const preview = root.querySelector('.wb-preview');
    expect(dock.isPreviewOpen()).toBe(true);
    dock.api.getPanel('preview')?.api.close();
    await Promise.resolve();
    expect(callbacks.onClosePreview).toHaveBeenCalledOnce();
    expect(dock.isPreviewOpen()).toBe(false);
    expect(preview?.parentElement).toBe(root.querySelector('[data-slot="panel-staging"]'));
    dock.showPreview();
    expect(dock.isPreviewOpen()).toBe(true);
    expect(root.querySelector('.wb-preview')).toBe(preview);
  });

  it('重置布局退出工具组最大化并保留面板实例', () => {
    const { dock } = fixture();
    const source = dock.ensureEditor('main.ts');
    const group = dock.api.getPanel('problems')!.group;
    group.api.maximize();
    expect(dock.api.hasMaximizedGroup()).toBe(true);
    dock.resetLayout();
    expect(dock.api.hasMaximizedGroup()).toBe(false);
    expect(dock.ensureEditor('main.ts')).toBe(source);
    expect(dock.api.getPanel('preview')).toBeDefined();
  });

  it('工具面板可见性与关闭重开状态一致', async () => {
    const { dock, callbacks } = fixture();
    expect(dock.isToolsVisible()).toBe(true);
    dock.toggleTools();
    await Promise.resolve();
    expect(dock.isToolsVisible()).toBe(false);
    expect(callbacks.onToggleTool).toHaveBeenLastCalledWith(false);
    dock.toggleTools();
    expect(dock.isToolsVisible()).toBe(true);
  });

  it('释放幂等，销毁Dock不等于用户关闭所有编辑标签', async () => {
    const { dock, callbacks } = fixture();
    dock.ensureEditor('first.ts');
    dock.dispose();
    dock.dispose();
    await Promise.resolve();
    expect(callbacks.onCloseEditor).not.toHaveBeenCalled();
  });
});

describe('底部工具面板标签', () => {
  const kinds = ['problems', 'output', 'console', 'terminal'] as const;
  const toolTab = (kind: string): HTMLElement => {
    const tab = document.querySelector<HTMLElement>(`[data-panel="${kind}"]`);
    if (!tab) throw new Error(`工具标签缺失 ${kind}`);
    return tab;
  };
  const openMenu = (target: Element): void => {
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 60 }));
  };
  const menuItems = (): HTMLButtonElement[] => [
    ...document.querySelectorAll<HTMLButtonElement>('.wb-context-menu button')
  ];
  const menuItem = (label: string): HTMLButtonElement => {
    const item = menuItems().find(entry => entry.textContent === label);
    if (!item) throw new Error(`菜单缺少 ${label}`);
    return item;
  };
  /** 经右键菜单切换一个工具的显隐，与用户操作一致。 */
  const toggle = (label: string, anchor = 'terminal'): void => {
    openMenu(toolTab(anchor));
    menuItem(label).click();
  };
  const present = (dock: WorkbenchDockview): string[] => kinds.filter(kind => dock.api.getPanel(kind));
  const order = (dock: WorkbenchDockview): string[] | undefined =>
    dock.api.getPanel('terminal')?.group.panels.map(panel => panel.id);

  it('工具标签只有文字：没有图标、没有关闭按钮，中键也不关闭', async () => {
    const { dock } = fixture();
    for (const kind of kinds) {
      const tab = toolTab(kind);
      expect(tab.classList.contains('wb-dock-tab-tool')).toBe(true);
      expect(tab.querySelector('.codicon')).toBeNull();
      expect(tab.querySelector('button')).toBeNull();
      tab.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
    }
    expect(toolTab('output').textContent).toBe('输出');
    await Promise.resolve();
    await Promise.resolve();
    expect(present(dock)).toEqual([...kinds]);
  });

  it('只有工具组带 wb-tool-group 标记，编辑器组与预览组没有', () => {
    const { dock } = fixture();
    dock.ensureEditor('main.ts');
    const marked = (id: string) => dock.api.getPanel(id)?.group.element.classList.contains('wb-tool-group');
    expect(marked('problems')).toBe(true);
    expect(marked('editor:main.ts')).toBe(false);
    expect(marked('preview')).toBe(false);
  });

  it('右键工具标签弹出带勾选的开关菜单', () => {
    fixture();
    openMenu(toolTab('output'));
    const items = menuItems();
    expect(items.map(item => item.textContent)).toEqual(['问题', '输出', 'Console', '终端']);
    expect(items.map(item => item.getAttribute('role'))).toEqual(kinds.map(() => 'menuitemcheckbox'));
    expect(items.map(item => item.getAttribute('aria-checked'))).toEqual(kinds.map(() => 'true'));
    expect(items.every(item => item.querySelector('.codicon-check') !== null)).toBe(true);
    expect(items.every(item => !item.disabled)).toBe(true);
  });

  it('取消勾选隐藏该工具并回存宿主，重新勾选按原顺序放回同一宿主', () => {
    const { root, dock, callbacks } = fixture();
    const host = root.querySelector('[data-log="output"]');
    callbacks.onToggleTool.mockClear();
    toggle('输出', 'problems');
    expect(present(dock)).toEqual(['problems', 'console', 'terminal']);
    expect(host?.parentElement).toBe(root.querySelector('[data-slot="panel-staging"]'));
    expect(document.querySelector('.wb-context-menu')).toBeNull();
    // 其余工具还在，底部面板没有整体关闭
    expect(callbacks.onToggleTool).not.toHaveBeenCalled();
    expect(dock.isToolsVisible()).toBe(true);

    openMenu(toolTab('problems'));
    expect(menuItem('输出').getAttribute('aria-checked')).toBe('false');
    expect(menuItem('输出').querySelector('.codicon-check')).toBeNull();
    menuItem('输出').click();
    expect(root.querySelector('[data-log="output"]')).toBe(host);
    expect(order(dock)).toEqual([...kinds]);
    expect(dock.api.getPanel('output')?.api.isActive).toBe(true);
    expect(callbacks.onSelectTool).toHaveBeenLastCalledWith('output');
  });

  it('隐藏当前活动的工具后，改选留下的工具并通知宿主', () => {
    const { dock, callbacks } = fixture();
    dock.showTool('output');
    callbacks.onSelectTool.mockClear();
    toggle('输出');
    const active = dock.api.getPanel('problems')?.group.activePanel?.id;
    expect(active).toBeDefined();
    expect(active).not.toBe('output');
    expect(callbacks.onSelectTool).toHaveBeenCalledExactlyOnceWith(active);
  });

  it('隐藏不活动的工具不改变选中项，也不通知宿主', () => {
    const { dock, callbacks } = fixture();
    dock.showTool('terminal');
    callbacks.onSelectTool.mockClear();
    toggle('Console');
    expect(dock.api.getPanel('terminal')?.api.isActive).toBe(true);
    expect(callbacks.onSelectTool).not.toHaveBeenCalled();
  });

  it('最后一个工具的条目禁用，底部面板不会被隐藏光', () => {
    const { dock } = fixture();
    for (const label of ['问题', '输出', 'Console']) toggle(label);
    expect(present(dock)).toEqual(['terminal']);
    openMenu(toolTab('terminal'));
    const last = menuItem('终端');
    expect(last.disabled).toBe(true);
    expect(last.getAttribute('aria-checked')).toBe('true');
    last.click();
    expect(present(dock)).toEqual(['terminal']);
  });

  it('右键工具组标签栏空白处弹出同一个菜单，编辑器组不弹', () => {
    const { dock } = fixture();
    dock.ensureEditor('main.ts');
    const blank = (id: string) => dock.api.getPanel(id)?.group.element.querySelector('.dv-void-container');
    const editorBlank = blank('editor:main.ts');
    if (!editorBlank) throw new Error('编辑器组标签栏缺失');
    openMenu(editorBlank);
    expect(document.querySelector('.wb-context-menu')).toBeNull();
    const toolBlank = blank('terminal');
    if (!toolBlank) throw new Error('工具组标签栏缺失');
    openMenu(toolBlank);
    expect(menuItems().map(item => item.textContent)).toEqual(['问题', '输出', 'Console', '终端']);
  });

  it('菜单按 Escape 关闭，点到菜单外也关闭', () => {
    fixture();
    openMenu(toolTab('console'));
    const menu = document.querySelector<HTMLElement>('.wb-context-menu');
    expect(menu).not.toBeNull();
    menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.querySelector('.wb-context-menu')).toBeNull();
    openMenu(toolTab('console'));
    expect(document.querySelector('.wb-context-menu')).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.querySelector('.wb-context-menu')).toBeNull();
  });

  it('触屏长按工具标签同样弹出菜单', () => {
    vi.useFakeTimers();
    fixture();
    toolTab('output').dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(500);
    expect(menuItems().map(item => item.textContent)).toEqual(['问题', '输出', 'Console', '终端']);
  });

  it('被拖进编辑器组的工具标签也能右键隐藏', () => {
    const { dock } = fixture();
    dock.ensureEditor('main.ts');
    const editorGroup = dock.api.getPanel('editor:main.ts')?.group;
    if (!editorGroup) throw new Error('编辑器组缺失');
    dock.api.getPanel('console')?.api.moveTo({ group: editorGroup, position: 'center' });
    expect(editorGroup.element.classList.contains('wb-tool-group')).toBe(false);
    toggle('Console', 'console');
    expect(dock.api.getPanel('console')).toBeUndefined();
    expect(present(dock)).toEqual(['problems', 'output', 'terminal']);
  });

  it('隐藏的工具在整体关闭再打开后仍然隐藏，显示其他工具也不会带回，显式显示才恢复', async () => {
    const { dock } = fixture();
    toggle('Console');
    dock.toggleTools();
    await Promise.resolve();
    expect(dock.isToolsVisible()).toBe(false);
    dock.toggleTools();
    expect(present(dock)).toEqual(['problems', 'output', 'terminal']);
    dock.showTool('problems');
    expect(dock.api.getPanel('console')).toBeUndefined();
    dock.showTool('console');
    expect(present(dock)).toEqual([...kinds]);
  });

  it('整体关闭再打开回到上次选中的工具', async () => {
    const { dock } = fixture();
    dock.showTool('terminal');
    dock.toggleTools();
    await Promise.resolve();
    dock.toggleTools();
    expect(dock.api.getPanel('terminal')?.api.isActive).toBe(true);
  });

  it('重置布局把隐藏的工具全部找回', () => {
    const { dock } = fixture();
    toggle('输出');
    toggle('Console');
    dock.resetLayout();
    expect(present(dock)).toEqual([...kinds]);
    expect(order(dock)).toEqual([...kinds]);
  });

  it('布局不记隐藏的工具，按这份布局还原后它们保持隐藏', () => {
    const { dock } = fixture();
    toggle('Console');
    const layout = JSON.parse(JSON.stringify(dock.serializeLayout())) as SerializedDockview;
    expect(Object.keys(layout.panels)).not.toContain('console');
    dock.resetLayout();
    expect(present(dock)).toEqual([...kinds]);
    expect(dock.applyLayout(layout)).toBe(true);
    expect(present(dock)).toEqual(['problems', 'output', 'terminal']);
    dock.showTool('problems');
    expect(dock.api.getPanel('console')).toBeUndefined();
  });

  it('按底部面板关闭的布局还原后，所有工具重新可用', () => {
    const closed = fixture();
    toggle('Console');
    closed.dock.toggleTools();
    const layout = JSON.parse(JSON.stringify(closed.dock.serializeLayout())) as SerializedDockview;
    const { dock } = fixture();
    expect(dock.applyLayout(layout)).toBe(true);
    expect(dock.isToolsVisible()).toBe(false);
    dock.showTool('terminal');
    expect(present(dock)).toEqual([...kinds]);
  });
});

describe('移动端侧栏抽屉', () => {
  it('抽屉模式把侧栏挂到工作台根，可见状态随抽屉切换', () => {
    const { root, dock } = fixture();
    expect(dock.isSidebarVisible()).toBe(true);
    dock.setSidebarOverlay(true);
    expect(root.classList.contains('wb-side-overlay')).toBe(true);
    const side = root.querySelector<HTMLElement>('.wb-side');
    expect(side?.parentElement).toBe(root);
    expect(side?.classList.contains('wb-side-open')).toBe(true);
    expect(dock.isSidebarVisible()).toBe(true);
    dock.setSidebarVisible(false);
    expect(side?.classList.contains('wb-side-open')).toBe(false);
    expect(dock.isSidebarVisible()).toBe(false);
    dock.setSidebarVisible(true);
    expect(side?.classList.contains('wb-side-open')).toBe(true);
    expect(dock.isSidebarVisible()).toBe(true);
  });

  it('遮罩点击通知宿主收起侧栏', () => {
    const { root, dock, callbacks } = fixture();
    dock.setSidebarOverlay(true);
    root.querySelector<HTMLElement>('.wb-side-scrim')?.click();
    expect(callbacks.onCloseSidebar).toHaveBeenCalledOnce();
  });

  it('退出抽屉模式把侧栏还回 Dockview 并恢复可见状态', () => {
    const { root, dock } = fixture();
    dock.setSidebarVisible(false);
    dock.setSidebarOverlay(true);
    expect(root.classList.contains('wb-side-overlay')).toBe(true);
    dock.setSidebarOverlay(false);
    expect(root.classList.contains('wb-side-overlay')).toBe(false);
    const side = root.querySelector<HTMLElement>('.wb-side');
    expect(root.querySelector('[data-slot="dockview"]')?.contains(side)).toBe(true);
    expect(dock.api.getPanel('sidebar')).toBeDefined();
    expect(dock.isSidebarVisible()).toBe(false);
    expect(side?.classList.contains('wb-side-open')).toBe(false);
    expect(root.querySelector('.wb-side-scrim')).toBeNull();
    expect(dock.api.getEdgeGroup('left')).toBeDefined();
    expect(dock.api.isEdgeGroupVisible('left')).toBe(false);
  });

  it('抽屉模式下重置布局保持抽屉形态', () => {
    const { root, dock } = fixture();
    dock.setSidebarOverlay(true);
    dock.setSidebarVisible(false);
    dock.resetLayout();
    expect(root.classList.contains('wb-side-overlay')).toBe(true);
    expect(dock.isSidebarVisible()).toBe(false);
    expect(root.querySelector<HTMLElement>('.wb-side')?.parentElement).toBe(root);
  });
});

describe('移动端尺寸与拆分', () => {
  it('窄屏首布局把预览宽度缩到 45%，宽屏保持 400', async () => {
    const narrow = fixture(0, 0);
    narrow.dock.setSidebarOverlay(true);
    narrow.dock.api.layout(390, 800);
    const narrowPreview = narrow.dock.api.getPanel('preview');
    await vi.waitFor(() => expect(narrowPreview?.group.api.width).toBeCloseTo(176, 0));
    const wide = fixture(1200, 800);
    const widePreview = wide.dock.api.getPanel('preview');
    await vi.waitFor(() => expect(widePreview?.group.api.width).toBeCloseTo(400, 0));
  });

  it('首布局后兜底重建边缘组，修复 overlay 定位竞态', async () => {
    const { root, dock } = fixture(0, 0);
    const container = root.querySelector<HTMLElement>('[data-slot="dockview"]');
    if (!container) throw new Error('dockview 容器缺失');
    Object.defineProperty(container, 'clientWidth', { value: 390 });
    Object.defineProperty(container, 'clientHeight', { value: 800 });
    dock.api.layout(390, 800);
    const side = root.querySelector<HTMLElement>('.wb-side');
    await vi.waitFor(() => expect(dock.api.getPanel('sidebar')).toBeDefined());
    expect(root.querySelector<HTMLElement>('.wb-side')).toBe(side);
    expect(dock.api.getEdgeGroup('left')).toBeDefined();
  });

  it('refreshLayout 检测侧栏内容高度为 0 时重建边缘组，健康时只强制重布局', async () => {
    const { root, dock } = fixture(1200, 800);
    const container = root.querySelector<HTMLElement>('[data-slot="dockview"]');
    if (!container) throw new Error('dockview 容器缺失');
    const layout = vi.spyOn(dock.api, 'layout');
    // 损坏状态：侧栏内容高度为 0（happy-dom 无布局，恒触发重建路径）
    const side = root.querySelector<HTMLElement>('.wb-side');
    dock.refreshLayout();
    await Promise.resolve();
    expect(root.querySelector<HTMLElement>('.wb-side')).toBe(side);
    expect(dock.api.getPanel('sidebar')).toBeDefined();
    expect(dock.api.getEdgeGroup('left')).toBeDefined();
    expect(dock.isSidebarVisible()).toBe(true);
    // 健康状态：mock 高度非零，只走强制重布局
    Object.defineProperty(side!, 'clientHeight', { value: 800 });
    Object.defineProperty(container, 'clientWidth', { value: 1180 });
    Object.defineProperty(container, 'clientHeight', { value: 760 });
    dock.refreshLayout();
    expect(layout).toHaveBeenCalledWith(1180, 760, true);
  });

  it('窄屏拆分编辑器到下方，宽屏到右侧', () => {
    const narrow = fixture(390, 800);
    narrow.dock.ensureEditor('a.ts');
    narrow.dock.ensureEditor('b.ts');
    narrow.dock.selectEditor('b.ts');
    const narrowPanel = narrow.dock.api.getPanel('editor:b.ts');
    const narrowGroup = narrowPanel!.group;
    const narrowMove = vi.spyOn(narrowPanel!.api, 'moveTo');
    narrow.dock.splitEditor();
    expect(narrowMove).toHaveBeenCalledWith({ group: narrowGroup, position: 'bottom' });

    const wide = fixture(1200, 800);
    wide.dock.ensureEditor('a.ts');
    wide.dock.ensureEditor('b.ts');
    wide.dock.selectEditor('b.ts');
    const widePanel = wide.dock.api.getPanel('editor:b.ts');
    const wideGroup = widePanel!.group;
    const wideMove = vi.spyOn(widePanel!.api, 'moveTo');
    wide.dock.splitEditor();
    expect(wideMove).toHaveBeenCalledWith({ group: wideGroup, position: 'right' });
  });

  it('编辑器标签触屏长按弹出右键菜单', () => {
    vi.useFakeTimers();
    const { root, dock } = fixture();
    dock.ensureEditor('long.ts');
    dock.selectEditor('long.ts');
    const tab = root.querySelector<HTMLElement>('[data-editor-tab-path="long.ts"]');
    if (!tab) throw new Error('编辑器标签缺失');
    tab.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(500);
    const menu = root.querySelector<HTMLElement>('.wb-context-menu');
    expect(menu).not.toBeNull();
    const labels = [...(menu?.querySelectorAll('button') ?? [])].map(item => item.textContent);
    expect(labels).toEqual(['关闭', '关闭其他', '关闭右侧']);
  });
});

describe('布局持久化', () => {
  /** 在一个工作台里摆好布局再导出，经 JSON 往返模拟落库后再读回的布局。 */
  function exported(arrange: (dock: WorkbenchDockview) => void): SerializedDockview {
    const { dock } = fixture();
    arrange(dock);
    return JSON.parse(JSON.stringify(dock.serializeLayout())) as SerializedDockview;
  }
  const splitEditors = (dock: WorkbenchDockview): void => {
    dock.ensureEditor('first.ts');
    dock.ensureEditor('second.ts');
    dock.selectEditor('second.ts');
    dock.splitEditor();
  };
  const emptyGroups = (dock: WorkbenchDockview) => dock.api.groups.filter(group => group.panels.length === 0);

  it('导出布局不含辅助差异面板，面板只记 id 与组件名', () => {
    const { dock } = fixture();
    dock.ensureEditor('src/a.ts');
    dock.ensureAuxiliary('diff:working:src/a.ts', 'a.ts · 工作区差异');
    const layout = dock.serializeLayout();
    expect(Object.keys(layout.panels).sort()).toEqual([
      'console',
      'editor:src/a.ts',
      'output',
      'preview',
      'problems',
      'sidebar',
      'terminal'
    ]);
    expect(layout.panels['editor:src/a.ts']).toEqual({ id: 'editor:src/a.ts', contentComponent: 'editor' });
    expect(JSON.stringify(layout)).not.toContain('diff:working');
    expect(layout.edgeGroups?.left).toMatchObject({ size: 300, visible: true });
  });

  it('按布局还原拆分的编辑器组与侧栏、底部面板、预览的显隐，复用原宿主且不回调会话', async () => {
    const layout = exported(dock => {
      splitEditors(dock);
      dock.setSidebarVisible(false);
      dock.toggleTools();
      dock.api.getPanel('preview')?.api.close();
    });
    const { root, dock, callbacks } = fixture();
    const first = dock.ensureEditor('first.ts');
    const second = dock.ensureEditor('second.ts');
    expect(dock.applyLayout(layout)).toBe(true);
    expect(dock.api.getPanel('editor:first.ts')?.group).not.toBe(dock.api.getPanel('editor:second.ts')?.group);
    expect(dock.ensureEditor('first.ts')).toBe(first);
    expect(dock.ensureEditor('second.ts')).toBe(second);
    expect(root.querySelector('[data-slot="dockview"]')?.contains(first)).toBe(true);
    expect(dock.isSidebarVisible()).toBe(false);
    expect(dock.api.getPanel('sidebar')?.group.id).toBe('sidebar');
    expect(dock.isToolsVisible()).toBe(false);
    expect(callbacks.onToggleTool).toHaveBeenLastCalledWith(false);
    expect(dock.isPreviewOpen()).toBe(false);
    expect(callbacks.onClosePreview).toHaveBeenCalledOnce();
    const staging = root.querySelector('[data-slot="panel-staging"]');
    expect(staging?.querySelector('[data-log="problems"]')).not.toBeNull();
    expect(staging?.querySelector('.wb-preview')).not.toBeNull();
    expect(emptyGroups(dock)).toEqual([]);
    await Promise.resolve();
    expect(callbacks.onCloseEditor).not.toHaveBeenCalled();
    expect(callbacks.onSelectEditor).not.toHaveBeenCalled();
  });

  it('只排布已打开的编辑器：布局中未打开的被忽略并回收空组，已打开而布局里没有的回到编辑区', async () => {
    const layout = exported(splitEditors);
    const { root, dock, callbacks } = fixture();
    dock.ensureEditor('second.ts');
    const third = dock.ensureEditor('third.ts');
    expect(dock.applyLayout(layout)).toBe(true);
    expect(dock.api.getPanel('editor:first.ts')).toBeUndefined();
    expect(dock.api.getPanel('editor:third.ts')?.group).toBe(dock.api.getPanel('editor:second.ts')?.group);
    expect(dock.ensureEditor('third.ts')).toBe(third);
    expect(welcomes(root)).toHaveLength(0);
    expect(emptyGroups(dock)).toEqual([]);
    await Promise.resolve();
    expect(callbacks.onCloseEditor).not.toHaveBeenCalled();
  });

  it('布局里的编辑器都没打开时，欢迎背景占据原编辑区，空组只留这一个', () => {
    const layout = exported(splitEditors);
    const { root, dock } = fixture();
    expect(dock.applyLayout(layout)).toBe(true);
    const [area, ...others] = emptyGroups(dock);
    expect(others).toEqual([]);
    expect(area).not.toBe(dock.api.getPanel('preview')?.group);
    expect(area).not.toBe(dock.api.getPanel('problems')?.group);
    expect(welcomes(root)).toHaveLength(1);
    expect(area?.element.contains(welcomes(root)[0] ?? null)).toBe(true);
  });

  it('无编辑器时导出的布局不含欢迎面板，空编辑组原样记下并能还原', () => {
    const layout = exported(() => undefined);
    expect(Object.keys(layout.panels)).not.toContain('welcome');
    const { root, dock } = fixture();
    dock.ensureEditor('late.ts');
    expect(dock.applyLayout(layout)).toBe(true);
    expect(emptyGroups(dock)).toEqual([]);
    dock.removeEditor('late.ts');
    expect(emptyGroups(dock)).toHaveLength(1);
    expect(welcomes(root)).toHaveLength(1);
  });

  it('旧版布局里残留的欢迎面板被丢弃，其所在组按空编辑区展示欢迎背景', () => {
    const legacy: SerializedDockview = JSON.parse(JSON.stringify(exported(() => undefined)));
    // 旧版在无编辑器时把「欢迎」面板写进编辑组：给空叶子补上它，模拟旧布局记录
    const addLegacyWelcome = (node: GridNode): boolean => {
      if (Array.isArray(node.data)) return node.data.some(addLegacyWelcome);
      if (node.data.views.length > 0) return false;
      node.data.views.push('welcome');
      node.data.activeView = 'welcome';
      return true;
    };
    expect(addLegacyWelcome(legacy.grid.root)).toBe(true);
    legacy.panels['welcome'] = { id: 'welcome', contentComponent: 'welcome', title: '欢迎', renderer: 'always' };
    const { root, dock } = fixture();
    expect(dock.applyLayout(legacy)).toBe(true);
    expect(dock.api.getPanel('welcome')).toBeUndefined();
    expect(emptyGroups(dock)).toHaveLength(1);
    expect(welcomes(root)).toHaveLength(1);
    expect(tabTitles(root)).not.toContain('欢迎');
  });

  it('结构非法的布局不改动现有布局', () => {
    const { dock } = fixture();
    dock.ensureEditor('main.ts');
    const before = JSON.stringify(dock.api.toJSON());
    for (const value of [null, 'layout', { grid: { root: { type: 'leaf' } } }])
      expect(dock.applyLayout(value)).toBe(false);
    expect(JSON.stringify(dock.api.toJSON())).toBe(before);
  });

  it('抽屉模式下侧栏不进布局：窄屏应用桌面布局仍留在抽屉，桌面应用抽屉布局保留原侧栏', () => {
    const desktop = exported(() => undefined);
    const overlay = exported(dock => dock.setSidebarOverlay(true));
    expect(overlay).not.toHaveProperty('edgeGroups');
    expect(overlay.panels).not.toHaveProperty('sidebar');

    const narrow = fixture();
    narrow.dock.setSidebarOverlay(true);
    expect(narrow.dock.applyLayout(desktop)).toBe(true);
    expect(narrow.dock.api.getEdgeGroup('left')).toBeUndefined();
    expect(narrow.root.querySelector('.wb-side')?.parentElement).toBe(narrow.root);

    const wide = fixture();
    expect(wide.dock.applyLayout(overlay)).toBe(true);
    expect(wide.dock.api.getPanel('sidebar')?.group.id).toBe('sidebar');
    expect(wide.dock.isSidebarVisible()).toBe(true);
    expect(wide.dock.api.getGroup('sidebar')?.api.locked).toBe('no-drop-target');
  });

  it('还原后的首次非零布局不再套用默认尺寸', async () => {
    const layout = exported(dock => {
      dock.api.getEdgeGroup('left')?.setSize({ width: 320 });
      dock.api.getPanel('problems')?.group.api.setSize({ height: 260 });
    });
    expect(layout.edgeGroups?.left?.size).toBe(320);
    const { dock } = fixture();
    expect(dock.applyLayout(layout)).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(dock.serializeLayout().edgeGroups?.left?.size).toBe(320);
    expect(dock.api.getPanel('problems')?.group.api.height).toBeCloseTo(260, 0);
  });
});

describe('Markdown 预览的编辑器组入口', () => {
  it('Markdown 标签显示预览动作，普通代码不显示', () => {
    const { root, dock, callbacks } = fixture();
    dock.ensureEditor('README.md');
    dock.selectEditor('README.md');
    const button = root.querySelector<HTMLButtonElement>('[data-markdown-preview]:not([hidden])')!;
    expect(button).not.toBeNull();
    button.click();
    expect(callbacks.onPreviewMarkdown).toHaveBeenCalledWith('README.md');
    dock.ensureEditor('main.ts');
    dock.selectEditor('main.ts');
    expect(root.querySelector('[data-markdown-preview]:not([hidden])')).toBeNull();
  });

  it('侧边预览独立成组，默认辅助面板仍在当前组', () => {
    const { dock } = fixture();
    dock.ensureEditor('README.md');
    dock.ensureAuxiliary('markdown-extension', 'Markdown 预览', 'right');
    expect(dock.api.getPanel('markdown-extension')!.group.id).not.toBe(dock.api.getPanel('editor:README.md')!.group.id);
  });
});
