import {
  Orientation,
  type GroupviewPanelState,
  type SerializedDockview,
  type SerializedGridObject
} from 'dockview-core';
import { describe, expect, it } from 'vitest';
import { normalizeWorkbenchLayout, type WorkbenchLayoutRules } from './workbench-layout-state.js';

const all = ['sidebar', 'editor:src/a.ts', 'editor:src/b.ts', 'preview', 'problems', 'output', 'console'];
const toolIds = ['problems', 'output', 'console'];
const state = (id: string): GroupviewPanelState => ({ id, contentComponent: id.startsWith('editor:') ? 'editor' : id });
const rules = (open: readonly string[] = all, sidebar = true): WorkbenchLayoutRules => ({
  sidebar,
  panel: id => (open.includes(id) ? state(id) : undefined)
});
const leaf = (id: string, views: string[], size: number, activeView?: string) => ({
  type: 'leaf',
  size,
  data: { id, views, ...(activeView ? { activeView } : {}) }
});

/** Dockview toJSON 的真实形状：两组编辑器与预览在上、工具组在下，侧栏在左侧边缘组，另带不受支持的右侧边缘组。 */
function source() {
  const first = leaf('1', ['editor:src/a.ts'], 280, 'editor:src/a.ts');
  const second = leaf('4', ['editor:src/b.ts', 'diff:working:src/a.ts'], 280, 'diff:working:src/a.ts');
  const preview = leaf('2', ['preview'], 640, 'preview');
  const tools = leaf('3', [...toolIds], 180, 'output');
  const top = { type: 'branch', size: 620, data: [first, second, preview] };
  const sidebar = {
    size: 240,
    visible: false,
    minimumSize: 180,
    maximumSize: 420,
    collapsedSize: 35,
    group: {
      views: ['sidebar'],
      activeView: 'sidebar',
      id: 'sidebar',
      locked: 'no-drop-target',
      hideHeader: true,
      headerPosition: 'left'
    }
  };
  const layout = {
    grid: {
      root: { type: 'branch', size: 1200, data: [top, tools] },
      width: 1200,
      height: 800,
      orientation: 'VERTICAL',
      maximizedNode: { location: [1] }
    },
    panels: { 'editor:src/a.ts': { id: 'editor:src/a.ts', contentComponent: 'editor', title: 'a.ts •' } },
    activeGroup: '4',
    floatingGroups: [],
    edgeGroups: { left: sidebar, right: { size: 200, visible: true, group: { id: 'right', views: ['preview'] } } }
  };
  return { layout, first, second, preview, tools, top, sidebar };
}

type GroupData = { id: string; views: string[]; activeView?: string };
/** 按组 id 收集规整结果里的叶子组。 */
function groupsOf(layout: SerializedDockview | null): Record<string, GroupData> {
  const groups: Record<string, GroupData> = {};
  const visit = (node: SerializedGridObject<GroupData>): void => {
    if (Array.isArray(node.data)) node.data.forEach(visit);
    else groups[node.data.id] = node.data;
  };
  if (layout) visit(layout.grid.root);
  return groups;
}

