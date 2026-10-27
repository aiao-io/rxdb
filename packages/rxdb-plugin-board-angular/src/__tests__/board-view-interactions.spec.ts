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
const makeTask = (value: string, columnId: UUID, extra: Partial<Task> = {}) =>
  ({ id: id(value), columnId, title: value, dueDate: null, description: null, ...extra }) as Task;
const firstColumn = makeColumn('first');
const secondColumn = makeColumn('second');
const emptyColumn = makeColumn('empty');
const first = makeTask('A', firstColumn.id);
const second = makeTask('B', firstColumn.id, { dueDate: '2000-01-01' });
const third = makeTask('C', secondColumn.id);
const label = { id: id('label'), name: '标签', color: '#ffffff', boardId } as BoardLabel;
const other = { id: id('other-label'), name: '文档', color: '#2563eb', boardId } as BoardLabel;
const current = { id: boardId, title: '板', description: null } as Board;
const snapshot: TaskDraftSnapshot = {
  title: first.title,
  columnId: first.columnId,
  description: null,
  dueDate: null,
  labelIds: []
};
const result = { id: first.id, collection: 'Task', rank: 1, snippet: '匹配' } as SearchResult;

const keydown = (key: string, init: KeyboardEventInit = {}, target?: HTMLElement): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  if (target) {
    Object.defineProperty(event, 'target', { value: target });
    Object.defineProperty(event, 'currentTarget', { value: target });
  }
  return event;
};

const clickOn = (element: HTMLElement): Event => {
  const event = new MouseEvent('click');
  Object.defineProperty(event, 'currentTarget', { value: element });
  return event;
};

