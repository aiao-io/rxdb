import type { RxDB, UUID } from '@aiao/rxdb';
import {
  BOARD_LABEL_COLORS,
  DIALOG_FOCUSABLE_SELECTOR,
  localDateKey,
  RESTORING_MARKER_KEY,
  type Board,
  type BoardLabel,
  type BoardSearchSource,
  type Column,
  type SearchHandle,
  type SearchResult,
  type Task,
  type TaskDraftSnapshot
} from '@aiao/rxdb-plugin-board';
import { SearchExecutionError } from '@aiao/rxdb-plugin-search';
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  type RenderResult
} from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardView } from '../board-view.js';
import type { UseBoardActions, UseBoardReturn } from '../use-board.js';
import {
  allByTestId,
  byTestId,
  cardById,
  cardByTitle,
  columnByTitle,
  deferred,
  dragAt,
  focus,
  inputValue,
  isDisabled,
  memoryStorage,
  rectOf,
  texts,
  titlesIn,
  typeInto,
  within,
  withinAll
} from './board-test-utils.js';

let state: UseBoardReturn;
vi.mock('../use-board.js', () => ({ useBoard: () => state }));

const id = (value: string) => value as UUID;
const boardId = id('board');
const makeColumn = (value: string) => ({ id: id(value), boardId, title: value }) as Column;
const makeTask = (value: string, columnId: UUID, extra: Partial<Task> = {}) =>
  ({ id: id(value), columnId, title: value, dueDate: null, description: null, ...extra }) as Task;
const firstColumn = makeColumn('first');
const secondColumn = makeColumn('second');
const emptyColumn = makeColumn('empty');
const first = makeTask('A', firstColumn.id);
const second = makeTask('B', firstColumn.id, { dueDate: '2000-01-01' });
const third = makeTask('C', secondColumn.id, { dueDate: localDateKey(new Date()) });
const label = { id: id('label'), name: '标签', color: '#ffffff', boardId } as BoardLabel;
const other = { id: id('other-label'), name: '文档', color: '#2563eb', boardId } as BoardLabel;
const current = { id: boardId, title: '板', description: null } as Board;
const next = { id: id('next'), title: '下一块', description: null } as Board;
const result = { id: first.id, collection: 'Task', rank: 1, snippet: '匹配' } as SearchResult;
const rxdb = { getPlugins: () => [] } as unknown as RxDB;

/** 按当前桩数据生成快照（任务 / 列 / 标签关联）。 */
const snapshotOf = (taskId: UUID): TaskDraftSnapshot => {
  const task = state.tasks.find(item => item.id === taskId)!;
  return {
    title: task.title,
    columnId: task.columnId,
    description: task.description ?? null,
    dueDate: task.dueDate ?? null,
    labelIds: (state.taskLabels.get(taskId) ?? []).map(item => item.id)
  };
};

const createActions = (): UseBoardActions => ({
  createBoard: vi.fn(async () => current),
  createColumn: vi.fn(async () => firstColumn),
  createTask: vi.fn(async () => first),
  updateBoard: vi.fn(async () => current),
  updateColumn: vi.fn(async () => firstColumn),
  updateTaskTitle: vi.fn(async () => first),
  openSnapshot: vi.fn(async (taskId: UUID) => snapshotOf(taskId)),
  saveTaskDraft: vi.fn(async () => ({ kind: 'unchanged' as const })),
  saveTaskFields: vi.fn(async () => ({ kind: 'saved' as const, task: first })),
  planTaskDelete: vi.fn(async (taskId: UUID) => ({
    kind: 'task' as const,
    taskId,
    taskTitle: state.tasks.find(task => task.id === taskId)?.title ?? '',
    taskLabelIds: []
  })),
  planColumnDelete: vi.fn(async (columnId: UUID) => ({
    kind: 'column' as const,
    columnId,
    columnTitle: columnId,
    taskIds: state.tasks.filter(task => task.columnId === columnId).map(task => task.id),
    taskLabelIds: []
  })),
  planBoardDelete: vi.fn(async () => ({
    kind: 'board' as const,
    boardId,
    boardTitle: current.title,
    columnIds: [firstColumn.id, secondColumn.id, emptyColumn.id],
    taskIds: [first.id, second.id, third.id],
    taskLabelIds: [id('link')],
    boardLabelIds: [label.id, other.id]
  })),
  executeDelete: vi.fn(async () => undefined),
  moveTask: vi.fn(async () => undefined),
  moveColumn: vi.fn(async () => undefined),
  sortColumn: vi.fn(async () => ({ written: true })),
  createLabel: vi.fn(async (input: { name: string; color: string }) => ({ ...other, id: id('new-label'), ...input })),
  renameLabel: vi.fn(async () => label),
  recolorLabel: vi.fn(async () => label),
  planLabelDelete: vi.fn(async () => ({ labelId: label.id, labelName: label.name, taskLabelIds: [id('link')] })),
  executeLabelDelete: vi.fn(async () => undefined),
  undo: vi.fn(async () => undefined),
  redo: vi.fn(async () => undefined)
});

const flush = () =>
  act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });

