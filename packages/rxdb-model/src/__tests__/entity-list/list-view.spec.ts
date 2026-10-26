import type { ColumnDefine } from '@visactor/vtable/es/ts-types/index.js';
import { describe, expect, it } from 'vitest';
import {
  type ListViewState,
  applyListViewColumns,
  buildListViewOrderBy,
  buildListViewRecords,
  buildListViewTableOptions,
  createListViewState,
  getListViewFields,
  moveListViewItem
} from '../../entity-list/list-view.js';
import { isReadonly, isReadonlyOrAddRow } from '../../entity-table/columns/column-utils.js';

const columns: ColumnDefine[] = [
  { field: 'id', title: 'ID', sort: true },
  { field: 'title', title: '标题', sort: true, _propertyType: 'string' } as ColumnDefine,
  { field: 'completed', title: '完成', sort: true, _propertyType: 'boolean' } as ColumnDefine,
  { field: 'payload', title: '数据', _propertyType: 'json' } as ColumnDefine,
  { field: 'actions', title: '操作' }
];

describe('列表视图配置', () => {
  it('分组标题是只读节点，不能编辑、粘贴或删除', () => {
    expect(isReadonly({ vtableMerge: true })).toBe(true);
    expect(isReadonlyOrAddRow({ vtableMerge: true })).toBe(true);
  });
  it('默认配置保留原列和默认游标排序', () => {
    const state: ListViewState = createListViewState();
    expect(applyListViewColumns(columns, state)).toEqual(columns);
    expect(buildListViewOrderBy(state, undefined)).toEqual([{ field: 'id', sort: 'desc' }]);
    expect(buildListViewTableOptions(state, columns).groupBy).toEqual([]);
  });

  it('配置字段显隐与顺序，选择列保持最前、操作列保持最后', () => {
    const state: ListViewState = { ...createListViewState(), fieldOrder: ['completed', 'title'], hiddenFields: ['id'] };
    const result = applyListViewColumns([{ field: '__selected', title: '' }, ...columns], state);
    expect(result.map(column => column.field)).toEqual(['__selected', 'completed', 'title', 'payload', 'actions']);
    expect(columns[0].field).toBe('id');
    expect(getListViewFields(columns).map(field => [field.field, field.sortable])).toEqual([
      ['id', true],
      ['title', true],
      ['completed', true],
      ['payload', false]
    ]);
  });

  it('至少保留一个数据字段，避免只剩操作列', () => {
    expect(() =>
      applyListViewColumns(columns, {
        ...createListViewState(),
        hiddenFields: ['id', 'title', 'completed', 'payload']
      })
    ).toThrow('至少保留一个字段');
  });

  it('多字段排序保留优先级，补充同向唯一键保障跨页稳定', () => {
    const state: ListViewState = {
      ...createListViewState(),
      sorts: [
        { field: 'completed', sort: 'asc' },
        { field: 'title', sort: 'desc' }
      ]
    };
    expect(buildListViewOrderBy(state, undefined)).toEqual([
      { field: 'completed', sort: 'asc' },
      { field: 'title', sort: 'desc' },
      { field: 'id', sort: 'desc' }
    ]);
    expect(buildListViewOrderBy({ ...state, sorts: [{ field: 'id', sort: 'asc' }] }, undefined)).toEqual([
      { field: 'id', sort: 'asc' }
    ]);
  });

  it('用户把 ID 放在前面时仍将 ID 放到游标排序末尾', () => {
    expect(
      buildListViewOrderBy(
        {
          ...createListViewState(),
          sorts: [
            { field: 'id', sort: 'asc' },
            { field: 'title', sort: 'desc' }
          ]
        },
        undefined
      )
    ).toEqual([
      { field: 'title', sort: 'desc' },
      { field: 'id', sort: 'asc' }
    ]);
  });

  it('分组字段参与查询排序，避免只对当前页排序，显式方向保持有效', () => {
    const state: ListViewState = {
      ...createListViewState(),
      groupBy: 'completed',
      sorts: [{ field: 'title', sort: 'desc' }]
    };
    expect(buildListViewOrderBy(state, undefined)).toEqual([
      { field: 'completed', sort: 'asc' },
      { field: 'title', sort: 'desc' },
      { field: 'id', sort: 'desc' }
    ]);
    expect(buildListViewOrderBy({ ...state, sorts: [{ field: 'completed', sort: 'desc' }] }, undefined)[0]).toEqual({
      field: 'completed',
      sort: 'desc'
    });
  });

  it('缺失与空分组值保留记录，false、零和空字符串不丢失，源记录不变', () => {
    const records = [
      { id: 'a' },
      { id: 'b', completed: null },
      { id: 'c', completed: false },
      { id: 'd', completed: 0 },
      { id: 'e', completed: '' }
    ];
    const state: ListViewState = { ...createListViewState(), groupBy: 'completed' };
    expect(buildListViewRecords(records, state).map(record => record['completed'])).toEqual([null, null, false, 0, '']);
    expect(records[0]).toEqual({ id: 'a' });
    expect(buildListViewRecords(records, createListViewState())).toBe(records);
  });

  it('分组标题显示已加载计数与可读值，使用字段格式化显示关联名称', () => {
    const state: ListViewState = { ...createListViewState(), groupBy: 'completed' };
    const options = buildListViewTableOptions(state, columns);
    expect(options.groupBy).toEqual(['completed']);
    expect(options.hierarchyExpandLevel).toBe(2);
    const format = options.groupTitleFieldFormat;
    expect(format?.({ children: [{ completed: false }, { completed: false }] })).toBe('完成：否（已加载 2 条）');
    expect(format?.({ children: [{ completed: null }] })).toBe('完成：未填写（已加载 1 条）');
    const formatted = buildListViewTableOptions({ ...state, groupBy: 'title' }, [
      { field: 'title', title: '分类', fieldFormat: () => '办公设备' }
    ]);
    expect(formatted.groupTitleFieldFormat?.({ children: [{ title: 'category-id' }] })).toBe(
      '分类：办公设备（已加载 1 条）'
    );
  });

  it('移动优先级不修改输入，边界保持不变', () => {
    const items = ['a', 'b', 'c'];
    expect(moveListViewItem(items, 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveListViewItem(items, 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveListViewItem(items, 0, -1)).toEqual(items);
    expect(moveListViewItem(items, 2, 1)).toEqual(items);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});