describe('Angular 看板交互边界（看板 v2）', () => {
  let view: BoardViewComponent;
  let actions: UseBoardActions;
  let area: HTMLElement;
  let trigger: HTMLButtonElement;

  beforeEach(() => {
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
      saveTaskFields: vi.fn(async () => ({ kind: 'saved' as const, task: first })),
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
      createLabel: vi.fn(async () => other),
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
      labels: signal([label, other]),
      taskLabels: signal(new Map([[first.id, [label]]])),
      restoring: signal(false),
      undoCount: signal(1),
      redoCount: signal(0),
      writeEvent: signal(null),
      searchSource: null,
      searchUnavailableReason: null,
      loading: signal(false),
      readError: signal(null),
      retryReads: vi.fn(),
      selectBoard: vi.fn(),
      setRestoring: vi.fn(),
      actions
    };
    view = TestBed.runInInjectionContext(() => new BoardViewComponent());
    view['board'].set(installed);
    area = document.createElement('section');
    area.innerHTML = `<section data-column-id="first"><header data-column-header-id="first"></header><article tabindex="0" data-task-id="A"></article><article tabindex="-1" data-task-id="B"></article></section><section data-column-id="second"><header data-column-header-id="second"></header><article tabindex="-1" data-task-id="C"></article></section><section data-column-id="empty"><header data-column-header-id="empty"></header></section><input data-testid="board-filter-input" />`;
    document.body.append(area);
    trigger = document.createElement('button');
    area.append(trigger);
    Object.defineProperty(view, 'boardArea', { value: signal({ nativeElement: area }) });
    for (const [index, column] of [...area.querySelectorAll('section')].entries()) {
      vi.spyOn(column, 'getBoundingClientRect').mockReturnValue(new DOMRect(index * 200, 0, 180, 300));
      const header = column.querySelector('header')!;
      vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(new DOMRect(index * 200, 0, 180, 30));
      for (const [cardIndex, card] of [...column.querySelectorAll('[data-task-id]')].entries()) {
        vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(index * 200, 40 + cardIndex * 60, 180, 50));
      }
    }
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(300, 100, 32, 32));
  });

  afterEach(() => {
    view.ngOnDestroy();
    area.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('详情侧栏（即改即存）', () => {
    it('字段提交只发补丁、成功后以最新快照为基线，未改动零调用', async () => {
      await view['openDetail'](first.id);
      await view['commitDetailTitle']();
      expect(actions.saveTaskFields).not.toHaveBeenCalled();

      vi.mocked(actions.openSnapshot).mockResolvedValueOnce({ ...snapshot, title: '新标题' });
      view['detailTitle'].set(' 新标题 ');
      await view['commitDetailTitle']();
      expect(actions.saveTaskFields).toHaveBeenCalledWith(first.id, snapshot, { title: ' 新标题 ' });
      expect(view['detailBase']()?.title).toBe('新标题');
      expect(view['detailTitle']()).toBe('新标题');
      expect(view['detailStatus']()).toBe('已保存');

      await view['commitDetailDue']('2026-12-01');
      expect(actions.saveTaskFields).toHaveBeenLastCalledWith(first.id, expect.anything(), { dueDate: '2026-12-01' });
      view['detailDescription'].set('描述');
      await view['commitDetailDescription']();
      expect(actions.saveTaskFields).toHaveBeenLastCalledWith(first.id, expect.anything(), { description: '描述' });
    });

    it('回车后紧跟失焦：提交串行，第二次读到新基线而零调用', async () => {
      await view['openDetail'](first.id);
      vi.mocked(actions.openSnapshot).mockResolvedValue({ ...snapshot, title: '改' });
      view['detailTitle'].set('改');
      const enter = view['commitDetailTitle']();
      const blur = view['commitDetailTitle']();
      await Promise.all([enter, blur]);
      expect(actions.saveTaskFields).toHaveBeenCalledOnce();
    });

    it('保存失败保留草稿并提示（空标题等由领域拒绝）', async () => {
      await view['openDetail'](first.id);
      vi.mocked(actions.saveTaskFields).mockRejectedValueOnce(new Error('标题不能为空'));
      view['detailTitle'].set('   ');
      await view['commitDetailTitle']();
      expect(view['detailTitle']()).toBe('   ');
      expect(view['notice']()).toBe('标题不能为空');
      expect(view['detailStatus']()).toBeNull();
    });

    it('Esc 还原标题与描述，不提交', async () => {
      await view['openDetail'](first.id);
      view['detailTitle'].set('草稿');
      view['revertDetailTitle'](new Event('keydown'));
      expect(view['detailTitle']()).toBe(first.title);
      view['detailDescription'].set('草稿');
      view['onDetailDescriptionKeydown'](keydown('Escape'));
      expect(view['detailDescription']()).toBe('');
      expect(actions.saveTaskFields).not.toHaveBeenCalled();
    });

    it('迟到的详情快照：较新选择优先；所属列被删后不再打开', async () => {
      let resolveFirst!: (value: TaskDraftSnapshot) => void;
      vi.mocked(actions.openSnapshot).mockReturnValueOnce(new Promise(done => (resolveFirst = done)));
      const stale = view['openDetail'](first.id);
      await view['openDetail'](third.id);
      resolveFirst(snapshot);
      await stale;
      expect(view['detailTaskId']()).toBe(third.id);

      let resolveLate!: (value: TaskDraftSnapshot) => void;
      vi.mocked(actions.openSnapshot).mockReturnValueOnce(new Promise(done => (resolveLate = done)));
      view['closeDetail']();
      const opening = view['openDetail'](first.id);
      await view['confirmColumnDelete'](firstColumn);
      await view['executeConfirmedDelete']();
      resolveLate(snapshot);
      await opening;
      expect(view['detailTaskId']()).toBeNull();
    });

    it('删除整板关闭已失效的详情并给出可撤销提示', async () => {
      await view['openDetail'](first.id);
      await view['confirmBoardDelete']();
      expect(view['dialog']()?.kind).toBe('confirm-delete');
      await view['executeConfirmedDelete']();
      expect(view['detailTaskId']()).toBeNull();
      expect(view['toast']()).toEqual({ message: '已删除看板「板」', undoable: true });
    });

    it('标签选择器：多选只改草稿，关闭时一次提交；就地创建的标签自动选中', async () => {
      await view['openDetail'](first.id);
      view['openDetailLabelPicker'](clickOn(trigger));
      expect(view['popover']()?.kind).toBe('detail-label-picker');
      await view['choosePickerOption'](label.id);
      expect(actions.saveTaskFields).not.toHaveBeenCalled();
      view['onPickerInput']('新标签');
      expect(view['canCreateLabelFromPicker']()).toBe(true);
      await view['createLabelFromPicker']();
      expect(actions.createLabel).toHaveBeenCalledWith({ name: '新标签', color: expect.stringMatching(/^#/) });
      view['closePopover']();
      await vi.waitFor(() =>
        expect(actions.saveTaskFields).toHaveBeenCalledWith(first.id, expect.anything(), {
          labelIds: [label.id, other.id]
        })
      );
    });

    it('标签选择器未改动关闭零调用；所在列选择器移到列尾且焦点留在侧栏', async () => {
      await view['openDetail'](first.id);
      view['openDetailLabelPicker'](clickOn(trigger));
      view['closePopover']();
      await Promise.resolve();
      expect(actions.saveTaskFields).not.toHaveBeenCalled();

      view['openDetailColumnPicker'](clickOn(trigger));
      await view['choosePickerOption'](secondColumn.id);
      expect(actions.moveTask).toHaveBeenCalledWith(first.id, {
        kind: 'between',
        columnId: secondColumn.id,
        prevId: third.id,
        nextId: null
      });
      expect(view['detailBase']()?.columnId).toBe(secondColumn.id);
      expect(view['toast']()?.message).toBe('已移动到「second」');
    });
  });

  describe('卡片菜单与键盘', () => {
    it('菜单开关：同一触发器再点关闭，外部点击关闭并不抢焦点', () => {
      view['openTaskMenu'](clickOn(trigger), first);
      expect(view['popover']()).toMatchObject({ kind: 'task-menu', targetId: first.id, width: 240 });
      view['openTaskMenu'](clickOn(trigger), first);
      expect(view['popover']()).toBeNull();

      view['openColumnMenu'](clickOn(trigger), firstColumn);
      const outside = document.createElement('div');
      document.body.append(outside);
      view['onDocumentPointerdown']({ target: outside } as unknown as PointerEvent);
      expect(view['popover']()).toBeNull();
      outside.remove();
    });

    it('移到列选择器：移到目标列末尾；原位零写；失败提示不移动', async () => {
      view['openTaskMenu'](clickOn(trigger), first);
      view['openMovePicker'](first);
      expect(view['popover']()?.kind).toBe('move-picker');
      expect(view['pickerOptions']().find(option => option.selected)?.id).toBe(firstColumn.id);
      await view['choosePickerOption'](emptyColumn.id);
      expect(actions.moveTask).toHaveBeenCalledWith(first.id, { kind: 'end', columnId: emptyColumn.id });

      view['openMovePicker'](second);
      await view['choosePickerOption'](firstColumn.id);
      expect(actions.moveTask).toHaveBeenCalledOnce();

      vi.mocked(actions.moveTask).mockRejectedValueOnce(new Error('移动失败'));
      await view['moveTaskBy'](first, 'down');
      expect(view['notice']()).toBe('移动失败');
    });

    it('方向键移动焦点、Alt + 方向键移动卡片、Enter / F2 / Del / Shift+F10', async () => {
      const cardA = area.querySelector<HTMLElement>('[data-task-id="A"]')!;
      view['onCardKeydown'](keydown('ArrowDown', {}, cardA), first);
      expect(document.activeElement?.getAttribute('data-task-id')).toBe('B');
      view['onCardKeydown'](keydown('ArrowRight', {}, cardA), first);
      expect(document.activeElement?.getAttribute('data-task-id')).toBe('C');

      view['onCardKeydown'](keydown('ArrowDown', { altKey: true }, cardA), first);
      await vi.waitFor(() =>
        expect(actions.moveTask).toHaveBeenCalledWith(first.id, {
          kind: 'between',
          columnId: firstColumn.id,
          prevId: second.id,
          nextId: null
        })
      );

      view['onCardKeydown'](keydown('Enter', {}, cardA), first);
      await vi.waitFor(() => expect(view['detailTaskId']()).toBe(first.id));
      view['onCardKeydown'](keydown('F2', {}, cardA), first);
      expect(view['editingTaskId']()).toBe(first.id);
      view['onCardKeydown'](keydown('Delete', {}, cardA), first);
      await vi.waitFor(() => expect(view['dialog']()?.kind).toBe('confirm-delete'));
      view['onCardKeydown'](keydown('F10', { shiftKey: true }, cardA), first);
      expect(view['popover']()?.kind).toBe('task-menu');

      const inner = document.createElement('input');
      const ignored = keydown('ArrowDown');
      Object.defineProperty(ignored, 'target', { value: inner });
      Object.defineProperty(ignored, 'currentTarget', { value: cardA });
      view['onCardKeydown'](ignored, first);
      expect(ignored.defaultPrevented).toBe(false);
    });

    it('全局快捷键：/ 聚焦筛选、? 打开快捷键、⌘Z / ⇧⌘Z、Esc 由内向外关闭', async () => {
      document.addEventListener('keydown', view['onDocumentKeydown']);
      try {
        document.body.dispatchEvent(keydown('/'));
        expect(document.activeElement?.getAttribute('data-testid')).toBe('board-filter-input');
        (document.activeElement as HTMLElement).blur();
        document.body.dispatchEvent(keydown('?'));
        expect(view['dialog']()?.kind).toBe('shortcuts');
        document.body.dispatchEvent(keydown('Escape'));
        expect(view['dialog']()).toBeNull();
        document.body.dispatchEvent(keydown('z', { metaKey: true }));
        document.body.dispatchEvent(keydown('z', { metaKey: true, shiftKey: true }));
        await vi.waitFor(() => expect(actions.redo).toHaveBeenCalledOnce());
        expect(actions.undo).toHaveBeenCalledOnce();

        await view['openDetail'](first.id);
        view['openTaskMenu'](clickOn(trigger), first);
        document.body.dispatchEvent(keydown('Escape'));
        expect(view['popover']()).toBeNull();
        expect(view['detailTaskId']()).toBe(first.id);
        document.body.dispatchEvent(keydown('Escape'));
        expect(view['detailTaskId']()).toBeNull();
      } finally {
        document.removeEventListener('keydown', view['onDocumentKeydown']);
      }
    });
  });

  describe('筛选', () => {
    it('补全用键盘选择；Esc 先收起补全；点击卡片标签切换筛选', () => {
      view['filterFocused'].set(true);
      view['onFilterInput']('la');
      expect(view['suggestionsOpen']()).toBe(true);
      const input = area.querySelector<HTMLInputElement>('[data-testid="board-filter-input"]')!;
      view['onFilterKeydown'](keydown('ArrowDown', {}, input));
      view['onFilterKeydown'](keydown('Enter', {}, input));
      expect(view['filterQuery']()).toBe('label:');
      view['onFilterKeydown'](keydown('Escape', {}, input));
      expect(view['suggestionsOpen']()).toBe(false);

      view['clearFilter']();
      view['toggleLabelFilter'](label.name);
      expect(view['filterQuery']()).toBe('label:标签');
      expect(view['isLabelFiltered']('标签')).toBe(true);
      expect(view['visibleTasksOf'](firstColumn).map(task => task.id)).toEqual([first.id]);
      expect(view['visibleCount']()).toBe(1);
      expect(view['countLabel'](firstColumn)).toBe('筛选后 1 / 共 2 个任务');
      view['toggleLabelFilter'](label.name);
      expect(view['filterQuery']()).toBe('');
    });

    it('逾期计数与截止日文字取本地今天', () => {
      expect(view['overdueCount'](firstColumn)).toBe(1);
      expect(view['dueStatusOf']('2000-01-01')).toBe('overdue');
      expect(view['dueText']('2000-01-01')).toBe('已逾期 2000-01-01');
      view['filterQuery'].set('due:overdue');
      expect(view['visibleTasksOf'](firstColumn).map(task => task.id)).toEqual([second.id]);
      expect(view['rovingTaskId']()).toBe(second.id);
    });
  });

  describe('创建、改名与删除', () => {
    it('新建看板对话框：空标题不提交，成功后切到新板', async () => {
      view['openBoardComposer']();
      expect(view['dialog']()?.kind).toBe('board-composer');
      await view['submitBoardComposer']();
      expect(actions.createBoard).not.toHaveBeenCalled();
      view['boardComposerTitle'].set(' 新板 ');
      await view['submitBoardComposer']();
      expect(actions.createBoard).toHaveBeenCalledWith({ title: '新板' });
      expect(installed.selectBoard).toHaveBeenCalledWith(boardId);
      expect(view['dialog']()).toBeNull();
    });

    it('建板落库期间用户已自己切板：尊重用户选择，不再自动切到新板', async () => {
      let resolve!: (value: Board) => void;
      vi.mocked(actions.createBoard).mockReturnValueOnce(new Promise(done => (resolve = done)));
      view['boardComposerTitle'].set('新板');
      const pending = view['submitBoardComposer']();
      (installed.currentBoardId as unknown as { set(value: UUID | null): void }).set(id('other'));
      resolve({ ...current, id: id('created') } as Board);
      await pending;
      expect(installed.selectBoard).not.toHaveBeenCalled();
      expect(view['dialog']()).toBeNull();
    });

    it('板标题 / 描述 / 列标题就地编辑：未改动零调用，失败保留编辑器', async () => {
      view['startBoardTitle']();
      await view['commitBoardTitle']();
      expect(actions.updateBoard).not.toHaveBeenCalled();
      view['startBoardTitle']();
      view['boardTitleDraft'].set('新标题');
      vi.mocked(actions.updateBoard).mockRejectedValueOnce(new Error('标题不能为空'));
      await view['commitBoardTitle']();
      expect(view['editingBoardTitle']()).toBe(true);

      view['startBoardDescription']();
      view['boardDescriptionDraft'].set('描述 ');
      await view['commitBoardDescription']();
      expect(actions.updateBoard).toHaveBeenLastCalledWith(boardId, { description: '描述' });

      view['startColumnTitle'](firstColumn.id);
      view['columnTitleDraft'].set('改名');
      await view['commitColumnTitle']();
      expect(actions.updateColumn).toHaveBeenCalledWith(firstColumn.id, { title: '改名' });
      view['startColumnTitle'](secondColumn.id);
      view['cancelColumnTitle'](new Event('keydown'));
      expect(view['editingColumnId']()).toBeNull();
    });

    it('列底建任务：回车即建并保持输入框；建任务中拒绝重复提交；失败保留草稿', async () => {
      let reject!: (reason: Error) => void;
      vi.mocked(actions.createTask).mockReturnValueOnce(new Promise((_resolve, fail) => (reject = fail)));
      view['openAddTask'](firstColumn.id);
      view['addTaskTitle'].set('只创建一次');
      const pending = view['commitAddTask']();
      await view['commitAddTask']();
      view['cancelAddTask']();
      expect(actions.createTask).toHaveBeenCalledOnce();
      reject(new Error('写入失败'));
      await pending;
      expect(view['addTaskTitle']()).toBe('只创建一次');
      await view['commitAddTask']();
      expect(view['addTaskColumnId']()).toBe(firstColumn.id);
      expect(view['addTaskTitle']()).toBe('');

      view['openAddColumn']();
      view['addColumnTitle'].set('新列');
      await view['commitAddColumn']();
      expect(actions.createColumn).toHaveBeenCalledWith({ title: '新列' });
      expect(view['addingColumn']()).toBe(false);
    });

    it('卡片标题内联编辑：失败保留草稿，成功收起', async () => {
      view['startTaskTitle'](first);
      view['taskTitleDraft'].set('');
      vi.mocked(actions.updateTaskTitle).mockRejectedValueOnce(new Error('标题不能为空'));
      await view['commitTaskTitle'](first);
      expect(view['editingTaskId']()).toBe(first.id);
      view['taskTitleDraft'].set('新标题');
      await view['commitTaskTitle'](first);
      expect(actions.updateTaskTitle).toHaveBeenLastCalledWith(first.id, '新标题');
      expect(view['editingTaskId']()).toBeNull();
    });

    it('删除任务 / 列走确认清单；取消零写；确认后给出可撤销提示', async () => {
      await view['confirmTaskDelete'](first);
      view['closeDialog']();
      expect(actions.executeDelete).not.toHaveBeenCalled();
      await view['confirmColumnDelete'](firstColumn);
      await view['executeConfirmedDelete']();
      expect(actions.executeDelete).toHaveBeenCalledWith(expect.objectContaining({ kind: 'column' }));
      expect(view['toast']()).toEqual({ message: '已删除列「first」', undoable: true });
      await view['undoFromToast']();
      expect(actions.undo).toHaveBeenCalledOnce();
      expect(view['toast']()).toBeNull();
    });

    it('标签编辑器：新建取下一个预设色，编辑只写改动字段；删除先确认再回到列表', async () => {
      view['openLabels']();
      view['startCreateLabel']();
      expect(view['labelEditor']()?.color).toMatch(/^#[0-9a-f]{6}$/);
      view['updateLabelEditor']({ name: '新' });
      await view['saveLabelEditor']();
      expect(actions.createLabel).toHaveBeenCalledWith({ name: '新', color: view['labelColors'][0].color });
      expect(view['labelEditor']()).toBeNull();

      view['startEditLabel'](label);
      view['updateLabelEditor']({ color: '#000000' });
      await view['saveLabelEditor']();
      expect(actions.renameLabel).not.toHaveBeenCalled();
      expect(actions.recolorLabel).toHaveBeenCalledWith(label.id, '#000000');

      view['startEditLabel'](label);
      view['updateLabelEditor']({ color: 'red' });
      await view['saveLabelEditor']();
      expect(actions.recolorLabel).toHaveBeenCalledOnce();
      view['cancelLabelEditor']();

      await view['deleteLabel'](label);
      expect(view['dialog']()?.kind).toBe('confirm-label-delete');
      view['closeDialog']();
      expect(view['dialog']()?.kind).toBe('labels');
      await view['deleteLabel'](label);
      await view['executeConfirmedDelete']();
      expect(actions.executeLabelDelete).toHaveBeenCalledOnce();
      expect(view['dialog']()?.kind).toBe('labels');
      expect(view['toast']()).toEqual({ message: '已删除标签「标签」', undoable: true });

      // 删除失败：不出提示，错误走横幅
      view['toast'].set(null);
      vi.mocked(actions.executeLabelDelete).mockRejectedValueOnce(new Error('标签已被删除'));
      await view['deleteLabel'](label);
      await view['executeConfirmedDelete']();
      expect(view['toast']()).toBeNull();
      expect(view['notice']()).toBe('标签已被删除');
    });

    it('详情字段选择器：再点同一字段即关闭（标签照常提交），不以旧基线重开', async () => {
      await view['openDetail'](first.id);
      view['openDetailLabelPicker'](clickOn(trigger));
      await view['choosePickerOption'](label.id);
      view['openDetailLabelPicker'](clickOn(trigger));
      expect(view['popover']()).toBeNull();
      await vi.waitFor(() =>
        expect(actions.saveTaskFields).toHaveBeenCalledWith(first.id, expect.anything(), { labelIds: [label.id] })
      );
      view['openDetailColumnPicker'](clickOn(trigger));
      expect(view['popover']()?.kind).toBe('detail-column-picker');
      view['openDetailColumnPicker'](clickOn(trigger));
      expect(view['popover']()).toBeNull();
    });

    it('本列排序：执行中阻止重复；无变化提示不可撤销；失败复位', async () => {
      view['sortingColumnId'].set(firstColumn.id);
      await view['sortColumnBy'](firstColumn.id, 'title');
      expect(actions.sortColumn).not.toHaveBeenCalled();
      view['sortingColumnId'].set(null);
      await view['sortColumnBy'](firstColumn.id, 'dueDate');
      expect(view['toast']()).toEqual({ message: '已按截止日排序「first」', undoable: true });
      vi.mocked(actions.sortColumn).mockResolvedValueOnce({ written: false });
      await view['sortColumnBy'](firstColumn.id, 'title');
      expect(view['toast']()).toEqual({ message: '已按目标顺序排列，无变化', undoable: false });
      vi.mocked(actions.sortColumn).mockRejectedValueOnce(new Error('排序失败'));
      await view['sortColumnBy'](firstColumn.id, 'dueDate');
      expect(view['sortingColumnId']()).toBeNull();
    });

    it('导出备份透传宿主回调；缺省给占位提示', async () => {
      await view['onExportBackup']();
      expect(view['notice']()).toContain('宿主接线');
      const exportBackup = vi.fn(async () => undefined);
      Object.defineProperty(view, 'exportBackup', { value: () => exportBackup });
      await view['onExportBackup']();
      expect(exportBackup).toHaveBeenCalledOnce();
      expect(view['toast']()?.message).toBe('备份已生成');
    });
  });

  describe('边界与分支', () => {
    it('弹层标签与颜色辅助', () => {
      for (const [kind, targetId, expected] of [
        ['board-menu', null, '看板操作'],
        ['column-menu', firstColumn.id, '列操作：first'],
        ['task-menu', first.id, '任务操作：A'],
        ['detail-label-picker', first.id, '选择标签'],
        ['move-picker', first.id, '移到列']
      ] as const) {
        expect(view['popoverLabel']({ kind, targetId, top: 0, left: 0, width: 240 })).toBe(expected);
      }
      expect(view['popoverLabel']({ kind: 'task-menu', targetId: id('missing'), top: 0, left: 0, width: 1 })).toBe(
        '任务操作：'
      );
      expect(view['previewColor']('#12')).toBe(view['labelColors'][0].color);
      expect(view['previewColor'](' #000000 ')).toBe('#000000');
      expect(view['isValidColor']('#abc')).toBe(true);
      expect(view['sameColor']('#ABCDEF', ' #abcdef ')).toBe(true);
      expect(view['countLabel'](firstColumn)).toBe('2 个任务');
      expect(view['canMoveTask'](first, 'up')).toBe(false);
      expect(view['canMoveTask'](first, 'right')).toBe(true);
      expect(view['columnTitleOf'](null)).toBe('');
      expect(view['labelTextColor']('#000000')).toBe('#ffffff');
      expect(view['searchUnavailableText']('plugin_not_installed')).toBe('搜索插件未安装');
      expect(view['searchUnavailableText']('adapter_unsupported')).toBe('当前适配器不支持搜索');
      expect(view['searchUnavailableText']('query_failed')).toBe('搜索查询失败');
      expect(view['searchUnavailableText'](null)).toBe('');
    });

    it('筛选键盘的其余分支：无补全时方向键 / 回车透传；Tab 采纳；补全收起后 Esc 失焦', () => {
      const input = area.querySelector<HTMLInputElement>('[data-testid="board-filter-input"]')!;
      const arrow = keydown('ArrowUp', {}, input);
      view['onFilterKeydown'](arrow);
      expect(arrow.defaultPrevented).toBe(false);
      view['filterFocused'].set(true);
      view['onFilterInput']('');
      view['onFilterKeydown'](keydown('ArrowUp', {}, input));
      expect(view['activeSuggestion']()).toBe(4);
      const enter = keydown('Enter', {}, input);
      view['onFilterInput']('登录');
      view['onFilterKeydown'](enter);
      expect(enter.defaultPrevented).toBe(false);
      view['onFilterInput']('co');
      view['onFilterKeydown'](keydown('ArrowDown', {}, input));
      view['onFilterKeydown'](keydown('Tab', {}, input));
      expect(view['filterQuery']()).toBe('column:');
      view['suggestionsDismissed'].set(true);
      input.focus();
      view['onFilterKeydown'](keydown('Escape', {}, input));
      expect(document.activeElement).not.toBe(input);
      view['onFilterKeydown'](keydown('x', {}, input));
    });

    it('选择器键盘：上下循环、回车选中或创建；Esc 关闭，其余按键透传', async () => {
      await view['openDetail'](first.id);
      view['openDetailLabelPicker'](clickOn(trigger));
      view['onPickerKeydown'](keydown('ArrowUp'));
      expect(view['pickerActive']()).toBe(1);
      view['onPickerKeydown'](keydown('ArrowDown'));
      expect(view['pickerActive']()).toBe(0);
      view['onPickerKeydown'](keydown('Enter'));
      expect(view['pickerOptions']()[0].selected).toBe(true);
      view['onPickerInput']('全新');
      view['onPickerKeydown'](keydown('Enter'));
      await vi.waitFor(() => expect(actions.createLabel).toHaveBeenCalledOnce());
      view['onPickerInput']('标签');
      const other = keydown('x');
      view['onPickerKeydown'](other);
      expect(other.defaultPrevented).toBe(false);
      view['onPopoverKeydown'](keydown('x'));
      expect(view['popover']()).not.toBeNull();
      view['onPopoverKeydown'](keydown('Escape'));
      expect(view['popover']()).toBeNull();
      // 关闭即提交标签：等这笔保存落定（它的写入口会先清掉旧提示）
      await vi.waitFor(() => expect(view['detailStatus']()).toBe('已保存'));
      await view['choosePickerOption'](label.id);
      vi.mocked(actions.createLabel).mockRejectedValueOnce(new Error('重名'));
      view['openDetailLabelPicker'](clickOn(trigger));
      view['onPickerInput']('重名');
      await view['createLabelFromPicker']();
      expect(view['notice']()).toBe('重名');
    });

    it('全局按键：看板外或编辑框内忽略，对话框打开时不响应单键，⌘K 打开搜索', () => {
      const outside = document.createElement('button');
      document.body.append(outside);
      document.addEventListener('keydown', view['onDocumentKeydown']);
      try {
        outside.focus();
        outside.dispatchEvent(keydown('?'));
        expect(view['dialog']()).toBeNull();
        outside.blur();
        const input = area.querySelector<HTMLInputElement>('[data-testid="board-filter-input"]')!;
        input.focus();
        input.dispatchEvent(keydown('?'));
        expect(view['dialog']()).toBeNull();
        input.blur();
        document.body.dispatchEvent(keydown('k', { ctrlKey: true }));
        expect(view['dialog']()).toBeNull();
        view['board'].set({ ...installed, searchUnavailableReason: 'adapter_unsupported' });
        document.body.dispatchEvent(keydown('k', { ctrlKey: true }));
        expect(view['dialog']()?.kind).toBe('search');
        document.body.dispatchEvent(keydown('?'));
        expect(view['dialog']()?.kind).toBe('search');
        view['closeDialog']();
        document.body.dispatchEvent(keydown('x', { altKey: true }));
        document.body.dispatchEvent(keydown('Escape'));
        expect(view['dialog']()).toBeNull();
      } finally {
        document.removeEventListener('keydown', view['onDocumentKeydown']);
        outside.remove();
      }
    });

    it('板标题 / 描述编辑的取消与快捷键', async () => {
      await view['commitBoardTitle']();
      view['startBoardTitle']();
      view['cancelBoardTitle'](new Event('keydown'));
      expect(view['editingBoardTitle']()).toBe(false);
      view['startBoardDescription']();
      view['onBoardDescriptionKeydown'](keydown('Escape'));
      expect(view['editingBoardDescription']()).toBe(false);
      await view['commitBoardDescription']();
      view['startBoardDescription']();
      view['boardDescriptionDraft'].set('新描述');
      view['onBoardDescriptionKeydown'](keydown('Enter', { metaKey: true }));
      await vi.waitFor(() => expect(actions.updateBoard).toHaveBeenCalledWith(boardId, { description: '新描述' }));
      view['startBoardDescription']();
      await view['commitBoardDescription']();
      expect(actions.updateBoard).toHaveBeenCalledOnce();
      view['onDetailDescriptionKeydown'](keydown('x'));
    });

    it('无当前板 / 无详情 / 无弹层时各入口零调用', async () => {
      view['board'].set({ ...installed, currentBoard: signal(null) });
      await view['confirmBoardDelete']();
      await view['commitBoardTitle']();
      view['editingBoardDescription'].set(true);
      await view['commitBoardDescription']();
      expect(actions.planBoardDelete).not.toHaveBeenCalled();
      view['openDetailColumnPicker'](clickOn(trigger));
      view['openDetailLabelPicker'](clickOn(trigger));
      await view['choosePickerOption'](label.id);
      await view['commitDetailTitle']();
      await view['commitDetailDescription']();
      await view['commitDetailDue']('2026-01-01');
      await view['executeConfirmedDelete']();
      await view['commitColumnTitle']();
      view['closePopover']();
      view['onDocumentPointerdown']({ target: trigger } as unknown as PointerEvent);
      view['updateLabelEditor']({ name: 'x' });
      await view['saveLabelEditor']();
      await view['commitAddColumn']();
      await view['commitAddTask']();
      expect(view['popover']()).toBeNull();
      expect(actions.saveTaskFields).not.toHaveBeenCalled();
      expect(actions.createColumn).not.toHaveBeenCalled();
      expect(actions.createTask).not.toHaveBeenCalled();
    });

    it('弹层内的点击不关闭；视口变化关闭；删除详情任务从侧栏发起', async () => {
      view['openTaskMenu'](clickOn(trigger), first);
      const inside = document.createElement('div');
      inside.className = 'rxb-popover';
      document.body.append(inside);
      view['onDocumentPointerdown']({ target: inside } as unknown as PointerEvent);
      expect(view['popover']()).not.toBeNull();
      inside.remove();
      view['onViewportChange']();
      expect(view['popover']()).toBeNull();

      await view['openDetail'](first.id);
      await view['deleteDetailTask'](clickOn(trigger));
      expect(view['dialog']()?.kind).toBe('confirm-delete');
      await view['executeConfirmedDelete']();
      expect(view['detailTaskId']()).toBeNull();
      expect(view['toast']()?.message).toBe('已删除任务「A」');
      view['onBackdropMousedown']({ target: inside, currentTarget: trigger } as unknown as MouseEvent);
      view['openShortcuts']();
      view['onBackdropMousedown']({ target: trigger, currentTarget: trigger } as unknown as MouseEvent);
      expect(view['dialog']()).toBeNull();
    });

    it('保存途中切换任务：迟到结果不改新任务的基线；读回失败保留状态', async () => {
      await view['openDetail'](first.id);
      let resolveSave!: (value: { kind: 'saved'; task: Task }) => void;
      vi.mocked(actions.saveTaskFields).mockReturnValueOnce(new Promise(done => (resolveSave = done)));
      view['detailTitle'].set('改');
      const saving = view['commitDetailTitle']();
      await view['openDetail'](third.id);
      resolveSave({ kind: 'saved', task: first });
      await saving;
      expect(view['detailTaskId']()).toBe(third.id);
      expect(view['detailTitle']()).toBe(first.title);

      vi.mocked(actions.openSnapshot).mockRejectedValueOnce(new Error('读回失败'));
      await view['commitDetailDue']('2026-02-02');
      expect(view['notice']()).toBe('读回失败');
      expect(view['detailStatus']()).toBeNull();
      vi.mocked(actions.saveTaskFields).mockResolvedValueOnce({ kind: 'unchanged' });
      await view['commitDetailDue']('2026-03-03');
      expect(view['detailStatus']()).toBeNull();
    });

    it('卡片编辑取消、列 / 列底取消、拖拽无主时零调用', async () => {
      view['cancelTaskTitle']();
      view['startTaskTitle'](first);
      view['cancelTaskTitle'](new Event('keydown'));
      expect(view['editingTaskId']()).toBeNull();
      view['openAddColumn']();
      view['cancelAddColumn'](new Event('keydown'));
      expect(view['addingColumn']()).toBe(false);
      view['openAddTask'](firstColumn.id);
      view['cancelAddTask'](new Event('keydown'));
      expect(view['addTaskColumnId']()).toBeNull();
      vi.mocked(actions.createColumn).mockRejectedValueOnce(new Error('失败'));
      view['openAddColumn']();
      view['addColumnTitle'].set('列');
      await view['commitAddColumn']();
      expect(view['addingColumn']()).toBe(true);

      view['onTaskDragOver'](drag(10, 50));
      view['onColumnDragOver'](drag(10, 5));
      await view['onColumnDrop'](drag(10, 5));
      expect(view['isDropBefore'](first)).toBe(false);
      expect(view['isDropEnd'](emptyColumn)).toBe(false);
      expect(view['isColumnDropBefore'](firstColumn)).toBe(false);
      expect(view['isDropColumn'](firstColumn)).toBe(false);
      expect(actions.moveColumn).not.toHaveBeenCalled();
      await view['moveTaskBy'](first, 'up');
      expect(actions.moveTask).not.toHaveBeenCalled();
    });

    it('选板事件、提示计时与跨午夜刷新', () => {
      vi.useFakeTimers();
      const select = document.createElement('select');
      select.innerHTML = `<option value="board">板</option><option value="next">下一块</option>`;
      select.value = 'next';
      view['onBoardSelectionChange']({ target: select } as unknown as Event);
      expect(installed.selectBoard).toHaveBeenCalledWith('next');
      expect(select.value).toBe('board');

      view['showNotice']('一');
      view['showNotice']('二');
      view['showToast']('三', false);
      view['showToast']('四', true);
      vi.advanceTimersByTime(6000);
      expect(view['notice']()).toBeNull();
      expect(view['toast']()).toBeNull();
      view['onTodayActivity']();
      expect(view['today']()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('撤销 / 重做后重读详情；任务已不存在则关闭侧栏', async () => {
      await view['openDetail'](first.id);
      vi.mocked(actions.openSnapshot).mockResolvedValueOnce({ ...snapshot, dueDate: '2026-01-01' });
      await view['undo']();
      expect(view['detailBase']()?.dueDate).toBe('2026-01-01');
      vi.mocked(actions.openSnapshot).mockRejectedValueOnce(new Error('任务不存在'));
      await view['redo']();
      expect(view['detailTaskId']()).toBeNull();
      expect(view['notice']()).toBeNull();
    });

    it('非 Error 拒绝也转成提示；撤销 / 重做透传', async () => {
      vi.mocked(actions.undo).mockRejectedValueOnce('字符串原因');
      await view['undo']();
      expect(view['notice']()).toBe('字符串原因');
      await view['redo']();
      expect(actions.redo).toHaveBeenCalledOnce();
      vi.mocked(actions.moveTask).mockRejectedValueOnce('移动原因');
      await view['moveTaskBy'](first, 'right');
      expect(view['notice']()).toBe('移动原因');
    });
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

  it('搜索：复用句柄、切板重建、点结果关闭对话框并定位高亮', () => {
    vi.useFakeTimers();
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
    view['board'].set({ ...installed, searchSource: source });
    view['openSearch']();
    view['onSearchInput'](' 搜索 ');
    view['onSearchInput']('新词');
    expect(source.search).toHaveBeenCalledWith('搜索');
    expect(handle.setQuery).toHaveBeenCalledWith('新词');
    view['onSearchMore']();
    expect(handle.loadMore).toHaveBeenCalledOnce();
    expect(view['searchColumnTitle'](result)).toBe('first');
    expect(view['searchResultTitle'](result)).toBe('A');

    const card = area.querySelector<HTMLElement>('[data-task-id="A"]')!;
    card.scrollIntoView = vi.fn();
    view['onSearchResultClick'](result);
    expect(view['dialog']()).toBeNull();
    expect(card.scrollIntoView).toHaveBeenCalled();
    expect(view['searchHighlightId']()).toBe(first.id);
    vi.advanceTimersByTime(2000);
    expect(view['searchHighlightId']()).toBeNull();

    view['selectBoard'](id('other'));
    expect(handle.destroy).toHaveBeenCalledOnce();
    expect(source.search).toHaveBeenCalledTimes(2);
  });

  const drag = (x: number, y: number, value?: string) =>
    ({
      clientX: x,
      clientY: y,
      preventDefault: vi.fn(),
      dataTransfer: { setData: vi.fn(), getData: vi.fn(() => value ?? '') }
    }) as unknown as DragEvent;

  it('筛选状态下拖拽：前邻居被隐藏时退回整列反馈，落点仍取完整序列', async () => {
    view['filterQuery'].set('label:标签');
    view['onTaskDragStart'](drag(210, 45, third.id), third);
    view['onTaskDragOver'](drag(10, 200));
    expect(view['isDropEnd'](firstColumn)).toBe(true);
    expect(view['isDropAfter'](second)).toBe(false);
    view['onTaskDragOver'](drag(10, 80));
    expect(view['isDropAfter'](first)).toBe(true);
    await view['onTaskDrop'](drag(10, 200, third.id));
    expect(actions.moveTask).toHaveBeenCalledWith(third.id, {
      kind: 'between',
      columnId: firstColumn.id,
      prevId: second.id,
      nextId: null
    });
  });

  it('Shift+F10 打开卡片菜单前先提交已开的标签选择器草稿', async () => {
    await view['openDetail'](first.id);
    view['openDetailLabelPicker'](clickOn(trigger));
    await view['choosePickerOption'](label.id);
    const cardA = area.querySelector<HTMLElement>('[data-task-id="A"]')!;
    view['onCardKeydown'](keydown('F10', { shiftKey: true }, cardA), first);
    expect(view['popover']()?.kind).toBe('task-menu');
    await vi.waitFor(() =>
      expect(actions.saveTaskFields).toHaveBeenCalledWith(first.id, expect.anything(), { labelIds: [label.id] })
    );
  });

  it('任务拖拽：落点反馈识别首尾与空列，筛选隐藏的卡片仍按完整序列取邻居', async () => {
    const start = drag(10, 50, first.id);
    view['onTaskDragStart'](start, first);
    expect(start.dataTransfer?.setData).toHaveBeenCalledWith('application/x-board-task', first.id);
    view['onTaskDragOver'](drag(10, 140));
    expect(view['isDropAfter'](second)).toBe(true);
    expect(view['isDropColumn'](firstColumn)).toBe(true);
    view['onTaskDragOver'](drag(410, 100));
    expect(view['isDropEnd'](emptyColumn)).toBe(true);
    view['onTaskDragOver'](drag(-1, 45));
    expect(view['dropTarget']()).toBeNull();
    await view['onTaskDrop'](drag(210, 45, first.id));
    expect(actions.moveTask).toHaveBeenCalledWith(first.id, expect.objectContaining({ columnId: secondColumn.id }));
    expect(view['isDraggingTask'](first)).toBe(false);
  });

  it('列拖拽与左右移：首尾不越界，本列排序与列移动走领域动作', async () => {
    view['onColumnDragStart'](drag(10, 5), firstColumn);
    expect(view['isDraggingColumn'](firstColumn)).toBe(true);
    view['onColumnDragOver'](drag(370, 5));
    expect(view['isColumnDropAfter'](secondColumn)).toBe(true);
    // 列拖拽冒泡到列体的任务落点处理：不清理拖拽态
    await view['onTaskDrop'](drag(370, 5));
    expect(view['isDraggingColumn'](firstColumn)).toBe(true);
    await view['onColumnDrop'](drag(370, 5, firstColumn.id));
    expect(actions.moveColumn).toHaveBeenCalledWith(firstColumn.id, {
      prevId: secondColumn.id,
      nextId: emptyColumn.id
    });
    expect(view['isFirstColumn'](firstColumn)).toBe(true);
    expect(view['isLastColumn'](emptyColumn)).toBe(true);
    await view['moveColumnBy'](firstColumn.id, -1);
    await view['moveColumnBy'](emptyColumn.id, 1);
    expect(actions.moveColumn).toHaveBeenCalledOnce();
    await view['moveColumnBy'](secondColumn.id, -1);
    expect(actions.moveColumn).toHaveBeenLastCalledWith(secondColumn.id, { prevId: null, nextId: firstColumn.id });
  });
});
