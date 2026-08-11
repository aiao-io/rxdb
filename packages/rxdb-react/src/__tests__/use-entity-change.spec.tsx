/**
 * `useEntityChange` —— React 侧（RVU-010）。
 *
 * @remarks
 * 与 `packages/rxdb-angular/src/__tests__/rxdb-change-detector.directive.spec.ts`、
 * `packages/rxdb-vue/src/__tests__/use-entity-change.spec.ts` 逐条对齐：Angular 断言
 * `markForCheck` 被调用，Vue 断言模板重渲染，React 断言组件函数被重新执行 ——
 * 三者是同一件事在各自框架里的可观测形式。
 *
 * 时间窗判定（`0` / 负值 / `NaN` / `Infinity` 一律禁用，串联顺序 debounce → audit）
 * 由 `@aiao/utils` 的 `withTimeWindows` 保证，三端共用同一份实现。
 *
 * 只 fake 定时器相关的少数 API：React 的调度器走 `MessageChannel`，
 * 把 `queueMicrotask` 之类一并 fake 掉会让 `act` 永远等不到提交。
 */
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntityChange } from '../use-entity-change';

const rxdbMocks = vi.hoisted(() => ({ getEntityStatus: vi.fn() }));

vi.mock('@aiao/rxdb', () => ({ getEntityStatus: rxdbMocks.getEntityStatus }));

interface MockEntity {
  id: string;
  title: string;
}

