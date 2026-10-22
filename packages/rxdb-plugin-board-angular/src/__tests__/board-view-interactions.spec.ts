import { type UUID } from '@aiao/rxdb';
import {
  Board,
  BoardLabel,
  Column,
  RESTORING_MARKER_KEY,
  Task,
  type BoardSearchSource,
  type SearchHandle,
  type SearchResult,
  type TaskDraftSnapshot
} from '@aiao/rxdb-plugin-board';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardViewComponent } from '../board-view.js';
import type { UseBoardActions, UseBoardReturn } from '../use-board.js';

let installed: UseBoardReturn;

const id = (value: string) => value as UUID;
const boardId = id('board');
const makeColumn = (value: string) => ({ id: id(value), boardId, title: value }) as Column;
const makeTask = (value: string, columnId: UUID) =>
  ({ id: id(value), columnId, title: value, dueDate: null, description: null }) as Task;
const firstColumn = makeColumn('first');
const secondColumn = makeColumn('second');
const emptyColumn = makeColumn('empty');
const first = makeTask('A', firstColumn.id);
const second = makeTask('B', firstColumn.id);
const third = makeTask('C', secondColumn.id);
const label = { id: id('label'), name: '标签', color: '#ffffff', boardId } as BoardLabel;
const current = { id: boardId, title: '板' } as Board;
const snapshot: TaskDraftSnapshot = {
  title: first.title,
  columnId: first.columnId,
  description: null,
  dueDate: null,
  labelIds: []
};
const result = { id: first.id, collection: 'Task', rank: 1, snippet: '匹配' } as SearchResult;

