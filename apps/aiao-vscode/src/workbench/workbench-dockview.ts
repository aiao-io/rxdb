import {
  createDockview,
  themeDark,
  type DockviewApi,
  type DockviewGroupPanel,
  type DockviewIDisposable,
  type IDockviewPanel,
  type IHeaderActionsRenderer,
  type TabPartInitParameters
} from 'dockview-core';
import { createCodicon, createFileIcon } from './workbench-icons.js';
import { attachWorkbenchLongPress } from './workbench-longpress.js';

/** 底部工具区域的固定面板。 */
export type WorkbenchToolKind = 'problems' | 'output' | 'console';

/** Dockview 与工作台会话之间的单向事件。 */
export interface WorkbenchDockviewCallbacks {
  onSelectEditor(path: string): void;
  onCloseEditor(path: string): void;
  onSelectTool(kind: WorkbenchToolKind): void;
  onToggleTool?(visible: boolean): void;
  onClosePreview?(): void;
  onCloseAuxiliary?(id: string): void;
  /** 移动端抽屉遮罩被点击，宿主应收起侧栏。 */
  onCloseSidebar?(): void;
  /** 标签右键菜单：关闭除该标签外的其他编辑器。 */
  onCloseOthers?(path: string): void;
  /** 标签右键菜单：关闭该标签右侧的编辑器。 */
  onCloseRight?(path: string): void;
}

/** 三端共享的 Dockview 面板桥。编辑器与预览的业务生命周期由宿主负责。 */
export interface WorkbenchDockview {
  readonly api: DockviewApi;
  ensureEditor(path: string): HTMLElement;
  selectEditor(path: string): void;
  removeEditor(path: string): void;
  setEditorTitle(path: string, title: string): void;
  ensureAuxiliary(id: string, title: string): HTMLElement;
  removeAuxiliary(id: string): void;
  setSidebarVisible(visible: boolean): void;
  isSidebarVisible(): boolean;
  /** 窄屏时把侧栏切换为覆盖式抽屉（挂到工作台根），退出时归还 Dockview 边缘组。 */
  setSidebarOverlay(overlay: boolean): void;
  showTool(kind: WorkbenchToolKind): void;
  toggleTools(): void;
  showPreview(): void;
  isPreviewOpen(): boolean;
  splitEditor(): void;
  resetLayout(): void;
  dispose(): void;
}

const tools: readonly WorkbenchToolKind[] = ['problems', 'output', 'console'];
const titles = {
  sidebar: '资源管理器',
  welcome: '欢迎',
  preview: '预览',
  problems: '问题',
  output: '输出',
  console: 'Console'
};
const editorId = (path: string) => `editor:${path}`;
const editorPath = (id: string): string | undefined => (id.startsWith('editor:') ? id.slice(7) : undefined);
const isTool = (id: string): id is WorkbenchToolKind => tools.some(kind => kind === id);

