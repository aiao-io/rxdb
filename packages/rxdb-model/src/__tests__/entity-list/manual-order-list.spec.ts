import { type EntityPropertyMetadata, PropertyType } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import {
  type ListReorderState,
  type ManualOrderListMetadata,
  canReorderEntityList,
  commitRowMove,
  defaultListOrderBy,
  pinsSingleOrderDomain
} from '../../entity-list/manual-order-list.js';

const metadataOf = (
  manualOrder: ManualOrderListMetadata['manualOrder'],
  keyType: PropertyType = PropertyType.uuid
): ManualOrderListMetadata => ({
  manualOrder,
  propertyMap: new Map([['id', { name: 'id', type: keyType } as EntityPropertyMetadata]])
});

/** 一切满足的基线：整表手动排序、uuid 主键、全部加载、无干扰状态 */
const enabledState = (overrides: Partial<ListReorderState> = {}): ListReorderState => ({
  metadata: metadataOf(true),
  sortOrder: 'normal',
  hasUserFilter: false,
  selectMode: false,
  fixedQuery: undefined,
  fullyLoaded: true,
  hasReadonlyRows: false,
  hasDrafts: false,
  hasPendingEdits: false,
  reorderPending: false,
  ...overrides
});

const MOVE = { id: 'b', prevId: 'c', nextId: null };

describe('pinsSingleOrderDomain', () => {
  it('整表排序：没有固定查询或规则为空才算一条完整排序域', () => {
    expect(pinsSingleOrderDomain([], undefined)).toBe(true);
    expect(pinsSingleOrderDomain([], { combinator: 'and', rules: [] })).toBe(true);
    expect(pinsSingleOrderDomain([], { combinator: 'and', rules: [{ field: 'x', operator: '=', value: 1 }] })).toBe(
      false
    );
  });

  it('分组排序：对全部分组字段各一条等值或 null 条件', () => {
    const groups = ['categoryId', 'archived'];
    expect(
      pinsSingleOrderDomain(groups, {
        combinator: 'and',
        rules: [
          { field: 'categoryId', operator: '=', value: 'c1' },
          { field: 'archived', operator: 'null' }
        ]
      })
    ).toBe(true);
    expect(
      pinsSingleOrderDomain(['categoryId'], { combinator: 'or', rules: [{ field: 'categoryId', operator: '=' }] })
    ).toBe(true);
  });

  it('分组排序：缺字段、多余规则、重复字段、非等值、嵌套组或 or 组合都不算', () => {
    const groups = ['categoryId', 'archived'];
    const eq = (field: string) => ({ field, operator: '=', value: 'v' });
    expect(pinsSingleOrderDomain(groups, undefined)).toBe(false);
    expect(pinsSingleOrderDomain(groups, { combinator: 'and', rules: [eq('categoryId')] })).toBe(false);
    expect(pinsSingleOrderDomain(groups, { combinator: 'and', rules: [eq('categoryId'), eq('categoryId')] })).toBe(
      false
    );
    expect(pinsSingleOrderDomain(groups, { combinator: 'and', rules: [eq('categoryId'), eq('title')] })).toBe(false);
    expect(pinsSingleOrderDomain(groups, { combinator: 'or', rules: [eq('categoryId'), eq('archived')] })).toBe(false);
    expect(
      pinsSingleOrderDomain(groups, {
        combinator: 'and',
        rules: [eq('categoryId'), { field: 'archived', operator: '!=', value: true }]
      })
    ).toBe(false);
    expect(
      pinsSingleOrderDomain(groups, {
        combinator: 'and',
        rules: [eq('categoryId'), { combinator: 'and', rules: [eq('archived')] }]
      })
    ).toBe(false);
    expect(pinsSingleOrderDomain(['categoryId'], { combinator: 'and', rules: [null] })).toBe(false);
    expect(pinsSingleOrderDomain(['categoryId'], { combinator: 'and', rules: [{ operator: '=' }] })).toBe(false);
  });
});

