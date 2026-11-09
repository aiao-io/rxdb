// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkbenchDockview, type WorkbenchDockview } from './workbench-dockview.js';

const instances: WorkbenchDockview[] = [];
afterEach(() => {
  instances.splice(0).forEach(dock => dock.dispose());
  document.body.replaceChildren();
});

function fixture() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = host;
  root.innerHTML =
    '<main data-slot="dockview"></main><div data-slot="panel-staging" hidden><aside class="wb-side"></aside><template data-slot="welcome"><div class="wb-welcome">欢迎</div></template><section class="wb-preview"></section><section class="wb-panel" data-log="problems"></section><section class="wb-panel" data-log="output"></section><section class="wb-panel" data-log="console"></section><section class="wb-panel" data-log="terminal"></section></div>';
  const dock = createWorkbenchDockview(root, {
    onSelectEditor: vi.fn(),
    onCloseEditor: vi.fn(),
    onSelectTool: vi.fn()
  });
  instances.push(dock);
  const container = document.createElement('div');
  root.querySelector('.wb-side')!.append(container);
  dock.views.addContainer({ id: 'explorer', element: container });
  for (const id of ['workspace', 'open-editors']) {
    const element = document.createElement('div');
    element.innerHTML = `<input aria-label="${id}" value="未提交状态"><button>操作</button>`;
    const header = document.createElement('div');
    header.textContent = id;
    dock.views.addView({ id, title: id, element, header, containerId: 'explorer', size: 240, expanded: true });
  }
  dock.api.layout(1200, 800);
  dock.views.getContainerApi('explorer').layout(300, 700);
  dock.showTool('terminal');
  return { root, dock, container };
}

