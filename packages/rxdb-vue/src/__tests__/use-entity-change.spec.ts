/**
 * `useEntityChange` —— Vue 侧（RVU-010）。
 *
 * @remarks
 * 与 `packages/rxdb-angular/src/__tests__/rxdb-change-detector.directive.spec.ts` 逐条对齐：
 * Angular 那边断言的是 `markForCheck` 被调用，Vue 这边断言的是**模板真的重渲染** ——
 * 两者是同一件事在各自框架里的可观测形式。时间窗的判定（`0` / 负值 / `NaN` / `Infinity`
 * 一律禁用，两者串联顺序为 debounce → audit）由 `@aiao/utils` 的 `withTimeWindows` 保证。
 */
import { mount } from '@vue/test-utils';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue';
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
    vi.useFakeTimers();
    patches = new Subject<void>();
    entity = { id: 'todo-1', title: 'first' };
    rxdbMocks.getEntityStatus.mockReset();
    rxdbMocks.getEntityStatus.mockReturnValue({ patches$: patches.asObservable() });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** 渲染实体标题的宿主组件；`text()` 就是「视图有没有跟上」的可观测量。 */
  const mountHost = (
    source: Parameters<typeof useEntityChange>[0],
    options?: Parameters<typeof useEntityChange>[1]
  ) => {
    const Host = defineComponent({
      setup() {
        const change = useEntityChange(source as never, options);
        return () => h('span', (change.value.value as MockEntity | undefined)?.title ?? 'none');
      }
    });
    return mount(Host);
  };

  it('订阅当前实体的 patch 流', () => {
    const wrapper = mountHost(entity);

    expect(rxdbMocks.getEntityStatus).toHaveBeenCalledWith(entity);
    expect(patches.observed).toBe(true);
    wrapper.unmount();
  });

  // 核心：实体是原地可变的类实例，引用不变，普通 ref/computed 会判定「没变化」
  it('patch 到达后模板读到原地修改的新字段', async () => {
    const wrapper = mountHost(entity);
    expect(wrapper.text()).toBe('first');

    entity.title = 'second';
    patches.next();
    await nextTick();

    expect(wrapper.text()).toBe('second');
    wrapper.unmount();
  });

  it('没有 patch 时原地修改不会重渲染（证明重渲染确实来自 patch 流）', async () => {
    const wrapper = mountHost(entity);

    entity.title = 'silent';
    await nextTick();

    expect(wrapper.text()).toBe('first');
    wrapper.unmount();
  });

  it('revision 按 patch 次数递增', async () => {
    const change = useEntityChange(entity as never);
    expect(change.revision.value).toBe(0);

    patches.next();
    patches.next();
    await nextTick();

    expect(change.revision.value).toBe(2);
  });

  it('value 就是入参那个实例，不是副本', () => {
    expect(useEntityChange(entity as never).value.value).toBe(entity);
  });

  describe('时间窗', () => {
    it('默认配置下 patch 同步透传', () => {
      const change = useEntityChange(entity as never);

      patches.next();

      // 不 await、不推进定时器：默认路径不得挂任何 asyncScheduler
      expect(change.revision.value).toBe(1);
    });

    it('debounceTime 生效', async () => {
      const change = useEntityChange(entity as never, { debounceTime: 100 });

      patches.next();
      patches.next();
      await vi.advanceTimersByTimeAsync(99);
      expect(change.revision.value).toBe(0);

      await vi.advanceTimersByTimeAsync(1);
      expect(change.revision.value).toBe(1);
    });

    it('auditTime 生效', async () => {
      const change = useEntityChange(entity as never, { auditTime: 50 });

      patches.next();
      await vi.advanceTimersByTimeAsync(49);
      expect(change.revision.value).toBe(0);

      await vi.advanceTimersByTimeAsync(1);
      expect(change.revision.value).toBe(1);
    });

    it('两者同时为正值时串联，顺序为 debounceTime → auditTime', async () => {
      const change = useEntityChange(entity as never, { debounceTime: 100, auditTime: 50 });

      patches.next();
      await vi.advanceTimersByTimeAsync(100);
      expect(change.revision.value).toBe(0);

      await vi.advanceTimersByTimeAsync(50);
      expect(change.revision.value).toBe(1);
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
      const change = useEntityChange(entity as never, options);

      patches.next();

      expect(change.revision.value).toBe(1);
    });

    it('时间窗是响应式的：改成正值后立即改按窗口放行', async () => {
      const debounce = ref(0);
      const change = useEntityChange(entity as never, { debounceTime: debounce });

      debounce.value = 100;
      await nextTick();
      patches.next();
      expect(change.revision.value).toBe(0);

      await vi.advanceTimersByTimeAsync(100);
      expect(change.revision.value).toBe(1);
    });
  });

  describe('实体切换与清理', () => {
    it('实体换成 undefined 时退订', async () => {
      const source = shallowRef<MockEntity | undefined>(entity);
      useEntityChange(source as never);

      source.value = undefined;
      await nextTick();

      expect(patches.observed).toBe(false);
    });

    it('实体为 undefined 时不建立订阅', () => {
      useEntityChange(shallowRef<MockEntity | undefined>(undefined) as never);

      expect(rxdbMocks.getEntityStatus).not.toHaveBeenCalled();
      expect(patches.observed).toBe(false);
    });

    it('换实体时先退订旧的再订阅新的', async () => {
      const otherPatches = new Subject<void>();
      const other: MockEntity = { id: 'todo-2', title: 'other' };
      const source = shallowRef<MockEntity>(entity);
      const change = useEntityChange(source as never);

      rxdbMocks.getEntityStatus.mockReturnValue({ patches$: otherPatches.asObservable() });
      source.value = other;
      await nextTick();

      expect(patches.observed).toBe(false);
      expect(change.value.value).toBe(other);

      otherPatches.next();
      expect(change.revision.value).toBe(1);
    });

    it('组件卸载时退订', () => {
      const wrapper = mountHost(entity);
      expect(patches.observed).toBe(true);

      wrapper.unmount();

      expect(patches.observed).toBe(false);
    });
  });

  describe('错误', () => {
    it('patch 流的错误进入 error，并归一化成 Error', () => {
      const change = useEntityChange(entity as never);

      patches.error('stream failed');

      expect(change.error.value).toBeInstanceOf(Error);
      expect(change.error.value?.message).toBe('stream failed');
    });

    it('Error 实例原样透传，保留 identity', () => {
      const failure = new TypeError('patch stream failed');
      const change = useEntityChange(entity as never);

      patches.error(failure);

      expect(change.error.value).toBe(failure);
    });

    it('切换实体后 error 复位', async () => {
      const source = shallowRef<MockEntity>(entity);
      const change = useEntityChange(source as never);
      patches.error(new Error('boom'));
      expect(change.error.value).toBeDefined();

      rxdbMocks.getEntityStatus.mockReturnValue({ patches$: new Subject<void>().asObservable() });
      source.value = { id: 'todo-3', title: 'fresh' };
      await nextTick();

      expect(change.error.value).toBeUndefined();
    });
  });
});
