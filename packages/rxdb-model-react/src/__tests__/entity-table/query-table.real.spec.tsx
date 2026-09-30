/**
 * QueryTable —— **真实组件源码**（Angular `query-table.component.real.spec.ts` 的 React 移植）。
 *
 * 覆盖 statusText（filtered/total）、filterBar / emptyState 插槽、状态栏显隐
 * 与真实 EntityTable 的事件透传链路；命令式能力经 ref handle 委托。
 */
import type { BatchChangeItem, CellChangeEvent, EntityTableRecord } from '@aiao/rxdb-model';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryTable, type QueryTableHandle } from '../../entity-table';
import { FakeListTable, getLastListTable } from '../testing/fake-vtable';

// VTable 引擎打桩（真实组件代码照常执行，只替换渲染引擎）
vi.mock('@visactor/vtable', () => import('../testing/fake-vtable'));
vi.mock('@visactor/vtable-editors', () => import('../testing/fake-vtable-editors'));

describe('QueryTable（真实组件）', () => {
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
  });

  function renderTable(
    overrides: Partial<{
      records: EntityTableRecord[];
      totalCount: number | undefined;
      filteredCount: number | undefined;
      queryActive: boolean;
      loading: boolean;
    }> = {}
  ) {
    const emittedCellChanged: CellChangeEvent[] = [];
    const emittedSort: Array<{ field: unknown; order: unknown }> = [];
    const utils = render(
      <QueryTable
        columns={
          [
            { field: 'name', title: '名称', cellType: 'text' },
            { field: 'active', title: '启用', cellType: 'switch' }
          ] as never
        }
        records={'records' in overrides ? overrides.records! : [{ id: 'r1', name: 'Alice', active: true }]}
        filteredCount={'filteredCount' in overrides ? overrides.filteredCount : 3}
        totalCount={'totalCount' in overrides ? overrides.totalCount : 10}
        queryActive={'queryActive' in overrides ? overrides.queryActive : true}
        loading={'loading' in overrides ? overrides.loading : false}
        onCellChanged={e => emittedCellChanged.push(e)}
        onSortClicked={e => emittedSort.push(e)}
        filterBar={
          <div data-filter-bar='true'>
            筛选区：<button type='button'>应用</button>
          </div>
        }
        emptyState={<div data-empty-state='true'>自定义空态</div>}
      />
    );
    return { ...utils, emittedCellChanged, emittedSort };
  }

  it('statusText：total 缺失为空串，无 filtered 为总数，不等为 filtered / total', () => {
    const none = renderTable({ totalCount: undefined });
    expect(none.container.textContent).not.toContain('/');

    const onlyTotal = renderTable({ totalCount: 5, filteredCount: undefined });
    expect(onlyTotal.container.querySelector('.text-base-content\\/60 span')?.textContent).toBe('5');

    const filtered = renderTable({ totalCount: 10, filteredCount: 3 });
    expect(filtered.container.querySelector('.text-base-content\\/60 span')?.textContent).toBe('3 / 10');

    const equal = renderTable({ totalCount: 7, filteredCount: 7 });
    expect(equal.container.querySelector('.text-base-content\\/60 span')?.textContent).toBe('7');

    const zero = renderTable({ totalCount: 5, filteredCount: 0 });
    expect(zero.container.querySelector('.text-base-content\\/60 span')?.textContent).toBe('0 / 5');
  });

  it('queryActive 且有 statusText 时渲染筛选状态栏，否则隐藏', () => {
    expect(renderTable().container.textContent).toContain('3 / 10');

    const inactive = renderTable({ queryActive: false });
    expect(inactive.container.textContent).not.toContain('3 / 10');

    const noTotal = renderTable({ totalCount: undefined });
    expect(noTotal.container.textContent).not.toContain('/');
  });

  it('filterBar 与 emptyState 插槽渲染；emptyState 只在实体表格空态时渲染', () => {
    const { container } = renderTable();

    expect(container.textContent).toContain('筛选区');
    // emptyState 只在实体表格空态时渲染
    expect(container.textContent).not.toContain('自定义空态');

    const empty = renderTable({ records: [] });
    expect(empty.container.textContent).toContain('自定义空态');
  });

  it('表格初始化后 ref.tableInstance 委托给内部 EntityTable', () => {
    const ref = { current: null as QueryTableHandle | null };
    render(
      <QueryTable
        ref={ref}
        columns={[{ field: 'name', title: '名称' }] as never}
        records={[{ id: 'r1', name: 'Alice' }]}
      />
    );

    expect(ref.current?.tableInstance).toBeInstanceOf(FakeListTable);
  });

  it('内部表格事件透传到外层回调（onCellChanged / onSortClicked）', () => {
    const { emittedCellChanged, emittedSort } = renderTable();
    const table = getLastListTable();

    table.emit('change_cell_value', { col: 1, row: 1, changedValue: 'New' });
    expect(emittedCellChanged).toEqual([
      { col: 1, row: 1, field: 'name', value: 'New', record: { id: 'r1', name: 'Alice', active: true } }
    ]);

    table.emit('sort_click', { field: 'name', order: 'desc' });
    expect(emittedSort).toEqual([{ field: 'name', order: 'desc' }]);
  });

  it('rowDeleted / iconClicked / batchUpdated / rowReordered 透传', () => {
    const rowDeleted: EntityTableRecord[] = [];
    const iconClicked: Array<{ name: string; record: EntityTableRecord }> = [];
    const batchUpdated: BatchChangeItem[][] = [];
    const rowReordered: string[][] = [];
    const utils = render(
      <QueryTable
        records={[{ id: 'r1', name: 'Alice', active: true }]}
        columns={
          [
            { field: 'name', title: '名称', cellType: 'text' },
            { field: 'active', title: '启用', cellType: 'switch' }
          ] as never
        }
        onRowDeleted={e => rowDeleted.push(e)}
        onIconClicked={e => iconClicked.push(e)}
        onBatchUpdated={e => batchUpdated.push(e)}
        onRowReordered={e => rowReordered.push(e)}
      />
    );

    const table = getLastListTable();
    table.emit('icon_click', { name: 'delete-action', col: 1, row: 1 });
    table.emit('icon_click', { name: 'view-action', col: 1, row: 1 });
    table.emit('change_header_position', {});
    table.selectedCellInfos = [[{ col: 1, row: 1, field: 'name' }]];
    table.emit('selected_cell', { col: 1, row: 1 });
    (utils.container.querySelector('.rxdb-entity-table > div') as HTMLDivElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', cancelable: true })
    );

    expect(rowDeleted).toEqual([{ id: 'r1', name: 'Alice', active: true }]);
    expect(iconClicked).toEqual([{ name: 'view-action', record: { id: 'r1', name: 'Alice', active: true } }]);
    expect(rowReordered).toEqual([['r1']]);
    expect(batchUpdated).toEqual([[{ recordId: 'r1', changes: { name: '' } }]]);
  });

  it('changeCellValue 与 redrawTheme 委托给内部表格', () => {
    const ref = { current: null as QueryTableHandle | null };
    render(
      <QueryTable
        ref={ref}
        columns={[{ field: 'name', title: '名称' }] as never}
        records={[{ id: 'r1', name: 'Alice' }]}
      />
    );
    const table = getLastListTable();

    expect(() => ref.current?.changeCellValue(1, 1, 'back')).not.toThrow();
    ref.current?.redrawTheme();
    expect(table.lastTheme).toBeDefined();
  });

  it('loading 透传给内部实体表格并渲染 spinner', () => {
    const loading = renderTable({ records: [], loading: true });

    expect(loading.container.querySelector('.loading-spinner')).toBeTruthy();
  });
});