describe('工作台布局规整', () => {
  it('保留树形结构，只留下规则认可的面板，面板状态按规则重建', () => {
    const open = all.filter(id => id !== 'editor:src/b.ts');
    const result = normalizeWorkbenchLayout(source().layout, rules(open));
    expect(result?.grid).toEqual({
      root: {
        type: 'branch',
        size: 1200,
        data: [
          {
            type: 'branch',
            size: 620,
            data: [
              leaf('1', ['editor:src/a.ts'], 280, 'editor:src/a.ts'),
              leaf('4', [], 280),
              leaf('2', ['preview'], 640, 'preview')
            ]
          },
          leaf('3', toolIds, 180, 'output')
        ]
      },
      width: 1200,
      height: 800,
      orientation: Orientation.VERTICAL,
      maximizedNode: { location: [1] }
    });
    expect(result?.panels).toEqual(Object.fromEntries(open.map(id => [id, state(id)])));
    expect(result?.activeGroup).toBe('4');
    expect(result).not.toHaveProperty('floatingGroups');
  });

  it('侧栏只进左侧边缘组：宽度夹到约束内，锁定与隐藏标题栏固定，其他边缘组丢弃', () => {
    const { layout, sidebar } = source();
    sidebar.size = 999;
    expect(normalizeWorkbenchLayout(layout, rules())?.edgeGroups).toEqual({
      left: {
        size: 420,
        visible: false,
        minimumSize: 180,
        maximumSize: 420,
        group: { id: 'sidebar', views: ['sidebar'], activeView: 'sidebar', locked: 'no-drop-target', hideHeader: true }
      }
    });
    sidebar.size = 12;
    expect(normalizeWorkbenchLayout(layout, rules())?.edgeGroups?.left?.size).toBe(180);
    Reflect.deleteProperty(layout.edgeGroups, 'left');
    expect(normalizeWorkbenchLayout(layout, rules())).not.toHaveProperty('edgeGroups');
  });

  it('抽屉模式丢弃边缘组与侧栏；侧栏出现在网格里时一律不保留', () => {
    const { layout, tools } = source();
    tools.data.views.push('sidebar');
    const narrow = normalizeWorkbenchLayout(layout, rules(all, false));
    expect(narrow).not.toHaveProperty('edgeGroups');
    expect(narrow?.panels).not.toHaveProperty('sidebar');
    expect(groupsOf(narrow)['3']?.views).toEqual(toolIds);
    const wide = normalizeWorkbenchLayout(layout, rules());
    expect(groupsOf(wide)['3']?.views).toEqual(toolIds);
    expect(wide?.panels['sidebar']).toEqual(state('sidebar'));
  });

  it('同一面板重复出现只保留第一次，activeView 指向被过滤的面板时去掉', () => {
    const { layout, second } = source();
    second.data.views.unshift('editor:src/a.ts');
    const groups = groupsOf(normalizeWorkbenchLayout(layout, rules()));
    expect(groups['1']).toEqual({ id: '1', views: ['editor:src/a.ts'], activeView: 'editor:src/a.ts' });
    expect(groups['4']).toEqual({ id: '4', views: ['editor:src/b.ts'] });
  });

  it('maximizedNode 只在指向保留了面板的叶子时保留', () => {
    const withoutTools = all.filter(id => !toolIds.includes(id));
    expect(normalizeWorkbenchLayout(source().layout, rules(withoutTools))?.grid).not.toHaveProperty('maximizedNode');
    for (const maximizedNode of [
      { location: [0] },
      { location: [5] },
      { location: [1, 0] },
      { location: ['1'] },
      'x'
    ]) {
      const { layout } = source();
      Object.assign(layout.grid, { maximizedNode });
      expect(normalizeWorkbenchLayout(layout, rules())?.grid).not.toHaveProperty('maximizedNode');
    }
  });

  it('activeGroup 只保留指向保留下来的组', () => {
    const { layout } = source();
    layout.activeGroup = '9';
    expect(normalizeWorkbenchLayout(layout, rules())).not.toHaveProperty('activeGroup');
    layout.activeGroup = 'sidebar';
    expect(normalizeWorkbenchLayout(layout, rules())?.activeGroup).toBe('sidebar');
    expect(normalizeWorkbenchLayout(layout, rules(all, false))).not.toHaveProperty('activeGroup');
  });

  it('结构非法时返回 null', () => {
    const broken: ((parts: ReturnType<typeof source>) => void)[] = [
      ({ layout }) => Object.assign(layout.grid, { orientation: 'DIAGONAL' }),
      ({ layout }) => Object.assign(layout.grid, { width: Number.NaN }),
      ({ layout, tools }) => Object.assign(layout.grid, { root: tools }),
      ({ layout }) => Object.assign(layout, { grid: null }),
      ({ top }) => Object.assign(top, { type: 'tree' }),
      ({ top }) => Object.assign(top, { size: -1 }),
      ({ top }) => Object.assign(top, { data: 'leaf' }),
      ({ first }) => Object.assign(first, { size: undefined }),
      ({ tools }) => Object.assign(tools, { visible: 'yes' }),
      ({ tools }) => Object.assign(tools.data, { views: ['problems', 3] }),
      ({ tools }) => Object.assign(tools.data, { id: '1' }),
      ({ tools }) => Object.assign(tools.data, { id: 'sidebar' }),
      ({ tools }) => Object.assign(tools.data, { id: 'a b' }),
      ({ tools }) => Object.assign(tools.data, { activeView: 7 }),
      ({ sidebar }) => Object.assign(sidebar, { visible: 'yes' }),
      ({ sidebar }) => Object.assign(sidebar, { size: '240' }),
      ({ layout }) => Object.assign(layout, { edgeGroups: [] })
    ];
    for (const mutate of broken) {
      const parts = source();
      mutate(parts);
      expect(normalizeWorkbenchLayout(parts.layout, rules())).toBeNull();
    }
    for (const value of [null, 'layout', 42, [], {}]) expect(normalizeWorkbenchLayout(value, rules())).toBeNull();
    let deep: unknown = leaf('9', ['preview'], 100);
    for (let level = 0; level < 40; level++) deep = { type: 'branch', size: 100, data: [deep] };
    const { layout } = source();
    Object.assign(layout.grid, { root: { type: 'branch', size: 100, data: [deep] } });
    expect(normalizeWorkbenchLayout(layout, rules())).toBeNull();
  });
});
