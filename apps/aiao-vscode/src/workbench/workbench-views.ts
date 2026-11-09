import {
  createPaneview,
  DockviewCompositeDisposable,
  DockviewEmitter,
  getPaneData,
  getPanelData,
  positionToDirection,
  type AddPanelOptions,
  type DockviewApi,
  type DockviewIDisposable,
  type IContentRenderer,
  type IPanePart,
  type PanePanelComponentInitParameter,
  type PaneviewApi
} from 'dockview-core';
import { createCodicon } from './workbench-icons.js';
import { parseWorkbenchViewLayout, type WorkbenchViewLayout, type WorkbenchViewState } from './workbench-view-state.js';

/** 可迁移的视图，正文和标题的生命周期由工作台持有。 */
export interface WorkbenchView {
  readonly id: string;
  readonly title: string;
  readonly element: HTMLElement;
  readonly header: HTMLElement;
  readonly containerId: string;
  readonly size?: number;
  readonly expanded?: boolean;
  readonly visible?: boolean;
}

interface Entry {
  view: WorkbenchView;
  readonly initial: WorkbenchViewState;
  state: WorkbenchViewState;
  available: boolean;
}

interface Container {
  readonly element: HTMLElement;
  readonly api: PaneviewApi;
  readonly subscriptions: DockviewCompositeDisposable;
  sourceId?: string;
}

/** 原生 Dockview 与嵌套 Paneview 的共享视图桥。 */
export interface WorkbenchViews extends DockviewIDisposable {
  readonly onDidLayoutChange: (listener: () => void) => DockviewIDisposable;
  addContainer(options: { id: string; element: HTMLElement }): void;
  addView(view: WorkbenchView): void;
  getContainerApi(id: string): PaneviewApi;
  getView(id: string): WorkbenchView;
  has(id: string): boolean;
  isVisible(id: string): boolean;
  isDetached(id: string): boolean;
  isExpanded(id: string): boolean;
  setVisible(id: string, visible: boolean): void;
  setAvailable(id: string, available: boolean): void;
  setExpanded(id: string, expanded: boolean): void;
  setTitle(id: string, title: string): void;
  moveToDock(id: string, position?: AddPanelOptions['position']): void;
  moveToContainer(id: string, index?: number): void;
  setDockVisible(visible: boolean): void;
  hasDockedViews(): boolean;
  createComponent(id: string): IContentRenderer;
  serialize(): WorkbenchViewLayout;
  prepare(value: unknown, dockPanels: Readonly<Record<string, unknown>>): WorkbenchViewLayout | null;
  restore(layout: WorkbenchViewLayout): void;
  reset(): void;
}

interface Host {
  readonly root: HTMLElement;
  readonly dock: DockviewApi;
  program<T>(action: () => T): T;
  isSyncing(): boolean;
  showMenu(event: MouseEvent, id: string): void;
}

