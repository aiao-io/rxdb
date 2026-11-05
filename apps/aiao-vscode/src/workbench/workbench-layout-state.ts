import {
  Orientation,
  type GroupviewPanelState,
  type SerializedDockview,
  type SerializedGridObject,
  type SerializedGridview
} from 'dockview-core';

/** 侧栏所在左侧边缘组的固定 id 与宽度约束；侧栏面板与该组同名。 */
export const SIDEBAR_EDGE = { id: 'sidebar', minimumSize: 180, maximumSize: 420 } as const;

/** 规整布局时的面板规则。 */
export interface WorkbenchLayoutRules {
  /** 侧栏是否停靠在左侧边缘组；窄屏抽屉模式下为 false，布局里的侧栏与边缘组一并丢弃。 */
  readonly sidebar: boolean;
  /** 返回可进入布局的面板状态；undefined 表示不保留该面板。 */
  panel(id: string): GroupviewPanelState | undefined;
}

type GroupState = Exclude<SerializedDockview['grid']['root']['data'], readonly unknown[]>;
type GridNode = SerializedGridObject<GroupState>;
type EdgeGroups = NonNullable<SerializedDockview['edgeGroups']>;

interface Context {
  readonly rules: WorkbenchLayoutRules;
  readonly groups: Set<string>;
  readonly panels: Map<string, GroupviewPanelState>;
}

/** Dockview 内置生成的组 id 是数字串；放宽到单词字符，拒绝其余输入。 */
const GROUP_ID = /^[\w-]{1,64}$/;
/** 网格嵌套深度上限；工作台的真实布局远浅于此。 */
const MAX_DEPTH = 16;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isSize = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isOrientation = (value: unknown): value is Orientation =>
  value === Orientation.HORIZONTAL || value === Orientation.VERTICAL;

/** 收下规则认可且首次出现的面板；侧栏只能待在左侧边缘组。 */
function claim(context: Context, id: string): boolean {
  if (id === SIDEBAR_EDGE.id || context.panels.has(id)) return false;
  const state = context.rules.panel(id);
  if (state) context.panels.set(id, state);
  return state !== undefined;
}

function normalizeGroup(value: unknown, context: Context): GroupState | null {
  if (!isRecord(value)) return null;
  const { id, views, activeView } = value;
  if (typeof id !== 'string' || !GROUP_ID.test(id) || id === SIDEBAR_EDGE.id || context.groups.has(id)) return null;
  if (!Array.isArray(views) || !views.every((view): view is string => typeof view === 'string')) return null;
  if (activeView !== undefined && typeof activeView !== 'string') return null;
  context.groups.add(id);
  const kept = views.filter(view => claim(context, view));
  return { id, views: kept, ...(activeView !== undefined && kept.includes(activeView) ? { activeView } : {}) };
}

function normalizeNode(value: unknown, context: Context, depth: number): GridNode | null {
  if (!isRecord(value) || depth > MAX_DEPTH) return null;
  const { type, data, size, visible } = value;
  if (!isSize(size) || (visible !== undefined && typeof visible !== 'boolean')) return null;
  const base = { size, ...(visible === undefined ? {} : { visible }) };
  if (type === 'leaf') {
    const group = normalizeGroup(data, context);
    return group && { type: 'leaf', data: group, ...base };
  }
  if (type !== 'branch' || !Array.isArray(data)) return null;
  const children = data.map(child => normalizeNode(child, context, depth + 1));
  return children.every((child): child is GridNode => child !== null) ?
      { type: 'branch', data: children, ...base }
    : null;
}

/** 左侧边缘组只承载侧栏：宽度夹到约束内，锁定与隐藏标题栏固定，其他边缘组丢弃。 */
function normalizeEdges(value: unknown, context: Context): EdgeGroups | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const left = value['left'];
  if (left === undefined) return undefined;
  if (!isRecord(left) || !isSize(left['size']) || typeof left['visible'] !== 'boolean') return null;
  const state = context.rules.sidebar ? context.rules.panel(SIDEBAR_EDGE.id) : undefined;
  if (!state) return undefined;
  context.groups.add(SIDEBAR_EDGE.id);
  context.panels.set(SIDEBAR_EDGE.id, state);
  const { id, minimumSize, maximumSize } = SIDEBAR_EDGE;
  return {
    left: {
      size: Math.min(maximumSize, Math.max(minimumSize, left['size'])),
      visible: left['visible'],
      minimumSize,
      maximumSize,
      group: { id, views: [id], activeView: id, locked: 'no-drop-target', hideHeader: true }
    }
  };
}

/** 最大化标记只在指向仍有面板的叶子时保留。 */
function normalizeMaximized(value: unknown, root: GridNode): { location: number[] } | undefined {
  const location: unknown = isRecord(value) ? value['location'] : undefined;
  if (!Array.isArray(location) || !location.every((index): index is number => Number.isInteger(index)))
    return undefined;
  const target = location.reduce<GridNode | undefined>(
    (node, index) => (node && Array.isArray(node.data) ? node.data[index] : undefined),
    root
  );
  return target && !Array.isArray(target.data) && target.data.views.length > 0 ?
      { location: [...location] }
    : undefined;
}

/**
 * 校验并规整持久化的 Dockview 布局：结构非法返回 null。
 * 网格的树形保持不变，只按规则过滤面板并重建面板状态；面板全被过滤的组留作空组，交给调用方回收。
 */
export function normalizeWorkbenchLayout(value: unknown, rules: WorkbenchLayoutRules): SerializedDockview | null {
  if (!isRecord(value) || !isRecord(value['grid'])) return null;
  const { root, width, height, orientation, maximizedNode } = value['grid'];
  if (!isSize(width) || !isSize(height) || !isOrientation(orientation)) return null;
  const context: Context = { rules, groups: new Set(), panels: new Map() };
  const tree = normalizeNode(root, context, 0);
  const edgeGroups = normalizeEdges(value['edgeGroups'], context);
  if (tree?.type !== 'branch' || edgeGroups === null) return null;
  const maximized = normalizeMaximized(maximizedNode, tree);
  const grid: SerializedGridview<GroupState> = {
    root: tree,
    width,
    height,
    orientation,
    ...(maximized ? { maximizedNode: maximized } : {})
  };
  const activeGroup = value['activeGroup'];
  return {
    grid,
    panels: Object.fromEntries(context.panels),
    ...(typeof activeGroup === 'string' && context.groups.has(activeGroup) ? { activeGroup } : {}),
    ...(edgeGroups ? { edgeGroups } : {})
  };
}
