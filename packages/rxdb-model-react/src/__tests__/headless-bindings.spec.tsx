import { EntityFormController, type EntityListControllerOptions } from '@aiao/rxdb-model/headless';
import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  useEntityDetail,
  useEntityDialog,
  useEntityForm,
  useEntityList,
  useQueryBuilder,
  useQueryTable,
  type UseEntityListResult
} from '../headless';
import { captureHook, hideAndReveal } from './testing/activity';

const fields = [{ field: 'title', displayName: '标题', type: 'string' as const }];
const queryFields = [{ name: 'title', displayName: '标题', type: 'string' as const }];

function useFormAction(): () => unknown {
  const { controller } = useEntityForm({ fields, data: { title: 'A' }, mode: 'edit' });
  return () => controller.setField('title', 'B');
}
function useQueryBuilderAction(): () => unknown {
  const { controller } = useQueryBuilder({ fields: queryFields });
  return () => controller.addRule();
}
function useListAction(): () => unknown {
  const { controller } = useEntityList({ records: [] });
  return () => controller.select([]);
}
function useDetailAction(): () => unknown {
  const { controller } = useEntityDetail({ fields, data: { title: 'A' }, mode: 'edit' });
  return () => controller.setField('title', 'B');
}
function useDialogAction(): () => unknown {
  const { controller } = useEntityDialog();
  return () => controller.open();
}
function useQueryTableAction(): () => unknown {
  const { controller } = useQueryTable({ records: [] });
  return () => controller.select([]);
}

type ListHook = (options: EntityListControllerOptions) => UseEntityListResult;

describe('React headless bindings', () => {
  it('StrictMode 回放不会销毁仍在使用的表单控制器', () => {
    const { result } = renderHook(() => useEntityForm({ fields, data: { title: 'A' }, mode: 'edit' }), {
      wrapper: StrictMode
    });
    act(() => {
      result.current.controller.setField('title', 'B');
    });
    expect(result.current.snapshot.data.title).toBe('B');
  });

  it('详情只改变 mode 不会丢弃未提交草稿', () => {
    const { result, rerender } = renderHook(
      ({ mode }: { mode: 'edit' | 'view' }) => useEntityDetail({ fields, data: { title: 'A' }, mode }),
      { initialProps: { mode: 'edit' as const } }
    );
    act(() => {
      result.current.controller.setField('title', 'draft');
    });
    rerender({ mode: 'edit' });
    expect(result.current.snapshot.form.data.title).toBe('draft');
  });

  it('宿主更新 data 会重置表单，字段和 mode 更新不会重置', () => {
    const { result, rerender } = renderHook(
      ({ data, mode }: { data: { title: string }; mode: 'edit' | 'view' }) => useEntityForm({ fields, data, mode }),
      { initialProps: { data: { title: 'A' }, mode: 'edit' as 'edit' | 'view' } }
    );
    act(() => result.current.controller.setField('title', 'draft'));
    rerender({ data: { title: 'A' }, mode: 'view' });
    expect(result.current.snapshot.data.title).toBe('draft');
    rerender({ data: { title: 'B' }, mode: 'view' });
    expect(result.current.snapshot.data.title).toBe('B');
  });

  it('StrictMode 回放与卸载只增减订阅：卸载后不留监听，也不终结控制器', async () => {
    const original = EntityFormController.prototype.subscribe;
    let active = 0;
    const subscribe = vi.spyOn(EntityFormController.prototype, 'subscribe').mockImplementation(function (
      this: EntityFormController,
      listener
    ) {
      const stop = original.call(this, listener);
      active++;
      return () => {
        active--;
        stop();
      };
    });
    try {
      const { result, unmount } = renderHook(() => useEntityForm({ fields, data: { title: 'A' }, mode: 'edit' }), {
        wrapper: StrictMode
      });
      const dispose = vi.spyOn(result.current.controller, 'dispose');
      expect(active).toBe(1);
      unmount();
      await Promise.resolve();
      expect(active).toBe(0);
      expect(dispose).not.toHaveBeenCalled();
    } finally {
      subscribe.mockRestore();
    }
  });

  it.each([
    ['useEntityForm', useFormAction],
    ['useQueryBuilder', useQueryBuilderAction],
    ['useEntityList', useListAction],
    ['useEntityDetail', useDetailAction],
    ['useEntityDialog', useDialogAction],
    ['useQueryTable', useQueryTableAction]
  ])('%s 在 Activity 隐藏、跨过微任务再显示后仍可操作', async (_name, useAction) => {
    const { results, ui } = captureHook(useAction);
    await hideAndReveal(ui);
    expect(() => act(() => void results.at(-1)!())).not.toThrow();
  });

  it('Activity 重显后沿用同一表单控制器，草稿、动作与订阅保持一致', async () => {
    const { results, ui } = captureHook(() => useEntityForm({ fields, data: { title: 'A' }, mode: 'edit' }));
    await hideAndReveal(ui, () => void results[0]!.controller.setField('title', 'draft'));
    const controller = results[0]!.controller;
    expect(results.at(-1)!.controller).toBe(controller);
    expect(results.at(-1)!.snapshot.data.title).toBe('draft');
    act(() => void controller.setField('title', 'after'));
    expect(results.at(-1)!.snapshot.data.title).toBe('after');
  });

  it.each<[string, ListHook]>([
    ['useEntityList', useEntityList],
    ['useQueryTable', useQueryTable]
  ])('%s 保留初始 records，并跟随分页、页大小与排序输入', async (_name, useList) => {
    const item = { id: 'one', title: 'one', save: async () => undefined, remove: async () => undefined };
    const load = vi.fn(() => ({ records: [item] }));
    const { result, rerender } = renderHook(
      ({ page, pageSize, sort }: { page: number; pageSize: number; sort: 'asc' | 'desc' }) =>
        useList({ records: [item], page, pageSize, sorts: [{ field: 'title', sort }], load }),
      { initialProps: { page: 0, pageSize: 10, sort: 'asc' } }
    );
    expect(result.current.snapshot.records).toEqual([item]);
    rerender({ page: 2, pageSize: 20, sort: 'desc' });
    const request = { page: 2, pageSize: 20, sorts: [{ field: 'title', sort: 'desc' }] };
    expect(result.current.snapshot).toMatchObject(request);
    await act(async () => {
      await result.current.controller.refresh();
    });
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining(request));
  });

  it('inline 查询与记录不会触发重渲染循环', () => {
    let renders = 0;
    const { result, rerender } = renderHook(() => {
      renders++;
      return useEntityList({ query: { title: 'A' }, records: [] });
    });
    rerender();
    expect(result.current.snapshot.records).toEqual([]);
    expect(renders).toBeLessThan(5);
  });
});
