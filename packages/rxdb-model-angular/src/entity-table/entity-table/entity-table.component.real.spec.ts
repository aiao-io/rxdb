import type { BatchChangeItem, CellChangeEvent, EntityTableRecord } from '@aiao/rxdb-model';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTITY_TABLE_CONFIG } from '../config';
import { EntityTableComponent } from './entity-table.component';

// VTable 引擎打桩（真实组件代码照常执行，只替换渲染引擎；happy-dom 无法跑真实 canvas 表格）
vi.mock('@visactor/vtable', () => import('../../testing/fake-vtable'));
vi.mock('@visactor/vtable-editors', () => import('../../testing/fake-vtable-editors'));

import { FakeListTable } from '../../testing/fake-vtable';

/**
 * EntityTableComponent —— **真实组件源码**（specs/027 T025a）。
 *
 * 通过 FakeListTable 按真实事件名驱动 VTable 事件 → 组件 output 桥接
 * （cellChanged / batchUpdated / rowDeleted / sortClicked / rowReordered / iconClicked），
 * 并覆盖 ENTITY_TABLE_CONFIG token、loading/空态渲染、主题重绘、销毁释放。
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

describe('EntityTableComponent（真实组件）', () => {
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
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: ENTITY_TABLE_CONFIG, useValue: { tooltipDelay: 1 } }]
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
    const fixture = TestBed.createComponent(EntityTableComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('records', inputs.records ?? RECORDS);
    fixture.componentRef.setInput('columns', (inputs.columns ?? COLUMNS) as never);
    if (inputs.loading !== undefined) fixture.componentRef.setInput('loading', inputs.loading);
    if (inputs.loadingMore !== undefined) fixture.componentRef.setInput('loadingMore', inputs.loadingMore);
    if (inputs.loadMore) fixture.componentRef.setInput('loadMore', inputs.loadMore);

    const cellChanged: CellChangeEvent[] = [];
    const rowDeleted: EntityTableRecord[] = [];
    const iconClicked: Array<{ name: string; record: EntityTableRecord }> = [];
    const batchUpdated: BatchChangeItem[][] = [];
    const rowReordered: string[][] = [];
    const scrollNearBottom: unknown[] = [];
    const sortClicked: Array<{ field: unknown; order: unknown }> = [];
    component.cellChanged.subscribe(e => cellChanged.push(e));
    component.rowDeleted.subscribe(e => rowDeleted.push(e));
    component.iconClicked.subscribe(e => iconClicked.push(e));
    component.batchUpdated.subscribe(e => batchUpdated.push(e));
    component.rowReordered.subscribe(e => rowReordered.push(e));
    component.scrollNearBottom.subscribe(() => scrollNearBottom.push(null));
    component.sortClicked.subscribe(e => sortClicked.push(e));
    fixture.detectChanges();

    return {
      fixture,
      component,
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
    const { component } = render();

    expect(component.tableInstance).toBeInstanceOf(FakeListTable);
    // 表头高度由 getRowHeight(0) 回填
    expect(component.headerHeight()).toBe(40);
  });

  it('无记录且非加载中时渲染空态，加载中渲染 spinner', () => {
    const empty = render({ records: [] });
    expect(empty.fixture.nativeElement.querySelector('[aria-label="暂无数据"]')).toBeTruthy();

    const loading = render({ records: [], loading: true });
    expect(loading.fixture.nativeElement.querySelector('[aria-label="暂无数据"]')).toBeNull();
    expect(loading.fixture.nativeElement.querySelector('.loading-spinner')).toBeTruthy();
  });

  it('change_cell_value 事件桥接到 cellChanged（含列字段名与行记录）', () => {
    const { component, cellChanged } = render();
    const table = component.tableInstance as FakeListTable;

    table.emit('change_cell_value', { col: 1, row: 1, changedValue: 'NewName' });

    expect(cellChanged).toEqual([{ col: 1, row: 1, field: 'name', value: 'NewName', record: RECORDS[0] }]);
  });

  it('switch / checkbox 状态事件按布尔值桥接到 cellChanged', () => {
    const { component, cellChanged } = render();
    const table = component.tableInstance as FakeListTable;

    table.emit('switch_state_change', { col: 2, row: 2, checked: true });
    table.emit('checkbox_state_change', { col: 2, row: 1, checked: false });

    expect(cellChanged).toEqual([
      { col: 2, row: 2, field: 'active', value: true, record: RECORDS[1] },
      { col: 2, row: 1, field: 'active', value: false, record: RECORDS[0] }
    ]);
  });

  it('icon_click 的 delete-action 走 rowDeleted，其余名字走 iconClicked', () => {
    const { component, rowDeleted, iconClicked } = render();
    const table = component.tableInstance as FakeListTable;

    table.emit('icon_click', { name: 'delete-action', col: 1, row: 2 });
    table.emit('icon_click', { name: 'view-action', col: 1, row: 1 });

    expect(rowDeleted).toEqual([RECORDS[1]]);
    expect(iconClicked).toEqual([{ name: 'view-action', record: RECORDS[0] }]);
  });

  it('sort_click 透传字段与方向（阻止 VTable 客户端排序）', () => {
    const { component, sortClicked } = render();
    const table = component.tableInstance as FakeListTable;

    table.emit('sort_click', { field: 'name', order: 'asc' });

    expect(sortClicked).toEqual([{ field: 'name', order: 'asc' }]);
  });

  it('change_header_position 经 collectReorderedIds 输出拖拽后的行序', () => {
    const { component, rowReordered } = render();
    const table = component.tableInstance as FakeListTable;

    table.emit('change_header_position', {});

    expect(rowReordered).toEqual([['r1', 'r2']]);
  });

  it('触底滚动优先调用 loadMore，未提供时输出 scrollNearBottom', () => {
    const loadMore = vi.fn();
    const { component, scrollNearBottom } = render({ loadMore });
    const table = component.tableInstance as FakeListTable;

    table.emit('scroll', { scrollDirection: 'vertical', dy: 10, scrollRatioY: 0.95 });
    expect(loadMore).toHaveBeenCalledTimes(1);

    const withoutCallback = render();
    (withoutCallback.component.tableInstance as FakeListTable).emit('scroll', {
      scrollDirection: 'vertical',
      dy: 10,
      scrollRatioY: 0.95
    });
    expect(withoutCallback.scrollNearBottom).toHaveLength(1);
    // 上滑 / 未触底不触发
    (withoutCallback.component.tableInstance as FakeListTable).emit('scroll', {
      scrollDirection: 'vertical',
      dy: -5,
      scrollRatioY: 0.95
    });
    expect(withoutCallback.scrollNearBottom).toHaveLength(1);
    void scrollNearBottom;
  });

  it('keydown Delete 清空选中单元格并经 batchUpdated 输出', () => {
    const { fixture, component, batchUpdated } = render();
    const table = component.tableInstance as FakeListTable;
    table.emit('selected_cell', { col: 1, row: 1 });
    table.selectedCellInfos = [[{ col: 1, row: 1, field: 'name' }]];

    const container = component.tableContainer()!.nativeElement;
    const event = new KeyboardEvent('keydown', { key: 'Delete', cancelable: true });
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(batchUpdated).toEqual([[{ recordId: 'r1', changes: { name: '' } }]]);
    void fixture;
  });

  it('nonClearableFields 与 cellClearable 阻止对应单元格被清空', () => {
    const fixture = TestBed.createComponent(EntityTableComponent);
    fixture.componentRef.setInput('records', RECORDS);
    fixture.componentRef.setInput('columns', COLUMNS as never);
    fixture.componentRef.setInput('nonClearableFields', new Set(['name']));
    const cleared: BatchChangeItem[][] = [];
    fixture.componentInstance.batchUpdated.subscribe(e => cleared.push(e));
    fixture.detectChanges();

    const table = fixture.componentInstance.tableInstance as FakeListTable;
    table.emit('selected_cell', { col: 1, row: 1 });
    table.selectedCellInfos = [[{ col: 1, row: 1, field: 'name' }]];

    const container = fixture.componentInstance.tableContainer()!.nativeElement;
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true }));

    expect(cleared).toEqual([]);
  });

  it('Ctrl+V 粘贴经系统剪贴板解析为 batchUpdated', async () => {
    const { component, batchUpdated } = render();
    const table = component.tableInstance as FakeListTable;
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

    const container = component.tableContainer()!.nativeElement;
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, cancelable: true }));
    await flushAsync();

    expect(batchUpdated).toEqual([[{ recordId: 'r1', changes: { name: 'PastedName', active: true } }]]);
  });

  it('records 更新时经 effect 调用 setRecords', () => {
    const { fixture, component } = render();
    const table = component.tableInstance as FakeListTable;
    expect(table.setRecordsCalls).toBe(0);

    fixture.componentRef.setInput('records', [...RECORDS, { id: 'r3', name: 'Cara', active: true, count: 3 }]);
    fixture.detectChanges();

    expect(table.setRecordsCalls).toBe(1);
  });

  it('列定义变化时走 updateTableRecords（重放记录并收敛列数）', () => {
    const { fixture, component } = render();
    const table = component.tableInstance as FakeListTable;

    fixture.componentRef.setInput('columns', [
      { field: 'name', title: '名称', cellType: 'text', width: 200 },
      { field: 'count', title: '数量', cellType: 'text' }
    ] as never);
    fixture.detectChanges();

    expect(table.setRecordsCalls).toBe(1);
    expect(table.colCount).toBe(3);
  });

  it('cellErrorDetector 在悬停时经 CellTooltipManager 显示错误 tooltip', async () => {
    vi.useFakeTimers();
    try {
      const { fixture, component } = render();
      fixture.componentRef.setInput('cellErrorDetector', (record: EntityTableRecord, field: string) =>
        field === 'name' && record['name'] === 'Bob' ? '名称不能为空' : null
      );
      fixture.detectChanges();
      const table = component.tableInstance as FakeListTable;
      table.emit('mouseenter_cell', { col: 1, row: 2 });

      await vi.advanceTimersByTimeAsync(5);
      expect(component.cellTooltip()?.content).toBe('名称不能为空');

      table.emit('mouseleave_cell', {});
      expect(component.cellTooltip()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('销毁时释放表格并解绑容器键盘监听', () => {
    const { fixture, component } = render();
    const table = component.tableInstance as FakeListTable;

    fixture.destroy();

    expect(table.isReleased).toBe(true);
    expect(component.tableInstance).toBeNull();
  });
});
