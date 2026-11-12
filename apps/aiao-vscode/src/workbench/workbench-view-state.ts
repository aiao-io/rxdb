import type { SerializedDockview } from 'dockview-core';

/** 一个视图的布局状态；size 始终记录展开高度。 */
export interface WorkbenchViewState {
  readonly containerId: string;
  readonly index: number;
  readonly size: number;
  readonly expanded: boolean;
  readonly visible: boolean;
  readonly detached: boolean;
}

/** 嵌套视图布局，与 Dockview 网格一起原子保存。 */
export interface WorkbenchViewLayout {
  readonly version: 1;
  readonly dockVisible: boolean;
  readonly views: Readonly<Record<string, WorkbenchViewState>>;
}

/** 在原生网格上附加嵌套布局，保留旧布局的读取方式。 */
export interface WorkbenchLayout extends SerializedDockview {
  readonly viewLayout?: WorkbenchViewLayout;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseState(value: unknown, initial: WorkbenchViewState): WorkbenchViewState | null {
  if (!isRecord(value) || value['containerId'] !== initial.containerId) return null;
  const { index, size, expanded, visible, detached } = value;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null;
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 28 || size > 100000) return null;
  if (typeof expanded !== 'boolean' || typeof visible !== 'boolean' || typeof detached !== 'boolean') return null;
  return { containerId: initial.containerId, index, size, expanded, visible, detached };
}

/** 在修改界面前校验视图状态，旧版裸网格恢复默认侧栏。 */
export function parseWorkbenchViewLayout(
  value: unknown,
  defaults: Readonly<Record<string, WorkbenchViewState>>,
  dockPanels: Readonly<Record<string, unknown>>
): WorkbenchViewLayout | null {
  if (value === undefined) {
    if (Object.keys(defaults).some(id => Object.hasOwn(dockPanels, id))) return null;
    return { version: 1, dockVisible: true, views: { ...defaults } };
  }
  if (!isRecord(value) || value['version'] !== 1 || typeof value['dockVisible'] !== 'boolean') return null;
  const input = value['views'];
  if (!isRecord(input) || Object.keys(input).some(id => !Object.hasOwn(defaults, id))) return null;
  const views: Record<string, WorkbenchViewState> = {};
  for (const [id, initial] of Object.entries(defaults)) {
    const state = Object.hasOwn(input, id) ? parseState(input[id], initial) : initial;
    if (!state || (Object.hasOwn(dockPanels, id) && (!state.detached || !state.visible || !value['dockVisible'])))
      return null;
    if (state.detached && state.visible && value['dockVisible'] && !Object.hasOwn(dockPanels, id)) return null;
    views[id] = state;
  }
  return { version: 1, dockVisible: value['dockVisible'], views };
}
