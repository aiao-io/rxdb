import type { BatchChangeItem, CellChangeEvent, EntityTableRecord } from '@aiao/rxdb-model';
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryTableComponent } from '../../../entity-table/query-table/query-table.component';

// VTable 引擎打桩（真实组件代码照常执行，只替换渲染引擎）
vi.mock('@visactor/vtable', () => import('../../testing/fake-vtable'));
vi.mock('@visactor/vtable-editors', () => import('../../testing/fake-vtable-editors'));

import { FakeListTable } from '../../testing/fake-vtable';

/** 投影宿主：把 filterBar / emptyState 两个插槽按真实用法投进 query-table。 */
@Component({
  standalone: true,
  imports: [QueryTableComponent],
  template: `
    <rxdb-query-table
      [columns]="columns"
      [filteredCount]="filteredCount"
      [loading]="loading"
      [queryActive]="queryActive"
      [records]="records"
      [totalCount]="totalCount"
      (cellChanged)="cellChanged($event)"
      (sortClicked)="sortClicked($event)"
    >
      <div filterBar>筛选区：<button type="button">应用</button></div>
      <div emptyState>自定义空态</div>
    </rxdb-query-table>
  `
})
class QueryTableHost {
  columns = [
    { field: 'name', title: '名称', cellType: 'text' },
    { field: 'active', title: '启用', cellType: 'switch' }
  ];
  records: EntityTableRecord[] = [{ id: 'r1', name: 'Alice', active: true }];
  filteredCount = 3;
  totalCount = 10;
  queryActive = true;
  loading = false;
  emittedCellChanged: CellChangeEvent[] = [];
  emittedSort: Array<{ field: unknown; order: unknown }> = [];
  cellChanged(event: CellChangeEvent): void {
    this.emittedCellChanged.push(event);
  }
  sortClicked(event: { field: unknown; order: unknown }): void {
    this.emittedSort.push(event);
  }
}

/**
 * QueryTableComponent —— **真实组件源码**（specs/027 T025a）。
 *
 * 覆盖 statusText（filtered/total）、filterBar / emptyState 内容投影、
 * 状态栏显隐与真实 EntityTableComponent 的事件透传链路。
 */

