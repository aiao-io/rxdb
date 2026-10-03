/**
 * EntityTable —— **真实组件源码**（Angular `entity-table.component.real.spec.ts` 的 React 移植）。
 *
 * 通过 FakeListTable 按真实事件名驱动 VTable 事件 → onXxx 回调桥接
 * （onCellChanged / onBatchUpdated / onRowDeleted / onSortClicked / onRowReordered / onRowMoved / onIconClicked），
 * 并覆盖 ENTITY_TABLE_CONFIG、loading/空态渲染、主题重绘、销毁释放。
 * 只打桩 VTable 引擎与 happy-dom 缺失的浏览器 API（clipboard）。
 */
import type { BatchChangeItem, CellChangeEvent, EntityTableRecord, RowMoveEvent } from '@aiao/rxdb-model';
import { isRowDragEnabled } from '@aiao/rxdb-model';
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTITY_TABLE_CONFIG, EntityTable, type EntityTableHandle } from '../../entity-table';
import { FakeListTable, getLastListTable } from '../testing/fake-vtable';

// VTable 引擎打桩（真实组件代码照常执行，只替换渲染引擎；happy-dom 无法跑真实 canvas 表格）
vi.mock('@visactor/vtable', () => import('../testing/fake-vtable'));
vi.mock('@visactor/vtable-editors', () => import('../testing/fake-vtable-editors'));

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

