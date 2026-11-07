import { requireCondition } from '../core/errors.js';
import type { Bounds, Mode, WindowModel, WindowRecord, WindowState } from '../core/types.js';

export interface WorkArea {
  width: number;
  height: number;
}

export function createWindowModel(mode: Mode): WindowModel {
  return {
    mode,
    windows: [],
    activeId: null,
    activeWindows: { first: null },
    workspaceId: 'first',
    showingDesktop: false
  };
}

export function constrainBounds(bounds: Bounds, area: WorkArea, minWidth = 360, minHeight = 240): Bounds {
  const width = Math.max(1, Math.min(area.width, Math.max(minWidth, bounds.width)));
  const height = Math.max(1, Math.min(area.height, Math.max(minHeight, bounds.height)));
  return {
    x: Math.max(0, Math.min(bounds.x, area.width - width)),
    y: Math.max(0, Math.min(bounds.y, area.height - 40)),
    width,
    height
  };
}

export function windowById(model: WindowModel, id: string): WindowRecord {
  const win = model.windows.find(win => win.id === id);
  requireCondition(win, 'NOT_FOUND', '窗口已关闭');
  return win;
}

function topZ(model: WindowModel): number {
  return Math.max(0, ...model.windows.map(win => win.z)) + 1;
}

export function openWindow(model: WindowModel, instanceId: string, appId: string, area: WorkArea): WindowRecord {
  requireCondition(!model.windows.some(win => win.instanceId === instanceId), 'EXISTS', '实例已有窗口');
  const offset = (model.windows.length % 6) * 28;
  const bounds = constrainBounds({ x: 90 + offset, y: 48 + offset, width: 800, height: 520 }, area);
  const win: WindowRecord = {
    id: crypto.randomUUID(),
    instanceId,
    appId,
    workspaceId: model.workspaceId,
    title: appId,
    bounds,
    normalBounds: { ...bounds },
    state: 'normal',
    previousState: 'normal',
    beforeMinimized: 'normal',
    z: topZ(model)
  };
  model.windows.push(win);
  model.activeId = win.id;
  model.activeWindows[win.workspaceId] = win.id;
  model.showingDesktop = false;
  return win;
}

export function activateWindow(model: WindowModel, id: string): void {
  const win = windowById(model, id);
  if (win.state === 'minimized') win.state = win.beforeMinimized;
  model.workspaceId = win.workspaceId;
  model.activeId = win.id;
  model.activeWindows[win.workspaceId] = win.id;
  model.showingDesktop = false;
  win.z = topZ(model);
}

export function visibleWindows(model: WindowModel): WindowRecord[] {
  return model.windows.filter(win => win.workspaceId === model.workspaceId && win.state !== 'minimized');
}

export function focusRecent(model: WindowModel): void {
  model.activeId = visibleWindows(model).sort((a, b) => b.z - a.z)[0]?.id ?? null;
  model.activeWindows[model.workspaceId] = model.activeId;
}

export function switchWorkspace(model: WindowModel, id: string): void {
  model.activeWindows[model.workspaceId] = model.activeId;
  model.workspaceId = id;
  model.showingDesktop = false;
  const remembered = model.activeWindows[id];
  if (remembered === null) {
    model.activeId = null;
    return;
  }
  const win = visibleWindows(model).find(item => item.id === remembered);
  if (win) {
    model.activeId = win.id;
    return;
  }
  focusRecent(model);
}

export function setWindowState(model: WindowModel, id: string, action: WindowState | 'restore', area: WorkArea): void {
  const win = windowById(model, id);
  if (action === 'minimized') {
    if (win.state === 'minimized') return;
    win.beforeMinimized = win.state;
    win.state = action;
    focusRecent(model);
    return;
  }
  const state = action === 'restore' ? restoredState(win) : action;
  if (win.state === 'normal' && state !== 'normal') win.normalBounds = { ...win.bounds };
  if (state === 'maximized' && win.state !== 'maximized' && win.state !== 'minimized') win.previousState = win.state;
  win.state = state;
  const geometries = {
    normal: () => constrainBounds(win.normalBounds, area),
    maximized: () => ({ x: 0, y: 0, width: area.width, height: area.height }),
    left: () => ({ x: 0, y: 0, width: area.width / 2, height: area.height }),
    right: () => ({ x: area.width / 2, y: 0, width: area.width / 2, height: area.height })
  };
  win.bounds = geometries[state]();
  activateWindow(model, id);
}

function restoredState(win: WindowRecord): Exclude<WindowState, 'minimized'> {
  if (win.state === 'minimized') return win.beforeMinimized;
  if (win.state === 'maximized') return win.previousState;
  return 'normal';
}

export function switchMode(model: WindowModel, mode: Mode, area: WorkArea): void {
  model.mode = mode;
  for (const win of model.windows) win.bounds = constrainBounds(win.bounds, area);
}

export function removeWindow(model: WindowModel, id: string): void {
  model.windows = model.windows.filter(win => win.id !== id);
  focusRecent(model);
}
