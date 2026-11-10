import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * @fileoverview Todo 页批量添加的 pending 生命周期（与 React 的 try / finally、Angular `useAction` 同口径）：
 * 写入失败也要复位，否则同一档批量按钮一直禁用、转圈，底层恢复后也没法重试。
 */

const mocks = vi.hoisted(() => ({ saveMany: vi.fn() }));

vi.mock('@aiao/rxdb-vue', () => ({
  injectRxDB: () => ({
    entityManager: { saveMany: mocks.saveMany, removeMany: vi.fn(), getRepository: vi.fn() },
    versionManager: {
      history: () => ({
        histories$: of([]),
        redo: vi.fn(),
        redoCount$: of(0),
        type: 'repository',
        undo: vi.fn(),
        undoCount$: of(0)
      })
    }
  }),
  useFindAll: () => ({ value: [], isLoading: false, error: undefined, isEmpty: true, hasValue: true })
}));

vi.mock('@aiao/rxdb-test/entities', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb-test/entities')>()),
  Task: class {
    completed = false;
    title = '';
  }
}));

import TodoPage from './TodoPage.vue';

type TodoPageVm = { addManyTodo(total: number): Promise<void> };

const wrappers: VueWrapper[] = [];

function renderTodoPage() {
  const wrapper = mount(TodoPage, { global: { stubs: { HistorySidebar: true, SyncRejectionsPanel: true } } });
  wrappers.push(wrapper);
  const batchOption = () => wrapper.get<HTMLButtonElement>('[data-testid="todo-batch-option-100"]');
  return { batchOption, vm: wrapper.vm as unknown as TodoPageVm, wrapper };
}

beforeEach(() => {
  mocks.saveMany.mockReset();
  vi.spyOn(console, 'time').mockImplementation(() => undefined);
  vi.spyOn(console, 'timeEnd').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
});

describe('TodoPage：批量添加', () => {
  it('写入失败后复位 pending，同一档批量按钮可以重试', async () => {
    let rejectSave!: (error: Error) => void;
    mocks.saveMany.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => (rejectSave = reject)));
    const { batchOption, vm } = renderTodoPage();

    // 按钮点击调用的就是 addManyTodo(100)；这里直接调它，好接住原样冒泡的错误
    const failure = vm.addManyTodo(100).then(
      () => null,
      (error: unknown) => error
    );
    await flushPromises();
    expect(batchOption().element.disabled).toBe(true);
    rejectSave(new Error('quota exceeded'));
    expect(await failure).toEqual(new Error('quota exceeded'));
    await flushPromises();

    expect(batchOption().element.disabled).toBe(false);
    mocks.saveMany.mockResolvedValueOnce(undefined);
    await batchOption().trigger('click');
    await flushPromises();
    expect(mocks.saveMany).toHaveBeenCalledTimes(2);
    expect(mocks.saveMany.mock.calls[1]?.[0]).toHaveLength(100);
    expect(batchOption().element.disabled).toBe(false);
  });
});