function required(root: HTMLElement, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Dockview 布局缺少 ${selector}`);
  return element;
}

let activeTabMenu: HTMLElement | null = null;

const outsideTabMenu = (event: Event) => {
  if (activeTabMenu && !(event.target instanceof Node && activeTabMenu.contains(event.target))) closeTabMenu();
};

function closeTabMenu(): void {
  activeTabMenu?.remove();
  activeTabMenu = null;
  document.removeEventListener('mousedown', outsideTabMenu, true);
}

/** 编辑器标签的右键菜单：关闭 / 关闭其他 / 关闭右侧，与 VS Code 一致。 */
function showTabMenu(
  event: MouseEvent,
  path: string,
  close: () => void,
  root: HTMLElement,
  onCloseOthers?: (path: string) => void,
  onCloseRight?: (path: string) => void
): void {
  event.preventDefault();
  event.stopPropagation();
  closeTabMenu();
  // 树行与编辑器的菜单由宿主管理，弹出标签菜单前清掉避免叠层
  for (const menu of root.querySelectorAll('.wb-context-menu')) menu.remove();
  const menu = document.createElement('div');
  menu.className = 'wb-context-menu';
  menu.setAttribute('role', 'menu');
  const items: { label: string; action: () => void }[] = [
    { label: '关闭', action: close },
    ...(onCloseOthers ? [{ label: '关闭其他', action: () => onCloseOthers(path) }] : []),
    ...(onCloseRight ? [{ label: '关闭右侧', action: () => onCloseRight(path) }] : [])
  ];
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.textContent = item.label;
    button.onclick = () => {
      closeTabMenu();
      item.action();
    };
    menu.append(button);
  }
  menu.onkeydown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeTabMenu();
    }
  };
  root.append(menu);
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  const bounds = menu.getBoundingClientRect();
  if (bounds.right > window.innerWidth) menu.style.left = `${Math.max(0, window.innerWidth - bounds.width - 4)}px`;
  if (bounds.bottom > window.innerHeight) menu.style.top = `${Math.max(0, window.innerHeight - bounds.height - 4)}px`;
  activeTabMenu = menu;
  document.addEventListener('mousedown', outsideTabMenu, true);
}

function createTab(id: string, auxiliary: boolean, callbacks: WorkbenchDockviewCallbacks, root: HTMLElement) {
  const element = document.createElement('div');
  element.className = 'wb-dock-tab';
  const path = editorPath(id);
  if (isTool(id)) element.dataset['panel'] = id;
  if (path !== undefined) element.dataset['editorTabPath'] = path;
  if (auxiliary) element.dataset['auxiliaryId'] = id;
  const icon =
    path ?
      createFileIcon(path)
    : createCodicon(
        auxiliary ? 'git-compare'
        : id === 'preview' ? 'open-preview'
        : id === 'welcome' ? 'code'
        : id === 'console' ? 'debug-console'
        : id === 'problems' ? 'warning'
        : 'output'
      );
  const label = document.createElement('span');
  label.className = 'wb-dock-tab-title';
  const dirty = createCodicon('circle-filled');
  dirty.classList.add('wb-dock-tab-dirty', 'wb-dirty-marker');
  dirty.hidden = true;
  element.append(icon, label, dirty);
  const renderTitle = (title: string): void => {
    const modified = path !== undefined && title.endsWith(' •');
    label.textContent = modified ? title.slice(0, -2) : title;
    dirty.hidden = !modified;
  };
  let titleSubscription: DockviewIDisposable | undefined;
  let detachLongPress: (() => void) | undefined;
  return {
    element,
    init(parameters: TabPartInitParameters) {
      renderTitle(parameters.title);
      titleSubscription = parameters.api.onDidTitleChange(event => renderTitle(event.title));
      detachLongPress = attachWorkbenchLongPress(element, {
        onLongPress: event =>
          element.dispatchEvent(
            new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: event.clientX,
              clientY: event.clientY
            })
          )
      });
      if (id === 'sidebar' || id === 'welcome') return;
      element.addEventListener('auxclick', event => {
        if (event.button !== 1) return;
        event.preventDefault();
        parameters.api.close();
      });
      if (path !== undefined) {
        element.addEventListener('contextmenu', event =>
          showTabMenu(event, path, () => parameters.api.close(), root, callbacks.onCloseOthers, callbacks.onCloseRight)
        );
      }
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'wb-dock-tab-close';
      close.setAttribute('aria-label', `关闭 ${path ?? parameters.title}`);
      close.append(createCodicon('close'));
      close.onpointerdown = event => event.stopPropagation();
      close.onmousedown = event => event.stopPropagation();
      close.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        parameters.api.close();
      };
      element.append(close);
    },
    dispose() {
      titleSubscription?.dispose();
      detachLongPress?.();
    }
  };
}

function createGroupActions(
  group: DockviewGroupPanel,
  splitEditor: (panel: IDockviewPanel) => void
): IHeaderActionsRenderer {
  const element = document.createElement('div');
  element.className = 'wb-dock-group-actions';
  element.dataset['groupId'] = group.id;
  const subscriptions: DockviewIDisposable[] = [];
  let api: DockviewApi;
  const split = document.createElement('button');
  split.type = 'button';
  split.setAttribute('aria-label', '向右拆分编辑器组');
  split.title = '向右拆分编辑器组';
  split.append(createCodicon('split-horizontal'));
  const maximize = document.createElement('button');
  maximize.type = 'button';
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', '关闭面板');
  close.title = '关闭面板';
  close.append(createCodicon('close'));
  element.append(split, maximize, close);

  function update(): void {
    const active = group.activePanel;
    const toolGroup = group.panels.length > 0 && group.panels.every(panel => isTool(panel.id));
    split.hidden = !active || editorPath(active.id) === undefined;
    maximize.hidden = !toolGroup;
    close.hidden = !toolGroup;
    const expanded = group.api.isMaximized();
    const label = expanded ? '还原面板大小' : '展开面板';
    maximize.setAttribute('aria-label', label);
    maximize.title = label;
    maximize.replaceChildren(createCodicon(expanded ? 'chevron-down' : 'chevron-up'));
    element.hidden = split.hidden && !toolGroup;
  }

  split.onclick = event => {
    event.stopPropagation();
    const active = group.activePanel;
    if (active && editorPath(active.id) !== undefined) splitEditor(active);
  };
  maximize.onclick = event => {
    event.stopPropagation();
    if (group.api.isMaximized()) group.api.exitMaximized();
    else group.api.maximize();
  };
  close.onclick = event => {
    event.stopPropagation();
    const panels = [...group.panels];
    if (panels.some(panel => !isTool(panel.id))) return;
    for (const panel of panels) api.removePanel(panel);
  };

  return {
    element,
    init(parameters) {
      api = parameters.containerApi;
      subscriptions.push(
        group.api.onDidActivePanelChange(update),
        group.model.onDidAddPanel(update),
        group.model.onDidRemovePanel(update),
        api.onDidMaximizedGroupChange(update)
      );
      update();
    },
    dispose() {
      subscriptions.splice(0).forEach(subscription => subscription.dispose());
      split.onclick = null;
      maximize.onclick = null;
      close.onclick = null;
    }
  };
}

/** 把既有界面节点交给 Dockview，使用其原生尺寸、分组、拖放和保活渲染。 */
export function createWorkbenchDockview(root: HTMLElement, callbacks: WorkbenchDockviewCallbacks): WorkbenchDockview {
  const container = required(root, '[data-slot="dockview"]');
  const staging = required(root, '[data-slot="panel-staging"]');
  const hosts = new Map<string, HTMLElement>([
    ['sidebar', required(root, '.wb-side')],
    ['welcome', required(root, '.wb-welcome')],
    ['preview', required(root, '.wb-preview')],
    ...tools.map(kind => [kind, required(root, `.wb-panel[data-log="${kind}"]`)] as [string, HTMLElement])
  ]);
  const subscriptions: DockviewIDisposable[] = [];
  const closing = new Set<string>();
  const auxiliaryIds = new Set<string>();
  let syncing = 1;
  let disposed = false;
  let lastEditor: string | undefined;
  let lastTool: WorkbenchToolKind = 'problems';
  let toolsShown = true;
  let sized = false;
  let overlayMode = false;
  let overlayVisible = false;

  /** 窄屏下侧栏作为抽屉浮出时盖住编辑区的遮罩，点击请求宿主收起。 */
  const scrim = document.createElement('div');
  scrim.className = 'wb-side-scrim';
  scrim.addEventListener('click', () => callbacks.onCloseSidebar?.());

  /** 预览的初始宽度：桌面固定 400，窄屏按工作台宽度 45% 缩放并保底 160。 */
  const previewWidth = (width: number): number => Math.max(160, Math.min(400, Math.round(width * 0.45)));

  function ensureSideGroup(): NonNullable<ReturnType<DockviewApi['getEdgeGroup']>> {
    const existing = api.getEdgeGroup('left');
    if (existing) return existing;
    const created = api.addEdgeGroup('left', { id: 'sidebar', initialSize: 240, minimumSize: 180, maximumSize: 420 });
    created.locked = 'no-drop-target';
    const group = api.getGroup(created.id);
    if (!group) throw new Error('Dockview 侧栏初始化失败');
    group.model.header.hidden = true;
    return created;
  }

  function renderSidebarState(): void {
    hosts.get('sidebar')?.classList.toggle('wb-side-open', overlayVisible);
    scrim.classList.toggle('wb-side-scrim-open', overlayVisible);
  }

  function setSidebarOverlay(overlay: boolean): void {
    if (overlayMode === overlay) return;
    overlayMode = overlay;
    const panel = api.getPanel('sidebar');
    const host = hosts.get('sidebar');
    if (overlay) {
      overlayVisible = panel ? api.isEdgeGroupVisible('left') : false;
      program(() => {
        if (panel) api.removePanel(panel);
        // 空边缘组会塌成收起条仍占宽度，抽屉模式下把槽位一并回收
        if (api.getEdgeGroup('left')) api.removeEdgeGroup('left');
      });
      if (host) root.append(host);
      root.append(scrim);
      root.classList.add('wb-side-overlay');
      renderSidebarState();
      return;
    }
    const visible = overlayVisible;
    overlayVisible = false;
    if (host) {
      host.classList.remove('wb-side-open');
      staging.append(host);
    }
    scrim.remove();
    root.classList.remove('wb-side-overlay');
    program(() => {
      const group = ensureSideGroup();
      if (!api.getPanel('sidebar')) addStatic('sidebar', group.id);
      api.setEdgeGroupVisible('left', visible);
    });
  }

  const program = <T>(action: () => T): T => {
    syncing++;
    try {
      return action();
    } finally {
      syncing--;
    }
  };
  const api = createDockview(container, {
    theme: themeDark,
    proportionalLayout: false,
    defaultRenderer: 'always',
    disableFloatingGroups: true,
    defaultTabComponent: 'workbench',
    closeEmptyGroups: true,
    createComponent: options => {
      const element = hosts.get(options.id);
      if (!element) throw new Error(`未知工作台面板 ${options.id}`);
      return {
        element,
        init() {
          element.dataset['dockPanel'] = options.id;
        }
      };
    },
    createTabComponent: options => createTab(options.id, auxiliaryIds.has(options.id), callbacks, root),
    createRightHeaderActionComponent: group => createGroupActions(group, splitPanel)
  });

  function splitPanel(panel: IDockviewPanel): void {
    // 窄屏横向空间不足，拆分方向改为上下，对齐 VS Code 的小窗口行为
    const position = api.width < 720 ? 'bottom' : 'right';
    program(() => panel.api.moveTo({ group: panel.group, position }));
  }

  function editorGroup() {
    return (
      (lastEditor ? api.getPanel(editorId(lastEditor))?.group : undefined) ??
      api.panels.find(panel => editorPath(panel.id) !== undefined)?.group ??
      api.getPanel('welcome')?.group
    );
  }

  function addStatic(id: keyof typeof titles, referenceGroup?: string): IDockviewPanel {
    const existing = api.getPanel(id);
    if (existing) return existing;
    // 无参照组时先占一个主区组，避免面板掉进当前活动组（预览/工具组）里
    const group = referenceGroup ?? api.addGroup().id;
    return api.addPanel({
      id,
      component: id,
      title: titles[id],
      renderer: 'always',
      inactive: true,
      position: { referenceGroup: group, direction: 'within' as const }
    });
  }

  /** 对齐 VS Code：欢迎页只在没有任何编辑器打开时存在，并随最后一个编辑器关闭回归。 */
  function syncWelcome(activate: boolean): void {
    program(() => {
      const welcome = api.getPanel('welcome');
      if (api.panels.some(panel => editorPath(panel.id) !== undefined)) {
        if (welcome) {
          api.removePanel(welcome);
          stash('welcome');
        }
        return;
      }
      if (!welcome) addStatic('welcome');
      if (activate) api.getPanel('welcome')?.api.setActive();
    });
  }

  function addTool(kind: WorkbenchToolKind): IDockviewPanel {
    const group =
      tools.map(tool => api.getPanel(tool)?.group).find(Boolean) ??
      api.addGroup({ direction: 'below', initialHeight: 180, skipSetActive: true });
    const panel = addStatic(kind, group.id);
    return panel;
  }

  function addPreview(): IDockviewPanel {
    const existing = api.getPanel('preview');
    if (existing) return existing;
    const reference = editorGroup();
    return api.addPanel({
      id: 'preview',
      component: 'preview',
      title: titles.preview,
      renderer: 'always',
      inactive: true,
      initialWidth: api.width > 0 ? previewWidth(api.width) : 400,
      ...(reference ? { position: { referenceGroup: reference, direction: 'right' as const } } : {})
    });
  }

  function reportTools(visible: boolean): void {
    if (toolsShown === visible) return;
    toolsShown = visible;
    callbacks.onToggleTool?.(visible);
  }

  function stash(id: string): void {
    const host = hosts.get(id);
    if (host) staging.append(host);
  }

  subscriptions.push(
    api.onDidLayoutChange(() => {
      if (disposed || sized || api.width <= 0 || api.height <= 0) return;
      sized = true;
      program(() => {
        api.getEdgeGroup('left')?.setSize({ width: 240 });
        api.getPanel('preview')?.group.api.setSize({ width: previewWidth(api.width) });
        api.getPanel('problems')?.group.api.setSize({ height: 180 });
      });
    })
  );
  subscriptions.push(
    api.onDidActivePanelChange(event => {
      if (disposed || syncing || !event.panel) return;
      const path = editorPath(event.panel.id);
      if (path !== undefined) {
        lastEditor = path;
        callbacks.onSelectEditor(path);
      } else if (isTool(event.panel.id)) {
        lastTool = event.panel.id;
        callbacks.onSelectTool(lastTool);
      }
    })
  );
  subscriptions.push(
    api.onDidRemovePanel(panel => {
      if (disposed || syncing) return;
      closing.add(panel.id);
      queueMicrotask(() => {
        if (disposed || !closing.delete(panel.id) || api.getPanel(panel.id)) return;
        const path = editorPath(panel.id);
        if (path !== undefined) {
          hosts.delete(panel.id);
          callbacks.onCloseEditor(path);
          syncWelcome(true);
          return;
        }
        if (auxiliaryIds.delete(panel.id)) {
          hosts.delete(panel.id);
          callbacks.onCloseAuxiliary?.(panel.id);
          return;
        }
        if (panel.id === 'preview') callbacks.onClosePreview?.();
        stash(panel.id);
        if (isTool(panel.id)) reportTools(tools.some(kind => Boolean(api.getPanel(kind))));
      });
    })
  );

  const side = api.addEdgeGroup('left', { id: 'sidebar', initialSize: 240, minimumSize: 180, maximumSize: 420 });
  side.locked = 'no-drop-target';
  const sideGroup = api.getGroup(side.id);
  if (!sideGroup) throw new Error('Dockview 侧栏初始化失败');
  sideGroup.model.header.hidden = true;
  addStatic('sidebar', side.id);
  addStatic('welcome');
  addPreview();
  tools.forEach(addTool);
  api.getPanel('problems')?.api.setActive();
  api.getPanel('welcome')?.api.setActive();
  syncing = 0;

  function ensureEditor(path: string): HTMLElement {
    const id = editorId(path);
    const existing = hosts.get(id);
    if (existing && (api.getPanel(id) || closing.has(id))) return existing;
    const host = document.createElement('div');
    host.className = 'wb-editor-host';
    host.dataset['editorPath'] = path;
    host.style.cssText = 'height:100%;min-height:0;min-width:0';
    hosts.set(id, host);
    program(() => {
      const reference = editorGroup();
      api.addPanel({
        id,
        component: 'editor',
        title: path.split('/').at(-1) ?? path,
        params: { path },
        renderer: 'always',
        inactive: true,
        ...(reference ? { position: { referenceGroup: reference, direction: 'within' } } : {})
      });
    });
    syncWelcome(false);
    return host;
  }

  function showTool(kind: WorkbenchToolKind): void {
    program(() => addTool(kind).api.setActive());
    lastTool = kind;
    reportTools(true);
    callbacks.onSelectTool(kind);
  }

  function ensureAuxiliary(id: string, title: string): HTMLElement {
    if (!id || Object.hasOwn(titles, id) || editorPath(id) !== undefined)
      throw new Error(`辅助面板 id 与工作台保留面板冲突：${id}`);
    const existing = hosts.get(id);
    const panel = api.getPanel(id);
    if (existing && (panel || closing.has(id))) {
      program(() => {
        panel?.api.setTitle(title);
        panel?.api.setActive();
      });
      return existing;
    }
    const host = document.createElement('div');
    host.className = 'wb-auxiliary-host';
    host.dataset['auxiliaryId'] = id;
    host.style.cssText = 'height:100%;min-height:0;min-width:0';
    hosts.set(id, host);
    auxiliaryIds.add(id);
    program(() => {
      const reference = editorGroup();
      api.addPanel({
        id,
        component: 'auxiliary',
        title,
        renderer: 'always',
        ...(reference ? { position: { referenceGroup: reference, direction: 'within' } } : {})
      });
    });
    return host;
  }

  function resetLayout(): void {
    program(() => {
      const activeAuxiliary = api.activePanel && auxiliaryIds.has(api.activePanel.id) ? api.activePanel.id : undefined;
      api.exitMaximizedGroup();
      const editors = api.panels.filter(
        panel => editorPath(panel.id) !== undefined || panel.id === 'welcome' || auxiliaryIds.has(panel.id)
      );
      const group = api.addGroup({ direction: 'left', skipSetActive: true });
      for (const panel of editors) panel.api.moveTo({ group, position: 'center', skipSetActive: true });
      const preview = addPreview();
      const previewGroup = api.addGroup({
        referenceGroup: group,
        direction: 'right',
        initialWidth: previewWidth(api.width),
        skipSetActive: true
      });
      preview.api.moveTo({ group: previewGroup, position: 'center', skipSetActive: true });
      const bottom = api.addGroup({ direction: 'below', initialHeight: 180, skipSetActive: true });
      for (const kind of tools)
        addStatic(kind, bottom.id).api.moveTo({ group: bottom, position: 'center', skipSetActive: true });
      if (!overlayMode) {
        api.getEdgeGroup('left')?.setSize({ width: 240 });
        api.getEdgeGroup('left')?.expand();
        api.setEdgeGroupVisible('left', true);
      }
      api.getPanel(lastTool)?.api.setActive();
      if (activeAuxiliary) api.getPanel(activeAuxiliary)?.api.setActive();
      else if (lastEditor && api.getPanel(editorId(lastEditor))) api.getPanel(editorId(lastEditor))?.api.setActive();
      else syncWelcome(true);
    });
    reportTools(true);
  }

  return {
    api,
    ensureEditor,
    selectEditor(path) {
      ensureEditor(path);
      lastEditor = path;
      program(() => api.getPanel(editorId(path))?.api.setActive());
    },
    removeEditor(path) {
      const id = editorId(path);
      const panel = api.getPanel(id);
      program(() => {
        if (panel) api.removePanel(panel);
      });
      closing.delete(id);
      hosts.delete(id);
      syncWelcome(true);
    },
    setEditorTitle(path, title) {
      api.getPanel(editorId(path))?.api.setTitle(title);
    },
    ensureAuxiliary,
    removeAuxiliary(id) {
      if (!auxiliaryIds.has(id)) return;
      const panel = api.getPanel(id);
      program(() => {
        if (panel) api.removePanel(panel);
      });
      closing.delete(id);
      auxiliaryIds.delete(id);
      hosts.delete(id);
    },
    setSidebarVisible(visible) {
      if (overlayMode) {
        overlayVisible = visible;
        renderSidebarState();
      } else {
        api.setEdgeGroupVisible('left', visible);
      }
    },
    isSidebarVisible: () => (overlayMode ? overlayVisible : api.isEdgeGroupVisible('left')),
    setSidebarOverlay,
    showTool,
    toggleTools() {
      if (tools.some(kind => Boolean(api.getPanel(kind)))) {
        program(() => {
          for (const kind of tools) {
            const panel = api.getPanel(kind);
            if (panel) api.removePanel(panel);
            stash(kind);
          }
        });
        reportTools(false);
      } else {
        program(() => tools.forEach(addTool));
        showTool(lastTool);
      }
    },
    showPreview() {
      program(() => addPreview().api.setActive());
    },
    isPreviewOpen: () => Boolean(api.getPanel('preview')),
    splitEditor() {
      const panel = lastEditor ? api.getPanel(editorId(lastEditor)) : undefined;
      if (panel) splitPanel(panel);
    },
    resetLayout,
    dispose() {
      if (disposed) return;
      disposed = true;
      closeTabMenu();
      scrim.remove();
      root.classList.remove('wb-side-overlay');
      subscriptions.splice(0).forEach(subscription => subscription.dispose());
      api.dispose();
      closing.clear();
      hosts.clear();
      auxiliaryIds.clear();
    }
  };
}
