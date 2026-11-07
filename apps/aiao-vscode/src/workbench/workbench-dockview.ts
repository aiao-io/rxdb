import {
  createDockview,
  themeDark,
  type DockviewApi,
  type DockviewGroupPanel,
  type DockviewIDisposable,
  type GroupviewPanelState,
  type IDockviewPanel,
  type IHeaderActionsRenderer,
  type SerializedDockview,
  type TabPartInitParameters
} from 'dockview-core';
import { isMarkdownPath } from './extensions/markdown-extension.js';
import { createCodicon, createFileIcon } from './workbench-icons.js';
import { normalizeWorkbenchLayout, SIDEBAR_EDGE, SIDEBAR_WIDTH } from './workbench-layout-state.js';
import { attachWorkbenchLongPress } from './workbench-longpress.js';

/** 底部工具区域的固定面板。 */
export type WorkbenchToolKind = 'problems' | 'output' | 'console' | 'terminal';

/** Dockview 与工作台会话之间的单向事件。 */
export interface WorkbenchDockviewCallbacks {
  onSelectEditor(path: string): void;
  onPreviewMarkdown?(path: string): void;
  onPinEditor?(path: string): void;
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
  setEditorPreview(path: string, preview: boolean): void;
  getEditorGroupPaths(): readonly string[];
  ensureAuxiliary(id: string, title: string, direction?: 'right' | 'within'): HTMLElement;
  removeAuxiliary(id: string): void;
  setSidebarVisible(visible: boolean): void;
  isSidebarVisible(): boolean;
  /** 窄屏时把侧栏切换为覆盖式抽屉（挂到工作台根），退出时归还 Dockview 边缘组。 */
  setSidebarOverlay(overlay: boolean): void;
  /** 显示并选中一个底部工具；它之前被标签栏右键菜单隐藏的话一并恢复，其余隐藏的工具不受影响。 */
  showTool(kind: WorkbenchToolKind): void;
  /** 整体开合底部面板；右键菜单隐藏的工具重开后仍保持隐藏。 */
  toggleTools(): void;
  isToolsVisible(): boolean;
  showPreview(): void;
  isPreviewOpen(): boolean;
  splitEditor(): void;
  resetLayout(): void;
  /** 按容器当前尺寸强制重布局；容器无尺寸时静默跳过。 */
  refreshLayout(): void;
  /** 导出可持久化的布局：辅助差异面板依赖运行时状态，不进入布局。 */
  serializeLayout(): SerializedDockview;
  /** 按持久化布局重排面板，只排布已打开的编辑器；结构非法时不动现有布局并返回 false。 */
  applyLayout(layout: unknown): boolean;
  dispose(): void;
}

const tools: readonly WorkbenchToolKind[] = ['problems', 'output', 'console', 'terminal'];
const titles = {
  sidebar: '资源管理器',
  preview: '预览',
  problems: '问题',
  output: '输出',
  console: 'Console',
  terminal: '终端'
};
const editorId = (path: string) => `editor:${path}`;
const editorPath = (id: string): string | undefined => (id.startsWith('editor:') ? id.slice(7) : undefined);
const isTool = (id: string): id is WorkbenchToolKind => tools.some(kind => kind === id);
const isStatic = (id: string): id is keyof typeof titles => Object.hasOwn(titles, id);

function required<T extends HTMLElement = HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
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

/** 标签栏右键菜单的一项；`checked` 有值时是带勾选的开关项。 */
interface TabMenuItem {
  readonly label: string;
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly action: () => void;
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
  showMenu(
    event,
    [
      { label: '关闭', action: close },
      ...(onCloseOthers ? [{ label: '关闭其他', action: () => onCloseOthers(path) }] : []),
      ...(onCloseRight ? [{ label: '关闭右侧', action: () => onCloseRight(path) }] : [])
    ],
    root
  );
}

function createMenuItem(item: TabMenuItem): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  const checkable = item.checked !== undefined;
  button.setAttribute('role', checkable ? 'menuitemcheckbox' : 'menuitem');
  if (checkable) button.setAttribute('aria-checked', String(item.checked));
  if (item.checked) {
    const check = createCodicon('check');
    check.classList.add('wb-menu-check');
    button.append(check);
  }
  const label = document.createElement('span');
  label.className = 'wb-menu-label';
  label.textContent = item.label;
  button.append(label);
  button.disabled = item.disabled ?? false;
  button.onclick = () => {
    closeTabMenu();
    item.action();
  };
  return button;
}