describe('React 看板交互边界（看板 v2）', () => {
  let actions: UseBoardActions;
  let view: RenderResult;
  let exportBackup: (() => Promise<void>) | undefined;

  const mount = (): void => {
    view = render(<BoardView rxdb={rxdb} onExportBackup={exportBackup} />);
  };
  const update = (patch: Partial<UseBoardReturn>): void => {
    state = { ...state, ...patch };
    view.rerender(<BoardView rxdb={rxdb} onExportBackup={exportBackup} />);
  };
  const openDetailOf = async (title: string): Promise<void> => {
    fireEvent.click(within(cardByTitle(title), 'task-title'));
    await waitFor(() => expect(inputValue('detail-title')).toBe(title));
  };
  const openColumnMenu = (title: string): void => {
    fireEvent.click(within(columnByTitle(title), 'column-menu-trigger'));
  };
  const openTaskMenu = (title: string): void => {
    fireEvent.click(within(cardByTitle(title), 'task-menu-trigger'));
  };
  const option = (text: string): HTMLElement =>
    allByTestId('picker-option').find(element => element.textContent?.includes(text))!;

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return rectOf(this);
    });
    exportBackup = undefined;
    actions = createActions();
    state = {
      boards: [current, next],
      currentBoardId: boardId,
      currentBoard: current,
      columns: [firstColumn, secondColumn, emptyColumn],
      tasks: [first, second, third],
      labels: [label, other],
      taskLabels: new Map([[first.id, [label]]]),
      restoring: false,
      undoCount: 1,
      redoCount: 1,
      writeEvent: null,
      searchSource: null,
      searchUnavailableReason: null,
      loading: false,
      readError: null,
      retryReads: vi.fn(),
      selectBoard: vi.fn(),
      setRestoring: vi.fn(),
      actions
    };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('详情侧栏（即改即存）', () => {
    it('字段提交只发补丁、成功后以最新快照为基线，未改动零调用', async () => {
      mount();
      await openDetailOf('A');
      expect(byTestId('detail-panel').getAttribute('aria-label')).toBe('任务详情：A');
      expect(byTestId('board-view').className).toBe('rxb has-overlay');
      expect(cardByTitle('A').className).toContain('is-selected');
      fireEvent.blur(byTestId('detail-title'));
      await flush();
      expect(actions.saveTaskFields).not.toHaveBeenCalled();

      vi.mocked(actions.openSnapshot).mockResolvedValueOnce({ ...snapshotOf(first.id), title: '新标题' });
      typeInto(byTestId('detail-title'), ' 新标题 ', 'Enter');
      await waitFor(() => expect(texts('detail-status')).toEqual(['已保存']));
      expect(actions.saveTaskFields).toHaveBeenCalledWith(first.id, snapshotOf(first.id), { title: ' 新标题 ' });
      expect(inputValue('detail-title')).toBe('新标题');
      expect(isDisabled(byTestId('detail-undo'))).toBe(false);

      fireEvent.change(byTestId('detail-due'), { target: { value: '2026-12-01' } });
      await waitFor(() =>
        expect(actions.saveTaskFields).toHaveBeenLastCalledWith(first.id, expect.anything(), { dueDate: '2026-12-01' })
      );
      typeInto(byTestId('detail-description'), '描述');
      fireEvent.blur(byTestId('detail-description'));
      await waitFor(() =>
        expect(actions.saveTaskFields).toHaveBeenLastCalledWith(first.id, expect.anything(), { description: '描述' })
      );
      typeInto(byTestId('detail-description'), '快捷键保存', 'Enter', { metaKey: true });
      await waitFor(() =>
        expect(actions.saveTaskFields).toHaveBeenLastCalledWith(first.id, expect.anything(), {
          description: '快捷键保存'
        })
      );
    });

    it('回车后紧跟失焦：提交串行，第二次读到新基线而零调用', async () => {
      mount();
      await openDetailOf('A');
      vi.mocked(actions.openSnapshot).mockResolvedValue({ ...snapshotOf(first.id), title: '改' });
      typeInto(byTestId('detail-title'), '改', 'Enter');
      fireEvent.blur(byTestId('detail-title'));
      await waitFor(() => expect(texts('detail-status')).toEqual(['已保存']));
      await flush();
      expect(actions.saveTaskFields).toHaveBeenCalledOnce();
    });

    it('保存失败保留草稿并提示（空标题等由领域拒绝）', async () => {
      mount();
      await openDetailOf('A');
      vi.mocked(actions.saveTaskFields).mockRejectedValueOnce(new Error('标题不能为空'));
      typeInto(byTestId('detail-title'), '   ', 'Enter');
      await waitFor(() => expect(texts('board-notice')).toEqual(['标题不能为空']));
      expect(inputValue('detail-title')).toBe('   ');
      expect(screen.queryByTestId('detail-status')).toBeNull();
      // 关提示不抢焦点：按下不改焦点，编辑中的字段不会失焦重提交
      const mousedown = createEvent.mouseDown(byTestId('board-notice-close'));
      fireEvent(byTestId('board-notice-close'), mousedown);
      expect(mousedown.defaultPrevented).toBe(true);
      fireEvent.click(byTestId('board-notice-close'));
      expect(screen.queryByTestId('board-notice')).toBeNull();
    });

    it('Esc 还原标题与描述，不提交也不关闭侧栏', async () => {
      mount();
      await openDetailOf('A');
      typeInto(byTestId('detail-title'), '草稿', 'Escape');
      expect(inputValue('detail-title')).toBe('A');
      typeInto(byTestId('detail-description'), '草稿', 'Escape');
      expect(inputValue('detail-description')).toBe('');
      fireEvent.keyDown(byTestId('detail-description'), { key: 'x' });
      expect(byTestId('detail-panel')).toBeTruthy();
      await flush();
      expect(actions.saveTaskFields).not.toHaveBeenCalled();
    });

    it('迟到的详情快照：较新选择优先；所属列被删后不再打开', async () => {
      mount();
      const stale = deferred<TaskDraftSnapshot>();
      vi.mocked(actions.openSnapshot).mockReturnValueOnce(stale.promise);
      fireEvent.click(within(cardByTitle('A'), 'task-title'));
      await openDetailOf('C');
      await act(async () => stale.resolve(snapshotOf(first.id)));
      expect(inputValue('detail-title')).toBe('C');

      fireEvent.click(byTestId('detail-close'));
      expect(screen.queryByTestId('detail-panel')).toBeNull();
      const late = deferred<TaskDraftSnapshot>();
      vi.mocked(actions.openSnapshot).mockReturnValueOnce(late.promise);
      fireEvent.click(within(cardByTitle('A'), 'task-title'));
      openColumnMenu('first');
      fireEvent.click(byTestId('column-delete'));
      fireEvent.click(await screen.findByTestId('confirm-delete-yes'));
      await waitFor(() => expect(actions.executeDelete).toHaveBeenCalledOnce());
      await act(async () => late.resolve(snapshotOf(first.id)));
      await flush();
      expect(screen.queryByTestId('detail-panel')).toBeNull();
    });

    it('删除整板关闭已失效的详情并给出可撤销提示', async () => {
      mount();
      await openDetailOf('A');
      fireEvent.click(byTestId('board-menu-trigger'));
      expect(byTestId('popover').getAttribute('aria-label')).toBe('看板操作');
      fireEvent.click(byTestId('delete-board'));
      const confirm = await screen.findByTestId('confirm-delete');
      expect(confirm.textContent).toContain('3 列、3 个任务、2 个标签定义、1 条任务标签关联会一并删除。');
      fireEvent.click(byTestId('confirm-delete-yes'));
      await waitFor(() => expect(screen.queryByTestId('detail-panel')).toBeNull());
      expect(texts('board-toast')[0]).toContain('已删除看板「板」');
      expect(screen.getByTestId('board-toast-undo')).toBeTruthy();
    });

    it('标签选择器：多选只改草稿，关闭时一次提交；就地创建的标签自动选中', async () => {
      mount();
      await openDetailOf('A');
      expect(texts('detail-label')).toEqual(['标签']);
      fireEvent.click(byTestId('detail-labels'));
      const popover = byTestId('popover');
      expect(popover.getAttribute('role')).toBe('dialog');
      expect(popover.getAttribute('aria-label')).toBe('选择标签');
      expect(screen.getByRole('listbox').getAttribute('aria-label')).toBe('选择标签');
      expect(option('标签').getAttribute('aria-selected')).toBe('true');
      fireEvent.click(option('文档'));
      expect(option('文档').getAttribute('aria-selected')).toBe('true');
      await flush();
      expect(actions.saveTaskFields).not.toHaveBeenCalled();
      typeInto(byTestId('picker-filter'), '标签');
      expect(screen.queryByTestId('picker-create')).toBeNull();
      typeInto(byTestId('picker-filter'), '新标签');
      expect(texts('picker-create')).toEqual(['创建标签「新标签」']);
      // listbox 只容 option：无匹配时不渲染 listbox，空态段落在其外
      expect(screen.getByText('没有匹配的选项')).toBeTruthy();
      expect(screen.queryByRole('listbox')).toBeNull();
      fireEvent.click(byTestId('picker-create'));
      await waitFor(() => expect(inputValue('picker-filter')).toBe(''));
      expect(actions.createLabel).toHaveBeenCalledWith({ name: '新标签', color: expect.stringMatching(/^#/) });
      fireEvent.keyDown(byTestId('picker-filter'), { key: 'Escape' });
      expect(screen.queryByTestId('popover')).toBeNull();
      await waitFor(() =>
        expect(actions.saveTaskFields).toHaveBeenCalledWith(first.id, expect.anything(), {
          labelIds: [label.id, other.id, id('new-label')]
        })
      );
    });

    it('标签选择器未改动关闭零调用；所在列选择器移到列尾且焦点留在侧栏', async () => {
      mount();
      await openDetailOf('A');
      fireEvent.click(byTestId('detail-labels'));
      fireEvent.keyDown(byTestId('picker-filter'), { key: 'Escape' });
      await flush();
      expect(actions.saveTaskFields).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(byTestId('detail-labels'));

      fireEvent.click(byTestId('detail-column'));
      expect(byTestId('popover').getAttribute('aria-label')).toBe('移到列');
      expect(byTestId('detail-column').getAttribute('aria-expanded')).toBe('true');
      fireEvent.click(option('second'));
      await waitFor(() =>
        expect(actions.moveTask).toHaveBeenCalledWith(first.id, {
          kind: 'between',
          columnId: secondColumn.id,
          prevId: third.id,
          nextId: null
        })
      );
      await waitFor(() => expect(byTestId('detail-column').textContent).toContain('second'));
      expect(texts('board-toast')[0]).toContain('已移动到「second」');
      expect(document.activeElement).toBe(byTestId('detail-column'));
    });

    it('选择器打开时再点同一字段按钮即关闭：标签照常提交一次，所在列零写', async () => {
      mount();
      await openDetailOf('A');
      fireEvent.click(byTestId('detail-labels'));
      fireEvent.click(option('文档'));
      fireEvent.pointerDown(byTestId('detail-labels'));
      fireEvent.click(byTestId('detail-labels'));
      expect(screen.queryByTestId('popover')).toBeNull();
      expect(document.activeElement).toBe(byTestId('detail-labels'));
      await waitFor(() =>
        expect(actions.saveTaskFields).toHaveBeenCalledWith(first.id, expect.anything(), {
          labelIds: [label.id, other.id]
        })
      );
      expect(actions.saveTaskFields).toHaveBeenCalledOnce();

      fireEvent.click(byTestId('detail-column'));
      expect(byTestId('popover').getAttribute('aria-label')).toBe('移到列');
      fireEvent.click(byTestId('detail-column'));
      expect(screen.queryByTestId('popover')).toBeNull();
      await flush();
      expect(actions.moveTask).not.toHaveBeenCalled();
    });

    it('保存途中切换任务：迟到结果不改新任务的基线；读回失败不停在「保存中」', async () => {
      mount();
      await openDetailOf('A');
      const saving = deferred<{ kind: 'saved'; task: Task }>();
      vi.mocked(actions.saveTaskFields).mockReturnValueOnce(saving.promise);
      typeInto(byTestId('detail-title'), '改', 'Enter');
      await openDetailOf('C');
      await act(async () => saving.resolve({ kind: 'saved', task: first }));
      await flush();
      expect(inputValue('detail-title')).toBe('C');

      vi.mocked(actions.openSnapshot).mockRejectedValueOnce(new Error('读回失败'));
      fireEvent.change(byTestId('detail-due'), { target: { value: '2026-02-02' } });
      await waitFor(() => expect(texts('board-notice')).toEqual(['读回失败']));
      await waitFor(() => expect(screen.queryByTestId('detail-status')).toBeNull());
      expect(inputValue('detail-due')).toBe('2026-02-02');
      vi.mocked(actions.saveTaskFields).mockResolvedValueOnce({ kind: 'unchanged' });
      fireEvent.change(byTestId('detail-due'), { target: { value: '2026-03-03' } });
      await waitFor(() => expect(screen.queryByTestId('detail-status')).toBeNull());
    });

    it('撤销 / 重做后重读详情；任务已不存在则关闭侧栏', async () => {
      mount();
      await openDetailOf('C');
      expect(within(byTestId('detail-panel'), 'detail-due-clear')).toBeTruthy();
      vi.mocked(actions.openSnapshot).mockResolvedValueOnce({ ...snapshotOf(third.id), dueDate: '2026-01-01' });
      fireEvent.click(byTestId('undo'));
      await waitFor(() => expect(inputValue('detail-due')).toBe('2026-01-01'));
      vi.mocked(actions.openSnapshot).mockRejectedValueOnce(new Error('任务不存在'));
      fireEvent.click(byTestId('redo'));
      await waitFor(() => expect(screen.queryByTestId('detail-panel')).toBeNull());
      expect(screen.queryByTestId('board-notice')).toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(cardByTitle('C')));
    });

    it('清除截止日与侧栏删除任务（确认后关闭侧栏并提示）', async () => {
      mount();
      await openDetailOf('C');
      fireEvent.click(byTestId('detail-due-clear'));
      await waitFor(() =>
        expect(actions.saveTaskFields).toHaveBeenCalledWith(third.id, expect.anything(), { dueDate: null })
      );
      fireEvent.click(byTestId('detail-delete'));
      expect((await screen.findByTestId('confirm-delete')).textContent).toContain('删除任务「C」');
      fireEvent.click(byTestId('confirm-delete-no'));
      expect(document.activeElement).toBe(byTestId('detail-delete'));
      fireEvent.click(byTestId('detail-delete'));
      fireEvent.click(await screen.findByTestId('confirm-delete-yes'));
      await waitFor(() => expect(screen.queryByTestId('detail-panel')).toBeNull());
      expect(texts('board-toast')[0]).toContain('已删除任务「C」');
    });
  });

  describe('卡片菜单与键盘', () => {
    it('菜单开关：同一触发器再点关闭，外部按下关闭且不抢焦点，弹层内按下不关闭', () => {
      mount();
      const trigger = within(cardByTitle('A'), 'task-menu-trigger');
      fireEvent.click(trigger);
      const popover = byTestId('popover');
      expect(popover.getAttribute('role')).toBe('menu');
      expect(popover.getAttribute('aria-label')).toBe('任务操作：A');
      expect(popover.style.width).toBe('240px');
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      fireEvent.click(trigger);
      expect(screen.queryByTestId('popover')).toBeNull();
      expect(document.activeElement).toBe(trigger);

      openColumnMenu('first');
      expect(byTestId('popover').getAttribute('aria-label')).toBe('列操作：first');
      fireEvent.pointerDown(byTestId('popover'));
      fireEvent.pointerDown(within(columnByTitle('first'), 'column-menu-trigger'));
      expect(screen.queryByTestId('popover')).not.toBeNull();
      fireEvent.pointerDown(byTestId('board-header'));
      expect(screen.queryByTestId('popover')).toBeNull();
      expect(document.activeElement).not.toBe(within(columnByTitle('first'), 'column-menu-trigger'));
    });

    it('视口变化与列区滚动关闭弹层，滚动关闭不把焦点拉回触发器', () => {
      mount();
      openTaskMenu('A');
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
      expect(screen.queryByTestId('popover')).toBeNull();
      openTaskMenu('A');
      fireEvent.scroll(byTestId('columns'));
      expect(screen.queryByTestId('popover')).toBeNull();
      expect(document.activeElement).not.toBe(within(cardByTitle('A'), 'task-menu-trigger'));
    });

    it('移到列选择器：移到目标列末尾；原位零写；失败提示不移动', async () => {
      mount();
      openTaskMenu('A');
      fireEvent.click(byTestId('task-move-to-column'));
      expect(byTestId('popover').getAttribute('aria-label')).toBe('移到列');
      expect(
        allByTestId('picker-option').find(element => element.getAttribute('aria-selected') === 'true')?.textContent
      ).toBe('first');
      fireEvent.click(option('empty'));
      await waitFor(() =>
        expect(actions.moveTask).toHaveBeenCalledWith(first.id, { kind: 'end', columnId: emptyColumn.id })
      );
      await waitFor(() => expect(document.activeElement).toBe(cardByTitle('A')));

      openTaskMenu('B');
      fireEvent.click(byTestId('task-move-to-column'));
      typeInto(byTestId('picker-filter'), 'zzz', 'Enter');
      expect(screen.getByText('没有匹配的选项')).toBeTruthy();
      expect(screen.queryByTestId('picker-create')).toBeNull();
      typeInto(byTestId('picker-filter'), '');
      fireEvent.click(option('first'));
      await flush();
      expect(actions.moveTask).toHaveBeenCalledOnce();

      vi.mocked(actions.moveTask).mockRejectedValueOnce(new Error('移动失败'));
      fireEvent.keyDown(cardByTitle('A'), { key: 'ArrowDown', altKey: true });
      await waitFor(() => expect(texts('board-notice')).toEqual(['移动失败']));
    });

    it('卡片菜单：上 / 下移按可移动性禁用，打开详情、编辑标题与删除', async () => {
      mount();
      openTaskMenu('A');
      expect(isDisabled(byTestId('task-move-up'))).toBe(true);
      expect(isDisabled(byTestId('task-move-down'))).toBe(false);
      fireEvent.click(byTestId('task-move-down'));
      await waitFor(() =>
        expect(actions.moveTask).toHaveBeenCalledWith(first.id, {
          kind: 'between',
          columnId: firstColumn.id,
          prevId: second.id,
          nextId: null
        })
      );
      openTaskMenu('B');
      fireEvent.click(byTestId('task-move-up'));
      await waitFor(() => expect(actions.moveTask).toHaveBeenCalledTimes(2));
      openTaskMenu('A');
      fireEvent.click(byTestId('task-menu-open'));
      await waitFor(() => expect(inputValue('detail-title')).toBe('A'));
      openTaskMenu('A');
      fireEvent.click(byTestId('task-delete'));
      expect((await screen.findByTestId('confirm-delete')).textContent).toContain('将同时移除 0 条标签关联。');
    });

    it('方向键移动焦点、Alt + 方向键移动卡片、Enter / Space / F2 / Del / Shift+F10 / ContextMenu', async () => {
      mount();
      const cardA = cardByTitle('A');
      cardA.focus();
      expect(cardA.getAttribute('tabindex')).toBe('0');
      fireEvent.keyDown(cardA, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(cardByTitle('B'));
      fireEvent.keyDown(cardA, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(cardByTitle('C'));
      expect(cardByTitle('C').getAttribute('tabindex')).toBe('0');
      fireEvent.keyDown(cardByTitle('C'), { key: 'ArrowRight' });
      expect(document.activeElement).toBe(cardByTitle('C'));
      fireEvent.keyDown(cardByTitle('B'), { key: 'Home' });
      expect(document.activeElement).toBe(cardByTitle('A'));
      fireEvent.keyDown(cardA, { key: 'End' });
      expect(document.activeElement).toBe(cardByTitle('B'));

      fireEvent.keyDown(cardA, { key: 'ArrowDown', altKey: true });
      await waitFor(() =>
        expect(actions.moveTask).toHaveBeenCalledWith(first.id, {
          kind: 'between',
          columnId: firstColumn.id,
          prevId: second.id,
          nextId: null
        })
      );
      fireEvent.keyDown(cardA, { key: ' ' });
      await waitFor(() => expect(inputValue('detail-title')).toBe('A'));
      fireEvent.click(byTestId('detail-close'));
      fireEvent.keyDown(cardA, { key: 'Enter' });
      await waitFor(() => expect(screen.queryByTestId('detail-panel')).not.toBeNull());
      fireEvent.keyDown(cardA, { key: 'F2' });
      expect(inputValue('task-title-editor')).toBe('A');
      const inner = byTestId('task-title-editor');
      const ignored = createEvent.keyDown(inner, { key: 'ArrowDown' });
      fireEvent(inner, ignored);
      expect(ignored.defaultPrevented).toBe(false);
      fireEvent.keyDown(cardById('A'), { key: 'Delete' });
      await screen.findByTestId('confirm-delete');
      fireEvent.keyDown(cardById('A'), { key: 'F10', shiftKey: true });
      expect(byTestId('popover').getAttribute('aria-label')).toBe('任务操作：A');
      fireEvent.keyDown(cardById('A'), { key: 'ContextMenu' });
      expect(byTestId('popover').getAttribute('aria-label')).toBe('任务操作：A');
      const unhandled = createEvent.keyDown(cardById('A'), { key: 'x' });
      fireEvent(cardById('A'), unhandled);
      expect(unhandled.defaultPrevented).toBe(false);
      fireEvent.keyDown(cardByTitle('B'), { key: 'Backspace' });
      await waitFor(() => expect(actions.planTaskDelete).toHaveBeenLastCalledWith(second.id));
    });

    it('卡片标题内联编辑：失败保留草稿，成功收起并聚焦卡片；取消零写', async () => {
      mount();
      openTaskMenu('A');
      fireEvent.click(byTestId('task-edit-title'));
      typeInto(byTestId('task-title-editor'), '');
      vi.mocked(actions.updateTaskTitle).mockRejectedValueOnce(new Error('标题不能为空'));
      fireEvent.click(byTestId('task-title-save'));
      await waitFor(() => expect(texts('board-notice')).toEqual(['标题不能为空']));
      expect(screen.getByTestId('task-title-editor')).toBeTruthy();
      expect(cardById('A').getAttribute('draggable')).toBe('false');
      typeInto(byTestId('task-title-editor'), '新标题', 'Enter');
      await waitFor(() => expect(screen.queryByTestId('task-title-editor')).toBeNull());
      expect(actions.updateTaskTitle).toHaveBeenLastCalledWith(first.id, '新标题');
      await waitFor(() => expect(document.activeElement).toBe(cardByTitle('A')));

      fireEvent.keyDown(cardByTitle('A'), { key: 'F2' });
      fireEvent.click(byTestId('task-title-cancel'));
      expect(screen.queryByTestId('task-title-editor')).toBeNull();
      fireEvent.keyDown(cardByTitle('A'), { key: 'F2' });
      typeInto(byTestId('task-title-editor'), '不保存', 'Escape');
      expect(screen.queryByTestId('task-title-editor')).toBeNull();
      expect(actions.updateTaskTitle).toHaveBeenCalledTimes(2);
    });

    it('全局快捷键：/ 聚焦筛选、? 打开快捷键、⌘Z / ⇧⌘Z、Esc 由内向外关闭', async () => {
      mount();
      fireEvent.keyDown(document.body, { key: '/' });
      expect(document.activeElement).toBe(byTestId('board-filter-input'));
      byTestId('board-filter-input').blur();
      fireEvent.keyDown(document.body, { key: '?' });
      const dialog = byTestId('shortcuts-dialog');
      expect(dialog.textContent).toContain('在卡片间移动');
      expect(withinAll(dialog, 'dialog-close')).toHaveLength(1);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(screen.queryByTestId('shortcuts-dialog')).toBeNull();
      fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
      fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true });
      await waitFor(() => expect(actions.redo).toHaveBeenCalledOnce());
      expect(actions.undo).toHaveBeenCalledOnce();

      await openDetailOf('A');
      openTaskMenu('A');
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(screen.queryByTestId('popover')).toBeNull();
      expect(byTestId('detail-panel')).toBeTruthy();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(screen.queryByTestId('detail-panel')).toBeNull();
      const unhandled = createEvent.keyDown(document.body, { key: 'Escape' });
      fireEvent(document.body, unhandled);
      expect(unhandled.defaultPrevented).toBe(false);
    });

    it('模态对话框：Tab / Shift+Tab 在对话框内首尾循环，焦点被移到背后的卡片时拉回对话框', () => {
      mount();
      fireEvent.click(byTestId('create-board'));
      const focusables = [...byTestId('board-composer').querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)];
      expect(focusables.length).toBeGreaterThan(1);
      const [first, last] = [focusables[0], focusables[focusables.length - 1]];
      focus(last);
      const forward = createEvent.keyDown(last, { key: 'Tab' });
      fireEvent(last, forward);
      expect(forward.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first);
      fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(last);
      // 中间位置交给浏览器默认顺序
      const middle = createEvent.keyDown(first, { key: 'Tab' });
      focus(first);
      fireEvent(first, middle);
      expect(middle.defaultPrevented).toBe(false);
      focus(cardByTitle('A'));
      fireEvent.keyDown(cardByTitle('A'), { key: 'Tab' });
      expect(document.activeElement).toBe(first);
    });

    it('全局按键：看板外或编辑框内忽略，对话框打开时不响应单键，⌘K 打开搜索', () => {
      mount();
      const outside = document.createElement('button');
      document.body.append(outside);
      focus(outside);
      fireEvent.keyDown(outside, { key: '?' });
      expect(screen.queryByTestId('shortcuts-dialog')).toBeNull();
      outside.remove();
      const input = byTestId('board-filter-input');
      input.focus();
      fireEvent.keyDown(input, { key: '?' });
      expect(screen.queryByTestId('shortcuts-dialog')).toBeNull();
      fireEvent.keyDown(input, { key: 'k', ctrlKey: true });
      expect(screen.queryByTestId('board-search')).toBeNull();
      expect(screen.queryByTestId('search-open')).toBeNull();

      update({ searchUnavailableReason: 'adapter_unsupported' });
      fireEvent.keyDown(input, { key: 'k', ctrlKey: true });
      expect(byTestId('board-search')).toBeTruthy();
      expect(isDisabled(byTestId('board-search-input'))).toBe(true);
      expect(texts('board-search-unavailable')).toEqual(['当前适配器不支持搜索']);
      fireEvent.keyDown(document.body, { key: '?' });
      expect(screen.queryByTestId('shortcuts-dialog')).toBeNull();
      fireEvent.click(byTestId('dialog-close'));
      expect(screen.queryByTestId('board-search')).toBeNull();
      fireEvent.keyDown(document.body, { key: 'x', altKey: true });
      fireEvent.keyDown(document.body, { key: 'x' });
      update({ searchUnavailableReason: 'plugin_not_installed' });
      fireEvent.click(byTestId('search-open'));
      expect(texts('board-search-unavailable')).toEqual(['搜索插件未安装']);
      update({ searchUnavailableReason: 'query_failed' });
      expect(texts('board-search-unavailable')).toEqual(['搜索查询失败']);
    });
  });

  describe('筛选', () => {
    it('补全默认高亮第一项、回车采纳；Esc 先收起补全再失焦；点击补全项采纳', () => {
      mount();
      const input = byTestId('board-filter-input');
      focus(input);
      typeInto(input, 'la');
      expect(byTestId('board-filter-suggestions')).toBeTruthy();
      expect(input.getAttribute('aria-expanded')).toBe('true');
      expect(input.getAttribute('aria-activedescendant')).toMatch(/-suggestions-0$/);
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(inputValue('board-filter-input')).toBe('label:');
      expect(texts('board-filter-suggestion')).toEqual(['标签标签', '文档标签']);
      expect(allByTestId('board-filter-suggestion')[0].className).toContain('is-active');
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByTestId('board-filter-suggestions')).toBeNull();
      expect(document.activeElement).toBe(input);
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(document.activeElement).not.toBe(input);

      focus(input);
      typeInto(input, '');
      typeInto(input, 'label:');
      const mousedown = createEvent.mouseDown(allByTestId('board-filter-suggestion')[1]);
      fireEvent(allByTestId('board-filter-suggestion')[1], mousedown);
      expect(mousedown.defaultPrevented).toBe(true);
      fireEvent.click(allByTestId('board-filter-suggestion')[1]);
      expect(inputValue('board-filter-input')).toBe('label:文档 ');
      expect(allByTestId('task-card')).toHaveLength(0);
    });

    it('点击卡片标签切换 label 筛选；计数按筛选结果重算', () => {
      mount();
      fireEvent.click(within(cardByTitle('A'), 'card-label'));
      expect(inputValue('board-filter-input')).toBe('label:标签');
      const chip = within(cardByTitle('A'), 'card-label');
      expect(chip.getAttribute('aria-pressed')).toBe('true');
      expect(chip.className).toContain('is-active');
      expect(titlesIn(columnByTitle('first'))).toEqual(['A']);
      expect(texts('board-filter-count')).toEqual(['1 项']);
      expect(within(columnByTitle('first'), 'column-count').getAttribute('title')).toBe('筛选后 1 / 共 2 个任务');
      expect(texts('column-empty')).toEqual(['没有匹配筛选的任务', '暂无任务']);
      fireEvent.click(within(cardByTitle('A'), 'card-label'));
      expect(inputValue('board-filter-input')).toBe('');
      expect(within(columnByTitle('first'), 'column-count').getAttribute('title')).toBe('2 个任务');
    });

    it('逾期计数与截止日文字取本地今天；漫游 tabindex 落在第一张可见卡片', () => {
      mount();
      expect(texts('column-overdue')).toEqual(['逾期 1']);
      const overdue = within(cardByTitle('B'), 'task-due');
      expect(overdue.textContent).toBe('已逾期 2000-01-01');
      expect(overdue.className).toContain('is-overdue');
      const today = within(cardByTitle('C'), 'task-due');
      expect(today.textContent).toBe(`今天到期 ${third.dueDate}`);
      expect(today.className).toContain('is-today');
      typeInto(byTestId('board-filter-input'), 'due:overdue');
      expect(titlesIn(columnByTitle('first'))).toEqual(['B']);
      expect(cardByTitle('B').getAttribute('tabindex')).toBe('0');
    });

    it('筛选键盘的其余分支：无补全时方向键 / 回车透传；Tab 采纳；未选中时 ↑ 到最后一项', () => {
      mount();
      const input = byTestId('board-filter-input');
      const arrow = createEvent.keyDown(input, { key: 'ArrowUp' });
      fireEvent(input, arrow);
      expect(arrow.defaultPrevented).toBe(false);
      focus(input);
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(input.getAttribute('aria-activedescendant')).toMatch(/-suggestions-4$/);
      typeInto(input, '登录');
      const enter = createEvent.keyDown(input, { key: 'Enter' });
      fireEvent(input, enter);
      expect(enter.defaultPrevented).toBe(false);
      typeInto(input, 'co');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Tab' });
      expect(inputValue('board-filter-input')).toBe('column:');
      fireEvent.keyDown(input, { key: 'x' });
      fireEvent.blur(input);
      expect(screen.queryByTestId('board-filter-suggestions')).toBeNull();
      typeInto(input, '-label:标签');
      expect(allByTestId('task-card')).toHaveLength(2);
      fireEvent.click(byTestId('board-filter-clear'));
      expect(allByTestId('task-card')).toHaveLength(3);
    });
  });

  describe('创建、改名与删除', () => {
    it('新建看板对话框：空标题不提交，成功后切到新板', async () => {
      mount();
      expect(byTestId('board-view').className).toBe('rxb');
      fireEvent.click(byTestId('create-board'));
      expect(byTestId('board-composer')).toBeTruthy();
      // 对话框打开时根节点挂 has-overlay：错误提示浮到遮罩之上
      expect(byTestId('board-view').className).toBe('rxb has-overlay');
      expect(isDisabled(byTestId('board-composer-submit'))).toBe(true);
      fireEvent.keyDown(byTestId('board-composer-input'), { key: 'Enter' });
      await flush();
      expect(actions.createBoard).not.toHaveBeenCalled();
      typeInto(byTestId('board-composer-input'), ' 新板 ');
      fireEvent.click(byTestId('board-composer-submit'));
      await waitFor(() => expect(state.selectBoard).toHaveBeenCalledWith(boardId));
      expect(actions.createBoard).toHaveBeenCalledWith({ title: '新板' });
      expect(screen.queryByTestId('board-composer')).toBeNull();
      expect(byTestId('board-view').className).toBe('rxb');

      fireEvent.click(byTestId('create-board'));
      fireEvent.click(byTestId('dialog-close'));
      expect(screen.queryByTestId('board-composer')).toBeNull();
      expect(document.activeElement).toBe(byTestId('create-board'));
      fireEvent.click(byTestId('create-board'));
      fireEvent.click(screen.getByText('取消'));
      expect(screen.queryByTestId('board-composer')).toBeNull();
    });

    it('建板落库期间用户已自己切板：尊重用户选择，不再自动切到新板', async () => {
      mount();
      const pending = deferred<Board>();
      vi.mocked(actions.createBoard).mockReturnValueOnce(pending.promise);
      fireEvent.click(byTestId('create-board'));
      typeInto(byTestId('board-composer-input'), '新板', 'Enter');
      update({ currentBoardId: next.id, currentBoard: next });
      await act(async () => pending.resolve({ ...current, id: id('created') } as Board));
      await flush();
      expect(state.selectBoard).not.toHaveBeenCalled();
      expect(screen.queryByTestId('board-composer')).toBeNull();
    });

    it('建板失败保留对话框与草稿', async () => {
      mount();
      vi.mocked(actions.createBoard).mockRejectedValueOnce(new Error('标题不能为空'));
      fireEvent.click(byTestId('create-board'));
      typeInto(byTestId('board-composer-input'), '新板', 'Enter');
      await waitFor(() => expect(texts('board-notice')).toEqual(['标题不能为空']));
      expect(inputValue('board-composer-input')).toBe('新板');
    });

    it('板标题 / 描述 / 列标题就地编辑：未改动零调用，失败保留编辑器', async () => {
      mount();
      expect(byTestId('rename-board').getAttribute('aria-label')).toBe('改板标题：板');
      fireEvent.click(byTestId('rename-board'));
      fireEvent.keyDown(byTestId('board-title-editor'), { key: 'Enter' });
      await flush();
      expect(actions.updateBoard).not.toHaveBeenCalled();
      expect(screen.queryByTestId('board-title-editor')).toBeNull();
      fireEvent.click(byTestId('rename-board'));
      vi.mocked(actions.updateBoard).mockRejectedValueOnce(new Error('标题不能为空'));
      const titleEditor = byTestId('board-title-editor');
      typeInto(titleEditor, '新标题');
      act(() => {
        fireEvent.keyDown(titleEditor, { key: 'Enter' });
        fireEvent.blur(titleEditor);
      });
      await waitFor(() => expect(texts('board-notice')).toEqual(['标题不能为空']));
      expect(inputValue('board-title-editor')).toBe('新标题');
      expect(actions.updateBoard).toHaveBeenCalledOnce();
      fireEvent.keyDown(byTestId('board-title-editor'), { key: 'Escape' });
      expect(screen.queryByTestId('board-title-editor')).toBeNull();

      expect(byTestId('board-description').textContent).toBe('添加描述');
      fireEvent.click(byTestId('board-description'));
      typeInto(byTestId('board-description-editor'), '描述 ');
      fireEvent.blur(byTestId('board-description-editor'));
      await waitFor(() => expect(actions.updateBoard).toHaveBeenLastCalledWith(boardId, { description: '描述' }));

      openColumnMenu('first');
      fireEvent.click(byTestId('column-rename'));
      const columnEditor = byTestId('column-title-editor');
      typeInto(columnEditor, '改名');
      act(() => {
        fireEvent.keyDown(columnEditor, { key: 'Enter' });
        fireEvent.blur(columnEditor);
      });
      await waitFor(() => expect(actions.updateColumn).toHaveBeenCalledWith(firstColumn.id, { title: '改名' }));
      expect(actions.updateColumn).toHaveBeenCalledOnce();
      openColumnMenu('second');
      fireEvent.click(byTestId('column-rename'));
      typeInto(byTestId('column-title-editor'), 'second', 'Enter');
      openColumnMenu('second');
      fireEvent.click(byTestId('column-rename'));
      fireEvent.keyDown(byTestId('column-title-editor'), { key: 'Escape' });
      expect(screen.queryByTestId('column-title-editor')).toBeNull();
      vi.mocked(actions.updateColumn).mockRejectedValueOnce(new Error('列名不能为空'));
      openColumnMenu('second');
      fireEvent.click(byTestId('column-rename'));
      typeInto(byTestId('column-title-editor'), ' ', 'Enter');
      await waitFor(() => expect(texts('board-notice')).toEqual(['列名不能为空']));
      expect(screen.getByTestId('column-title-editor')).toBeTruthy();
      expect(actions.updateColumn).toHaveBeenCalledTimes(2);
    });

    it('板描述编辑的取消与快捷键', async () => {
      state = { ...state, currentBoard: { ...current, description: '旧描述' } as Board };
      mount();
      expect(byTestId('board-description').textContent).toBe('旧描述');
      fireEvent.click(byTestId('board-description'));
      fireEvent.keyDown(byTestId('board-description-editor'), { key: 'Escape' });
      expect(screen.queryByTestId('board-description-editor')).toBeNull();
      fireEvent.click(byTestId('board-description'));
      typeInto(byTestId('board-description-editor'), '新描述', 'Enter', { metaKey: true });
      await waitFor(() => expect(actions.updateBoard).toHaveBeenCalledWith(boardId, { description: '新描述' }));
      fireEvent.click(byTestId('board-description'));
      typeInto(byTestId('board-description-editor'), '旧描述 ', 'Enter');
      fireEvent.blur(byTestId('board-description-editor'));
      await flush();
      expect(actions.updateBoard).toHaveBeenCalledOnce();
    });

    it('列底建任务：回车即建并保持输入框；建任务中拒绝重复提交；失败保留草稿', async () => {
      mount();
      const pending = deferred<Task>();
      vi.mocked(actions.createTask).mockReturnValueOnce(pending.promise);
      fireEvent.click(within(columnByTitle('first'), 'add-task'));
      typeInto(byTestId('add-task-input'), '只创建一次', 'Enter');
      fireEvent.keyDown(byTestId('add-task-input'), { key: 'Enter' });
      fireEvent.keyDown(byTestId('add-task-input'), { key: 'Escape' });
      expect(actions.createTask).toHaveBeenCalledOnce();
      expect(isDisabled(byTestId('add-task-input'))).toBe(true);
      expect(isDisabled(within(columnByTitle('second'), 'add-task'))).toBe(true);
      fireEvent.click(within(columnByTitle('second'), 'column-add-task'));
      expect(withinAll(columnByTitle('second'), 'add-task-form')).toHaveLength(0);
      await act(async () => pending.reject(new Error('写入失败')));
      await waitFor(() => expect(isDisabled(byTestId('add-task-input'))).toBe(false));
      expect(inputValue('add-task-input')).toBe('只创建一次');
      expect(texts('board-notice')).toEqual(['写入失败']);
      fireEvent.click(byTestId('add-task-submit'));
      await waitFor(() => expect(inputValue('add-task-input')).toBe(''));
      expect(actions.createTask).toHaveBeenLastCalledWith({ columnId: firstColumn.id, title: '只创建一次' });
      expect(byTestId('add-task-form')).toBeTruthy();
      await waitFor(() => expect(document.activeElement).toBe(byTestId('add-task-input')));
      fireEvent.click(byTestId('add-task-cancel'));
      expect(screen.queryByTestId('add-task-form')).toBeNull();
      fireEvent.click(within(columnByTitle('second'), 'column-add-task'));
      fireEvent.keyDown(byTestId('add-task-input'), { key: 'Enter' });
      fireEvent.keyDown(byTestId('add-task-input'), { key: 'Escape' });
      expect(screen.queryByTestId('add-task-form')).toBeNull();
      expect(actions.createTask).toHaveBeenCalledTimes(2);
    });

    it('末尾建列：回车建列后收起，失败保留输入；Esc / 取消零写', async () => {
      mount();
      fireEvent.click(byTestId('create-column'));
      expect(isDisabled(byTestId('column-composer-submit'))).toBe(true);
      fireEvent.keyDown(byTestId('column-composer-input'), { key: 'Enter' });
      vi.mocked(actions.createColumn).mockRejectedValueOnce(new Error('失败'));
      typeInto(byTestId('column-composer-input'), '列', 'Enter');
      await waitFor(() => expect(texts('board-notice')).toEqual(['失败']));
      expect(inputValue('column-composer-input')).toBe('列');
      fireEvent.click(byTestId('column-composer-submit'));
      await waitFor(() => expect(screen.queryByTestId('column-composer-input')).toBeNull());
      expect(actions.createColumn).toHaveBeenLastCalledWith({ title: '列' });
      fireEvent.click(byTestId('create-column'));
      fireEvent.keyDown(byTestId('column-composer-input'), { key: 'Escape' });
      expect(screen.queryByTestId('column-composer-input')).toBeNull();
      fireEvent.click(byTestId('create-column'));
      fireEvent.click(byTestId('column-composer-cancel'));
      expect(screen.queryByTestId('column-composer-input')).toBeNull();
      expect(actions.createColumn).toHaveBeenCalledTimes(2);
    });

    it('删除任务 / 列走确认清单；取消零写；确认后给出可撤销提示', async () => {
      mount();
      openTaskMenu('A');
      fireEvent.click(byTestId('task-delete'));
      expect((await screen.findByTestId('confirm-delete')).textContent).toContain('删除任务「A」');
      fireEvent.click(byTestId('confirm-delete-no'));
      expect(screen.queryByTestId('confirm-delete')).toBeNull();
      expect(actions.executeDelete).not.toHaveBeenCalled();

      openColumnMenu('first');
      fireEvent.click(byTestId('column-delete'));
      expect((await screen.findByTestId('confirm-delete')).textContent).toContain('其中 2 个任务会一并删除；');
      fireEvent.mouseDown(byTestId('confirm-delete'));
      expect(screen.queryByTestId('confirm-delete')).not.toBeNull();
      fireEvent.click(byTestId('confirm-delete-yes'));
      await waitFor(() =>
        expect(actions.executeDelete).toHaveBeenCalledWith(expect.objectContaining({ kind: 'column' }))
      );
      expect(texts('board-toast')[0]).toContain('已删除列「first」');
      fireEvent.click(byTestId('board-toast-undo'));
      await waitFor(() => expect(actions.undo).toHaveBeenCalledOnce());
      expect(screen.queryByTestId('board-toast')).toBeNull();

      vi.mocked(actions.executeDelete).mockRejectedValueOnce(new Error('清单已过期'));
      openTaskMenu('A');
      fireEvent.click(byTestId('task-delete'));
      fireEvent.click(await screen.findByTestId('confirm-delete-yes'));
      await waitFor(() => expect(texts('board-notice')).toEqual(['清单已过期']));
      expect(screen.queryByTestId('board-toast')).toBeNull();
      openTaskMenu('A');
      fireEvent.click(byTestId('task-delete'));
      fireEvent.mouseDown(await screen.findByTestId('dialog-backdrop'));
      expect(screen.queryByTestId('confirm-delete')).toBeNull();
    });

    it('标签编辑器：新建取下一个预设色，编辑只写改动字段；删除先确认再回到列表', async () => {
      mount();
      fireEvent.click(byTestId('labels-open'));
      expect(texts('label-chip')).toEqual(['标签', '文档']);
      expect(document.querySelector('.rxb-dialog-title')?.textContent).toBe('标签');
      fireEvent.click(byTestId('create-label'));
      expect(document.querySelector('.rxb-dialog-title')?.textContent).toBe('新建标签');
      expect(inputValue('label-color-input')).toBe(BOARD_LABEL_COLORS[0].color);
      expect(document.querySelector('.rxb-label-preview')?.textContent).toBe('标签预览');
      fireEvent.click(allByTestId('label-color-option')[1]);
      expect(allByTestId('label-color-option')[1].getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(allByTestId('label-color-option')[0]);
      typeInto(byTestId('label-name-input'), '新', 'Enter');
      await waitFor(() => expect(screen.queryByTestId('label-editor')).toBeNull());
      expect(actions.createLabel).toHaveBeenCalledWith({ name: '新', color: BOARD_LABEL_COLORS[0].color });

      fireEvent.click(allByTestId('label-edit')[0]);
      expect(document.querySelector('.rxb-dialog-title')?.textContent).toBe('编辑标签');
      typeInto(byTestId('label-color-input'), '#000000');
      fireEvent.click(byTestId('label-editor-save'));
      await waitFor(() => expect(actions.recolorLabel).toHaveBeenCalledWith(label.id, '#000000'));
      expect(actions.renameLabel).not.toHaveBeenCalled();

      fireEvent.click(allByTestId('label-edit')[0]);
      typeInto(byTestId('label-name-input'), '改名');
      typeInto(byTestId('label-color-input'), 'red');
      expect(isDisabled(byTestId('label-editor-save'))).toBe(true);
      expect(document.querySelector<HTMLElement>('.rxb-label-preview .rxb-label')?.style.backgroundColor).toBeTruthy();
      fireEvent.keyDown(byTestId('label-name-input'), { key: 'Enter' });
      typeInto(byTestId('label-color-input'), '#ffffff');
      fireEvent.click(byTestId('label-editor-save'));
      await waitFor(() => expect(actions.renameLabel).toHaveBeenCalledWith(label.id, '改名'));
      expect(actions.recolorLabel).toHaveBeenCalledOnce();

      fireEvent.click(allByTestId('label-edit')[0]);
      fireEvent.click(byTestId('label-editor-cancel'));
      expect(screen.queryByTestId('label-editor')).toBeNull();

      fireEvent.click(allByTestId('label-delete')[0]);
      expect((await screen.findByTestId('confirm-delete')).textContent).toContain('将从 1 个任务上移除这个标签。');
      fireEvent.click(byTestId('confirm-delete-no'));
      expect(byTestId('label-manager')).toBeTruthy();
      fireEvent.click(allByTestId('label-delete')[0]);
      fireEvent.click(await screen.findByTestId('confirm-delete-yes'));
      await waitFor(() => expect(actions.executeLabelDelete).toHaveBeenCalledOnce());
      expect(byTestId('label-manager')).toBeTruthy();
      await waitFor(() => expect(texts('board-toast')[0]).toContain('已删除标签「标签」'));
      fireEvent.click(byTestId('dialog-close'));
      expect(screen.queryByTestId('label-manager')).toBeNull();
    });

    it('标签编辑：已被删的标签按新建前的 id 改名改色；空库提示', async () => {
      state = { ...state, labels: [] };
      mount();
      fireEvent.click(byTestId('labels-open'));
      expect(screen.getByText('当前看板还没有标签。')).toBeTruthy();
      fireEvent.click(byTestId('create-label'));
      typeInto(byTestId('label-name-input'), '首个');
      fireEvent.click(byTestId('label-editor-save'));
      await waitFor(() =>
        expect(actions.createLabel).toHaveBeenCalledWith({ name: '首个', color: BOARD_LABEL_COLORS[0].color })
      );
      update({ labels: [label] });
      fireEvent.click(allByTestId('label-edit')[0]);
      update({ labels: [] });
      typeInto(byTestId('label-color-input'), '#123456');
      fireEvent.click(byTestId('label-editor-save'));
      await waitFor(() => expect(actions.recolorLabel).toHaveBeenCalledWith(label.id, '#123456'));
      expect(actions.renameLabel).toHaveBeenCalledWith(label.id, '标签');
      vi.mocked(actions.planLabelDelete).mockRejectedValueOnce(new Error('标签不存在'));
      update({ labels: [label] });
      fireEvent.click(allByTestId('label-delete')[0]);
      await waitFor(() => expect(texts('board-notice')).toEqual(['标签不存在']));
      vi.mocked(actions.executeLabelDelete).mockRejectedValueOnce(new Error('删除失败'));
      fireEvent.click(allByTestId('label-delete')[0]);
      fireEvent.click(await screen.findByTestId('confirm-delete-yes'));
      await waitFor(() => expect(texts('board-notice')).toEqual(['删除失败']));
      expect(screen.queryByTestId('board-toast')).toBeNull();
    });

    it('本列排序：执行中阻止重复；无变化提示不可撤销；失败复位', async () => {
      mount();
      const sorting = deferred<{ written: boolean }>();
      vi.mocked(actions.sortColumn).mockReturnValueOnce(sorting.promise);
      openColumnMenu('first');
      fireEvent.click(byTestId('column-sort-due'));
      openColumnMenu('first');
      expect(isDisabled(byTestId('column-sort-due'))).toBe(true);
      expect(isDisabled(byTestId('column-sort-title'))).toBe(true);
      fireEvent.keyDown(byTestId('popover'), { key: 'Escape' });
      await act(async () => sorting.resolve({ written: true }));
      await waitFor(() => expect(texts('board-toast')[0]).toContain('已按截止日排序「first」'));
      expect(screen.getByTestId('board-toast-undo')).toBeTruthy();

      vi.mocked(actions.sortColumn).mockResolvedValueOnce({ written: false });
      openColumnMenu('first');
      fireEvent.click(byTestId('column-sort-title'));
      await waitFor(() => expect(texts('board-toast')[0]).toContain('已按目标顺序排列，无变化'));
      expect(screen.queryByTestId('board-toast-undo')).toBeNull();
      fireEvent.click(byTestId('board-toast-close'));
      expect(screen.queryByTestId('board-toast')).toBeNull();

      vi.mocked(actions.sortColumn).mockRejectedValueOnce(new Error('排序失败'));
      openColumnMenu('first');
      fireEvent.click(byTestId('column-sort-due'));
      await waitFor(() => expect(texts('board-notice')).toEqual(['排序失败']));
      openColumnMenu('first');
      expect(isDisabled(byTestId('column-sort-due'))).toBe(false);
    });

    it('导出备份透传宿主回调；缺省给占位提示', async () => {
      mount();
      fireEvent.click(byTestId('board-menu-trigger'));
      fireEvent.click(byTestId('export-backup'));
      await waitFor(() => expect(texts('board-notice')[0]).toContain('宿主接线'));
      expect(screen.queryByTestId('popover')).toBeNull();
      exportBackup = vi.fn(async () => undefined);
      update({});
      fireEvent.click(byTestId('board-menu-trigger'));
      fireEvent.click(byTestId('export-backup'));
      await waitFor(() => expect(exportBackup).toHaveBeenCalledOnce());
      await waitFor(() => expect(texts('board-toast')[0]).toContain('备份已生成'));
      exportBackup = vi.fn(async () => Promise.reject(new Error('导出失败')));
      update({});
      fireEvent.click(byTestId('board-menu-trigger'));
      fireEvent.click(byTestId('export-backup'));
      await waitFor(() => expect(texts('board-notice')).toEqual(['导出失败']));
    });
  });

  describe('边界与分支', () => {
    it('板选择器：新板选项晚于当前板 id 渲染，选项出现后即为选中项', () => {
      const created = { id: id('created'), title: '新板', description: null } as Board;
      state = { ...state, currentBoardId: created.id, currentBoard: created };
      mount();
      update({ boards: [current, next, created] });
      const selector = byTestId('board-selector') as HTMLSelectElement;
      expect([...selector.options].filter(item => item.selected).map(item => item.textContent)).toEqual(['新板']);
      expect(selector.value).toBe(created.id);
    });

    it('列菜单：首尾列禁用左 / 右移并写明原因；左右移走领域动作并聚焦列菜单', async () => {
      mount();
      openColumnMenu('first');
      expect(isDisabled(byTestId('column-move-back'))).toBe(true);
      expect(byTestId('column-move-back').textContent).toContain('已是最左列');
      expect(byTestId('column-move-forward').textContent).not.toContain('已是最右列');
      fireEvent.click(byTestId('column-move-forward'));
      await waitFor(() =>
        expect(actions.moveColumn).toHaveBeenCalledWith(firstColumn.id, {
          prevId: secondColumn.id,
          nextId: emptyColumn.id
        })
      );
      await waitFor(() => expect(document.activeElement).toBe(within(columnByTitle('first'), 'column-menu-trigger')));
      openColumnMenu('empty');
      expect(isDisabled(byTestId('column-move-forward'))).toBe(true);
      expect(byTestId('column-move-forward').textContent).toContain('已是最右列');
      openColumnMenu('second');
      fireEvent.click(byTestId('column-move-back'));
      await waitFor(() =>
        expect(actions.moveColumn).toHaveBeenLastCalledWith(secondColumn.id, { prevId: null, nextId: firstColumn.id })
      );
    });

    it('选择器键盘：上下循环、回车选中或创建；Esc 关闭，其余按键透传；创建失败提示', async () => {
      mount();
      await openDetailOf('A');
      fireEvent.click(byTestId('detail-labels'));
      const filter = byTestId('picker-filter');
      fireEvent.keyDown(filter, { key: 'ArrowUp' });
      expect(allByTestId('picker-option')[1].className).toContain('is-active');
      fireEvent.keyDown(filter, { key: 'ArrowDown' });
      expect(allByTestId('picker-option')[0].className).toContain('is-active');
      fireEvent.keyDown(filter, { key: 'Enter' });
      expect(allByTestId('picker-option')[0].getAttribute('aria-selected')).toBe('false');
      typeInto(filter, '全新', 'Enter');
      await waitFor(() => expect(actions.createLabel).toHaveBeenCalledOnce());
      typeInto(filter, '标签');
      const other = createEvent.keyDown(filter, { key: 'x' });
      fireEvent(filter, other);
      expect(other.defaultPrevented).toBe(false);
      fireEvent.keyDown(byTestId('popover'), { key: 'x' });
      expect(screen.queryByTestId('popover')).not.toBeNull();
      fireEvent.keyDown(byTestId('popover'), { key: 'Escape' });
      expect(screen.queryByTestId('popover')).toBeNull();
      await waitFor(() => expect(texts('detail-status')).toEqual(['已保存']));

      vi.mocked(actions.createLabel).mockRejectedValueOnce(new Error('重名'));
      fireEvent.click(byTestId('detail-labels'));
      typeInto(byTestId('picker-filter'), '重名');
      fireEvent.click(byTestId('picker-create'));
      await waitFor(() => expect(texts('board-notice')).toEqual(['重名']));
      expect(inputValue('picker-filter')).toBe('重名');
    });

    it('无当前板：空态请选择看板，标签与删板入口禁用；读取中 / 读取失败 / 恢复中横幅', () => {
      state = { ...state, currentBoard: null, currentBoardId: null };
      mount();
      expect(texts('empty-board')[0]).toContain('请选择看板');
      expect(screen.queryByTestId('board-filter')).toBeNull();
      expect(screen.queryByTestId('rename-board')).toBeNull();
      expect(isDisabled(byTestId('labels-open'))).toBe(true);
      fireEvent.click(byTestId('board-menu-trigger'));
      expect(isDisabled(byTestId('delete-board'))).toBe(true);
      fireEvent.click(byTestId('board-menu-trigger'));

      update({ loading: true });
      expect(byTestId('board-loading')).toBeTruthy();
      expect(screen.queryByTestId('empty-board')).toBeNull();
      expect(isDisabled(byTestId('create-board'))).toBe(true);
      update({ loading: false, readError: '磁盘已满' });
      expect(texts('board-read-error')[0]).toContain('读取看板数据失败：磁盘已满');
      fireEvent.click(byTestId('board-read-retry'));
      expect(state.retryReads).toHaveBeenCalledOnce();
      update({ readError: null, restoring: true });
      expect(byTestId('restoring-note')).toBeTruthy();
      expect(byTestId('restoring-badge').textContent).toBe('恢复中');
      expect(isDisabled(byTestId('create-board-empty'))).toBe(true);
    });

    it('选板事件、提示计时与跨午夜刷新', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      vi.setSystemTime(new Date(2026, 9, 28, 23, 59, 59));
      state = { ...state, tasks: [first, second, { ...third, dueDate: '2026-10-29' } as Task] };
      mount();
      fireEvent.change(byTestId('board-selector'), { target: { value: next.id } });
      expect(state.selectBoard).toHaveBeenCalledWith(next.id);
      expect((byTestId('board-selector') as HTMLSelectElement).value).toBe(boardId);
      expect(within(cardByTitle('C'), 'task-due').textContent).toBe('2026-10-29');

      fireEvent.click(byTestId('board-menu-trigger'));
      fireEvent.click(byTestId('export-backup'));
      expect(texts('board-notice')).toHaveLength(1);
      await act(async () => {
        fireEvent.keyDown(cardByTitle('A'), { key: 'ArrowDown', altKey: true });
        await Promise.resolve();
      });
      expect(texts('board-toast')).toHaveLength(1);
      act(() => vi.advanceTimersByTime(6000));
      expect(screen.queryByTestId('board-notice')).toBeNull();
      expect(screen.queryByTestId('board-toast')).toBeNull();
      expect(within(cardByTitle('C'), 'task-due').textContent).toBe('今天到期 2026-10-29');
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      expect(within(cardByTitle('C'), 'task-due').className).toContain('is-today');
    });

    it('非 Error 拒绝也转成提示；撤销 / 重做透传', async () => {
      mount();
      vi.mocked(actions.undo).mockRejectedValueOnce('字符串原因');
      fireEvent.click(byTestId('undo'));
      await waitFor(() => expect(texts('board-notice')).toEqual(['字符串原因']));
      fireEvent.click(byTestId('redo'));
      await waitFor(() => expect(actions.redo).toHaveBeenCalledOnce());
      vi.mocked(actions.moveTask).mockRejectedValueOnce('移动原因');
      fireEvent.keyDown(cardByTitle('A'), { key: 'ArrowRight', altKey: true });
      await waitFor(() => expect(texts('board-notice')).toEqual(['移动原因']));
      update({ undoCount: 0, redoCount: 0 });
      expect(isDisabled(byTestId('undo'))).toBe(true);
      expect(isDisabled(byTestId('redo'))).toBe(true);
    });

    it('生命周期读取跨页恢复标记并卸载监听', () => {
      mount();
      expect(state.setRestoring).toHaveBeenLastCalledWith(false);
      localStorage.setItem(RESTORING_MARKER_KEY, 'restoring');
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: RESTORING_MARKER_KEY }));
      });
      expect(state.setRestoring).toHaveBeenLastCalledWith(true);
      view.unmount();
      vi.mocked(state.setRestoring).mockClear();
      window.dispatchEvent(new StorageEvent('storage'));
      expect(state.setRestoring).not.toHaveBeenCalled();
    });
  });

  describe('搜索与拖拽', () => {
    const makeHandle = () => {
      const searchState = new BehaviorSubject<'idle' | 'loading' | 'success' | 'empty' | 'error'>('success');
      const error = new BehaviorSubject<SearchExecutionError | undefined>(undefined);
      const handle: SearchHandle = {
        state$: searchState,
        results$: of([result]),
        hasMore$: of(true),
        error$: error,
        setQuery: vi.fn(),
        loadMore: vi.fn(async () => undefined),
        retry: vi.fn(),
        clear: vi.fn(),
        destroy: vi.fn()
      };
      return { handle, searchState, error };
    };

    it('搜索：复用句柄、切板重建、点结果关闭对话框并定位高亮聚焦', async () => {
      const { handle, searchState, error } = makeHandle();
      const source = { search: vi.fn(() => handle) } as unknown as BoardSearchSource;
      state = { ...state, searchSource: source };
      mount();
      fireEvent.click(byTestId('search-open'));
      expect(byTestId('board-search-input').getAttribute('placeholder')).toBe('全文搜索标题与描述');
      typeInto(byTestId('board-search-input'), ' 搜索 ');
      typeInto(byTestId('board-search-input'), '新词');
      expect(source.search).toHaveBeenCalledWith('搜索');
      expect(handle.setQuery).toHaveBeenCalledWith('新词');
      fireEvent.click(byTestId('board-search-more'));
      expect(handle.loadMore).toHaveBeenCalledOnce();
      const hit = byTestId('board-search-result');
      expect(hit.querySelector('.rxb-search-result-title')?.textContent).toBe('A');
      expect(hit.querySelector('.rxb-search-result-column')?.textContent).toBe('first');
      expect(hit.querySelector('.rxb-search-result-snippet')?.textContent).toBe('匹配');

      act(() => searchState.next('loading'));
      expect(byTestId('board-search-loading')).toBeTruthy();
      act(() => {
        error.next(new SearchExecutionError('查询失败'));
        searchState.next('error');
      });
      expect(texts('board-search-error')[0]).toContain('查询失败');
      act(() => searchState.next('empty'));
      expect(byTestId('board-search-empty')).toBeTruthy();
      act(() => searchState.next('success'));

      const card = cardByTitle('A');
      card.scrollIntoView = vi.fn();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      act(() => searchState.next('loading'));
      act(() => searchState.next('success'));
      fireEvent.click(byTestId('board-search-result'));
      expect(screen.queryByTestId('board-search')).toBeNull();
      expect(card.scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'center' });
      expect(cardByTitle('A').className).toContain('is-search-hit');
      expect(document.activeElement).toBe(cardByTitle('A'));
      act(() => vi.advanceTimersByTime(2000));
      expect(cardByTitle('A').className).not.toContain('is-search-hit');
      vi.useRealTimers();

      fireEvent.change(byTestId('board-selector'), { target: { value: next.id } });
      expect(handle.destroy).toHaveBeenCalledOnce();
      expect(source.search).toHaveBeenCalledTimes(2);
      fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
      expect(inputValue('board-search-input')).toBe('新词');
      typeInto(byTestId('board-search-input'), '');
      expect(screen.queryByTestId('board-search-results')).toBeNull();
      expect(handle.destroy).toHaveBeenCalledTimes(2);
    });

    it('搜索更新中不可点结果、不可加载更多', () => {
      const { handle, searchState } = makeHandle();
      const source = { search: vi.fn(() => handle) } as unknown as BoardSearchSource;
      state = { ...state, searchSource: source };
      mount();
      fireEvent.click(byTestId('search-open'));
      typeInto(byTestId('board-search-input'), '词');
      const hit = byTestId('board-search-result');
      const more = byTestId('board-search-more');
      act(() => searchState.next('loading'));
      fireEvent.click(hit);
      fireEvent.click(more);
      expect(handle.loadMore).not.toHaveBeenCalled();
      expect(byTestId('board-search')).toBeTruthy();
      typeInto(byTestId('board-search-input'), '词', undefined);
      update({ searchSource: null, searchUnavailableReason: 'plugin_not_installed' });
      typeInto(byTestId('board-search-input'), '另一个');
      expect(source.search).toHaveBeenCalledOnce();
    });

    it('任务拖拽：落点反馈识别首尾与空列，筛选隐藏的卡片仍按完整序列取邻居、插入线只挂可见卡片', async () => {
      mount();
      const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => '') };
      fireEvent.dragStart(cardByTitle('A'), { dataTransfer });
      expect(dataTransfer.setData).toHaveBeenCalledWith('application/x-board-task', first.id);
      expect(cardByTitle('A').className).toContain('is-dragging');
      dragAt(cardByTitle('B'), 'dragOver', 10, 140);
      expect(cardByTitle('B').className).toContain('is-drop-after');
      expect(columnByTitle('first').className).toContain('is-drop-target');
      dragAt(cardByTitle('B'), 'dragOver', 10, 141);
      dragAt(columnByTitle('empty'), 'dragOver', 410, 100);
      expect(columnByTitle('empty').className).toContain('is-drop-end');
      dragAt(byTestId('board-view'), 'dragOver', -1, 45);
      expect(document.querySelector('.is-drop-end, .is-drop-target, .is-drop-after, .is-drop-before')).toBeNull();
      dragAt(columnByTitle('second'), 'drop', 210, 45, {
        getData: (type: string) => (type === 'application/x-board-task' ? first.id : '')
      });
      await waitFor(() =>
        expect(actions.moveTask).toHaveBeenCalledWith(first.id, expect.objectContaining({ columnId: secondColumn.id }))
      );
      expect(cardByTitle('A').className).not.toContain('is-dragging');

      fireEvent.dragStart(cardByTitle('C'), { dataTransfer });
      dragAt(cardByTitle('A'), 'dragOver', 10, 45);
      expect(cardByTitle('A').className).toContain('is-drop-before');
      fireEvent.dragEnd(cardByTitle('C'));
      expect(cardByTitle('A').className).not.toContain('is-drop-before');
      expect(cardByTitle('C').className).not.toContain('is-dragging');

      // 筛选隐藏 A：几何只取可见的 B，邻居仍取完整序列 [A, B]
      typeInto(byTestId('board-filter-input'), 'has:due');
      expect(titlesIn(columnByTitle('first'))).toEqual(['B']);
      fireEvent.dragStart(cardByTitle('C'), { dataTransfer });
      // 前邻居 A 被隐藏：插入线改挂在可见的 B 之前
      dragAt(cardByTitle('B'), 'dragOver', 10, 45);
      expect(cardByTitle('B').className).toContain('is-drop-before');
      dragAt(cardByTitle('B'), 'drop', 10, 45, { getData: () => '' });
      await waitFor(() =>
        expect(actions.moveTask).toHaveBeenLastCalledWith(third.id, {
          kind: 'between',
          columnId: firstColumn.id,
          prevId: first.id,
          nextId: second.id
        })
      );

      // 目标列的卡片全被筛掉：两侧邻居都不可见，插入线画在列尾
      typeInto(byTestId('board-filter-input'), 'label:标签');
      fireEvent.dragStart(cardByTitle('A'), { dataTransfer });
      dragAt(columnByTitle('second'), 'dragOver', 210, 100);
      expect(columnByTitle('second').className).toContain('is-drop-end');
      fireEvent.dragEnd(cardByTitle('A'));
      expect(columnByTitle('second').className).not.toContain('is-drop-end');
    });

    it('列拖拽与左右移：首尾不越界，列落点走领域动作', async () => {
      mount();
      const header = within(columnByTitle('first'), 'column-header');
      fireEvent.dragStart(header, { dataTransfer: { setData: vi.fn() } });
      expect(header.className).toContain('is-dragging');
      dragAt(columnByTitle('second'), 'dragOver', 370, 5);
      expect(within(columnByTitle('second'), 'column-header').className).toContain('is-drop-after');
      dragAt(columnByTitle('second'), 'dragOver', -100, 5);
      dragAt(columnByTitle('second'), 'drop', 370, 5, {
        getData: (type: string) => (type === 'application/x-board-column' ? firstColumn.id : '')
      });
      await waitFor(() =>
        expect(actions.moveColumn).toHaveBeenCalledWith(firstColumn.id, {
          prevId: secondColumn.id,
          nextId: emptyColumn.id
        })
      );
      expect(header.className).not.toContain('is-dragging');
      dragAt(byTestId('board-view'), 'drop', 10, 5);
      dragAt(columnByTitle('second'), 'dragOver', 10, 5);
      dragAt(columnByTitle('second'), 'drop', 10, 5);
      await flush();
      expect(actions.moveColumn).toHaveBeenCalledOnce();
      expect(actions.moveTask).not.toHaveBeenCalled();
      fireEvent.keyDown(cardByTitle('A'), { key: 'ArrowUp', altKey: true });
      await flush();
      expect(actions.moveTask).not.toHaveBeenCalled();
    });
  });
});