/** 为侧栏创建可折叠、可调高、可排序的容器，并迁移原有正文节点。 */
export function createWorkbenchViews(host: Host): WorkbenchViews {
  const entries = new Map<string, Entry>();
  const containers = new Map<string, Container>();
  const subscriptions = new DockviewCompositeDisposable();
  const changed = new DockviewEmitter<void>();
  const parking = document.createElement('div');
  parking.hidden = true;
  parking.dataset['viewParking'] = '';
  host.root.append(parking);
  let dockVisible = true;
  let disposed = false;

  function entry(id: string): Entry {
    const value = entries.get(id);
    if (!value) throw new Error(`未知工作台视图 ${id}`);
    return value;
  }

  function container(id: string): Container {
    const value = containers.get(id);
    if (!value) throw new Error(`未知视图容器 ${id}`);
    return value;
  }

  function capture(): void {
    for (const current of containers.values()) {
      const views = current.api.toJSON().views;
      views.forEach((pane, index) => {
        const item = entry(pane.data.id);
        item.state = {
          ...item.state,
          index,
          expanded: pane.expanded ?? false,
          ...(pane.expanded && pane.size >= 28 ? { size: pane.size } : {})
        };
      });
    }
  }

  function notify(): void {
    if (!disposed && !host.isSyncing()) changed.fire();
  }

  function renderer(id: string, header = false) {
    const view = entry(id).view;
    const content = header ? view.header : view.element;
    const element = document.createElement('div');
    element.className = header ? 'wb-view-heading' : 'wb-view-content';
    element.append(content);
    return {
      element,
      init: () => undefined,
      update: () => undefined,
      dispose() {
        if (content.parentElement === element) parking.append(content);
      }
    };
  }

  function headerRenderer(id: string): IPanePart {
    const part = renderer(id, true);
    const item = entry(id);
    const disposables = new DockviewCompositeDisposable();
    const toggle = () => setExpanded(id, !item.state.expanded);
    const onClick = (event: MouseEvent): void => {
      if (event.target instanceof Element && event.target.closest('button,input,textarea')) return;
      toggle();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        item.view.header.querySelector('[data-tree-section]') ||
        event.target instanceof HTMLInputElement
      )
        return;
      if (!['Enter', ' ', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft') setExpanded(id, false);
      else if (event.key === 'ArrowRight') setExpanded(id, true);
      else toggle();
    };
    const onMenu = (event: MouseEvent): void => {
      if (!item.view.header.querySelector('[data-tree-section]')) host.showMenu(event, id);
    };
    const update = (): void => {
      const primary = item.view.header.querySelector<HTMLElement>('[data-tree-section]') ?? part.element;
      primary.setAttribute('aria-expanded', String(item.state.expanded));
      const icon = primary.querySelector('.codicon');
      if (icon) icon.replaceWith(createCodicon(item.state.expanded ? 'chevron-down' : 'chevron-right'));
    };
    return {
      ...part,
      init(parameters: PanePanelComponentInitParameter) {
        container(item.view.containerId).sourceId = parameters.accessor.id;
        part.element.dataset['viewHeader'] = id;
        part.element.setAttribute('aria-label', `${item.view.title}部分`);
        if (!item.view.header.querySelector('button')) {
          part.element.tabIndex = 0;
          part.element.setAttribute('role', 'button');
        }
        update();
        disposables.addDisposables(
          parameters.api.onDidExpansionChange(event => {
            item.state = { ...item.state, expanded: event.isExpanded };
            if (event.isExpanded) parameters.api.setSize({ size: item.state.size });
            update();
          })
        );
        part.element.addEventListener('click', onClick);
        part.element.addEventListener('keydown', onKey);
        part.element.addEventListener('contextmenu', onMenu);
      },
      dispose() {
        disposables.dispose();
        part.element.removeEventListener('click', onClick);
        part.element.removeEventListener('keydown', onKey);
        part.element.removeEventListener('contextmenu', onMenu);
        part.dispose();
      }
    };
  }

  function syncEmpty(current: Container): void {
    const empty = !current.api.panels.some(panel => panel.api.isVisible);
    current.element.classList.toggle('wb-view-container-empty', empty);
  }

  function addPane(item: Entry, index = item.state.index): void {
    const current = container(item.view.containerId);
    if (!item.state.visible || !item.available || current.api.getPanel(item.view.id)) return;
    current.api.addPanel({
      id: item.view.id,
      title: item.view.title,
      component: 'view',
      headerComponent: 'view',
      size: item.state.size,
      isExpanded: item.state.expanded,
      headerSize: window.matchMedia('(pointer: coarse)').matches ? 38 : 28,
      minimumBodySize: 60,
      index: Math.min(index, current.api.panels.length)
    });
    syncEmpty(current);
  }

  function removePane(item: Entry): void {
    const current = container(item.view.containerId);
    const panel = current.api.getPanel(item.view.id);
    if (panel) current.api.removePanel(panel);
    syncEmpty(current);
  }

  function dockPosition(): AddPanelOptions['position'] {
    const reference = host.dock.panels.find(
      panel => ['terminal', 'problems', 'output', 'console'].includes(panel.id) || entries.has(panel.id)
    );
    return reference ? { referenceGroup: reference.group, direction: 'within' } : { direction: 'below' };
  }

  function addDock(item: Entry, position = dockPosition()): void {
    host.dock.addPanel({ id: item.view.id, component: 'view', title: item.view.title, renderer: 'always', position });
  }

  function setDockVisible(visible: boolean): void {
    dockVisible = visible;
    host.program(() => {
      for (const [id, item] of entries) {
        if (!item.state.detached || !item.state.visible) continue;
        const panel = host.dock.getPanel(id);
        if (visible && !panel) addDock(item);
        if (!visible && panel) host.dock.removePanel(panel);
      }
    });
    notify();
  }

  function preserveFocus(action: () => void): void {
    const active = host.root.ownerDocument.activeElement;
    action();
    if (active instanceof HTMLElement && active.isConnected) active.focus({ preventScroll: true });
  }

  function moveToDock(id: string, position?: AddPanelOptions['position']): void {
    const item = entry(id);
    if (item.state.detached) return;
    capture();
    const before = item.state;
    host.program(() =>
      preserveFocus(() => {
        removePane(item);
        item.state = { ...before, detached: true, visible: true };
        try {
          addDock(item, position);
          setDockVisible(true);
        } catch (cause) {
          item.state = before;
          addPane(item);
          throw cause;
        }
      })
    );
    notify();
  }

  function moveToContainer(id: string, index?: number): void {
    const item = entry(id);
    if (!item.state.detached) return;
    const panel = host.dock.getPanel(id);
    const before = item.state;
    const group = panel?.group;
    const dockIndex = group?.panels.indexOf(panel!);
    host.program(() =>
      preserveFocus(() => {
        if (panel) host.dock.removePanel(panel, { removeEmptyGroup: false });
        item.state = { ...before, detached: false, visible: true, index: index ?? before.index };
        try {
          addPane(item);
        } catch (cause) {
          removePane(item);
          item.state = before;
          addDock(item, group ? { referenceGroup: group, direction: 'within', index: dockIndex } : undefined);
          throw cause;
        }
        if (group?.panels.length === 0) host.dock.removeGroup(group);
      })
    );
    notify();
  }

  function setExpanded(id: string, expanded: boolean): void {
    const item = entry(id);
    if (item.state.expanded === expanded) return;
    capture();
    item.state = { ...item.state, expanded };
    container(item.view.containerId).api.getPanel(id)?.api.setExpanded(expanded);
    notify();
  }

  function setVisible(id: string, visible: boolean): void {
    const item = entry(id);
    if (item.state.visible === visible) return;
    capture();
    item.state = { ...item.state, visible };
    host.program(() => {
      if (!item.state.detached) {
        if (visible) addPane(item);
        else removePane(item);
      } else if (visible) {
        setDockVisible(true);
      } else {
        const panel = host.dock.getPanel(id);
        if (panel) host.dock.removePanel(panel);
      }
    });
    syncEmpty(container(item.view.containerId));
    notify();
  }

  function paneSource(): string | undefined {
    const source = getPaneData();
    const item = source && entries.get(source.paneId);
    if (!source || !item || item.state.detached) return undefined;
    return container(item.view.containerId).sourceId === source.viewId ? source.paneId : undefined;
  }

  function dockSource(): string | undefined {
    const source = getPanelData();
    return source?.viewId === host.dock.id && source.panelId && entries.has(source.panelId) ?
        source.panelId
      : undefined;
  }

  function addContainer(options: { id: string; element: HTMLElement }): void {
    if (containers.has(options.id)) throw new Error(`视图容器重复 ${options.id}`);
    options.element.classList.add('wb-view-container');
    options.element.dataset['viewContainer'] = options.id;
    const api = createPaneview(options.element, {
      createComponent: ({ id }) => renderer(id),
      createHeaderComponent: ({ id }) => headerRenderer(id)
    });
    const current: Container = { ...options, api, subscriptions: new DockviewCompositeDisposable() };
    containers.set(options.id, current);
    current.subscriptions.addDisposables(
      api.onDidLayoutChange(() => {
        syncEmpty(current);
        notify();
      })
    );
    current.subscriptions.addDisposables(
      api.onUnhandledDragOver(event => {
        const id = dockSource();
        if (id && entry(id).view.containerId === options.id) event.accept();
      })
    );
    current.subscriptions.addDisposables(
      api.onDidDrop(event => {
        const id = dockSource();
        if (!id || entry(id).view.containerId !== options.id) return;
        moveToContainer(id, api.panels.indexOf(event.panel) + (event.position === 'bottom' ? 1 : 0));
      })
    );
    const emptyOver = (event: DragEvent): void => {
      if (!dockSource() || !options.element.classList.contains('wb-view-container-empty')) return;
      event.preventDefault();
      event.stopPropagation();
      options.element.classList.add('wb-view-drop');
    };
    const clear = () => options.element.classList.remove('wb-view-drop');
    const emptyDrop = (event: DragEvent): void => {
      const id = dockSource();
      if (!id || !options.element.classList.contains('wb-view-container-empty')) return;
      event.preventDefault();
      event.stopPropagation();
      clear();
      if (entry(id).view.containerId === options.id) moveToContainer(id, 0);
    };
    options.element.addEventListener('dragover', emptyOver);
    options.element.addEventListener('dragleave', clear);
    options.element.addEventListener('drop', emptyDrop);
    current.subscriptions.addDisposables({
      dispose() {
        options.element.removeEventListener('dragover', emptyOver);
        options.element.removeEventListener('dragleave', clear);
        options.element.removeEventListener('drop', emptyDrop);
      }
    });
    syncEmpty(current);
  }

  function restore(layout: WorkbenchViewLayout): void {
    host.program(() => {
      for (const current of containers.values()) current.api.clear();
      dockVisible = layout.dockVisible;
      for (const [id, state] of Object.entries(layout.views)) entry(id).state = { ...state };
      const ordered = [...entries.values()].sort((a, b) => a.state.index - b.state.index);
      ordered.filter(item => !item.state.detached && item.available).forEach(item => addPane(item));
    });
  }

  function defaults(): Record<string, WorkbenchViewState> {
    return Object.fromEntries([...entries].map(([id, item]) => [id, item.initial]));
  }

  subscriptions.addDisposables(
    host.dock.onUnhandledDragOver(event => {
      if (paneSource() && event.group?.id !== 'sidebar') event.accept();
    })
  );
  subscriptions.addDisposables(
    host.dock.onDidDrop(event => {
      const id = paneSource();
      if (!id || event.group?.id === 'sidebar') return;
      moveToDock(id, {
        ...(event.group ? { referenceGroup: event.group } : {}),
        direction: positionToDirection(event.position),
        ...(event.index === undefined ? {} : { index: event.index })
      });
    })
  );
  subscriptions.addDisposables(
    host.dock.onDidRemovePanel(panel => {
      const item = entries.get(panel.id);
      if (!item || host.isSyncing()) return;
      queueMicrotask(() => {
        if (disposed || host.dock.getPanel(panel.id) || !item.state.detached) return;
        item.state = { ...item.state, visible: false };
        notify();
      });
    })
  );

  return {
    onDidLayoutChange: changed.event,
    addContainer,
    addView(view) {
      if (entries.has(view.id) || host.dock.getPanel(view.id)) throw new Error(`工作台视图重复 ${view.id}`);
      container(view.containerId);
      const initial: WorkbenchViewState = {
        containerId: view.containerId,
        index: [...entries.values()].filter(item => item.view.containerId === view.containerId).length,
        size: view.size ?? 240,
        expanded: view.expanded ?? true,
        visible: view.visible ?? true,
        detached: false
      };
      const item: Entry = { view, initial, state: { ...initial }, available: true };
      entries.set(view.id, item);
      view.element.dataset['workbenchView'] = view.id;
      view.header.dataset['workbenchViewHeader'] = view.id;
      parking.append(view.element, view.header);
      addPane(item);
    },
    getContainerApi: id => container(id).api,
    getView: id => entry(id).view,
    has: id => entries.has(id),
    isVisible: id => entry(id).state.visible,
    isDetached: id => entry(id).state.detached,
    isExpanded: id => entry(id).state.expanded,
    setVisible,
    setAvailable(id, available) {
      const item = entry(id);
      if (item.available === available) return;
      capture();
      item.available = available;
      if (item.state.detached) return;
      host.program(() => (available ? addPane(item) : removePane(item)));
    },
    setExpanded,
    setTitle(id, title) {
      const item = entry(id);
      if (item.view.title === title) return;
      item.view = { ...item.view, title };
      host.dock.getPanel(id)?.api.setTitle(title);
    },
    moveToDock,
    moveToContainer,
    setDockVisible,
    hasDockedViews: () => [...entries.keys()].some(id => Boolean(host.dock.getPanel(id))),
    createComponent: id => renderer(id),
    serialize() {
      capture();
      return {
        version: 1,
        dockVisible,
        views: Object.fromEntries([...entries].map(([id, item]) => [id, { ...item.state }]))
      };
    },
    prepare: (value, dockPanels) => parseWorkbenchViewLayout(value, defaults(), dockPanels),
    restore,
    reset() {
      host.program(() => {
        for (const id of entries.keys()) {
          const panel = host.dock.getPanel(id);
          if (panel) host.dock.removePanel(panel);
        }
        restore({ version: 1, dockVisible: true, views: defaults() });
      });
      notify();
    },
    dispose() {
      disposed = true;
      subscriptions.dispose();
      for (const current of containers.values()) {
        current.subscriptions.dispose();
        current.api.dispose();
      }
      changed.dispose();
      parking.remove();
    }
  };
}