describe('QueryTableComponent（真实组件）', () => {
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
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  function render(
    overrides: Partial<{
      records: EntityTableRecord[];
      totalCount: number | undefined;
      filteredCount: number | undefined;
      queryActive: boolean;
      loading: boolean;
    }> = {}
  ) {
    const fixture = TestBed.createComponent(QueryTableHost);
    const host = fixture.componentInstance;
    if (overrides.records) host.records = overrides.records;
    if ('totalCount' in overrides) host.totalCount = overrides.totalCount as number;
    if ('filteredCount' in overrides) host.filteredCount = overrides.filteredCount as number;
    if ('queryActive' in overrides) host.queryActive = overrides.queryActive as boolean;
    if ('loading' in overrides) host.loading = overrides.loading as boolean;
    fixture.detectChanges();
    const component = fixture.debugElement.query(q => q.componentInstance instanceof QueryTableComponent)
      .componentInstance as QueryTableComponent;
    return { fixture, host, component };
  }

  it('statusText：total 缺失为空串，无 filtered 为总数，不等为 filtered / total', () => {
    const none = render({ totalCount: undefined });
    expect(none.component.statusText()).toBe('');

    const onlyTotal = render({ totalCount: 5, filteredCount: undefined });
    expect(onlyTotal.component.statusText()).toBe('5');

    const filtered = render({ totalCount: 10, filteredCount: 3 });
    expect(filtered.component.statusText()).toBe('3 / 10');

    const equal = render({ totalCount: 7, filteredCount: 7 });
    expect(equal.component.statusText()).toBe('7');

    const zero = render({ totalCount: 5, filteredCount: 0 });
    expect(zero.component.statusText()).toBe('0 / 5');
  });

  it('queryActive 且有 statusText 时渲染筛选状态栏，否则隐藏', () => {
    expect(render().fixture.nativeElement.textContent).toContain('3 / 10');

    const inactive = render({ queryActive: false });
    expect(inactive.fixture.nativeElement.textContent).not.toContain('3 / 10');

    const noTotal = render({ totalCount: undefined });
    expect(noTotal.fixture.nativeElement.textContent).not.toContain('/');
  });

  it('filterBar 与 emptyState 插槽按选择器投影', () => {
    const { fixture } = render();

    expect(fixture.nativeElement.textContent).toContain('筛选区');
    // emptyState 只在实体表格空态时渲染
    expect(fixture.nativeElement.textContent).not.toContain('自定义空态');

    const empty = render({ records: [] });
    expect(empty.fixture.nativeElement.textContent).toContain('自定义空态');
  });

  it('表格初始化后 tableInstance 委托给内部 EntityTableComponent', () => {
    const { component } = render();

    expect(component.tableInstance).toBeInstanceOf(FakeListTable);
  });

  it('内部表格事件透传到外层 output（cellChanged / sortClicked）', () => {
    const { host, component } = render();
    const table = component.tableInstance as unknown as FakeListTable;

    table.emit('change_cell_value', { col: 1, row: 1, changedValue: 'New' });
    expect(host.emittedCellChanged).toEqual([
      { col: 1, row: 1, field: 'name', value: 'New', record: { id: 'r1', name: 'Alice', active: true } }
    ]);

    table.emit('sort_click', { field: 'name', order: 'desc' });
    expect(host.emittedSort).toEqual([{ field: 'name', order: 'desc' }]);
  });

  it('rowDeleted / iconClicked / batchUpdated / rowReordered 透传', () => {
    const fixture = TestBed.createComponent(QueryTableComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('records', [{ id: 'r1', name: 'Alice', active: true }]);
    fixture.componentRef.setInput('columns', [
      { field: 'name', title: '名称', cellType: 'text' },
      { field: 'active', title: '启用', cellType: 'switch' }
    ] as never);
    const rowDeleted: EntityTableRecord[] = [];
    const iconClicked: Array<{ name: string; record: EntityTableRecord }> = [];
    const batchUpdated: BatchChangeItem[][] = [];
    const rowReordered: string[][] = [];
    component.rowDeleted.subscribe(e => rowDeleted.push(e));
    component.iconClicked.subscribe(e => iconClicked.push(e));
    component.batchUpdated.subscribe(e => batchUpdated.push(e));
    component.rowReordered.subscribe(e => rowReordered.push(e));
    fixture.detectChanges();

    const table = component.tableInstance as unknown as FakeListTable;
    table.emit('icon_click', { name: 'delete-action', col: 1, row: 1 });
    table.emit('icon_click', { name: 'view-action', col: 1, row: 1 });
    table.emit('change_header_position', {});
    table.selectedCellInfos = [[{ col: 1, row: 1, field: 'name' }]];
    table.emit('selected_cell', { col: 1, row: 1 });
    component
      .entityTable()!
      .tableContainer()!
      .nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true }));

    expect(rowDeleted).toEqual([{ id: 'r1', name: 'Alice', active: true }]);
    expect(iconClicked).toEqual([{ name: 'view-action', record: { id: 'r1', name: 'Alice', active: true } }]);
    expect(rowReordered).toEqual([['r1']]);
    expect(batchUpdated).toEqual([[{ recordId: 'r1', changes: { name: '' } }]]);
  });

  it('changeCellValue 与 redrawTheme 委托给内部表格', () => {
    const { component } = render();
    const table = component.tableInstance as unknown as FakeListTable;

    expect(() => component.changeCellValue(1, 1, 'back')).not.toThrow();
    component.redrawTheme();
    expect(table.lastTheme).toBeDefined();
  });

  it('loading 透传给内部实体表格并渲染 spinner', () => {
    const loading = render({ records: [], loading: true });

    expect(loading.fixture.nativeElement.querySelector('.loading-spinner')).toBeTruthy();
  });
});

describe('QueryTableComponent（分支收尾）', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('viewChild / 表格引擎未就绪时 tableInstance 回退 null，就绪后拿到引擎', async () => {
    const fixture = TestBed.createComponent(QueryTableComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('columns', [{ field: 'name', title: '名称' }]);
    fixture.componentRef.setInput('records', []);

    // 未 detectChanges：entityTable viewChild 尚未解析
    expect(component.tableInstance).toBeNull();

    // 渲染后引擎经 afterNextRender / effect 装配（需要非空列定义），随后拿到 FakeListTable
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(component.tableInstance).toBeInstanceOf(FakeListTable);
  });
});