/** 在光标处弹出标签栏右键菜单，同一时刻只保留一个。 */
function showMenu(event: MouseEvent, items: readonly TabMenuItem[], root: HTMLElement): void {
  event.preventDefault();
  event.stopPropagation();
  closeTabMenu();
  // 树行与编辑器的菜单由宿主管理，弹出标签菜单前清掉避免叠层
  for (const menu of root.querySelectorAll('.wb-context-menu')) menu.remove();
  const menu = document.createElement('div');
  menu.className = 'wb-context-menu';
  menu.setAttribute('role', 'menu');
  menu.append(...items.map(createMenuItem));
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

/** 触屏长按转成 contextmenu 事件，让标签在手机上也能弹出右键菜单。 */
function forwardLongPress(element: HTMLElement): () => void {
  return attachWorkbenchLongPress(element, {
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
}

/**
 * 底部工具标签对齐 VS Code 的面板标签栏：只有文字，没有图标、脏标记和关闭按钮，
 * 显隐统一走标签栏右键菜单。
 */
function createToolTab(id: WorkbenchToolKind, showToolMenu: (event: MouseEvent) => void) {
  const element = document.createElement('div');
  element.className = 'wb-dock-tab wb-dock-tab-tool';
  element.dataset['panel'] = id;
  const label = document.createElement('span');
  label.className = 'wb-dock-tab-title';
  element.append(label);
  const renderTitle = (title: string): void => {
    label.textContent = title;
  };
  let titleSubscription: DockviewIDisposable | undefined;
  let detachLongPress: (() => void) | undefined;
  return {
    element,
    init(parameters: TabPartInitParameters) {
      renderTitle(parameters.title);
      titleSubscription = parameters.api.onDidTitleChange(event => renderTitle(event.title));
      detachLongPress = forwardLongPress(element);
      element.addEventListener('contextmenu', showToolMenu);
    },
    dispose() {
      titleSubscription?.dispose();
      detachLongPress?.();
      element.removeEventListener('contextmenu', showToolMenu);
    }
  };
}

function createTab(
  id: string,
  auxiliary: boolean,
  callbacks: WorkbenchDockviewCallbacks,
  root: HTMLElement,
  closeTab: () => void
) {
  const element = document.createElement('div');
  element.className = 'wb-dock-tab';
  const path = editorPath(id);
  if (path !== undefined) element.dataset['editorTabPath'] = path;
  if (auxiliary) element.dataset['auxiliaryId'] = id;
  const icon =
    path ?
      createFileIcon(path)
    : createCodicon(
        auxiliary ? 'git-compare'
        : id === 'preview' ? 'open-preview'
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
  let previewSubscription: DockviewIDisposable | undefined;
  let detachLongPress: (() => void) | undefined;
  return {
    element,
    init(parameters: TabPartInitParameters) {
      renderTitle(parameters.title);
      element.classList.toggle('wb-preview-tab', parameters.params?.['preview'] === true);
      previewSubscription = parameters.api.onDidParametersChange(params => {
        element.classList.toggle('wb-preview-tab', params['preview'] === true);
      });
      titleSubscription = parameters.api.onDidTitleChange(event => renderTitle(event.title));
      detachLongPress = forwardLongPress(element);
      if (id === 'sidebar') return;
      element.addEventListener('auxclick', event => {
        if (event.button !== 1) return;
        event.preventDefault();
        closeTab();
      });
      if (path !== undefined) {
        element.addEventListener('dblclick', () => callbacks.onPinEditor?.(path));
        element.addEventListener('contextmenu', event =>
          showTabMenu(event, path, closeTab, root, callbacks.onCloseOthers, callbacks.onCloseRight)
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
        closeTab();
      };
      element.append(close);
    },
    dispose() {
      titleSubscription?.dispose();
      previewSubscription?.dispose();
      detachLongPress?.();
    }
  };
}

function createGroupActions(
  group: DockviewGroupPanel,
  splitEditor: (panel: IDockviewPanel) => void,
  showToolMenu: (event: MouseEvent) => void,
  previewMarkdown?: (path: string) => void
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
  const markdown = document.createElement('button');
  markdown.type = 'button';
  markdown.dataset['markdownPreview'] = '';
  markdown.setAttribute('aria-label', '打开 Markdown 侧边预览');
  markdown.title = 'Markdown Preview Enhanced: 打开侧边预览 · Ctrl / ⌘ + K V';
  markdown.append(createCodicon('open-preview'));
  markdown.onclick = event => {
    event.stopPropagation();
    const path = group.activePanel && editorPath(group.activePanel.id);
    if (path) previewMarkdown?.(path);
  };
  element.append(markdown, split, maximize, close);

  /** 只放底部工具标签的组；它的标签栏用紧凑的面板样式（wb-tool-group）。 */
  const isToolGroup = (): boolean => group.panels.length > 0 && group.panels.every(panel => isTool(panel.id));

  /** 工具组的整条标签栏（含空白处与右侧按钮）都响应右键，与点在标签上弹出同一个菜单。 */
  const onHeaderContextMenu = (event: MouseEvent): void => {
    if (isToolGroup() && event.target instanceof Element && event.target.closest('.dv-tabs-and-actions-container'))
      showToolMenu(event);
  };

  function update(): void {
    const active = group.activePanel;
    const toolGroup = isToolGroup();
    group.element.classList.toggle('wb-tool-group', toolGroup);
    split.hidden = !active || editorPath(active.id) === undefined;
    markdown.hidden = !previewMarkdown || !active || !isMarkdownPath(editorPath(active.id));
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
      group.element.addEventListener('contextmenu', onHeaderContextMenu);
      update();
    },
    dispose() {
      subscriptions.splice(0).forEach(subscription => subscription.dispose());
      group.element.removeEventListener('contextmenu', onHeaderContextMenu);
      group.element.classList.remove('wb-tool-group');
      markdown.onclick = null;
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
  const welcomeTemplate = required<HTMLTemplateElement>(root, '[data-slot="welcome"]');
  const hosts = new Map<string, HTMLElement>([
    ['sidebar', required(root, '.wb-side')],
    ['preview', required(root, '.wb-preview')],
    ...tools.map(kind => [kind, required(root, `.wb-panel[data-log="${kind}"]`)] as [string, HTMLElement])
  ]);
  const subscriptions: DockviewIDisposable[] = [];
  const closing = new Set<string>();
  const auxiliaryIds = new Set<string>();
  /** 用户在标签栏右键菜单里隐藏的工具；底部面板整体关闭再打开时保持隐藏。 */
  const hiddenTools = new Set<WorkbenchToolKind>();
  let syncing = 1;
  let disposed = false;
  let lastEditor: string | undefined;
  let lastTool: WorkbenchToolKind = 'problems';
  let toolsShown = false;
  let sized = false;
  let overlayMode = false;
  let overlayVisible = false;

  /** 窄屏下侧栏作为抽屉浮出时盖住编辑区的遮罩，点击请求宿主收起。 */
  const scrim = document.createElement('div');
  scrim.className = 'wb-side-scrim';
  scrim.addEventListener('click', () => callbacks.onCloseSidebar?.());

  /** 预览的初始宽度：桌面固定 400，窄屏按工作台宽度 45% 缩放并保底 160。 */
  const previewWidth = (width: number): number => Math.max(160, Math.min(400, Math.round(width * 0.45)));
  /** 底部工具区的初始高度：取工作台高度的 1/3 并保底 180，容纳项目终端的安装与启动输出。 */
  const toolHeight = (height: number): number => Math.max(180, Math.round(height / 3));

  /** 欢迎内容的模板拷贝：每个空组的水印各用一份，互不抢占节点。 */
  function cloneWelcome(): HTMLElement {
    const welcome = welcomeTemplate.content.firstElementChild?.cloneNode(true);
    if (!(welcome instanceof HTMLElement)) throw new Error('Dockview 布局缺少欢迎内容');
    return welcome;
  }

  function ensureSideGroup(): NonNullable<ReturnType<DockviewApi['getEdgeGroup']>> {
    const existing = api.getEdgeGroup('left');
    if (existing) return existing;
    const created = api.addEdgeGroup('left', { ...SIDEBAR_EDGE, initialSize: SIDEBAR_WIDTH });
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

  /** 强制按当前容器尺寸重布局；侧栏内容高度为 0 时重建边缘组（见调用处注释）。 */
  function refreshLayout(): void {
    if (disposed || container.clientWidth <= 0 || container.clientHeight <= 0) return;
    const host = hosts.get('sidebar');
    // dockview 在挂载窗口内按 0 尺寸建立的边缘组布局会永久塌陷（上游已知竞态），
    // 检测到侧栏内容高度为 0 时移出再放回，按当前容器尺寸重建边缘组。
    if (!overlayMode && host && host.clientHeight <= 0) {
      setSidebarOverlay(true);
      setSidebarOverlay(false);
      return;
    }
    api.layout(container.clientWidth, container.clientHeight, true);
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
    // 编辑区没有内容时空组渲染的水印：欢迎内容是默认背景，不是标签；每个空组各克隆一份
    createWatermarkComponent: () => ({ element: cloneWelcome(), init: () => undefined }),
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
    createTabComponent: options =>
      isTool(options.id) ?
        createToolTab(options.id, showToolMenu)
      : createTab(options.id, auxiliaryIds.has(options.id), callbacks, root, () => closePanel(options.id)),
    createRightHeaderActionComponent: group =>
      createGroupActions(group, splitPanel, showToolMenu, callbacks.onPreviewMarkdown)
  });

  function splitPanel(panel: IDockviewPanel): void {
    // 窄屏横向空间不足，拆分方向改为上下，对齐 VS Code 的小窗口行为
    const position = api.width < 720 ? 'bottom' : 'right';
    program(() => panel.api.moveTo({ group: panel.group, position }));
  }

  /** 编辑区里放着编辑器或差异面板的面板。 */
  const isEditorAreaPanel = (id: string): boolean => editorPath(id) !== undefined || auxiliaryIds.has(id);

  /** 新编辑器与差异面板的落点：活动编辑器所在组，其次任一编辑器、任一差异面板所在组，都没有时是留作欢迎背景的空组。 */
  function editorGroup() {
    return (
      (lastEditor ? api.getPanel(editorId(lastEditor))?.group : undefined) ??
      api.panels.find(panel => editorPath(panel.id) !== undefined)?.group ??
      api.panels.find(panel => auxiliaryIds.has(panel.id))?.group ??
      emptyGroups()[0]
    );
  }

  function addStatic(id: keyof typeof titles, referenceGroup?: string, index?: number): IDockviewPanel {
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
      position: { referenceGroup: group, direction: 'within' as const, ...(index === undefined ? {} : { index }) }
    });
  }

  /**
   * 补建空的编辑区：预览开在右侧时贴着它左边，免得掉到预览上方；
   * 没有预览时落在最上层，补建会把上下重新均分，底部工具组回到默认高度。
   */
  function addEditorArea(): DockviewGroupPanel {
    const preview = api.getPanel('preview')?.group;
    if (preview) {
      const room = preview.api.width - previewWidth(api.width);
      return api.addGroup({ referenceGroup: preview, direction: 'left', ...(room > 0 ? { initialWidth: room } : {}) });
    }
    const group = api.addGroup();
    const bottom = tools.map(kind => api.getPanel(kind)?.group).find(Boolean);
    if (bottom) sizeToolGroup(bottom);
    return group;
  }

  /**
   * 对齐 VS Code：编辑区没有任何内容时展示欢迎背景，而不是一个「欢迎」标签。
   * 放着编辑器或差异面板的组就是编辑区，其余空组回收；一个内容都没有时恰好留一个空组（由水印展示欢迎），缺则补建。
   */
  function settleEditorArea(keep?: DockviewGroupPanel): void {
    program(() => {
      const empties = emptyGroups();
      const filled = api.panels.some(panel => isEditorAreaPanel(panel.id));
      const home = filled ? undefined : (empties.find(group => group === keep) ?? empties[0]);
      for (const group of empties) if (group !== home) api.removeGroup(group);
      if (!filled && !home) addEditorArea();
    });
  }

  /** 移除面板；它若是编辑区最后一个内容，保留空组当欢迎背景，免得 closeEmptyGroups 把整块编辑区收掉、其余分组跟着跳。 */
  function removeFromEditorArea(panel: IDockviewPanel): void {
    const last =
      isEditorAreaPanel(panel.id) && !api.panels.some(other => other !== panel && isEditorAreaPanel(other.id));
    api.removePanel(panel, last ? { removeEmptyGroup: false } : undefined);
  }

  /** 标签上的关闭按钮、中键与右键菜单的「关闭」统一走这里。 */
  function closePanel(id: string): void {
    const panel = api.getPanel(id);
    if (panel) removeFromEditorArea(panel);
  }

  /** 无参照组的 addGroup 不认 initialHeight（dockview 按均分插入），只能建组后显式定高；无尺寸时交给首次布局。 */
  function sizeToolGroup(group: DockviewGroupPanel): void {
    if (api.height > 0) group.api.setSize({ height: toolHeight(api.height) });
  }

  function addTool(kind: WorkbenchToolKind): IDockviewPanel {
    const existing = tools.map(tool => api.getPanel(tool)?.group).find(Boolean);
    if (existing) {
      // 按固定顺序放回，被隐藏后重新显示的工具不会排到最后
      const before = tools.slice(0, tools.indexOf(kind)).filter(tool => existing.panels.some(({ id }) => id === tool));
      return addStatic(kind, existing.id, before.length);
    }
    const group = api.addGroup({ direction: 'below', skipSetActive: true });
    sizeToolGroup(group);
    return addStatic(kind, group.id);
  }

  const openTools = (): WorkbenchToolKind[] => tools.filter(kind => Boolean(api.getPanel(kind)));

  /** 右键菜单隐藏一个工具：记入隐藏集，之后整体开合底部面板也不会带回；唯一显示的工具不可隐藏。 */
  function hideTool(kind: WorkbenchToolKind): void {
    const panel = api.getPanel(kind);
    const [fallback] = openTools().filter(tool => tool !== kind);
    if (!panel || fallback === undefined) return;
    const group = panel.group;
    const wasActive = group.activePanel === panel;
    hiddenTools.add(kind);
    program(() => api.removePanel(panel));
    stash(kind);
    const next = wasActive ? group.activePanel?.id : undefined;
    if (next !== undefined && isTool(next)) {
      lastTool = next;
      callbacks.onSelectTool(next);
    } else if (lastTool === kind) {
      lastTool = fallback;
    }
  }

  /** 工具标签栏的右键菜单：四个工具的显隐开关，对齐 VS Code 底部面板。 */
  function showToolMenu(event: MouseEvent): void {
    const open = openTools();
    showMenu(
      event,
      tools.map(kind => {
        const checked = open.includes(kind);
        return {
          label: titles[kind],
          checked,
          disabled: checked && open.length === 1,
          action: () => (checked ? hideTool(kind) : showTool(kind))
        };
      }),
      root
    );
  }

  function addPreview(reference = editorGroup()): IDockviewPanel {
    const existing = api.getPanel('preview');
    if (existing) return existing;
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
        api.getEdgeGroup('left')?.setSize({ width: SIDEBAR_WIDTH });
        api.getPanel('preview')?.group.api.setSize({ width: previewWidth(api.width) });
        api.getPanel('problems')?.group.api.setSize({ height: toolHeight(api.height) });
      });
      // 边缘组面板经 overlay 渲染容器定位，其首帧测量为 0 时不再重试；
      // 布局落地后兜底重布局，让 overlay 按真实容器尺寸重新定位。
      requestAnimationFrame(() => {
        requestAnimationFrame(() => refreshLayout());
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
          settleEditorArea();
          return;
        }
        if (auxiliaryIds.delete(panel.id)) {
          hosts.delete(panel.id);
          callbacks.onCloseAuxiliary?.(panel.id);
          settleEditorArea();
          return;
        }
        if (panel.id === 'preview') callbacks.onClosePreview?.();
        stash(panel.id);
        if (isTool(panel.id)) reportTools(tools.some(kind => Boolean(api.getPanel(kind))));
      });
    })
  );

  const side = api.addEdgeGroup('left', { ...SIDEBAR_EDGE, initialSize: SIDEBAR_WIDTH });
  side.locked = 'no-drop-target';
  const sideGroup = api.getGroup(side.id);
  if (!sideGroup) throw new Error('Dockview 侧栏初始化失败');
  sideGroup.model.header.hidden = true;
  addStatic('sidebar', side.id);
  // 编辑区起初是个空组：没有标签，由水印展示欢迎背景，打开第一个文件时才出现第一个标签
  api.addGroup();
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
      api.addPanel({
        id,
        component: 'editor',
        title: path.split('/').at(-1) ?? path,
        params: { path },
        renderer: 'always',
        inactive: true,
        position: { referenceGroup: editorGroup() ?? addEditorArea(), direction: 'within' }
      });
    });
    return host;
  }

  function showTool(kind: WorkbenchToolKind): void {
    // 显式显示的工具撤销之前的隐藏；其余仍隐藏的工具不随之带回
    hiddenTools.delete(kind);
    program(() => {
      tools.filter(tool => !hiddenTools.has(tool)).forEach(addTool);
      api.getPanel(kind)?.api.setActive();
    });
    lastTool = kind;
    reportTools(true);
    callbacks.onSelectTool(kind);
  }

  function ensureAuxiliary(id: string, title: string, direction: 'right' | 'within' = 'within'): HTMLElement {
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
      api.addPanel({
        id,
        component: 'auxiliary',
        title,
        renderer: 'always',
        position: { referenceGroup: editorGroup() ?? addEditorArea(), direction }
      });
    });
    return host;
  }

  function resetLayout(): void {
    program(() => {
      const activeAuxiliary = api.activePanel && auxiliaryIds.has(api.activePanel.id) ? api.activePanel.id : undefined;
      api.exitMaximizedGroup();
      const editors = api.panels.filter(panel => isEditorAreaPanel(panel.id));
      const group = api.addGroup({ direction: 'left', skipSetActive: true });
      for (const panel of editors) panel.api.moveTo({ group, position: 'center', skipSetActive: true });
      // 没有编辑器可搬时旧的空编辑组还留在原处：趁预览与工具组还没建，只留新建的这一个
      settleEditorArea(group);
      const preview = addPreview(group);
      const previewGroup = api.addGroup({
        referenceGroup: group,
        direction: 'right',
        initialWidth: previewWidth(api.width),
        skipSetActive: true
      });
      preview.api.moveTo({ group: previewGroup, position: 'center', skipSetActive: true });
      hiddenTools.clear();
      const bottom = api.addGroup({ direction: 'below', skipSetActive: true });
      for (const kind of tools)
        addStatic(kind, bottom.id).api.moveTo({ group: bottom, position: 'center', skipSetActive: true });
      // 旧工具组清空移除后会重新分配高度，移完再定高
      sizeToolGroup(bottom);
      if (!overlayMode) {
        api.getEdgeGroup('left')?.setSize({ width: SIDEBAR_WIDTH });
        api.getEdgeGroup('left')?.expand();
        api.setEdgeGroupVisible('left', true);
      }
      api.getPanel(lastTool)?.api.setActive();
      if (activeAuxiliary) api.getPanel(activeAuxiliary)?.api.setActive();
      else if (lastEditor && api.getPanel(editorId(lastEditor))) api.getPanel(editorId(lastEditor))?.api.setActive();
      else if (group.panels.length === 0) group.api.setActive();
    });
    reportTools(true);
  }

  /** 网格中没有面板的组；左侧边缘组不算。 */
  function emptyGroups(): DockviewGroupPanel[] {
    const edge = api.getEdgeGroup('left')?.id;
    return api.groups.filter(group => group.panels.length === 0 && group.id !== edge);
  }

  /** 恢复时的面板状态：已在 Dockview 中的沿用自身状态（标题、参数不被布局改写），未打开的编辑器与辅助面板不保留。 */
  function restorableState(id: string): GroupviewPanelState | undefined {
    if (auxiliaryIds.has(id)) return undefined;
    const panel = api.getPanel(id);
    if (panel) return panel.toJSON();
    return isStatic(id) ? { id, contentComponent: id, title: titles[id], renderer: 'always' } : undefined;
  }

  /** fromJSON 会清掉布局之外的面板：编辑器与辅助面板连同原宿主放回编辑区，静态面板回存 staging。 */
  function restorePanel(id: string, state: GroupviewPanelState): void {
    if (editorPath(id) === undefined && !auxiliaryIds.has(id)) {
      stash(id);
      return;
    }
    const group = editorGroup() ?? addEditorArea();
    api.addPanelFromJSON(state, { position: { referenceGroup: group, direction: 'within' }, inactive: true });
  }

  function serializeLayout(): SerializedDockview {
    const layout = normalizeWorkbenchLayout(api.toJSON(), {
      sidebar: !overlayMode,
      panel: id =>
        auxiliaryIds.has(id) ? undefined : { id, contentComponent: editorPath(id) === undefined ? id : 'editor' }
    });
    if (!layout) throw new Error('Dockview 导出的布局未通过校验');
    return layout;
  }

  function applyLayout(value: unknown): boolean {
    const layout = normalizeWorkbenchLayout(value, { sidebar: !overlayMode, panel: restorableState });
    if (!layout) return false;
    const before = new Map(api.panels.map(panel => [panel.id, panel.toJSON()] as const));
    program(() => {
      api.fromJSON(layout, { reuseExistingPanels: true });
      for (const [id, state] of before) if (!api.getPanel(id)) restorePanel(id, state);
      if (!overlayMode && !api.getPanel('sidebar')) addStatic('sidebar', ensureSideGroup().id);
      // 布局里的编辑器都没打开时，原编辑区留下的空组当欢迎背景，其余空组回收
      settleEditorArea();
    });
    // 布局里没有的工具就是用户隐藏的；底部面板整体关闭的布局没有隐藏信息，所有工具重新可用
    const shown = openTools();
    const missing = shown.length > 0 ? tools.filter(kind => !shown.includes(kind)) : [];
    hiddenTools.clear();
    for (const kind of missing) hiddenTools.add(kind);
    const tool = tools.map(kind => api.getPanel(kind)).find(Boolean)?.group.activePanel?.id;
    if (tool && isTool(tool)) lastTool = tool;
    reportTools(tools.some(kind => Boolean(api.getPanel(kind))));
    if (before.has('preview') && !api.getPanel('preview')) callbacks.onClosePreview?.();
    // 已按布局定好尺寸，首次非零布局不再套用默认宽高
    if (api.width > 0 && api.height > 0) sized = true;
    return true;
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
        if (panel) removeFromEditorArea(panel);
      });
      closing.delete(id);
      hosts.delete(id);
      settleEditorArea();
    },
    setEditorTitle(path, title) {
      api.getPanel(editorId(path))?.api.setTitle(title);
    },
    setEditorPreview(path, preview) {
      const panel = api.getPanel(editorId(path));
      if (panel && panel.params?.['preview'] !== preview) panel.api.updateParameters({ preview });
    },
    getEditorGroupPaths: () =>
      (editorGroup()?.panels ?? []).flatMap(panel => {
        const path = editorPath(panel.id);
        return path === undefined ? [] : [path];
      }),
    ensureAuxiliary,
    removeAuxiliary(id) {
      if (!auxiliaryIds.has(id)) return;
      const panel = api.getPanel(id);
      program(() => {
        if (panel) removeFromEditorArea(panel);
      });
      closing.delete(id);
      auxiliaryIds.delete(id);
      hosts.delete(id);
      settleEditorArea();
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
        showTool(lastTool);
      }
    },
    isToolsVisible: () => tools.some(kind => Boolean(api.getPanel(kind))),
    showPreview() {
      program(() => addPreview().api.setActive());
    },
    isPreviewOpen: () => Boolean(api.getPanel('preview')),
    splitEditor() {
      const panel = lastEditor ? api.getPanel(editorId(lastEditor)) : undefined;
      if (panel) splitPanel(panel);
    },
    resetLayout,
    refreshLayout,
    serializeLayout,
    applyLayout,
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
      hiddenTools.clear();
    }
  };
}