describe('canReorderEntityList', () => {
  it('全部条件满足时允许', () => {
    expect(canReorderEntityList(enabledState())).toBe(true);
    expect(canReorderEntityList(enabledState({ metadata: metadataOf(true, PropertyType.string) }))).toBe(true);
  });

  it('未注册实体、非手动排序实体、非字符串主键都不允许', () => {
    expect(canReorderEntityList(enabledState({ metadata: undefined }))).toBe(false);
    expect(canReorderEntityList(enabledState({ metadata: metadataOf(undefined) }))).toBe(false);
    expect(canReorderEntityList(enabledState({ metadata: metadataOf(true, PropertyType.integer) }))).toBe(false);
    expect(canReorderEntityList(enabledState({ metadata: { manualOrder: true, propertyMap: new Map() } }))).toBe(false);
  });

  it.each<[string, Partial<ListReorderState>]>([
    ['按列升序', { sortOrder: 'asc' }],
    ['按列降序', { sortOrder: 'desc' }],
    ['用户筛选', { hasUserFilter: true }],
    ['选择模式', { selectMode: true }],
    ['还有下一页', { fullyLoaded: false }],
    ['只读行', { hasReadonlyRows: true }],
    ['草稿行', { hasDrafts: true }],
    ['未完成的编辑', { hasPendingEdits: true }],
    ['重排未落定', { reorderPending: true }]
  ])('%s 时不允许', (_, overrides) => {
    expect(canReorderEntityList(enabledState(overrides))).toBe(false);
  });

  it('分组排序实体：固定查询钉住单组才允许', () => {
    const metadata = metadataOf({ groupBy: ['completed'] });
    expect(canReorderEntityList(enabledState({ metadata }))).toBe(false);
    expect(
      canReorderEntityList(
        enabledState({
          metadata,
          fixedQuery: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] }
        })
      )
    ).toBe(true);
  });
});

describe('defaultListOrderBy', () => {
  it('手动排序实体按 [分组…, sortOrder, id] 升序', () => {
    expect(defaultListOrderBy({ manualOrder: { groupBy: ['completed'] } })).toEqual([
      { field: 'completed', sort: 'asc' },
      { field: 'sortOrder', sort: 'asc' },
      { field: 'id', sort: 'asc' }
    ]);
    expect(defaultListOrderBy({ manualOrder: true })).toEqual([
      { field: 'sortOrder', sort: 'asc' },
      { field: 'id', sort: 'asc' }
    ]);
  });

  it('其它实体保持 id 降序', () => {
    expect(defaultListOrderBy(undefined)).toEqual([{ field: 'id', sort: 'desc' }]);
    expect(defaultListOrderBy({ manualOrder: undefined })).toEqual([{ field: 'id', sort: 'desc' }]);
  });
});

describe('commitRowMove', () => {
  const hooksOf = (enabled: boolean, reorder: (move: unknown) => Promise<unknown>) => ({
    enabled,
    reorder: vi.fn(reorder),
    restore: vi.fn(),
    setPending: vi.fn(),
    setError: vi.fn()
  });

  it('不允许时零写入并恢复表格', async () => {
    const hooks = hooksOf(false, () => Promise.resolve());
    await expect(commitRowMove(MOVE, hooks)).resolves.toBe(false);
    expect(hooks.reorder).not.toHaveBeenCalled();
    expect(hooks.restore).toHaveBeenCalledOnce();
    expect(hooks.setPending).not.toHaveBeenCalled();
  });

  it('成功时清错误、进出 pending、不恢复表格', async () => {
    const hooks = hooksOf(true, () => Promise.resolve());
    await expect(commitRowMove(MOVE, hooks)).resolves.toBe(true);
    expect(hooks.reorder).toHaveBeenCalledWith(MOVE);
    expect(hooks.setError).toHaveBeenCalledExactlyOnceWith(null);
    expect(hooks.setPending.mock.calls).toEqual([[true], [false]]);
    expect(hooks.restore).not.toHaveBeenCalled();
  });

  it('失败时显示错误、恢复表格并退出 pending', async () => {
    const error = new Error('boom');
    const hooks = hooksOf(true, () => Promise.reject(error));
    await expect(commitRowMove(MOVE, hooks)).resolves.toBe(false);
    expect(hooks.setError).toHaveBeenLastCalledWith(error);
    expect(hooks.restore).toHaveBeenCalledOnce();
    expect(hooks.setPending.mock.calls).toEqual([[true], [false]]);
  });
});
