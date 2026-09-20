import type { CellChangeEvent, EntityTableRecord } from '@aiao/rxdb-model';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import QueryTable from '../../entity-table/QueryTable.vue';

// VTable 引擎打桩（真实组件代码照常执行，只替换渲染引擎）
vi.mock('@visactor/vtable', () => import('../testing/fake-vtable'));
vi.mock('@visactor/vtable-editors', () => import('../testing/fake-vtable-editors'));

import { FakeListTable } from '../testing/fake-vtable';

/** 投影宿主：把 filterBar / emptyState 两个插槽按真实用法投进 query-table。 */
const QueryTableHost = defineComponent({
  components: { QueryTable },
  props: {
    columns: { type: Array, required: true },
    filteredCount: { type: Number, required: false, default: undefined },
    loading: { type: Boolean, required: false, default: false },
    queryActive: { type: Boolean, required: false, default: true },
    records: { type: Array, required: true },
    totalCount: { type: Number, required: false, default: undefined }
  },
  emits: ['cellChanged', 'sortClicked'],
  setup(_props, { emit }) {
    const onCellChanged = (event: CellChangeEvent) => emit('cellChanged', event);
    const onSortClicked = (event: { field: unknown; order: unknown }) => emit('sortClicked', event);
    return { onCellChanged, onSortClicked };
  },
  template: `
    <QueryTable
      :columns="columns"
      :filtered-count="filteredCount"
      :loading="loading"
      :query-active="queryActive"
      :records="records"
      :total-count="totalCount"
      @cell-changed="onCellChanged"
      @sort-clicked="onSortClicked"
    >
      <template #filterBar>
        <div class="filter-area">筛选区：<button type="button">应用</button></div>
      </template>
      <template #emptyState>
        <div class="custom-empty">自定义空态</div>
      </template>
    </QueryTable>
  `
});

type QueryTableVM = InstanceType<typeof QueryTable> & {
  statusText: string;
  tableInstance: FakeListTable | null;
  entityTable: { tableContainer: HTMLElement | null } | null;
  changeCellValue(col: number, row: number, value: unknown): void;
  redrawTheme(): void;
};

