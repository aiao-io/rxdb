// @vitest-environment happy-dom
import type { SerializedDockview } from 'dockview-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkbenchDockview, type WorkbenchDockview } from './workbench-dockview.js';

const instances: WorkbenchDockview[] = [];

function fixture(width = 1200, height = 800) {
  const root = document.createElement('section');
  root.innerHTML =
    '<main data-slot="dockview"></main><div data-slot="panel-staging" hidden><aside class="wb-side">资源</aside><div class="wb-welcome">欢迎</div><section class="wb-preview"><div class="wb-preview-content"></div></section><section class="wb-panel" data-log="problems">问题日志</section><section class="wb-panel" data-log="output">输出日志</section><section class="wb-panel" data-log="console">控制台日志</section><section class="wb-panel" data-log="terminal">终端内容</section></div>';
  document.body.append(root);
  const callbacks = {
    onSelectEditor: vi.fn(),
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

describe('Dockview 工作台布局', () => {
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

  it('首次非零布局把底部设为180px，后续尺寸变化保留用户调整', async () => {
    const { dock } = fixture();
    const bottom = dock.api.getPanel('problems')?.group;
    if (!bottom) throw new Error('工具group缺失');
    await vi.waitFor(() => expect(bottom.api.height).toBeCloseTo(180, 0));
    bottom.api.setSize({ height: 260 });
    await vi.waitFor(() => expect(bottom.api.height).toBeCloseTo(260, 0));
    dock.api.layout(1400, 800);
    await Promise.resolve();
    expect(bottom.api.height).toBeCloseTo(260, 0);
    dock.api.layout(1400, 900);
    await Promise.resolve();
    expect(bottom.api.height).not.toBeCloseTo(180, 0);
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
    expect(dock.api.getPanel('welcome')).toBeUndefined();
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

  it('欢迎页是无编辑器时的默认页，打开第一个编辑器即被替换', () => {
    const { root, dock } = fixture();
    const welcome = root.querySelector('.wb-welcome');
    expect(dock.api.getPanel('welcome')?.api.isActive).toBe(true);
    expect(root.querySelector<HTMLElement>('[aria-label="关闭 欢迎"]')).toBeNull();
    dock.ensureEditor('first.ts');
    expect(dock.api.getPanel('welcome')).toBeUndefined();
    expect(welcome?.parentElement).toBe(root.querySelector('[data-slot="panel-staging"]'));
    dock.ensureEditor('second.ts');
    expect(dock.api.getPanel('welcome')).toBeUndefined();
  });

  it('关闭最后一个编辑器时欢迎页回归并激活，重开编辑器再次替换', async () => {
    const { root, dock, callbacks } = fixture();
    const welcome = root.querySelector('.wb-welcome');
    dock.ensureEditor('first.ts');
    dock.ensureEditor('second.ts');
    dock.api.getPanel('editor:first.ts')?.api.close();
    await Promise.resolve();
    expect(dock.api.getPanel('welcome')).toBeUndefined();
    dock.api.getPanel('editor:second.ts')?.api.close();
    await Promise.resolve();
    expect(callbacks.onCloseEditor).toHaveBeenCalledTimes(2);
    const panel = dock.api.getPanel('welcome');
    expect(panel).toBeDefined();
    expect(panel?.api.isActive).toBe(true);
    expect(panel?.group).not.toBe(dock.api.getPanel('preview')?.group);
    expect(panel?.group).not.toBe(dock.api.getPanel('problems')?.group);
    expect(root.querySelector('.wb-welcome')).toBe(welcome);
    dock.ensureEditor('again.ts');
    expect(dock.api.getPanel('welcome')).toBeUndefined();
    expect(welcome?.parentElement).toBe(root.querySelector('[data-slot="panel-staging"]'));
  });

  it('程序移除最后一个编辑器同样恢复欢迎页，不触发关闭回调', () => {
    const { dock, callbacks } = fixture();
    dock.ensureEditor('a.ts');
    dock.removeEditor('a.ts');
    expect(dock.api.getPanel('welcome')?.api.isActive).toBe(true);
    expect(callbacks.onCloseEditor).not.toHaveBeenCalled();
  });

  it('重置布局时无编辑器展示欢迎页，有编辑器保持替换状态', () => {
    const { dock } = fixture();
    dock.resetLayout();
    expect(dock.api.getPanel('welcome')?.api.isActive).toBe(true);
    dock.ensureEditor('main.ts');
    dock.selectEditor('main.ts');
    dock.resetLayout();
    expect(dock.api.getPanel('welcome')).toBeUndefined();
  });

  it('重置布局时 lastEditor 已不在则回落到欢迎页', async () => {
    const { dock } = fixture();
    dock.ensureEditor('gone.ts');
    dock.selectEditor('gone.ts');
    dock.api.getPanel('editor:gone.ts')?.api.close();
    await Promise.resolve();
    dock.resetLayout();
    expect(dock.api.getPanel('welcome')?.api.isActive).toBe(true);
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
    const { dock, callbacks } = fixture();
    dock.ensureEditor('second.ts');
    const third = dock.ensureEditor('third.ts');
    expect(dock.applyLayout(layout)).toBe(true);
    expect(dock.api.getPanel('editor:first.ts')).toBeUndefined();
    expect(dock.api.getPanel('editor:third.ts')?.group).toBe(dock.api.getPanel('editor:second.ts')?.group);
    expect(dock.ensureEditor('third.ts')).toBe(third);
    expect(dock.api.getPanel('welcome')).toBeUndefined();
    expect(emptyGroups(dock)).toEqual([]);
    await Promise.resolve();
    expect(callbacks.onCloseEditor).not.toHaveBeenCalled();
  });

  it('布局里的编辑器都没打开时，欢迎页占据原编辑区', () => {
    const layout = exported(splitEditors);
    const { dock } = fixture();
    expect(dock.applyLayout(layout)).toBe(true);
    const welcome = dock.api.getPanel('welcome');
    expect(welcome).toBeDefined();
    expect(welcome?.group).not.toBe(dock.api.getPanel('preview')?.group);
    expect(welcome?.group).not.toBe(dock.api.getPanel('problems')?.group);
    expect(emptyGroups(dock)).toEqual([]);
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
