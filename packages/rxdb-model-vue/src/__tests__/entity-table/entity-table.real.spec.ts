import {
  type BatchChangeItem,
  type CellChangeEvent,
  type EntityTableRecord,
  type RowMoveEvent,
  isRowDragEnabled
} from '@aiao/rxdb-model';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EntityTable from '../../entity-table/EntityTable.vue';
import { ENTITY_TABLE_CONFIG } from '../../entity-table/config';

// VTable 引擎打桩（真实组件代码照常执行，只替换渲染引擎；happy-dom 无法跑真实 canvas 表格）
vi.mock('@visactor/vtable', () => import('../testing/fake-vtable'));
vi.mock('@visactor/vtable-editors', () => import('../testing/fake-vtable-editors'));

import { FakeListTable } from '../testing/fake-vtable';

/**
 * EntityTable —— **真实组件源码**（对齐 Angular 侧）。
 *
 * 通过 FakeListTable 按真实事件名驱动 VTable 事件 → 组件 emit 桥接
 * （cellChanged / batchUpdated / rowDeleted / sortClicked / rowReordered / iconClicked），
 * 并覆盖 ENTITY_TABLE_CONFIG 注入、loading/空态渲染、主题重绘、销毁释放。
 * 只打桩 VTable 引擎与 happy-dom 缺失的浏览器 API（ResizeObserver / clipboard）。
 */

const COLUMNS = [
  { field: 'name', title: '名称', cellType: 'text' },
  { field: 'active', title: '启用', cellType: 'switch' },
  { field: 'count', title: '数量', cellType: 'text' }
] as const;

const RECORDS: EntityTableRecord[] = [
  { id: 'r1', name: 'Alice', active: true, count: 1 },
  { id: 'r2', name: 'Bob', active: false, count: 2 }
];

const flushAsync = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

type EntityTableVM = InstanceType<typeof EntityTable> & {
  tableInstance: FakeListTable | null;
  tableContainer: HTMLElement | null;
  headerHeight: number;
  cellTooltip: { x: number; y: number; content: string } | null;
  changeCellValue(col: number, row: number, value: unknown): void;
  redrawTheme(): void;
  restoreRecords(): void;
};