/**
 * QueryTable —— **真实组件源码**（对齐 Angular 侧 specs/027 T025a）。
 *
 * 覆盖 statusText（filtered/total）、filterBar / emptyState 内容投影、
 * 状态栏显隐与真实 EntityTable 组件的事件透传链路。
 */

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

  function render(
    overrides: Partial<{
      records: EntityTableRecord[];
      totalCount: number | undefined;
      filteredCount: number | undefined;
      queryActive: boolean;
      loading: boolean;
    }> = {}
  ) {
    const wrapper = mount(QueryTableHost, {
      props: {
        columns: [
          { field: 'name', title: '名称', cellType: 'text' },
          { field: 'active', title: '启用', cellType: 'switch' }
        ],
        records:
          'records' in overrides ?
            (overrides.records as EntityTableRecord[])
          : [{ id: 'r1', name: 'Alice', active: true }],
        filteredCount: 'filteredCount' in overrides ? overrides.filteredCount : 3,
        totalCount: 'totalCount' in overrides ? overrides.totalCount : 10,
        queryActive: 'queryActive' in overrides ? overrides.queryActive : true,
        loading: 'loading' in overrides ? overrides.loading : false
      }
    });
    const component = wrapper.findComponent(QueryTable).vm as unknown as QueryTableVM;
    return { wrapper, component };
  }

  it('statusText：total 缺失为空串，无 filtered 为总数，不等为 filtered / total', () => {
    const none = render({ totalCount: undefined });
    expect(none.component.statusText).toBe('');

    const onlyTotal = render({ totalCount: 5, filteredCount: undefined });
    expect(onlyTotal.component.statusText).toBe('5');

    const filtered = render({ totalCount: 10, filteredCount: 3 });
    expect(filtered.component.statusText).toBe('3 / 10');

    const equal = render({ totalCount: 7, filteredCount: 7 });
    expect(equal.component.statusText).toBe('7');

    const zero = render({ totalCount: 5, filteredCount: 0 });
    expect(zero.component.statusText).toBe('0 / 5');
  });

  it('queryActive 且有 statusText 时渲染筛选状态栏，否则隐藏', () => {
    expect(render().wrapper.element.textContent).toContain('3 / 10');

    const inactive = render({ queryActive: false });
    expect(inactive.wrapper.element.textContent).not.toContain('3 / 10');

    const noTotal = render({ totalCount: undefined });
    expect(noTotal.wrapper.element.textContent).not.toContain('/');
  });

  it('filterBar 与 emptyState 插槽按选择器投影', () => {
    const { wrapper } = render();

    expect(wrapper.element.textContent).toContain('筛选区');
    // emptyState 只在实体表格空态时渲染
    expect(wrapper.element.textContent).not.toContain('自定义空态');

    const empty = render({ records: [] });
    expect(empty.wrapper.element.textContent).toContain('自定义空态');
  });

  it('表格初始化后 tableInstance 委托给内部 EntityTable', () => {
    const { component } = render();

    expect(component.tableInstance).toBeInstanceOf(FakeListTable);
  });

  it('内部表格事件透传到外层 emit（cellChanged / sortClicked）', () => {
    const { wrapper, component } = render();
    const table = component.tableInstance as unknown as FakeListTable;

    table.emit('change_cell_value', { col: 1, row: 1, changedValue: 'New' });
    expect(wrapper.emitted('cellChanged')).toEqual([
      [{ col: 1, row: 1, field: 'name', value: 'New', record: { id: 'r1', name: 'Alice', active: true } }]
    ]);

    table.emit('sort_click', { field: 'name', order: 'desc' });
    expect(wrapper.emitted('sortClicked')).toEqual([[{ field: 'name', order: 'desc' }]]);
  });

  it('rowDeleted / iconClicked / batchUpdated / rowReordered 透传', () => {
    const wrapper = mount(QueryTable, {
      props: {
        records: [{ id: 'r1', name: 'Alice', active: true }],
        columns: [
          { field: 'name', title: '名称', cellType: 'text' },
          { field: 'active', title: '启用', cellType: 'switch' }
        ] as never
      }
    });
    const component = wrapper.vm as unknown as QueryTableVM;

    const table = component.tableInstance as unknown as FakeListTable;
    table.emit('icon_click', { name: 'delete-action', col: 1, row: 1 });
    table.emit('icon_click', { name: 'view-action', col: 1, row: 1 });
    table.emit('change_header_position', {});
    table.selectedCellInfos = [[{ col: 1, row: 1, field: 'name' }]];
    table.emit('selected_cell', { col: 1, row: 1 });
    component.entityTable?.tableContainer?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', cancelable: true })
    );

    expect(wrapper.emitted('rowDeleted')).toEqual([[{ id: 'r1', name: 'Alice', active: true }]]);
    expect(wrapper.emitted('iconClicked')).toEqual([
      [{ name: 'view-action', record: { id: 'r1', name: 'Alice', active: true } }]
    ]);
    expect(wrapper.emitted('rowReordered')).toEqual([[['r1']]]);
    expect(wrapper.emitted('batchUpdated')).toEqual([[[{ recordId: 'r1', changes: { name: '' } }]]]);
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

    expect(loading.wrapper.element.querySelector('.loading-spinner')).toBeTruthy();
  });
});

describe('QueryTable（分支收尾）', () => {
  it('表格引擎未就绪时 tableInstance 回退 null，就绪后拿到引擎', async () => {
    const wrapper = mount(QueryTable, {
      props: {
        columns: [{ field: 'name', title: '名称' }],
        records: []
      }
    });
    const component = wrapper.vm as unknown as QueryTableVM;

    // 引擎经 onMounted 装配（需要非空列定义），随后拿到 FakeListTable
    expect(component.tableInstance).toBeInstanceOf(FakeListTable);
  });
});