describe('useEntityChange（RVU-010）', () => {
  let patches: Subject<void>;
  let entity: MockEntity;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    patches = new Subject<void>();
    entity = { id: 'todo-1', title: 'first' };
    rxdbMocks.getEntityStatus.mockReset();
    rxdbMocks.getEntityStatus.mockReturnValue({ patches$: patches.asObservable() });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  /** 渲染实体标题的宿主组件；DOM 文本就是「视图有没有跟上」的可观测量。 */
  const Host = ({ source }: { source: MockEntity | undefined }) => {
    const change = useEntityChange(source as never);
    return <span data-testid='title'>{(change.value as MockEntity | undefined)?.title ?? 'none'}</span>;
  };

  it('订阅当前实体的 patch 流', () => {
    renderHook(() => useEntityChange(entity as never));

    expect(rxdbMocks.getEntityStatus).toHaveBeenCalledWith(entity);
    expect(patches.observed).toBe(true);
  });

  // 核心：实体是原地可变的类实例，引用不变，React 的 props/state 比较会判定「没变化」
  it('patch 到达后组件读到原地修改的新字段', () => {
    render(<Host source={entity} />);
    expect(screen.getByTestId('title').textContent).toBe('first');

    entity.title = 'second';
    act(() => patches.next());

    expect(screen.getByTestId('title').textContent).toBe('second');
  });

  it('没有 patch 时原地修改不会重渲染（证明重渲染确实来自 patch 流）', () => {
    render(<Host source={entity} />);

    entity.title = 'silent';

    expect(screen.getByTestId('title').textContent).toBe('first');
  });

  it('revision 按 patch 次数递增', () => {
    const { result } = renderHook(() => useEntityChange(entity as never));
    expect(result.current.revision).toBe(0);

    act(() => {
      patches.next();
      patches.next();
    });

    expect(result.current.revision).toBe(2);
  });

  it('value 就是入参那个实例，不是副本', () => {
    const { result } = renderHook(() => useEntityChange(entity as never));

    expect(result.current.value).toBe(entity);
  });

  describe('时间窗', () => {
    it('默认配置下 patch 同步透传', () => {
      const { result } = renderHook(() => useEntityChange(entity as never));

      // 不推进定时器：默认路径不得挂任何 asyncScheduler
      act(() => patches.next());

      expect(result.current.revision).toBe(1);
    });

    it('debounceTime 生效', async () => {
      const { result } = renderHook(() => useEntityChange(entity as never, { debounceTime: 100 }));

      act(() => {
        patches.next();
        patches.next();
      });
      await act(async () => await vi.advanceTimersByTimeAsync(99));
      expect(result.current.revision).toBe(0);

      await act(async () => await vi.advanceTimersByTimeAsync(1));
      expect(result.current.revision).toBe(1);
    });

    it('auditTime 生效', async () => {
      const { result } = renderHook(() => useEntityChange(entity as never, { auditTime: 50 }));

      act(() => patches.next());
      await act(async () => await vi.advanceTimersByTimeAsync(49));
      expect(result.current.revision).toBe(0);

      await act(async () => await vi.advanceTimersByTimeAsync(1));
      expect(result.current.revision).toBe(1);
    });

    it('两者同时为正值时串联，顺序为 debounceTime → auditTime', async () => {
      const { result } = renderHook(() => useEntityChange(entity as never, { debounceTime: 100, auditTime: 50 }));

      act(() => patches.next());
      await act(async () => await vi.advanceTimersByTimeAsync(100));
      expect(result.current.revision).toBe(0);

      await act(async () => await vi.advanceTimersByTimeAsync(50));
      expect(result.current.revision).toBe(1);
    });

    it.each([
      ['debounceTime 为 0', { debounceTime: 0 }],
      ['auditTime 为 0', { auditTime: 0 }],
      ['debounceTime 为负', { debounceTime: -1 }],
      ['auditTime 为负', { auditTime: -1 }],
      ['debounceTime 为 NaN', { debounceTime: Number.NaN }],
      ['auditTime 为 NaN', { auditTime: Number.NaN }],
      ['debounceTime 为 Infinity', { debounceTime: Number.POSITIVE_INFINITY }],
      ['auditTime 为 Infinity', { auditTime: Number.POSITIVE_INFINITY }]
    ])('%s 时 patch 同步透传', (_label, options) => {
      const { result } = renderHook(() => useEntityChange(entity as never, options));

      act(() => patches.next());

      expect(result.current.revision).toBe(1);
    });

    it('时间窗改成正值后立即改按窗口放行', async () => {
      const { result, rerender } = renderHook(
        ({ debounce }) => useEntityChange(entity as never, { debounceTime: debounce }),
        {
          initialProps: { debounce: 0 }
        }
      );

      rerender({ debounce: 100 });
      act(() => patches.next());
      expect(result.current.revision).toBe(0);

      await act(async () => await vi.advanceTimersByTimeAsync(100));
      expect(result.current.revision).toBe(1);
    });
  });

  describe('实体切换与清理', () => {
    it('实体换成 undefined 时退订', () => {
      const { rerender } = renderHook(({ source }) => useEntityChange(source as never), {
        initialProps: { source: entity as MockEntity | undefined }
      });

      rerender({ source: undefined });

      expect(patches.observed).toBe(false);
    });

    it('实体为 undefined 时不建立订阅', () => {
      renderHook(() => useEntityChange(undefined as never));

      expect(rxdbMocks.getEntityStatus).not.toHaveBeenCalled();
      expect(patches.observed).toBe(false);
    });

    it('换实体时先退订旧的再订阅新的', () => {
      const otherPatches = new Subject<void>();
      const other: MockEntity = { id: 'todo-2', title: 'other' };
      const { result, rerender } = renderHook(({ source }) => useEntityChange(source as never), {
        initialProps: { source: entity }
      });

      rxdbMocks.getEntityStatus.mockReturnValue({ patches$: otherPatches.asObservable() });
      rerender({ source: other });

      expect(patches.observed).toBe(false);
      expect(result.current.value).toBe(other);

      act(() => otherPatches.next());
      expect(result.current.revision).toBe(1);
    });

    it('组件卸载时退订', () => {
      const { unmount } = renderHook(() => useEntityChange(entity as never));
      expect(patches.observed).toBe(true);

      unmount();

      expect(patches.observed).toBe(false);
    });

    // StrictMode 下 effect 会挂载—卸载—再挂载，清理函数写漏会留下悬空订阅
    it('StrictMode 下卸载后不残留订阅', () => {
      const { unmount } = renderHook(() => useEntityChange(entity as never), { wrapper: StrictMode });
      expect(patches.observed).toBe(true);

      unmount();

      expect(patches.observed).toBe(false);
    });
  });

  describe('错误', () => {
    it('patch 流的错误进入 error，并归一化成 Error', () => {
      const { result } = renderHook(() => useEntityChange(entity as never));

      act(() => patches.error('stream failed'));

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('stream failed');
    });

    it('Error 实例原样透传，保留 identity', () => {
      const failure = new TypeError('patch stream failed');
      const { result } = renderHook(() => useEntityChange(entity as never));

      act(() => patches.error(failure));

      expect(result.current.error).toBe(failure);
    });

    it('切换实体后 error 复位', () => {
      const { result, rerender } = renderHook(({ source }) => useEntityChange(source as never), {
        initialProps: { source: entity }
      });
      act(() => patches.error(new Error('boom')));
      expect(result.current.error).toBeDefined();

      rxdbMocks.getEntityStatus.mockReturnValue({ patches$: new Subject<void>().asObservable() });
      rerender({ source: { id: 'todo-3', title: 'fresh' } });

      expect(result.current.error).toBeUndefined();
    });
  });
});