describe('EntityTable（真实组件）', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {
          // happy-dom 无 ResizeObserver
        }
        unobserve(): void {
          // no-op
        }
        disconnect(): void {
          // no-op
        }
      }
    );
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => undefined), readText: vi.fn(async () => '') },
      configurable: true
    });
  });

  function render(
    inputs: Partial<{
      records: EntityTableRecord[];
      columns: typeof COLUMNS;
      loading: boolean;
      loadingMore: boolean;
      loadMore: () => void;
    }> = {}
  ) {
    const wrapper = mount(EntityTable, {
      props: {
        records: inputs.records ?? RECORDS,
        columns: (inputs.columns ?? COLUMNS) as never,
        ...(inputs.loading !== undefined ? { loading: inputs.loading } : {}),
        ...(inputs.loadingMore !== undefined ? { loadingMore: inputs.loadingMore } : {}),
        ...(inputs.loadMore ? { loadMore: inputs.loadMore } : {})
      },
      global: { provide: { [ENTITY_TABLE_CONFIG as never]: { tooltipDelay: 1 } } }
    });
    const component = wrapper.vm as unknown as EntityTableVM;
    return {
      wrapper,
      component,
      // Vue emit 记录是 [payload][] 形态，这里取每条的 payload
      cellChanged: () => (wrapper.emitted('cellChanged') ?? []).map(e => e[0] as CellChangeEvent),
      rowDeleted: () => (wrapper.emitted('rowDeleted') ?? []).map(e => e[0] as EntityTableRecord),
      iconClicked: () =>
        (wrapper.emitted('iconClicked') ?? []).map(e => e[0] as { name: string; record: EntityTableRecord }),
      batchUpdated: () => (wrapper.emitted('batchUpdated') ?? []).map(e => e[0] as BatchChangeItem[]),
      rowReordered: () => (wrapper.emitted('rowReordered') ?? []).map(e => e[0] as string[]),
      scrollNearBottom: () => (wrapper.emitted('scrollNearBottom') ?? []).map(() => null),
      sortClicked: () => (wrapper.emitted('sortClicked') ?? []).map(e => e[0] as { field: unknown; order: unknown })
    };
  }

  it('初始化时经 createListTable 创建真实组件持有的表格实例', () => {
    const { component } = render();

    expect(component.tableInstance).toBeInstanceOf(FakeListTable);
    // 表头高度由 getRowHeight(0) 回填
    expect(component.headerHeight).toBe(40);
  });

  it('无记录且非加载中时渲染空态，加载中渲染 spinner', () => {
    const empty = render({ records: [] });
    expect(empty.wrapper.element.querySelector('[aria-label="暂无数据"]')).toBeTruthy();

    const loading = render({ records: [], loading: true });
    expect(loading.wrapper.element.querySelector('[aria-label="暂无数据"]')).toBeNull();
    expect(loading.wrapper.element.querySelector('.loading-spinner')).toBeTruthy();
  });

  it('change_cell_value 事件桥接到 cellChanged（含列字段名与行记录）', () => {
    const { component, cellChanged } = render();
    const table = component.tableInstance as unknown as FakeListTable;

    table.emit('change_cell_value', { col: 1, row: 1, changedValue: 'NewName' });

    expect(cellChanged()).toEqual([{ col: 1, row: 1, field: 'name', value: 'NewName', record: RECORDS[0] }]);
  });

  it('switch / checkbox 状态事件按布尔值桥接到 cellChanged', () => {
    const { component, cellChanged } = render();
    const table = component.tableInstance as unknown as FakeListTable;

    table.emit('switch_state_change', { col: 2, row: 2, checked: true });
    table.emit('checkbox_state_change', { col: 2, row: 1, checked: false });

    expect(cellChanged()).toEqual([
      { col: 2, row: 2, field: 'active', value: true, record: RECORDS[1] },
      { col: 2, row: 1, field: 'active', value: false, record: RECORDS[0] }
    ]);
  });

  it('icon_click 的 delete-action 走 rowDeleted，其余名字走 iconClicked', () => {
    const { component, rowDeleted, iconClicked } = render();
    const table = component.tableInstance as unknown as FakeListTable;

    table.emit('icon_click', { name: 'delete-action', col: 1, row: 2 });
    table.emit('icon_click', { name: 'view-action', col: 1, row: 1 });

    expect(rowDeleted()).toEqual([RECORDS[1]]);
    expect(iconClicked()).toEqual([{ name: 'view-action', record: RECORDS[0] }]);
  });

  it('sort_click 透传字段与方向（阻止 VTable 客户端排序，同步列头图标）', () => {
    const { component, sortClicked } = render();
    const table = component.tableInstance as unknown as FakeListTable;

    table.emit('sort_click', { field: 'name', order: 'asc' });

    expect(sortClicked()).toEqual([{ field: 'name', order: 'asc' }]);
    // 图标跟着轮转：asc → desc → normal（normal 清空状态）
    expect(table.sortState).toEqual({ field: 'name', order: 'asc' });
    table.emit('sort_click', { field: 'name', order: 'normal' });
    expect(table.sortState).toBeNull();
  });

  it('change_header_position 经 collectReorderedIds 输出拖拽后的行序', () => {
    const { component, rowReordered } = render({ records: [...RECORDS] });
    const table = component.tableInstance as unknown as FakeListTable;

    table.dragRow(2, 1);

    expect(rowReordered()).toEqual([['r2', 'r1']]);
  });

  describe('单行拖放（US-028 阶段 B）', () => {
    const THREE: EntityTableRecord[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    function renderDraggable(rowDragEnabled?: boolean) {
      const records = THREE.map(record => ({ ...record }));
      const wrapper = mount(EntityTable, {
        props: {
          records,
          columns: COLUMNS as never,
          ...(rowDragEnabled !== undefined ? { rowDragEnabled } : {})
        }
      });
      const component = wrapper.vm as unknown as EntityTableVM;
      const table = component.tableInstance as unknown as FakeListTable;
      const moves = (): RowMoveEvent[] => (wrapper.emitted('rowMoved') ?? []).map(e => e[0] as RowMoveEvent);
      return { wrapper, component, table, records, moves };
    }

    it('拖放后输出被拖行与落点前后邻居；拖列、原位放下不输出', () => {
      const { table, moves } = renderDraggable();

      table.dragRow(3, 1);
      table.dragRow(1, 2);
      table.emit('change_header_position', {
        source: { col: 1, row: 0 },
        target: { col: 2, row: 0 },
        movingColumnOrRow: 'column'
      });
      table.emit('change_header_position', {
        source: { col: 0, row: 2 },
        target: { col: 0, row: 2 },
        movingColumnOrRow: 'row'
      });

      expect(moves()).toEqual([
        { id: 'c', prevId: null, nextId: 'a' },
        { id: 'c', prevId: 'a', nextId: 'b' }
      ]);
    });

    it('rowDragEnabled 缺省开启，运行时切换即时收起 / 恢复手柄', async () => {
      const { wrapper, table } = renderDraggable();
      expect(isRowDragEnabled(table as never)).toBe(true);

      await wrapper.setProps({ rowDragEnabled: false });
      expect(isRowDragEnabled(table as never)).toBe(false);
      expect(table.recreateCellsCalls).toBe(1);

      await wrapper.setProps({ rowDragEnabled: true });
      expect(isRowDragEnabled(table as never)).toBe(true);
      expect(table.recreateCellsCalls).toBe(2);
    });

    it('建表时就关闭的表格不显示手柄', () => {
      const { table } = renderDraggable(false);
      expect(isRowDragEnabled(table as never)).toBe(false);
    });

    it('restoreRecords 把被拖放原地换位的行恢复成交给表格时的顺序', () => {
      const { component, table, records } = renderDraggable();
      table.dragRow(1, 3);
      expect(table.records.map(r => r['id'])).toEqual(['b', 'c', 'a']);

      component.restoreRecords();

      expect(table.records.map(r => r['id'])).toEqual(['a', 'b', 'c']);
      expect(records.map(r => r['id'])).toEqual(['a', 'b', 'c']);
    });
  });

  it('loadingMore 进行中不重复触发 loadMore', () => {
    const loadMore = vi.fn();
    const { component } = render({ loadMore, loadingMore: true });
    const table = component.tableInstance as unknown as FakeListTable;

    table.emit('scroll', { scrollDirection: 'vertical', dy: 10, scrollRatioY: 0.95 });
    expect(loadMore).not.toHaveBeenCalled();
  });

  it('触底滚动优先调用 loadMore，未提供时输出 scrollNearBottom', () => {
    const loadMore = vi.fn();
    const { component } = render({ loadMore });
    const table = component.tableInstance as unknown as FakeListTable;

    table.emit('scroll', { scrollDirection: 'vertical', dy: 10, scrollRatioY: 0.95 });
    expect(loadMore).toHaveBeenCalledTimes(1);

    const withoutCallback = render();
    (withoutCallback.component.tableInstance as unknown as FakeListTable).emit('scroll', {
      scrollDirection: 'vertical',
      dy: 10,
      scrollRatioY: 0.95
    });
    expect(withoutCallback.scrollNearBottom()).toHaveLength(1);
    // 上滑 / 未触底不触发
    (withoutCallback.component.tableInstance as unknown as FakeListTable).emit('scroll', {
      scrollDirection: 'vertical',
      dy: -5,
      scrollRatioY: 0.95
    });
    expect(withoutCallback.scrollNearBottom()).toHaveLength(1);
    void component;
  });

  it('keydown Delete 清空选中单元格并经 batchUpdated 输出', () => {
    const { component, batchUpdated } = render();
    const table = component.tableInstance as unknown as FakeListTable;
    table.emit('selected_cell', { col: 1, row: 1 });
    table.selectedCellInfos = [[{ col: 1, row: 1, field: 'name' }]];

    const container = component.tableContainer!;
    const event = new KeyboardEvent('keydown', { key: 'Delete', cancelable: true });
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(batchUpdated()).toEqual([[{ recordId: 'r1', changes: { name: '' } }]]);
  });

  it('nonClearableFields 与 cellClearable 阻止对应单元格被清空', () => {
    const wrapper = mount(EntityTable, {
      props: {
        records: RECORDS,
        columns: COLUMNS as never,
        nonClearableFields: new Set(['name'])
      }
    });
    const component = wrapper.vm as unknown as EntityTableVM;

    const table = component.tableInstance as unknown as FakeListTable;
    table.emit('selected_cell', { col: 1, row: 1 });
    table.selectedCellInfos = [[{ col: 1, row: 1, field: 'name' }]];

    const container = component.tableContainer!;
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true }));

    expect(wrapper.emitted('batchUpdated')).toBeUndefined();
  });

  it('Ctrl+V 粘贴经系统剪贴板解析为 batchUpdated', async () => {
    const { component, batchUpdated } = render();
    const table = component.tableInstance as unknown as FakeListTable;
    table.selectedCellInfos = [
      [
        { col: 1, row: 1, field: 'name' },
        { col: 2, row: 1, field: 'active' }
      ]
    ];
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn(async () => undefined),
        readText: vi.fn(async () => 'PastedName\ttrue')
      },
      configurable: true
    });

    const container = component.tableContainer!;
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, cancelable: true }));
    await flushAsync();

    expect(batchUpdated()).toEqual([[{ recordId: 'r1', changes: { name: 'PastedName', active: true } }]]);
  });

  it('records 更新时经 watch 调用 setRecords', async () => {
    const { wrapper, component } = render();
    const table = component.tableInstance as unknown as FakeListTable;
    expect(table.setRecordsCalls).toBe(0);

    await wrapper.setProps({ records: [...RECORDS, { id: 'r3', name: 'Cara', active: true, count: 3 }] });

    expect(table.setRecordsCalls).toBe(1);
  });

  it('列定义变化时走 updateTableRecords（重放记录并收敛列数）', async () => {
    const { wrapper, component } = render();
    const table = component.tableInstance as unknown as FakeListTable;

    await wrapper.setProps({
      columns: [
        { field: 'name', title: '名称', cellType: 'text', width: 200 },
        { field: 'count', title: '数量', cellType: 'text' }
      ] as never
    });

    expect(table.setRecordsCalls).toBe(1);
    expect(table.colCount).toBe(3);
  });

  it('cellErrorDetector 在悬停时经 CellTooltipManager 显示错误 tooltip', async () => {
    vi.useFakeTimers();
    try {
      const { wrapper, component } = render();
      await wrapper.setProps({
        cellErrorDetector: (record: EntityTableRecord, field: string) =>
          field === 'name' && record['name'] === 'Bob' ? '名称不能为空' : null
      });
      const table = component.tableInstance as unknown as FakeListTable;
      table.emit('mouseenter_cell', { col: 1, row: 2 });

      await vi.advanceTimersByTimeAsync(5);
      expect(component.cellTooltip?.content).toBe('名称不能为空');

      table.emit('mouseleave_cell', {});
      expect(component.cellTooltip).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('销毁时释放表格并解绑容器键盘监听', () => {
    const { wrapper, component } = render();
    const table = component.tableInstance as unknown as FakeListTable;

    wrapper.unmount();

    expect(table.isReleased).toBe(true);
    expect(component.tableInstance).toBeNull();
  });
});