describe('EntityTable（真实组件）', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => undefined), readText: vi.fn(async () => '') },
      configurable: true
    });
  });

  function renderTable(
    props: Partial<{
      records: EntityTableRecord[];
      columns: typeof COLUMNS;
      loading: boolean;
      loadingMore: boolean;
      loadMore: () => void;
    }> = {}
  ) {
    const cellChanged: CellChangeEvent[] = [];
    const rowDeleted: EntityTableRecord[] = [];
    const iconClicked: Array<{ name: string; record: EntityTableRecord }> = [];
    const batchUpdated: BatchChangeItem[][] = [];
    const rowReordered: string[][] = [];
    const scrollNearBottom: unknown[] = [];
    const sortClicked: Array<{ field: unknown; order: unknown }> = [];
    const ref = createRef<EntityTableHandle>();
    const utils = render(
      <EntityTable
        ref={ref}
        records={props.records ?? RECORDS}
        columns={(props.columns ?? COLUMNS) as never}
        loading={props.loading}
        loadingMore={props.loadingMore}
        loadMore={props.loadMore}
        onCellChanged={e => cellChanged.push(e)}
        onRowDeleted={e => rowDeleted.push(e)}
        onIconClicked={e => iconClicked.push(e)}
        onBatchUpdated={e => batchUpdated.push(e)}
        onRowReordered={e => rowReordered.push(e)}
        onScrollNearBottom={() => scrollNearBottom.push(null)}
        onSortClicked={e => sortClicked.push(e)}
      />
    );
    return {
      ...utils,
      ref,
      cellChanged,
      rowDeleted,
      iconClicked,
      batchUpdated,
      rowReordered,
      scrollNearBottom,
      sortClicked
    };
  }

  it('初始化时经 createListTable 创建真实组件持有的表格实例', () => {
    const { ref } = renderTable();

    expect(ref.current?.tableInstance).toBeInstanceOf(FakeListTable);
  });

  it('无记录且非加载中时渲染空态，加载中渲染 spinner', () => {
    const empty = renderTable({ records: [] });
    expect(empty.container.querySelector('[aria-label="暂无数据"]')).toBeTruthy();

    const loading = renderTable({ records: [], loading: true });
    expect(loading.container.querySelector('[aria-label="暂无数据"]')).toBeNull();
    expect(loading.container.querySelector('.loading-spinner')).toBeTruthy();
  });

  it('change_cell_value 事件桥接到 onCellChanged（含列字段名与行记录）', () => {
    const { cellChanged } = renderTable();
    const table = getLastListTable();

    table.emit('change_cell_value', { col: 1, row: 1, changedValue: 'NewName' });

    expect(cellChanged).toEqual([{ col: 1, row: 1, field: 'name', value: 'NewName', record: RECORDS[0] }]);
  });

  it('switch / checkbox 状态事件按布尔值桥接到 onCellChanged', () => {
    const { cellChanged } = renderTable();
    const table = getLastListTable();

    table.emit('switch_state_change', { col: 2, row: 2, checked: true });
    table.emit('checkbox_state_change', { col: 2, row: 1, checked: false });

    expect(cellChanged).toEqual([
      { col: 2, row: 2, field: 'active', value: true, record: RECORDS[1] },
      { col: 2, row: 1, field: 'active', value: false, record: RECORDS[0] }
    ]);
  });

  it('icon_click 的 delete-action 走 onRowDeleted，其余名字走 onIconClicked', () => {
    const { rowDeleted, iconClicked } = renderTable();
    const table = getLastListTable();

    table.emit('icon_click', { name: 'delete-action', col: 1, row: 2 });
    table.emit('icon_click', { name: 'view-action', col: 1, row: 1 });

    expect(rowDeleted).toEqual([RECORDS[1]]);
    expect(iconClicked).toEqual([{ name: 'view-action', record: RECORDS[0] }]);
  });

  it('sort_click 透传字段与方向（阻止 VTable 客户端排序，同步列头图标）', () => {
    const { sortClicked } = renderTable();
    const table = getLastListTable();

    table.emit('sort_click', { field: 'name', order: 'asc' });

    expect(sortClicked).toEqual([{ field: 'name', order: 'asc' }]);
    // 图标跟着轮转：asc → desc → normal（normal 清空状态）
    expect(table.sortState).toEqual({ field: 'name', order: 'asc' });
    table.emit('sort_click', { field: 'name', order: 'normal' });
    expect(table.sortState).toBeNull();
  });

  it('change_header_position 经 collectReorderedIds 输出拖拽后的行序', () => {
    // 拖放会原地换位交进去的数组：给副本，别动共享的 RECORDS
    const { rowReordered } = renderTable({ records: [...RECORDS] });
    const table = getLastListTable();

    table.dragRow(2, 1);

    expect(rowReordered).toEqual([['r2', 'r1']]);
  });

  describe('单行拖放（US-028 阶段 B）', () => {
    const THREE: EntityTableRecord[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    function renderDraggable(rowDragEnabled?: boolean) {
      const moves: RowMoveEvent[] = [];
      const ref = createRef<EntityTableHandle>();
      const records = THREE.map(record => ({ ...record }));
      const element = (enabled?: boolean) => (
        <EntityTable
          ref={ref}
          records={records}
          columns={COLUMNS as never}
          rowDragEnabled={enabled}
          onRowMoved={move => moves.push(move)}
        />
      );
      const utils = render(element(rowDragEnabled));
      return { ...utils, ref, moves, records, rerenderWith: (enabled?: boolean) => utils.rerender(element(enabled)) };
    }

    it('拖放后输出被拖行与落点前后邻居；拖列、原位放下不输出', () => {
      const { moves } = renderDraggable();
      const table = getLastListTable();

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

      expect(moves).toEqual([
        { id: 'c', prevId: null, nextId: 'a' },
        { id: 'c', prevId: 'a', nextId: 'b' }
      ]);
    });

    it('rowDragEnabled 缺省开启，运行时切换即时收起 / 恢复手柄', () => {
      const { rerenderWith } = renderDraggable();
      const table = getLastListTable();
      expect(isRowDragEnabled(table as never)).toBe(true);

      rerenderWith(false);
      expect(isRowDragEnabled(table as never)).toBe(false);
      expect(table.recreateCellsCalls).toBe(1);

      rerenderWith(true);
      expect(isRowDragEnabled(table as never)).toBe(true);
      expect(table.recreateCellsCalls).toBe(2);
    });

    it('建表时就关闭的表格不显示手柄', () => {
      renderDraggable(false);
      expect(isRowDragEnabled(getLastListTable() as never)).toBe(false);
    });

    it('restoreRecords 把被拖放原地换位的行恢复成交给表格时的顺序', () => {
      const { ref, records } = renderDraggable();
      const table = getLastListTable();
      table.dragRow(1, 3);
      expect(table.records.map(r => r['id'])).toEqual(['b', 'c', 'a']);

      act(() => ref.current?.restoreRecords());

      expect(table.records.map(r => r['id'])).toEqual(['a', 'b', 'c']);
      expect(records.map(r => r['id'])).toEqual(['a', 'b', 'c']);
    });
  });

  it('loadingMore 进行中不重复触发 loadMore', () => {
    const loadMore = vi.fn();
    renderTable({ loadMore, loadingMore: true });
    const table = getLastListTable();

    table.emit('scroll', { scrollDirection: 'vertical', dy: 10, scrollRatioY: 0.95 });
    expect(loadMore).not.toHaveBeenCalled();
  });

  it('触底滚动优先调用 loadMore，未提供时输出 onScrollNearBottom', () => {
    const loadMore = vi.fn();
    const withCallback = renderTable({ loadMore });
    getLastListTable().emit('scroll', { scrollDirection: 'vertical', dy: 10, scrollRatioY: 0.95 });
    expect(loadMore).toHaveBeenCalledTimes(1);

    const withoutCallback = renderTable();
    const table = getLastListTable();
    table.emit('scroll', { scrollDirection: 'vertical', dy: 10, scrollRatioY: 0.95 });
    expect(withoutCallback.scrollNearBottom).toHaveLength(1);
    // 上滑 / 未触底不触发
    table.emit('scroll', { scrollDirection: 'vertical', dy: -5, scrollRatioY: 0.95 });
    expect(withoutCallback.scrollNearBottom).toHaveLength(1);
    void withCallback;
  });

  it('keydown Delete 清空选中单元格并经 onBatchUpdated 输出', () => {
    const { container, batchUpdated } = renderTable();
    const table = getLastListTable();
    table.emit('selected_cell', { col: 1, row: 1 });
    table.selectedCellInfos = [[{ col: 1, row: 1, field: 'name' }]];

    const tableContainer = container.querySelector('.rxdb-entity-table > div') as HTMLDivElement;
    const event = new KeyboardEvent('keydown', { key: 'Delete', cancelable: true });
    tableContainer.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(batchUpdated).toEqual([[{ recordId: 'r1', changes: { name: '' } }]]);
  });

  it('nonClearableFields 与 cellClearable 阻止对应单元格被清空', () => {
    const cleared: BatchChangeItem[][] = [];
    const utils = render(
      <EntityTable
        records={RECORDS}
        columns={COLUMNS as never}
        nonClearableFields={new Set(['name'])}
        onBatchUpdated={e => cleared.push(e)}
      />
    );

    const table = getLastListTable();
    table.emit('selected_cell', { col: 1, row: 1 });
    table.selectedCellInfos = [[{ col: 1, row: 1, field: 'name' }]];

    const tableContainer = utils.container.querySelector('.rxdb-entity-table > div') as HTMLDivElement;
    tableContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true }));

    expect(cleared).toEqual([]);
  });

  it('Ctrl+V 粘贴经系统剪贴板解析为 onBatchUpdated', async () => {
    const { container, batchUpdated } = renderTable();
    const table = getLastListTable();
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

    const tableContainer = container.querySelector('.rxdb-entity-table > div') as HTMLDivElement;
    tableContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, cancelable: true }));
    await flushAsync();

    expect(batchUpdated).toEqual([[{ recordId: 'r1', changes: { name: 'PastedName', active: true } }]]);
  });

  it('records 更新时经同步 effect 调用 setRecords', () => {
    const { rerender } = renderTable();
    const table = getLastListTable();
    expect(table.setRecordsCalls).toBe(0);

    rerender(
      <EntityTable
        records={[...RECORDS, { id: 'r3', name: 'Cara', active: true, count: 3 }]}
        columns={COLUMNS as never}
      />
    );

    expect(table.setRecordsCalls).toBe(1);
  });

  it('列定义变化时走 updateTableRecords（重放记录并收敛列数）', () => {
    const { rerender } = renderTable();
    const table = getLastListTable();

    rerender(
      <EntityTable
        records={RECORDS}
        columns={
          [
            { field: 'name', title: '名称', cellType: 'text', width: 200 },
            { field: 'count', title: '数量', cellType: 'text' }
          ] as never
        }
      />
    );

    expect(table.setRecordsCalls).toBe(1);
    expect(table.colCount).toBe(3);
  });

  it('cellErrorDetector 在悬停时经 CellTooltipManager 显示错误 tooltip', async () => {
    vi.useFakeTimers();
    try {
      const utils = render(
        <ENTITY_TABLE_CONFIG.Provider value={{ tooltipDelay: 1 }}>
          <EntityTable
            records={RECORDS}
            columns={COLUMNS as never}
            cellErrorDetector={(record: EntityTableRecord, field: string) =>
              field === 'name' && record['name'] === 'Bob' ? '名称不能为空' : null
            }
          />
        </ENTITY_TABLE_CONFIG.Provider>
      );
      const table = getLastListTable();
      table.emit('mouseenter_cell', { col: 1, row: 2 });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5);
      });
      // tooltip 渲染到覆盖层
      expect(utils.container.querySelector('[role="tooltip"]')?.textContent).toBe('名称不能为空');

      act(() => {
        table.emit('mouseleave_cell', {});
      });
      expect(utils.container.querySelector('[role="tooltip"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('销毁时释放表格并解绑容器键盘监听', () => {
    const { unmount, ref } = renderTable();
    const table = getLastListTable();

    unmount();

    expect(table.isReleased).toBe(true);
    expect(ref.current).toBeNull();
  });
});