describe('可移动工作台视图', () => {
  it('区块可以同时展开，调高与排序后仍保留正文实例和事件', () => {
    const { dock } = fixture();
    const panes = dock.views.getContainerApi('explorer');
    const content = dock.views.getView('workspace').element;
    const action = vi.fn();
    content.querySelector('button')!.onclick = action;
    panes.getPanel('workspace')!.api.setSize({ size: 310 });
    panes.movePanel(0, 1);
    expect(panes.panels.map(panel => panel.id)).toEqual(['open-editors', 'workspace']);
    expect(panes.panels.every(panel => panel.api.isExpanded)).toBe(true);
    expect(dock.views.getView('workspace').element).toBe(content);
    content.querySelector('button')!.click();
    expect(action).toHaveBeenCalledOnce();
  });

  it('侧栏视图进入终端标签的指定序号，再回到侧栏时不触发关闭或丢失正文', async () => {
    const { dock } = fixture();
    const content = dock.views.getView('workspace').element;
    content.querySelector('input')!.value = '保留草稿';
    const terminal = dock.api.getPanel('terminal')!;
    dock.views.moveToDock('workspace', { referenceGroup: terminal.group, direction: 'within', index: 0 });
    expect(terminal.group.panels[0]?.id).toBe('workspace');
    expect(dock.views.getContainerApi('explorer').getPanel('workspace')).toBeUndefined();
    expect(content.closest('[data-view-parking]')).toBeNull();
    dock.views.moveToContainer('workspace', 1);
    await Promise.resolve();
    expect(dock.api.getPanel('workspace')).toBeUndefined();
    expect(dock.views.getContainerApi('explorer').panels.map(panel => panel.id)).toEqual(['open-editors', 'workspace']);
    expect(content.querySelector('input')!.value).toBe('保留草稿');
    expect(content.closest('.dv-pane')).not.toBeNull();
    expect(dock.api.getPanel('terminal')?.group.element.classList.contains('wb-tool-group')).toBe(true);
  });

  it('视图与终端混合时保留面板工具，整体关闭重开恢复视图', () => {
    const { dock } = fixture();
    const terminal = dock.api.getPanel('terminal')!;
    dock.views.moveToDock('workspace', { referenceGroup: terminal.group, direction: 'within' });
    expect(terminal.group.element.classList.contains('wb-tool-group')).toBe(true);
    dock.toggleTools();
    expect(dock.api.getPanel('workspace')).toBeUndefined();
    expect(dock.isToolsVisible()).toBe(false);
    dock.toggleTools();
    expect(dock.api.getPanel('workspace')).toBeDefined();
    expect(dock.api.getPanel('workspace')?.group).toBe(dock.api.getPanel('terminal')?.group);
  });

  it('迁移目标创建失败时还原来源、顺序和正文', () => {
    const { dock } = fixture();
    const content = dock.views.getView('workspace').element;
    vi.spyOn(dock.api, 'addPanel').mockImplementationOnce(() => {
      throw new Error('创建失败');
    });
    expect(() => dock.views.moveToDock('workspace', { direction: 'below' })).toThrow('创建失败');
    expect(dock.views.getContainerApi('explorer').panels.map(panel => panel.id)).toEqual(['workspace', 'open-editors']);
    expect(content.closest('.dv-pane')).not.toBeNull();
  });

  it('布局往返恢复侧栏顺序、移出的视图和折叠前高度', () => {
    const first = fixture();
    const panes = first.dock.views.getContainerApi('explorer');
    panes.getPanel('workspace')!.api.setSize({ size: 350 });
    first.dock.views.setExpanded('workspace', false);
    first.dock.views.moveToDock('open-editors', {
      referenceGroup: first.dock.api.getPanel('terminal')!.group,
      direction: 'within'
    });
    const layout: unknown = JSON.parse(JSON.stringify(first.dock.serializeLayout()));
    const next = fixture();
    expect(next.dock.applyLayout(layout)).toBe(true);
    const restored = next.dock.views.getContainerApi('explorer');
    expect(restored.panels.map(panel => panel.id)).toEqual(['workspace']);
    expect(restored.getPanel('workspace')?.api.isExpanded).toBe(false);
    expect(next.dock.api.getPanel('open-editors')?.group).toBe(next.dock.api.getPanel('terminal')?.group);
    expect(next.dock.views.serialize().views['workspace']?.size).toBe(350);
    next.dock.views.setExpanded('workspace', true);
    expect(restored.getPanel('workspace')?.api.isExpanded).toBe(true);
  });

  it('非法或重复归属的视图布局在修改界面前拒绝，旧布局恢复默认侧栏', () => {
    const { dock } = fixture();
    const before = dock.serializeLayout();
    expect(dock.applyLayout({ ...before, viewLayout: { version: 999 } })).toBe(false);
    expect(dock.serializeLayout()).toEqual(before);
    dock.views.moveToDock('workspace', { referenceGroup: dock.api.getPanel('terminal')!.group, direction: 'within' });
    const detached = dock.serializeLayout();
    expect(dock.applyLayout({ ...detached, viewLayout: before.viewLayout })).toBe(false);
    expect(dock.serializeLayout()).toEqual(detached);
    expect(dock.applyLayout(before)).toBe(true);
    const legacy = dock.api.toJSON();
    expect(dock.applyLayout(legacy)).toBe(true);
    expect(dock.views.getContainerApi('explorer').panels.map(panel => panel.id)).toEqual(['workspace', 'open-editors']);
  });

  it('隐藏最后一个区块后保留空容器入口，再显示使用原正文', () => {
    const { dock, container } = fixture();
    const body = dock.views.getView('workspace').element;
    dock.views.setVisible('workspace', false);
    dock.views.setVisible('open-editors', false);
    expect(container.classList.contains('wb-view-container-empty')).toBe(true);
    expect(dock.views.getContainerApi('explorer').panels).toHaveLength(0);
    dock.views.setVisible('workspace', true);
    expect(container.classList.contains('wb-view-container-empty')).toBe(false);
    expect(body.closest('.dv-pane')).not.toBeNull();
  });

  it('原生 Dockview 组间移动不被误判成隐藏，真正移除才隐藏', async () => {
    const { dock } = fixture();
    dock.views.moveToDock('workspace');
    const view = dock.api.getPanel('workspace')!;
    view.api.moveTo({ group: view.group, position: 'right' });
    await Promise.resolve();
    expect(dock.views.isVisible('workspace')).toBe(true);
    expect(dock.views.serialize().views['workspace']?.detached).toBe(true);
    dock.api.removePanel(dock.api.getPanel('workspace')!);
    await Promise.resolve();
    expect(dock.views.isVisible('workspace')).toBe(false);
    dock.views.setVisible('workspace', true);
    expect(dock.api.getPanel('workspace')).toBeDefined();
  });

  it('整体面板关闭的布局可重载，重开后恢复移入视图', () => {
    const first = fixture();
    first.dock.views.moveToDock('workspace');
    first.dock.toggleTools();
    const saved = first.dock.serializeLayout();
    const next = fixture();
    expect(next.dock.applyLayout(saved)).toBe(true);
    expect(next.dock.isToolsVisible()).toBe(false);
    next.dock.toggleTools();
    expect(next.dock.api.getPanel('workspace')).toBeDefined();
    expect(next.dock.views.getContainerApi('explorer').getPanel('workspace')).toBeUndefined();
  });

  it('底部关闭后移入另一个视图，同时恢复之前收起的成员，布局仍可重载', () => {
    const { dock } = fixture();
    dock.views.moveToDock('workspace');
    dock.toggleTools();
    dock.views.moveToDock('open-editors');
    expect(dock.api.getPanel('workspace')).toBeDefined();
    expect(dock.api.getPanel('open-editors')).toBeDefined();
    expect(dock.applyLayout(dock.serializeLayout())).toBe(true);
  });
});