describe('Angular 看板交互边界', () => {
  let view: BoardViewComponent;
  let actions: UseBoardActions;
  let area: HTMLElement;

  beforeEach(() => {
    window.confirm = vi.fn(() => true);
    window.prompt = vi.fn(() => null);
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    actions = {
      createBoard: vi.fn(async () => current),
      createColumn: vi.fn(async () => firstColumn),
      createTask: vi.fn(async () => first),
      updateBoard: vi.fn(async () => current),
      updateColumn: vi.fn(async () => firstColumn),
      updateTaskTitle: vi.fn(async () => first),
      openSnapshot: vi.fn(async () => snapshot),
      saveTaskDraft: vi.fn(async () => ({ kind: 'unchanged' as const })),
      planTaskDelete: vi.fn(async () => ({
        kind: 'task' as const,
        taskId: first.id,
        taskTitle: first.title,
        taskLabelIds: []
      })),
      planColumnDelete: vi.fn(async () => ({
        kind: 'column' as const,
        columnId: firstColumn.id,
        columnTitle: firstColumn.title,
        taskIds: [first.id, second.id],
        taskLabelIds: []
      })),
      planBoardDelete: vi.fn(async () => ({
        kind: 'board' as const,
        boardId,
        boardTitle: current.title,
        columnIds: [firstColumn.id],
        taskIds: [first.id],
        taskLabelIds: [],
        boardLabelIds: []
      })),
      executeDelete: vi.fn(async () => undefined),
      moveTask: vi.fn(async () => undefined),
      moveColumn: vi.fn(async () => undefined),
      sortColumn: vi.fn(async () => ({ written: true })),
      createLabel: vi.fn(async () => label),
      renameLabel: vi.fn(async () => label),
      recolorLabel: vi.fn(async () => label),
      planLabelDelete: vi.fn(async () => ({ labelId: label.id, labelName: label.name, taskLabelIds: [] })),
      executeLabelDelete: vi.fn(async () => undefined),
      undo: vi.fn(async () => undefined),
      redo: vi.fn(async () => undefined)
    };
    installed = {
      boards: signal([current]),
      currentBoardId: signal(boardId),
      currentBoard: signal(current),
      columns: signal([firstColumn, secondColumn, emptyColumn]),
      tasks: signal([first, second, third]),
      labels: signal([label]),
      taskLabels: signal(new Map([[first.id, [label]]])),
      restoring: signal(false),
      undoCount: signal(1),
      redoCount: signal(0),
      writeEvent: signal(null),
      searchSource: null,
      selectBoard: vi.fn(),
      setRestoring: vi.fn(),
      actions
    };
    view = TestBed.runInInjectionContext(() => new BoardViewComponent());
    view['board'].set(installed);
    const focusMovedCard = view['focusMovedCard'].bind(view);
    vi.spyOn(view as unknown as { focusMovedCard(taskId: UUID): void }, 'focusMovedCard').mockImplementation(taskId =>
      focusMovedCard(taskId, 0)
    );
    area = document.createElement('div');
    area.innerHTML = `<section data-column-id="first"><header data-column-header-id="first"></header><div tabindex="0" data-task-id="A"></div><div data-task-id="B"></div></section><section data-column-id="second"><header data-column-header-id="second"></header><div data-task-id="C"></div></section><section data-column-id="empty"><header data-column-header-id="empty"></header></section>`;
    document.body.append(area);
    Object.defineProperty(view, 'boardArea', { value: signal({ nativeElement: area }) });
    for (const [index, column] of [...area.children].entries()) {
      vi.spyOn(column, 'getBoundingClientRect').mockReturnValue(new DOMRect(index * 200, 0, 180, 300));
      const header = column.querySelector('header')!;
      vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(new DOMRect(index * 200, 0, 180, 30));
      for (const [cardIndex, card] of [...column.querySelectorAll('[data-task-id]')].entries()) {
        vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(index * 200, 40 + cardIndex * 60, 180, 50));
      }
    }
  });

  afterEach(() => {
    view.ngOnDestroy();
    area.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('生命周期读取跨页恢复标记并卸载监听', () => {
    window.addEventListener('storage', view['onBoardStorage']);
    view['onBoardStorage']();
    expect(installed.setRestoring).toHaveBeenLastCalledWith(false);
    vi.mocked(localStorage.getItem).mockReturnValue('restoring');
    window.dispatchEvent(new StorageEvent('storage', { key: RESTORING_MARKER_KEY }));
    expect(installed.setRestoring).toHaveBeenLastCalledWith(true);
    view.ngOnDestroy();
    vi.mocked(installed.setRestoring).mockClear();
    window.dispatchEvent(new StorageEvent('storage'));
    expect(installed.setRestoring).not.toHaveBeenCalled();
  });

  it('创建和改名取消零调用，确认透传领域动作', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    await view['createBoard']();
    await view['createColumn']();
    await view['renameBoard']();
    await view['renameColumn'](firstColumn.id);
    expect(actions.createBoard).not.toHaveBeenCalled();
    prompt.mockReturnValue('修改');
    await view['createBoard']();
    await view['createColumn']();
    await view['renameBoard']();
    await view['renameColumn'](firstColumn.id);
    expect(actions.createBoard).toHaveBeenCalledWith({ title: '修改' });
    expect(actions.updateBoard).toHaveBeenCalledWith(boardId, { title: '修改' });
    expect(actions.updateColumn).toHaveBeenCalledWith(firstColumn.id, { title: '修改' });
    await view['renameColumn'](id('missing'));
    view['board'].set({ ...installed, currentBoard: signal(null) });
    await view['renameBoard']();
  });

  it('内联创建和标题修改失败保留草稿，成功或取消收起', async () => {
    await view['commitAddTask']();
    view['openAddTask'](firstColumn.id);
    view['addTaskTitle'].set(' ');
    await view['commitAddTask']();
    expect(actions.createTask).not.toHaveBeenCalled();
    view['openAddTask'](firstColumn.id);
    view['addTaskTitle'].set('新任务');
    vi.mocked(actions.createTask).mockRejectedValueOnce('创建失败');
    await view['commitAddTask']();
    expect(view['addTaskTitle']()).toBe('新任务');
    await view['commitAddTask']();
    expect(view['addTaskColumnId']()).toBeNull();
    await view['startEditTitle'](first);
    vi.mocked(actions.updateTaskTitle).mockRejectedValueOnce(new Error('改名失败'));
    await view['commitEditTitle'](first);
    expect(view['editTitle']()).toBe(first.id);
    await view['commitEditTitle'](first);
    expect(view['editTitle']()).toBeNull();
    await view['startEditTitle'](second);
    view['cancelEditTitle']();
    expect(view['editTitle']()).toBeNull();
  });

  it('详情脏检查覆盖所有草稿字段，关闭和切板尊重确认', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await view['openDetail'](first.id);
    for (const [field, value] of [
      ['draftDescription', '说明'],
      ['draftDueDate', '2030-01-01']
    ] as const) {
      view[field].set(value);
      expect(view['isDetailDirty']()).toBe(true);
      view[field].set('');
    }
    view['toggleDraftLabel'](label.id);
    expect(view['isDetailDirty']()).toBe(true);
    view['toggleDraftLabel'](label.id);
    expect(view['isDetailDirty']()).toBe(false);
    view['detailDraftTitle'].set('草稿');
    view['closeDetail']();
    view['onSelectBoard'](id('other'));
    expect(view['detailTaskId']()).toBe(first.id);
    expect(installed.selectBoard).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    view['onSelectBoard'](id('other'));
    expect(view['detailTaskId']()).toBeNull();
    expect(installed.selectBoard).toHaveBeenCalledWith(id('other'));
    await view['openDetail'](first.id);
    view['closeDetail']();
    expect(view['isDetailDirty']()).toBe(false);
  });

  it('详情保存失败保留全部草稿，执行中阻止重复提交', async () => {
    await view['saveDetail']();
    await view['openDetail'](first.id);
    view['detailDraftTitle'].set('修改');
    view['draftDueDate'].set('2030-01-01');
    vi.mocked(actions.saveTaskDraft).mockRejectedValueOnce(new Error('保存失败'));
    await view['saveDetail']();
    expect(view['detailTaskId']()).toBe(first.id);
    view['savingDetail'].set(true);
    await view['saveDetail']();
    expect(actions.saveTaskDraft).toHaveBeenCalledTimes(1);
    view['savingDetail'].set(false);
    await view['saveDetail']();
    expect(actions.saveTaskDraft).toHaveBeenLastCalledWith(
      first.id,
      snapshot,
      expect.objectContaining({ dueDate: '2030-01-01' })
    );
    expect(view['detailTaskId']()).toBeNull();
  });

  it('重新点击当前任务使其他任务的迟到详情失效', async () => {
    await view['openDetail'](first.id);
    let complete!: (value: TaskDraftSnapshot) => void;
    vi.mocked(actions.openSnapshot).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          complete = resolve;
        })
    );
    const opening = view['openDetail'](second.id);
    await view['openDetail'](first.id);
    complete({ ...snapshot, title: second.title });
    await opening;
    expect(view['detailTaskId']()).toBe(first.id);
    expect(view['detailDraftTitle']()).toBe(first.title);
  });

  it('保存中再次点击当前任务仍完成当前详情会话', async () => {
    await view['openDetail'](first.id);
    let complete!: () => void;
    vi.mocked(actions.saveTaskDraft).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          complete = () => resolve({ kind: 'unchanged' });
        })
    );
    const saving = view['saveDetail']();
    await view['openDetail'](first.id);
    complete();
    await saving;
    expect(view['detailTaskId']()).toBeNull();
  });

  it('旧任务保存完成不能关闭新打开的任务详情', async () => {
    await view['openDetail'](first.id);
    view['detailDraftTitle'].set('保存中的草稿');
    let complete!: () => void;
    vi.mocked(actions.saveTaskDraft).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          complete = () => resolve({ kind: 'unchanged' });
        })
    );
    const saving = view['saveDetail']();
    await view['openDetail'](second.id);
    complete();
    await saving;
    expect(view['detailTaskId']()).toBe(second.id);
    expect(view['savingDetail']()).toBe(false);
  });

  it('菜单移动原位零写，失败提示且不变更快照', async () => {
    await view['moveTaskByMenu']();
    await view['openDetail'](first.id);
    await view['moveTaskByMenu']();
    expect(actions.moveTask).not.toHaveBeenCalled();
    expect(view['notice']()).toContain('已在该位置');
    view['moveColumnId'].set(secondColumn.id);
    vi.mocked(actions.moveTask).mockRejectedValueOnce('移动失败');
    await view['moveTaskByMenu']();
    expect(view['notice']()).toBe('移动失败');
    expect(view['snapshot']?.columnId).toBe(firstColumn.id);
    await view['moveTaskByMenu']();
    expect(view['snapshot']?.columnId).toBe(secondColumn.id);
    expect(document.activeElement?.getAttribute('data-task-id')).toBe(first.id);
  });

  it('任务、列和整板删除执行原确认计划，缺少目标时零调用', async () => {
    await view['deleteDetailTask']();
    await view['executeConfirmedDelete']();
    await view['confirmTaskDelete'](first);
    const taskPlan = await vi.mocked(actions.planTaskDelete).mock.results[0].value;
    await view['executeConfirmedDelete']();
    expect(actions.executeDelete).toHaveBeenLastCalledWith(taskPlan);
    await view['confirmColumnDelete'](firstColumn);
    await view['executeConfirmedDelete']();
    expect(actions.planColumnDelete).toHaveBeenCalledOnce();
    await view['confirmBoardDelete']();
    await view['executeConfirmedDelete']();
    expect(actions.planBoardDelete).toHaveBeenCalledOnce();
    await view['openDetail'](first.id);
    await view['deleteDetailTask']();
    view['cancelDelete']();
    expect(view['confirmDelete']()).toBeNull();
    view['detailTaskId'].set(id('missing'));
    await view['deleteDetailTask']();
    view['board'].set({ ...installed, currentBoard: signal(null) });
    await view['confirmBoardDelete']();
  });

  it('标签创建取消、改名、删除确认透传，未知标签零调用', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    await view['createLabel']();
    await view['renameLabel'](label.id);
    await view['renameLabel'](id('missing'));
    prompt.mockReturnValueOnce('名称').mockReturnValueOnce(null);
    await view['createLabel']();
    expect(actions.createLabel).not.toHaveBeenCalled();
    prompt.mockReturnValueOnce('名称').mockReturnValueOnce('#123456').mockReturnValueOnce('新名称');
    await view['createLabel']();
    await view['renameLabel'](label.id);
    expect(actions.createLabel).toHaveBeenCalledWith({ name: '名称', color: '#123456' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await view['deleteLabel'](label.id);
    expect(actions.executeLabelDelete).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await view['deleteLabel'](label.id);
    expect(actions.executeLabelDelete).toHaveBeenCalledOnce();
  });

  it('历史和导出入口透传，提示自动清除', async () => {
    vi.useFakeTimers();
    await view['undo']();
    await view['redo']();
    await view['onExportBackup']();
    expect(actions.undo).toHaveBeenCalledOnce();
    expect(actions.redo).toHaveBeenCalledOnce();
    expect(view['notice']()).toContain('宿主接线');
    const callback = vi.fn();
    Object.defineProperty(view, 'exportBackup', { value: () => callback });
    await view['onExportBackup']();
    expect(callback).toHaveBeenCalledOnce();
    vi.mocked(actions.undo).mockRejectedValueOnce(new Error('第一次')).mockRejectedValueOnce('第二次');
    await view['undo']();
    await view['undo']();
    expect(view['notice']()).toBe('第二次');
    vi.advanceTimersByTime(5000);
    expect(view['notice']()).toBeNull();
  });

  it('日期提示使用本地日期，标签缺省为空', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 23, 12));
    expect(view['dueDateText'](first)).toBe('');
    expect(view['dueDateText']({ dueDate: '2026-10-22' } as Task)).toBe('已逾期 2026-10-22');
    expect(view['dueDateText']({ dueDate: '2026-10-23' } as Task)).toBe('今天到期 2026-10-23');
    expect(view['dueDateText']({ dueDate: '2026-10-24' } as Task)).toBe('2026-10-24');
    expect(view['labelsOf'](first.id)).toEqual([label]);
    expect(view['labelsOf'](second.id)).toEqual([]);
    expect(view['labelTextColor']('#ffffff')).toBeDefined();
    view['board'].set(null);
    expect(view['labelsOf'](first.id)).toEqual([]);
    expect(view['taskMap']().size).toBe(0);
    expect(() => view['boardRef']).toThrow('尚未安装');
  });

  it('搜索复用句柄，切板重建，清空和销毁取消订阅', () => {
    const state = new BehaviorSubject<'idle' | 'loading' | 'success' | 'empty' | 'error'>('success');
    const handle: SearchHandle = {
      state$: state,
      results$: of([result]),
      hasMore$: of(true),
      error$: of(undefined),
      setQuery: vi.fn(),
      loadMore: vi.fn(async () => undefined),
      retry: vi.fn(),
      clear: vi.fn(),
      destroy: vi.fn()
    };
    const source = { search: vi.fn(() => handle) } as unknown as BoardSearchSource;
    view['onSearchInput']('无能力');
    view['board'].set({ ...installed, searchSource: source });
    view['onSearchInput'](' 搜索 ');
    view['onSearchInput']('新词');
    expect(source.search).toHaveBeenCalledWith('搜索');
    expect(handle.setQuery).toHaveBeenCalledWith('新词');
    view['onSearchMore']();
    expect(handle.loadMore).toHaveBeenCalledOnce();
    state.next('loading');
    view['onSearchMore']();
    view['onSearchResultClick'](result);
    expect(handle.loadMore).toHaveBeenCalledOnce();
    expect(view['searchHighlightId']()).toBeNull();
    view['onSelectBoard'](id('other'));
    expect(handle.destroy).toHaveBeenCalledOnce();
    view['onSearchInput']('');
    expect(view['searchResults']()).toEqual([]);
    state.next('success');
    expect(view['searchState']()).toBe('idle');
  });

  it('搜索结果定位和列标题取当前实体，过时高亮不会清除较新结果', () => {
    vi.useFakeTimers();
    const card = area.querySelector<HTMLElement>('[data-task-id="A"]')!;
    const scroll = vi.fn();
    card.scrollIntoView = scroll;
    view['onSearchResultClick'](result);
    expect(scroll).toHaveBeenCalledWith({ block: 'center' });
    expect(view['searchColumnTitle'](result)).toBe('first');
    expect(view['searchResultTitle'](result)).toBe('A');
    expect(view['searchColumnTitle']({ ...result, id: 'missing' })).toBe('');
    expect(view['searchResultTitle']({ ...result, id: 'missing' })).toBe('');
    vi.advanceTimersByTime(1000);
    view['onSearchResultClick']({ ...result, id: second.id });
    vi.advanceTimersByTime(1000);
    expect(view['searchHighlightId']()).toBe(second.id);
    vi.advanceTimersByTime(1000);
    expect(view['searchHighlightId']()).toBeNull();
  });

  const drag = (x: number, y: number, value?: string) =>
    ({
      clientX: x,
      clientY: y,
      preventDefault: vi.fn(),
      dataTransfer: { setData: vi.fn(), getData: vi.fn(() => value ?? '') }
    }) as unknown as DragEvent;

  it('任务拖拽反馈识别首尾与空列，丢弃非法和原位落点', async () => {
    view['onTaskDragOver'](drag(10, 50));
    const event = drag(10, 50, first.id);
    view['onTaskDragStart'](event, first);
    expect(event.dataTransfer?.setData).toHaveBeenCalledWith('application/x-board-task', first.id);
    expect(view['isDraggingTask'](first)).toBe(true);
    view['onTaskDragOver'](drag(10, 105));
    expect(view['isDropBefore'](second)).toBe(false);
    view['onTaskDragOver'](drag(10, 140));
    expect(view['isDropAfter'](second)).toBe(true);
    view['onTaskDragOver'](drag(410, 100));
    expect(view['isDropEnd'](emptyColumn)).toBe(true);
    view['onTaskDragOver'](drag(210, 45));
    expect(view['isDropBefore'](third)).toBe(true);
    view['onTaskDragOver'](drag(-1, 45));
    expect(view['dropTarget']()).toBeNull();
    await view['onTaskDrop'](drag(210, 45, first.id), secondColumn);
    expect(actions.moveTask).toHaveBeenCalledWith(first.id, expect.objectContaining({ columnId: secondColumn.id }));
    expect(view['isDraggingTask'](first)).toBe(false);
    await view['onTaskDrop'](drag(-1, 50, first.id), firstColumn);
    view['dragging'].set(null);
    await view['onTaskDrop'](drag(0, 0) as DragEvent, firstColumn);
  });

  it('列拖拽反馈和键盘移动共享相邻目标，本列排序阻止重复调用', async () => {
    view['onColumnDragOver'](drag(210, 5));
    view['onColumnDragStart'](drag(10, 5), firstColumn);
    expect(view['isDraggingColumn'](firstColumn)).toBe(true);
    view['onTaskDragOver'](drag(210, 50));
    view['onColumnDragOver'](drag(210, 5));
    expect(view['isColumnDropBefore'](secondColumn)).toBe(false);
    view['onColumnDragOver'](drag(370, 5));
    expect(view['isColumnDropAfter'](secondColumn)).toBe(true);
    view['onColumnDragOver'](drag(410, 5));
    expect(view['isColumnDropAfter'](secondColumn)).toBe(true);
    view['onColumnDragStart'](drag(410, 5), emptyColumn);
    view['onColumnDragOver'](drag(10, 5));
    expect(view['isColumnDropBefore'](firstColumn)).toBe(true);
    view['onColumnDragStart'](drag(10, 5), firstColumn);
    view['onColumnDragOver'](drag(-1, 5));
    expect(view['dropTarget']()).toBeNull();
    await view['onColumnDrop'](drag(370, 5, firstColumn.id));
    expect(actions.moveColumn).toHaveBeenCalled();
    await view['onColumnDrop'](drag(-1, 0, firstColumn.id));
    await view['onColumnDrop'](drag(0, 0));
    await view['moveColumnBy'](id('missing'), 1);
    await view['moveColumnBy'](firstColumn.id, -1);
    await view['moveColumnBy'](emptyColumn.id, 1);
    await view['moveColumnBy'](secondColumn.id, -1);
    await view['moveColumnBy'](secondColumn.id, 1);
    view['sortingColumnId'].set(firstColumn.id);
    await view['sortColumnBy'](firstColumn.id, 'title');
    expect(actions.sortColumn).not.toHaveBeenCalled();
    view['sortingColumnId'].set(null);
    vi.mocked(actions.sortColumn).mockResolvedValueOnce({ written: false });
    await view['sortColumnBy'](firstColumn.id, 'title');
    expect(view['notice']()).toContain('无变化');
    vi.mocked(actions.sortColumn).mockRejectedValueOnce(new Error('排序失败'));
    await view['sortColumnBy'](firstColumn.id, 'dueDate');
    expect(view['sortingColumnId']()).toBeNull();
  });
});
