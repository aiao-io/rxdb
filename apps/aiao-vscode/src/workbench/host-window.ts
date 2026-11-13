import { workbenchElement } from './workbench-layout.js';

/** 宿主窗口状态里工作台关心的部分。 */
export interface WorkbenchHostWindowState {
  readonly focused: boolean;
  readonly maximized: boolean;
}

/**
 * 宿主窗口：Aiao Desktop 以透明窗口嵌入工作台时由 `@aiao/orbit/window` 提供，接口对齐 Tauri 的
 * `getCurrentWindow()`。工作台在标题栏左侧画红黄绿按钮，调用宿主的关闭、最小化与缩放。
 */
export interface WorkbenchHostWindow {
  readonly state: WorkbenchHostWindowState;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  onStateChange(handler: (state: WorkbenchHostWindowState) => void): () => void;
}

const BUTTONS = [
  ['close', '关闭'],
  ['minimize', '最小化'],
  ['maximize', '缩放']
] as const;

type WindowAction = (typeof BUTTONS)[number][0];

/**
 * 在工作台标题栏装上宿主窗口的红黄绿按钮：标题栏本身标成拖动区（`data-orbit-drag-region`，
 * 其中的按钮与输入框不可拖），按钮随窗口是否在前台置灰。返回卸载函数。
 */
export function attachHostWindow(root: HTMLElement, hostWindow: WorkbenchHostWindow): () => void {
  const title = workbenchElement(root, '.wb-title');
  const controls = root.ownerDocument.createElement('div');
  controls.className = 'wb-window-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', '窗口');
  controls.innerHTML = BUTTONS.map(
    ([action, label]) =>
      `<button type="button" data-window-action="${action}" aria-label="${label}" title="${label}"></button>`
  ).join('');
  const actions: Readonly<Record<WindowAction, () => Promise<void>>> = {
    close: () => hostWindow.close(),
    minimize: () => hostWindow.minimize(),
    maximize: () => hostWindow.toggleMaximize()
  };
  const click = (event: MouseEvent) => {
    const action = (event.target as Element).closest<HTMLElement>('[data-window-action]')?.dataset['windowAction'];
    if (action) void actions[action as WindowAction]();
  };
  const apply = (state: WorkbenchHostWindowState) => {
    root.dataset['windowFocused'] = String(state.focused);
    root.dataset['windowMaximized'] = String(state.maximized);
  };
  const previousMode = root.dataset['displayMode'];
  root.dataset['displayMode'] = 'desktop-window';
  title.setAttribute('data-orbit-drag-region', '');
  title.prepend(controls);
  controls.addEventListener('click', click);
  apply(hostWindow.state);
  const unsubscribe = hostWindow.onStateChange(apply);
  return () => {
    unsubscribe();
    controls.removeEventListener('click', click);
    controls.remove();
    title.removeAttribute('data-orbit-drag-region');
    if (previousMode) root.dataset['displayMode'] = previousMode;
    delete root.dataset['windowFocused'];
    delete root.dataset['windowMaximized'];
  };
}
