import type { RxDB, UUID } from '@aiao/rxdb';
import {
  Board,
  BoardLabel,
  BoardSearchSource,
  Column,
  Task,
  type SearchHandle,
  type SearchResult,
  type TaskDraftSnapshot
} from '@aiao/rxdb-plugin-board';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';

import BoardView from '../board-view.vue';
import type { UseBoardReturn } from '../use-board.js';

const bridge = vi.hoisted(() => ({ current: null as UseBoardReturn | null }));
vi.mock('../use-board.js', () => ({ useBoard: () => bridge.current }));

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}` as UUID;
const snapshotOf = (task: Task): TaskDraftSnapshot => ({
  title: task.title,
  description: task.description,
  dueDate: task.dueDate,
  columnId: task.columnId,
  labelIds: []
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('BoardView 交互边界', () => {
  let wrapper: VueWrapper;
  let board: UseBoardReturn;
  let first: Task;
  let second: Task;
  let column: Column;
  let otherColumn: Column;
  let label: BoardLabel;
  const rxdb = { getPlugins: () => [] } as unknown as RxDB;
  const get = (name: string) => wrapper.get(`[data-testid="${name}"]`);
  const click = async (name: string) => {
    await get(name).trigger('click');
    await flushPromises();
  };
  const open = async () => {
    await wrapper.findAll('[data-testid="task-title"]')[0].trigger('click');
    await flushPromises();
  };

  beforeEach(() => {
    const current = { id: id(1), title: '板一' } as Board;
    const another = { id: id(2), title: '板二' } as Board;
    column = { id: id(3), boardId: current.id, title: '待办' } as Column;
    otherColumn = { id: id(4), boardId: current.id, title: '完成' } as Column;
    first = { id: id(5), columnId: column.id, title: '任务一', dueDate: '2000-01-01', description: null } as Task;
    second = { id: id(6), columnId: column.id, title: '任务二', dueDate: '2999-01-01', description: null } as Task;
    label = { id: id(7), boardId: current.id, name: '核心', color: '#e11d48' } as BoardLabel;
    board = {
      searchSource: null,
      boards: ref([current, another]),
      currentBoardId: ref(current.id),
      currentBoard: ref(current),
      columns: ref([column, otherColumn]),
      tasks: ref([first, second]),
      labels: ref([label]),
      taskLabels: ref(new Map([[first.id, [label]]])),
      restoring: ref(false),
      undoCount: ref(1),
      redoCount: ref(1),
      writeEvent: ref(null),
      selectBoard: vi.fn(value => {
        board.currentBoardId.value = value;
      }),
      setRestoring: vi.fn(value => {
        board.restoring.value = value;
      }),
      actions: {
        createBoard: vi.fn(async () => current),
        createColumn: vi.fn(async () => column),
        createTask: vi.fn(async () => first),
        updateBoard: vi.fn(async () => current),
        updateColumn: vi.fn(async () => column),
        updateTaskTitle: vi.fn(async () => first),
        openSnapshot: vi.fn(async (value: UUID) => snapshotOf(value === first.id ? first : second)),
        saveTaskDraft: vi.fn(async () => ({ kind: 'unchanged' as const })),
        planTaskDelete: vi.fn(async (taskId: UUID) => ({
          kind: 'task' as const,
          taskId,
          taskTitle: first.title,
          taskLabelIds: []
        })),
        planColumnDelete: vi.fn(async (columnId: UUID) => ({
          kind: 'column' as const,
          columnId,
          columnTitle: column.title,
          taskIds: [first.id],
          taskLabelIds: []
        })),
        planBoardDelete: vi.fn(async (boardId: UUID) => ({
          kind: 'board' as const,
          boardId,
          boardTitle: current.title,
          taskIds: [first.id],
          taskLabelIds: [],
          columnIds: [column.id],
          boardLabelIds: [label.id]
        })),
        executeDelete: vi.fn(async () => undefined),
        moveTask: vi.fn(async () => undefined),
        moveColumn: vi.fn(async () => undefined),
        sortColumn: vi.fn(async () => ({ written: false })),
        createLabel: vi.fn(async () => label),
        renameLabel: vi.fn(async () => label),
        recolorLabel: vi.fn(async () => label),
        planLabelDelete: vi.fn(async (labelId: UUID) => ({ labelId, labelName: label.name, taskLabelIds: [] })),
        executeLabelDelete: vi.fn(async () => undefined),
        undo: vi.fn(async () => undefined),
        redo: vi.fn(async () => undefined)
      }
    };
    bridge.current = board;
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null as string | null) });
    vi.stubGlobal(
      'prompt',
      vi.fn(() => null)
    );
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 0)
    );
    wrapper = mount(BoardView, { props: { rxdb }, attachTo: document.body });
  });
  afterEach(() => {
    wrapper.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('删除其他列不打断正在加载的详情', async () => {
    const pending = deferred<TaskDraftSnapshot>();
    vi.mocked(board.actions.openSnapshot).mockReturnValueOnce(pending.promise);
    vi.mocked(board.actions.planColumnDelete).mockResolvedValueOnce({
      kind: 'column',
      columnId: otherColumn.id,
      columnTitle: otherColumn.title,
      taskIds: [],
      taskLabelIds: []
    });
    await open();
    await wrapper.findAll('[data-testid="column-delete"]')[1].trigger('click');
    await flushPromises();
    await click('confirm-delete-yes');
    pending.resolve(snapshotOf(first));
    await flushPromises();
    expect(wrapper.find('[data-testid="detail-panel"]').exists()).toBe(true);
  });

  it('删除所属列后不得接受迟到的详情快照', async () => {
    const pending = deferred<TaskDraftSnapshot>();
    vi.mocked(board.actions.openSnapshot).mockReturnValueOnce(pending.promise);
    await open();
    await wrapper.findAll('[data-testid="column-delete"]')[0].trigger('click');
    await flushPromises();
    await click('confirm-delete-yes');
    board.tasks.value = [];
    board.columns.value = [otherColumn];
    pending.resolve(snapshotOf(first));
    await flushPromises();
    expect(wrapper.find('[data-testid="detail-panel"]').exists()).toBe(false);
  });

  it('确认删除包含当前任务的板后关闭已失效的详情', async () => {
    await open();
    await get('detail-description').setValue('待删除草稿');
    await click('delete-board');
    await click('confirm-delete-yes');
    expect(wrapper.find('[data-testid="detail-panel"]').exists()).toBe(false);
  });

  it('取消切板后选择器应显示实际当前板', async () => {
    await open();
    await get('detail-description').setValue('未保存内容');
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await get('board-selector').setValue(id(2));
    expect(board.currentBoardId.value).toBe(id(1));
    expect((get('board-selector').element as HTMLSelectElement).value).toBe(id(1));
  });

  it('创建任务进行中应阻止重复提交', async () => {
    const pending = deferred<Task>();
    vi.mocked(board.actions.createTask).mockReturnValue(pending.promise);
    await wrapper.findAll('[data-testid="add-task"]')[0].trigger('click');
    await get('add-task-input').setValue('只应创建一次');
    await get('add-task-input').trigger('keydown', { key: 'Enter' });
    await get('add-task-input').trigger('keydown', { key: 'Enter' });
    expect(board.actions.createTask).toHaveBeenCalledTimes(1);
    expect((get('add-task-input').element as HTMLInputElement).disabled).toBe(true);
    pending.resolve(first);
    await flushPromises();
    expect(wrapper.find('[data-testid="add-task-form"]').exists()).toBe(false);
  });
  it('取消提示零写，建板建列与重命名只转发确认值', async () => {
    await click('create-board');
    await click('create-column');
    await click('rename-board');
    expect(board.actions.createBoard).not.toHaveBeenCalled();
    vi.mocked(window.prompt).mockReturnValue('新名称');
    await click('create-board');
    await click('create-column');
    await click('rename-board');
    await wrapper.findAll('[data-testid="column-rename"]')[0].trigger('click');
    await flushPromises();
    expect(board.actions.createBoard).toHaveBeenCalledWith({ title: '新名称' });
    expect(board.actions.createColumn).toHaveBeenCalledWith({ title: '新名称' });
    expect(board.actions.updateBoard).toHaveBeenCalledWith(id(1), { title: '新名称' });
    expect(board.actions.updateColumn).toHaveBeenCalledWith(column.id, { title: '新名称' });
  });

  it('任务新增：空内容取消、失败保留草稿、成功关闭', async () => {
    await wrapper.findAll('[data-testid="add-task"]')[0].trigger('click');
    await get('add-task-input').trigger('keydown.enter');
    expect(wrapper.find('[data-testid="add-task-form"]').exists()).toBe(false);
    await wrapper.findAll('[data-testid="add-task"]')[0].trigger('click');
    await get('add-task-input').setValue('新任务');
    vi.mocked(board.actions.createTask).mockRejectedValueOnce(new Error('保存失败'));
    await get('add-task-input').trigger('keydown.enter');
    await flushPromises();
    expect(wrapper.find('[data-testid="add-task-form"]').exists()).toBe(true);
    expect(get('board-notice').text()).toContain('保存失败');
    await click('add-task-submit');
    expect(wrapper.find('[data-testid="add-task-form"]').exists()).toBe(false);
    await wrapper.findAll('[data-testid="add-task"]')[0].trigger('click');
    await click('add-task-cancel');
  });

  it('标题编辑失败保留输入，成功与取消收起', async () => {
    await wrapper.findAll('[data-testid="task-edit-title"]')[0].trigger('click');
    await get('task-title-editor').setValue('新标题');
    vi.mocked(board.actions.updateTaskTitle).mockRejectedValueOnce('标题被拒绝');
    await click('task-title-save');
    expect(wrapper.find('[data-testid="task-title-editor"]').exists()).toBe(true);
    await get('task-title-editor').trigger('keydown.enter');
    await flushPromises();
    expect(wrapper.find('[data-testid="task-title-editor"]').exists()).toBe(false);
    await wrapper.findAll('[data-testid="task-edit-title"]')[0].trigger('click');
    await click('task-title-cancel');
  });

  it('删除板和任务执行初次计划，取消不调用动作', async () => {
    await click('delete-board');
    await click('confirm-delete-no');
    expect(board.actions.executeDelete).not.toHaveBeenCalled();
    await click('delete-board');
    await click('confirm-delete-yes');
    expect(board.actions.planBoardDelete).toHaveBeenCalledTimes(2);
    expect(board.actions.executeDelete).toHaveBeenCalledWith(
      await vi.mocked(board.actions.planBoardDelete).mock.results[1].value
    );
    await open();
    await click('detail-delete');
    await click('confirm-delete-yes');
    expect(board.actions.planTaskDelete).toHaveBeenCalledOnce();
  });

  it('详情修改标签和日期后保存；失败保留所有草稿', async () => {
    await open();
    await get('detail-title').setValue('草稿');
    await get('detail-description').setValue('描述');
    await get('detail-due').setValue('2030-01-02');
    await get('detail-label-check').setValue(true);
    await get('detail-label-check').setValue(false);
    await get('detail-label-check').setValue(true);
    vi.mocked(board.actions.saveTaskDraft).mockRejectedValueOnce(new Error('冲突'));
    await click('detail-save');
    expect(wrapper.find('[data-testid="detail-panel"]').exists()).toBe(true);
    await click('detail-save');
    expect(board.actions.saveTaskDraft).toHaveBeenLastCalledWith(first.id, snapshotOf(first), {
      title: '草稿',
      description: '描述',
      dueDate: '2030-01-02',
      labelIds: [label.id]
    });
    expect(wrapper.find('[data-testid="detail-panel"]').exists()).toBe(false);
  });

  it('重复点击当前任务保留草稿；关闭取消后确认放弃', async () => {
    await open();
    await get('detail-title').setValue('草稿');
    await open();
    expect(board.actions.openSnapshot).toHaveBeenCalledOnce();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await click('detail-cancel');
    expect(wrapper.find('[data-testid="detail-panel"]').exists()).toBe(true);
    await click('detail-cancel');
    expect(wrapper.find('[data-testid="detail-panel"]').exists()).toBe(false);
  });

  it('较早的详情请求迟到不能覆盖最新任务', async () => {
    const old = deferred<TaskDraftSnapshot>();
    vi.mocked(board.actions.openSnapshot).mockReturnValueOnce(old.promise);
    await wrapper.findAll('[data-testid="task-title"]')[0].trigger('click');
    await wrapper.findAll('[data-testid="task-title"]')[1].trigger('click');
    await flushPromises();
    expect((get('detail-title').element as HTMLInputElement).value).toBe(second.title);
    old.resolve(snapshotOf(first));
    await flushPromises();
    expect((get('detail-title').element as HTMLInputElement).value).toBe(second.title);
  });

  it('切板使待完成详情请求失效，取消切板保留草稿', async () => {
    const pending = deferred<TaskDraftSnapshot>();
    vi.mocked(board.actions.openSnapshot).mockReturnValueOnce(pending.promise);
    await wrapper.findAll('[data-testid="task-title"]')[0].trigger('click');
    await get('board-selector').setValue(id(2));
    pending.resolve(snapshotOf(first));
    await flushPromises();
    expect(wrapper.find('[data-testid="detail-panel"]').exists()).toBe(false);
    await open();
    await get('detail-description').setValue('草稿');
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await get('board-selector').setValue(id(1));
    expect(board.selectBoard).toHaveBeenCalledTimes(1);
    await get('board-selector').setValue(id(1));
    expect(board.selectBoard).toHaveBeenCalledTimes(2);
  });

  it('自发移动仅更新列快照，保留原字段以检测真实并发冲突', async () => {
    await open();
    await get('detail-title').setValue('草稿');
    await get('move-column').setValue(otherColumn.id);
    await get('move-position').setValue('0');
    await click('move-task');
    expect(board.actions.moveTask).toHaveBeenCalledWith(first.id, { kind: 'end', columnId: otherColumn.id });
    await click('detail-save');
    expect(board.actions.saveTaskDraft).toHaveBeenCalledWith(
      first.id,
      { ...snapshotOf(first), columnId: otherColumn.id },
      expect.objectContaining({ title: '草稿' })
    );
  });

  it('移动失败提示错误且仍能编辑，原位移动不写', async () => {
    await open();
    await click('move-task');
    expect(board.actions.moveTask).not.toHaveBeenCalled();
    await get('move-position').setValue('1');
    vi.mocked(board.actions.moveTask).mockRejectedValueOnce(new Error('移动失败'));
    await click('move-task');
    expect(get('board-notice').text()).toContain('移动失败');
    expect(wrapper.find('[data-testid="detail-panel"]').exists()).toBe(true);
  });

  it('列前后移边界零写，排序无变化提示，撤销重做转发', async () => {
    await wrapper.findAll('[data-testid="column-move-back"]')[0].trigger('click');
    await wrapper.findAll('[data-testid="column-move-forward"]')[1].trigger('click');
    expect(board.actions.moveColumn).not.toHaveBeenCalled();
    await wrapper.findAll('[data-testid="column-move-forward"]')[0].trigger('click');
    await wrapper.findAll('[data-testid="column-move-back"]')[1].trigger('click');
    await wrapper.findAll('[data-testid="column-sort-due"]')[0].trigger('click');
    await flushPromises();
    expect(get('board-notice').text()).toContain('无变化');
    vi.mocked(board.actions.sortColumn).mockResolvedValueOnce({ written: true });
    await wrapper.findAll('[data-testid="column-sort-title"]')[0].trigger('click');
    await flushPromises();
    await click('undo');
    await click('redo');
    expect(board.actions.undo).toHaveBeenCalledOnce();
    expect(board.actions.redo).toHaveBeenCalledOnce();
  });

  it('标签创建分阶段取消、改名和删除确认均走公开动作', async () => {
    await click('create-label');
    expect(board.actions.createLabel).not.toHaveBeenCalled();
    vi.mocked(window.prompt).mockReturnValueOnce('标签').mockReturnValueOnce(null);
    await click('create-label');
    expect(board.actions.createLabel).not.toHaveBeenCalled();
    vi.mocked(window.prompt).mockReturnValueOnce('标签').mockReturnValueOnce('#123456');
    await click('create-label');
    expect(board.actions.createLabel).toHaveBeenCalledWith({ name: '标签', color: '#123456' });
    await wrapper.get('.label-name').trigger('click');
    await flushPromises();
    expect(board.actions.renameLabel).not.toHaveBeenCalled();
    vi.mocked(window.prompt).mockReturnValueOnce('改名');
    await wrapper.get('.label-name').trigger('click');
    await flushPromises();
    expect(board.actions.renameLabel).toHaveBeenCalledWith(label.id, '改名');
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await wrapper.get('.label-delete').trigger('click');
    await flushPromises();
    expect(board.actions.executeLabelDelete).not.toHaveBeenCalled();
    await wrapper.get('.label-delete').trigger('click');
    await flushPromises();
    expect(board.actions.executeLabelDelete).toHaveBeenCalledOnce();
  });

  it('导出回调可由宿主接线；占位提示可关闭', async () => {
    await click('export-backup');
    expect(get('board-notice').text()).toContain('备份导出');
    await click('board-notice-close');
    expect(wrapper.find('[data-testid="board-notice"]').exists()).toBe(false);
    const callback = vi.fn();
    await wrapper.setProps({ onExportBackup: callback });
    await click('export-backup');
    expect(callback).toHaveBeenCalledOnce();
  });

  it('恢复 storage 事件实时暂停写入口', async () => {
    vi.mocked(localStorage.getItem).mockReturnValue('restoring');
    window.dispatchEvent(new Event('storage'));
    await nextTick();
    expect(get('restoring-badge').text()).toBe('恢复中');
    expect(get('undo').attributes('disabled')).toBeDefined();
  });

  it('搜索句柄覆盖查询更新、分页、各状态、结果定位和切板重建', async () => {
    wrapper.unmount();
    const state$ = new BehaviorSubject<'idle' | 'loading' | 'success' | 'empty' | 'error'>('loading');
    const results$ = new BehaviorSubject<readonly SearchResult[]>([]);
    const hasMore$ = new BehaviorSubject(false);
    const handle: SearchHandle = {
      state$,
      results$,
      hasMore$,
      error$: new BehaviorSubject(undefined),
      setQuery: vi.fn(),
      loadMore: vi.fn(async () => undefined),
      clear: vi.fn(),
      retry: vi.fn(),
      destroy: vi.fn()
    };
    const source = { search: vi.fn(() => handle) } as unknown as BoardSearchSource;
    bridge.current = { ...board, searchSource: source };
    wrapper = mount(BoardView, { props: { rxdb }, attachTo: document.body });
    await get('board-search-input').setValue('任务');
    expect(get('board-search-loading').text()).toContain('搜索中');
    state$.next('error');
    await nextTick();
    expect(wrapper.find('[data-testid="board-search-error"]').exists()).toBe(true);
    state$.next('empty');
    await nextTick();
    expect(get('board-search-empty').text()).toBe('无匹配');
    state$.next('success');
    results$.next([
      { entity: 'Task', collection: 'task', id: first.id, rank: 1, matchedField: 'title', snippet: '片段' }
    ]);
    hasMore$.next(true);
    await nextTick();
    expect(get('board-search-result').text()).toContain('待办');
    const scroll = vi.fn();
    Object.defineProperty(wrapper.findAll('[data-testid="task-card"]')[0].element, 'scrollIntoView', { value: scroll });
    await click('board-search-result');
    await click('board-search-result');
    expect(scroll).toHaveBeenCalled();
    expect(wrapper.findAll('[data-testid="task-card"]')[0].classes()).toContain('search-hit');
    await click('board-search-more');
    expect(handle.loadMore).toHaveBeenCalledOnce();
    await get('board-search-input').setValue('更新');
    expect(handle.setQuery).toHaveBeenCalledWith('更新');
    await get('board-selector').setValue(id(2));
    expect(source.search).toHaveBeenCalledTimes(2);
    await get('board-search-input').setValue(' ');
    expect(handle.destroy).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="board-search-results"]').exists()).toBe(false);
  });

  it('任务拖拽展示空列落点并调用领域移动，越界和缺少载荷不写', async () => {
    const columns = wrapper.findAll('[data-testid="column"]');
    const cards = wrapper.findAll('[data-testid="task-card"]');
    columns.forEach((element, index) => {
      vi.spyOn(element.element, 'getBoundingClientRect').mockReturnValue({
        left: index * 200,
        right: index * 200 + 180,
        top: 0,
        bottom: 300
      } as DOMRect);
    });
    cards.forEach((element, index) => {
      vi.spyOn(element.element, 'getBoundingClientRect').mockReturnValue({
        top: 50 + index * 60,
        bottom: 100 + index * 60
      } as DOMRect);
    });
    await open();
    await get('detail-title').setValue('拖拽后的草稿');
    const values = new Map<string, string>();
    const dataTransfer = {
      setData: (key: string, value: string) => values.set(key, value),
      getData: (key: string) => values.get(key) ?? ''
    };
    await columns[0].trigger('dragover', { clientX: 210, clientY: 50 });
    await cards[0].trigger('dragstart', { dataTransfer });
    expect(cards[0].classes()).toContain('dragging');
    await columns[1].trigger('dragover', { clientX: 210, clientY: 50 });
    expect(columns[1].classes()).toContain('drop-end');
    await columns[1].trigger('drop', { dataTransfer, clientX: 210, clientY: 50 });
    await flushPromises();
    expect(board.actions.moveTask).toHaveBeenCalledWith(first.id, { kind: 'end', columnId: otherColumn.id });
    await click('detail-save');
    expect(board.actions.saveTaskDraft).toHaveBeenCalledWith(
      first.id,
      { ...snapshotOf(first), columnId: otherColumn.id },
      expect.objectContaining({ title: '拖拽后的草稿' })
    );
    await cards[0].trigger('dragstart', { dataTransfer });
    await columns[0].trigger('dragover', { clientX: -1, clientY: -1 });
    await columns[0].trigger('drop', { dataTransfer, clientX: -1, clientY: -1 });
    await flushPromises();
    expect(board.actions.moveTask).toHaveBeenCalledTimes(1);
    await columns[0].trigger('drop', { dataTransfer: { getData: () => '' } });
    await get('board-view').trigger('dragend');
  });

  it('任务插入反馈对应前后邻居，列拖拽展示插入线', async () => {
    const thirdColumn = { id: id(9), boardId: id(1), title: '第三列' } as Column;
    board.columns.value = [column, otherColumn, thirdColumn];
    board.tasks.value = [first, second, { id: id(10), columnId: otherColumn.id, title: '目标任务' } as Task];
    await nextTick();
    const columns = wrapper.findAll('[data-testid="column"]');
    const headers = wrapper.findAll('[data-testid="column-header"]');
    const cards = wrapper.findAll('[data-testid="task-card"]');
    [...columns, ...headers].forEach((element, index) => {
      const position = index % 3;
      vi.spyOn(element.element, 'getBoundingClientRect').mockReturnValue({
        left: position * 200,
        right: position * 200 + 180,
        top: 0,
        bottom: 300
      } as DOMRect);
    });
    cards.forEach((element, index) =>
      vi.spyOn(element.element, 'getBoundingClientRect').mockReturnValue({
        top: index === 2 ? 50 : 50 + index * 60,
        bottom: index === 2 ? 100 : 100 + index * 60
      } as DOMRect)
    );
    const values = new Map<string, string>();
    const dataTransfer = {
      setData: (key: string, value: string) => values.set(key, value),
      getData: (key: string) => values.get(key) ?? ''
    };
    await cards[0].trigger('dragstart', { dataTransfer });
    await columns[1].trigger('dragover', { clientX: 210, clientY: 55 });
    expect(cards[2].classes()).toContain('drop-before');
    await columns[1].trigger('dragover', { clientX: 210, clientY: 90 });
    expect(cards[2].classes()).toContain('drop-after');
    await get('board-view').trigger('dragend');
    await headers[0].trigger('dragstart', { dataTransfer });
    await headers[2].trigger('dragover', { clientX: 550 });
    expect(headers[2].classes()).toContain('drop-after');
    await get('board-view').trigger('drop', { dataTransfer, clientX: 550 });
    await flushPromises();
    expect(board.actions.moveColumn).toHaveBeenCalledWith(column.id, { prevId: thirdColumn.id, nextId: null });
    await headers[2].trigger('dragstart', { dataTransfer });
    await headers[0].trigger('dragover', { clientX: 1 });
    expect(headers[0].classes()).toContain('drop-before');
    await headers[0].trigger('dragover', { clientX: -1 });
    await get('board-view').trigger('drop', { dataTransfer, clientX: -1 });
    await flushPromises();
    await get('board-view').trigger('dragend');
  });

  it('清空搜索后忽略已销毁句柄的迟到事件', async () => {
    wrapper.unmount();
    const state$ = new BehaviorSubject<'idle' | 'loading' | 'success' | 'empty' | 'error'>('loading');
    const results$ = new BehaviorSubject<readonly SearchResult[]>([]);
    const handle: SearchHandle = {
      state$,
      results$,
      hasMore$: new BehaviorSubject(false),
      error$: new BehaviorSubject(undefined),
      setQuery: vi.fn(),
      loadMore: vi.fn(async () => undefined),
      clear: vi.fn(),
      retry: vi.fn(),
      destroy: vi.fn()
    };
    bridge.current = { ...board, searchSource: { search: () => handle } as unknown as BoardSearchSource };
    wrapper = mount(BoardView, { props: { rxdb }, attachTo: document.body });
    await get('board-search-input').setValue('任务');
    await get('board-search-input').setValue('');
    state$.next('error');
    results$.next([
      { entity: 'Task', collection: 'task', id: first.id, rank: 1, matchedField: 'title', snippet: '迟到' }
    ]);
    expect(state$.observed).toBe(false);
    expect(results$.observed).toBe(false);
  });

  it('旧任务保存迟到不能关闭后来打开的任务详情', async () => {
    const pending = deferred<Awaited<ReturnType<UseBoardReturn['actions']['saveTaskDraft']>>>();
    await open();
    await get('detail-title').setValue('草稿');
    vi.mocked(board.actions.saveTaskDraft).mockReturnValueOnce(pending.promise);
    await get('detail-save').trigger('click');
    await wrapper.findAll('[data-testid="task-title"]')[1].trigger('click');
    await flushPromises();
    pending.resolve({ kind: 'unchanged' });
    await flushPromises();
    expect((get('detail-title').element as HTMLInputElement).value).toBe(second.title);
  });

  it('重新选择当前任务使另一个任务的迟到快照失效', async () => {
    await open();
    const pending = deferred<TaskDraftSnapshot>();
    vi.mocked(board.actions.openSnapshot).mockReturnValueOnce(pending.promise);
    await wrapper.findAll('[data-testid="task-title"]')[1].trigger('click');
    await wrapper.findAll('[data-testid="task-title"]')[0].trigger('click');
    pending.resolve(snapshotOf(second));
    await flushPromises();
    expect((get('detail-title').element as HTMLInputElement).value).toBe(first.title);
  });

  it('保存期间禁用草稿及移动控件，阻止请求发出后继续输入', async () => {
    await open();
    await get('detail-title').setValue('已提交的草稿');
    const pending = deferred<Awaited<ReturnType<UseBoardReturn['actions']['saveTaskDraft']>>>();
    vi.mocked(board.actions.saveTaskDraft).mockReturnValueOnce(pending.promise);
    await get('detail-save').trigger('click');
    for (const control of [
      'detail-title',
      'detail-description',
      'detail-due',
      'detail-label-check',
      'move-column',
      'move-position',
      'move-task'
    ]) {
      expect(get(control).attributes('disabled'), control).toBeDefined();
    }
    expect(get('detail-cancel').attributes('disabled')).toBeUndefined();
    expect(get('board-selector').attributes('disabled')).toBeUndefined();
    pending.resolve({ kind: 'unchanged' });
    await flushPromises();
    expect(wrapper.find('[data-testid="detail-panel"]').exists()).toBe(false);
  });
});
