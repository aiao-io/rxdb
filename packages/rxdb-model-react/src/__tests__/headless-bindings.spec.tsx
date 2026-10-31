import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useEntityDetail, useEntityForm, useEntityList } from '../headless';

const fields = [{ field: 'title', displayName: '标题', type: 'string' as const }];

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

  it('卸载清理在严格模式回放后仅销毁最终实例一次', async () => {
    const { result, unmount } = renderHook(() => useEntityForm({ fields, data: { title: 'A' }, mode: 'edit' }), {
      wrapper: StrictMode
    });
    const dispose = vi.spyOn(result.current.controller, 'dispose');
    unmount();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledTimes(1);
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
