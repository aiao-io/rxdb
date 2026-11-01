import type { RxDB, UUID } from '@aiao/rxdb';
import {
  Board,
  BOARD_LABEL_COLORS,
  BoardLabel,
  Column,
  RESTORING_MARKER_KEY,
  Task,
  type BoardSearchSource,
  type SearchHandle,
  type SearchResult,
  type TaskDraftSnapshot
} from '@aiao/rxdb-plugin-board';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { BehaviorSubject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isProxy, nextTick, reactive, ref } from 'vue';

import BoardView from '../board-view.vue';
import type { UseBoardActions, UseBoardReturn } from '../use-board.js';

/** `wrapper.get()` 的返回类型（VTU 2.5 起去掉了 `exists`），辅助函数统一按它收参。 */
type ElementWrapper = Omit<DOMWrapper<Element>, 'exists'>;

const bridge = vi.hoisted(() => ({ current: null as UseBoardReturn | null, calls: [] as unknown[][] }));
vi.mock('../use-board.js', () => ({
  useBoard: (...args: unknown[]) => {
    bridge.calls.push(args);
    return bridge.current;
  }
}));

/** 组件内部状态与方法（`<script setup>` 的 setupState，经 VTU 的 vm 代理读写）。 */
interface BoardViewVm {
  readonly popover: { readonly kind: string; readonly targetId: UUID | null; readonly width: number } | null;
  readonly dialog: { readonly kind: string } | null;
  readonly toast: { readonly message: string; readonly undoable: boolean } | null;
  readonly notice: string | null;
  readonly detailTaskId: UUID | null;
  readonly detailBase: TaskDraftSnapshot | null;
  readonly detailStatus: string | null;
  readonly dragging: { readonly kind: string; readonly id: UUID } | null;
  readonly addTaskColumnId: UUID | null;
  readonly addTaskTitle: string;
  readonly addingColumn: boolean;
  readonly editingTaskId: UUID | null;
  readonly filterQuery: string;
  readonly activeSuggestion: number;
  readonly suggestionsOpen: boolean;
  readonly pickerActive: number;
  readonly pickerOptions: readonly { readonly id: UUID; readonly selected: boolean }[];
  readonly canCreateLabelFromPicker: boolean;
  readonly labelEditor: { readonly labelId: UUID | null; readonly name: string; readonly color: string } | null;
  readonly searchHighlightId: UUID | null;
  readonly today: string;
  detailTitle: string;
  sortingColumnId: UUID | null;
  suggestionsDismissed: boolean;
  openDetail(taskId: UUID): Promise<void>;
  closeDetail(): void;
  commitDetailTitle(): Promise<void>;
  commitDetailDescription(): Promise<void>;
  commitDetailDue(value: string): Promise<void>;
  openDetailColumnPicker(event: Event): void;
  openDetailLabelPicker(event: Event): void;
  choosePickerOption(optionId: UUID): Promise<void>;
  createLabelFromPicker(): Promise<void>;
  closePopover(refocus?: boolean): void;
  closeDialog(refocus?: boolean): void;
  executeConfirmedDelete(): Promise<void>;
  confirmBoardDelete(): Promise<void>;
  confirmColumnDelete(column: Column): Promise<void>;
  commitBoardTitle(): Promise<void>;
  commitBoardDescription(): Promise<void>;
  commitColumnTitle(): Promise<void>;
  commitAddColumn(): Promise<void>;
  commitAddTask(): Promise<void>;
  cancelAddTask(event?: Event): void;
  openAddTask(columnId: UUID): void;
  enqueueDetail(operation: () => Promise<unknown>): Promise<void>;
  cancelTaskTitle(event?: Event): void;
  clearFilter(): void;
  onFilterInput(value: string): void;
  updateLabelEditor(patch: { name?: string; color?: string }): void;
  saveLabelEditor(): Promise<void>;
  sortColumnBy(columnId: UUID, mode: 'dueDate' | 'title'): Promise<void>;
  moveColumnBy(columnId: UUID, direction: -1 | 1): Promise<void>;
  moveTaskBy(task: Task, direction: 'up' | 'down' | 'left' | 'right'): Promise<void>;
  onTaskDrop(event: DragEvent): Promise<void>;
  onColumnDrop(event: DragEvent): Promise<void>;
  onTaskDragOver(event: DragEvent): void;
  onColumnDragOver(event: DragEvent): void;
  undo(): Promise<void>;
  redo(): Promise<void>;
  popoverLabel(pop: { kind: string; targetId: UUID | null; top: number; left: number; width: number }): string;
  previewColor(color: string): string;
  sameColor(a: string, b: string): boolean;
  countLabel(column: Column): string;
  canMoveTask(task: Task, direction: 'up' | 'down' | 'left' | 'right'): boolean;
  columnTitleOf(columnId: UUID | null): string;
  searchUnavailableText(reason: string | null): string;
}

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
const rxdb = { getPlugins: () => [] } as unknown as RxDB;

const keydown = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

describe('Vue 看板交互边界（看板 v2）', () => {
  let wrapper: VueWrapper;
  let vm: BoardViewVm;
  let actions: UseBoardActions;
  let installed: UseBoardReturn;

  const createActions = (): UseBoardActions => ({
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
  });

  let mounted = false;
  const unmountView = (): void => {
    if (mounted) wrapper.unmount();
    mounted = false;
  };

  const mountView = (
    overrides: Partial<UseBoardReturn> = {},
    props: { onExportBackup?: () => void | Promise<void> } = {},
    db: RxDB = rxdb
  ): void => {
    unmountView();
    installed = {
      boards: ref([current]),
      currentBoardId: ref(boardId),
      currentBoard: ref(current),
      columns: ref([firstColumn, secondColumn, emptyColumn]),
      tasks: ref([first, second, third]),
      labels: ref([label, other]),
      taskLabels: ref(new Map([[first.id, [label]]])),
      restoring: ref(false),
      undoCount: ref(1),
      redoCount: ref(1),
      writeEvent: ref(null),
      searchSource: null,
      searchUnavailableReason: null,
      loading: ref(false),
      readError: ref(null),
      retryReads: vi.fn(),
      selectBoard: vi.fn(),
      setRestoring: vi.fn(),
      actions,
      ...overrides
    };
    bridge.current = installed;
    wrapper = mount(BoardView, { props: { rxdb: db, ...props }, attachTo: document.body });
    mounted = true;
    vm = wrapper.vm as unknown as BoardViewVm;
  };

  const settle = async (): Promise<void> => {
    await flushPromises();
    await nextTick();
  };
  const $ = (testId: string): DOMWrapper<HTMLElement> => wrapper.find(`[data-testid="${testId}"]`);
  const $$ = (testId: string): DOMWrapper<HTMLElement>[] => wrapper.findAll(`[data-testid="${testId}"]`);
  const element = <T extends HTMLElement = HTMLElement>(selector: string): T => wrapper.get(selector).element as T;
  const cardOf = (taskId: UUID) => wrapper.get(`[data-task-id="${taskId}"]`);
  const inCard = (taskId: UUID, testId: string) => wrapper.get(`[data-task-id="${taskId}"] [data-testid="${testId}"]`);
  const inColumn = (columnId: UUID, testId: string) =>
    wrapper.get(`[data-column-id="${columnId}"] [data-testid="${testId}"]`);
  const click = async (target: ElementWrapper | string): Promise<void> => {
    await (typeof target === 'string' ? wrapper.get(`[data-testid="${target}"]`) : target).trigger('click');
    await settle();
  };
  const openDetailOf = async (taskId: UUID): Promise<void> => {
    await click(inCard(taskId, 'task-title'));
    expect($('detail-panel').exists()).toBe(true);
  };
  const openTaskMenu = async (taskId: UUID): Promise<void> => click(inCard(taskId, 'task-menu-trigger'));
  const openColumnMenu = async (columnId: UUID): Promise<void> => click(inColumn(columnId, 'column-menu-trigger'));
  const pickerOption = (text: string) => wrapper.findAll('[data-testid="picker-option"]').find(o => o.text() === text)!;
  const press = async (target: ElementWrapper | Element, key: string, init: KeyboardEventInit = {}) => {
    const event = keydown(key, init);
    (target instanceof Element ? target : target.element).dispatchEvent(event);
    await settle();
    return event;
  };
  const setInput = async (target: ElementWrapper, value: string): Promise<void> => {
    await target.setValue(value);
    await settle();
  };

  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null as string | null), setItem: vi.fn() });
    vi.stubGlobal('prompt', vi.fn());
    vi.stubGlobal('confirm', vi.fn());
    actions = createActions();
    mountView();
  });

  afterEach(() => {
    // 看板 v2 不再使用浏览器原生弹窗
    expect(window.prompt).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    unmountView();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('A的排队截止日编辑不会因切到B而重定向', async () => {
    mountView();
    await openDetailOf(first.id);
    const pending = deferred<void>();
    vi.mocked(actions.saveTaskFields).mockImplementationOnce(async () => {
      await pending.promise;
      return { kind: 'saved', task: first };
    });
    const firstSave = vm.commitDetailDue('2026-12-01');
    await Promise.resolve();
    const secondSave = vm.commitDetailDue('2026-12-02');
    await vm.openDetail(second.id);
    pending.resolve();
    await Promise.all([firstSave, secondSave]);
    expect(vi.mocked(actions.saveTaskFields).mock.calls.map(([taskId]) => taskId)).toEqual([first.id, first.id]);
    expect(vm.detailTaskId).toBe(second.id);
  });

  it('模态对话框Tab与Shift+Tab在首尾环绕', async () => {
    mountView();
    await click('create-board');
    const dialog = element('[data-testid="board-composer"]');
    const buttons = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')];
    const firstButton = buttons[0],
      lastButton = buttons[buttons.length - 1];
    lastButton.focus();
    const forward = await press(lastButton, 'Tab');
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(firstButton);
    await press(firstButton, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(lastButton);
  });

  describe('详情侧栏（即改即存）', () => {
    it('字段提交只发补丁、成功后以最新快照为基线，未改动零调用', async () => {
      await openDetailOf(first.id);
      expect($('board-view').classes()).toEqual(['rxb', 'has-overlay']);
      const title = wrapper.get('[data-testid="detail-title"]');
      await title.trigger('blur');
      await settle();
      expect(actions.saveTaskFields).not.toHaveBeenCalled();

      vi.mocked(actions.openSnapshot).mockResolvedValueOnce({ ...snapshot, title: '新标题' });
      await setInput(title, ' 新标题 ');
      await press(title, 'Enter');
      expect(actions.saveTaskFields).toHaveBeenCalledWith(first.id, snapshot, { title: ' 新标题 ' });
      expect(vm.detailBase?.title).toBe('新标题');
      expect((title.element as HTMLInputElement).value).toBe('新标题');
      expect($('detail-status').text()).toBe('已保存');
      expect($('detail-panel').attributes('aria-label')).toBe('任务详情：新标题');

      // VTU 的 setValue 依次派发 input 与 change：镜像随输入更新、change 提交
      await setInput(wrapper.get('[data-testid="detail-due"]'), '2026-12-01');
      expect(actions.saveTaskFields).toHaveBeenLastCalledWith(first.id, expect.anything(), { dueDate: '2026-12-01' });
      const description = wrapper.get('[data-testid="detail-description"]');
      await setInput(description, '描述');
      await description.trigger('blur');
      await settle();
      expect(actions.saveTaskFields).toHaveBeenLastCalledWith(first.id, expect.anything(), { description: '描述' });
      await press(description, 'Enter', { metaKey: true });
      expect(actions.saveTaskFields).toHaveBeenCalledTimes(3);

      // 「已保存」旁的撤销：撤销后重读详情
      vi.mocked(actions.openSnapshot).mockResolvedValueOnce({ ...snapshot, dueDate: '2026-01-01' });
      await click('detail-undo');
      expect(actions.undo).toHaveBeenCalledOnce();
      expect(element<HTMLInputElement>('[data-testid="detail-due"]').value).toBe('2026-01-01');
      await click('detail-due-clear');
      expect(actions.saveTaskFields).toHaveBeenLastCalledWith(first.id, expect.anything(), { dueDate: null });
    });

    it('回车后紧跟失焦：提交串行，第二次读到新基线而零调用', async () => {
      await openDetailOf(first.id);
      vi.mocked(actions.openSnapshot).mockResolvedValue({ ...snapshot, title: '改' });
      const title = wrapper.get('[data-testid="detail-title"]');
      await setInput(title, '改');
      title.element.dispatchEvent(keydown('Enter'));
      title.element.dispatchEvent(new FocusEvent('blur'));
      await settle();
      expect(actions.saveTaskFields).toHaveBeenCalledOnce();
    });

    it('保存失败保留草稿并提示（空标题等由领域拒绝）', async () => {
      await openDetailOf(first.id);
      vi.mocked(actions.saveTaskFields).mockRejectedValueOnce(new Error('标题不能为空'));
      const title = wrapper.get('[data-testid="detail-title"]');
      await setInput(title, '   ');
      await press(title, 'Enter');
      expect((title.element as HTMLInputElement).value).toBe('   ');
      expect($('board-notice').text()).toContain('标题不能为空');
      expect($('detail-status').exists()).toBe(false);
      // 关提示不抢焦点：按下不改焦点，编辑中的字段不会失焦重提交
      const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      $('board-notice-close').element.dispatchEvent(mousedown);
      expect(mousedown.defaultPrevented).toBe(true);
    });

    it('截止日保存中 / 失败不把用户刚选的日期刷回基线', async () => {
      await openDetailOf(first.id);
      const pending = deferred<{ kind: 'saved'; task: Task }>();
      vi.mocked(actions.saveTaskFields).mockReturnValueOnce(pending.promise);
      const due = wrapper.get('[data-testid="detail-due"]');
      await setInput(due, '2026-05-05');
      expect($('detail-status').text()).toBe('保存中…');
      expect((due.element as HTMLInputElement).value).toBe('2026-05-05');
      pending.reject(new Error('写入失败'));
      await settle();
      expect((due.element as HTMLInputElement).value).toBe('2026-05-05');
      expect($('board-notice').text()).toContain('写入失败');
    });

    it('Esc 还原标题与描述，不提交且不关闭侧栏', async () => {
      await openDetailOf(first.id);
      const title = wrapper.get('[data-testid="detail-title"]');
      await setInput(title, '草稿');
      await press(title, 'Escape');
      expect((title.element as HTMLInputElement).value).toBe(first.title);
      const description = wrapper.get('[data-testid="detail-description"]');
      await setInput(description, '草稿');
      await press(description, 'Escape');
      await press(description, 'x');
      expect((description.element as HTMLTextAreaElement).value).toBe('');
      expect(actions.saveTaskFields).not.toHaveBeenCalled();
      expect($('detail-panel').exists()).toBe(true);
    });

    it('迟到的详情快照：较新选择优先；所属列被删后不再打开', async () => {
      const stale = deferred<TaskDraftSnapshot>();
      vi.mocked(actions.openSnapshot).mockReturnValueOnce(stale.promise);
      const opening = vm.openDetail(first.id);
      await vm.openDetail(third.id);
      stale.resolve(snapshot);
      await opening;
      expect(vm.detailTaskId).toBe(third.id);

      const late = deferred<TaskDraftSnapshot>();
      vi.mocked(actions.openSnapshot).mockReturnValueOnce(late.promise);
      await click('detail-close');
      const reopening = vm.openDetail(first.id);
      await openColumnMenu(firstColumn.id);
      await click('column-delete');
      expect($('confirm-delete').text()).toContain('2 个任务');
      await click('confirm-delete-yes');
      late.resolve(snapshot);
      await reopening;
      await settle();
      expect($('detail-panel').exists()).toBe(false);
    });

    it('删除整板关闭已失效的详情并给出可撤销提示', async () => {
      await openDetailOf(first.id);
      await click('board-menu-trigger');
      await click('delete-board');
      expect($('confirm-delete').text()).toContain('1 列、1 个任务、0 个标签定义、0 条任务标签关联');
      await click('confirm-delete-yes');
      expect($('detail-panel').exists()).toBe(false);
      expect($('board-toast').text()).toContain('已删除看板「板」');
      expect($('board-toast-undo').exists()).toBe(true);
    });

    it('标签选择器：多选只改草稿，关闭时一次提交；就地创建的标签自动选中', async () => {
      await openDetailOf(first.id);
      await click('detail-labels');
      expect(vm.popover?.kind).toBe('detail-label-picker');
      expect($('popover').attributes('role')).toBe('dialog');
      expect($('popover').attributes('aria-label')).toBe('选择标签');
      expect(wrapper.get('[role="listbox"]').attributes('aria-label')).toBe('选择标签');
      await click(pickerOption('标签'));
      expect(actions.saveTaskFields).not.toHaveBeenCalled();
      expect(pickerOption('标签').attributes('aria-selected')).toBe('true');
      await setInput(wrapper.get('[data-testid="picker-filter"]'), '新标签');
      expect($('picker-create').text()).toContain('创建标签「新标签」');
      // listbox 只容 option：无匹配时不渲染 listbox，空态段落在其外
      expect(wrapper.find('.rxb-picker-empty').exists()).toBe(true);
      expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
      await click('picker-create');
      expect(actions.createLabel).toHaveBeenCalledWith({ name: '新标签', color: expect.stringMatching(/^#/) });
      await press(wrapper.get('[data-testid="popover"]'), 'Escape');
      expect($('popover').exists()).toBe(false);
      await vi.waitFor(() =>
        expect(actions.saveTaskFields).toHaveBeenCalledWith(first.id, expect.anything(), {
          labelIds: [label.id, other.id]
        })
      );
    });

    it('详情字段选择器：再点同一字段即关闭（标签照常提交），不以旧基线重开', async () => {
      await openDetailOf(first.id);
      await click('detail-labels');
      await click(pickerOption('标签'));
      await click('detail-labels');
      expect($('popover').exists()).toBe(false);
      await vi.waitFor(() =>
        expect(actions.saveTaskFields).toHaveBeenCalledWith(first.id, expect.anything(), { labelIds: [label.id] })
      );
      await click('detail-column');
      expect(vm.popover?.kind).toBe('detail-column-picker');
      await click('detail-column');
      expect($('popover').exists()).toBe(false);
    });

    it('标签选择器未改动关闭零调用；所在列选择器移到列尾且焦点留在侧栏', async () => {
      await openDetailOf(first.id);
      await click('detail-labels');
      await press(wrapper.get('[data-testid="popover"]'), 'Escape');
      expect(actions.saveTaskFields).not.toHaveBeenCalled();

      const trigger = element('[data-testid="detail-column"]');
      await click('detail-column');
      expect(vm.popover?.kind).toBe('detail-column-picker');
      expect(pickerOption('first').attributes('aria-selected')).toBe('true');
      await click(pickerOption('second'));
      expect(actions.moveTask).toHaveBeenCalledWith(first.id, {
        kind: 'between',
        columnId: secondColumn.id,
        prevId: third.id,
        nextId: null
      });
      expect(vm.detailBase?.columnId).toBe(secondColumn.id);
      expect($('board-toast').text()).toContain('已移动到「second」');
      expect(document.activeElement).toBe(trigger);
    });

    it('标签选择器：取消已选标签并换选另一个，关闭时按新集合提交', async () => {
      vi.mocked(actions.openSnapshot).mockResolvedValue({ ...snapshot, labelIds: [label.id] });
      await openDetailOf(first.id);
      expect($$('detail-label').map(chip => chip.text())).toEqual(['标签']);
      expect(wrapper.find('[data-testid="detail-labels"] .rxb-placeholder').exists()).toBe(false);
      await click('detail-labels');
      await click(pickerOption('标签'));
      expect(pickerOption('标签').attributes('aria-selected')).toBe('false');
      await click(pickerOption('文档'));
      await press(wrapper.get('[data-testid="popover"]'), 'Escape');
      await vi.waitFor(() =>
        expect(actions.saveTaskFields).toHaveBeenCalledWith(first.id, expect.anything(), { labelIds: [other.id] })
      );
    });

    it('详情提交队列：前一笔异常不阻塞后续提交', async () => {
      await openDetailOf(first.id);
      await expect(vm.enqueueDetail(() => Promise.reject(new Error('坏')))).rejects.toThrow('坏');
      vm.detailTitle = '新';
      await vm.commitDetailTitle();
      expect(actions.saveTaskFields).toHaveBeenCalledWith(first.id, snapshot, { title: '新' });
    });

    it('保存途中切换任务：迟到结果不改新任务的基线；读回失败保留状态', async () => {
      await openDetailOf(first.id);
      const saving = deferred<{ kind: 'saved'; task: Task }>();
      vi.mocked(actions.saveTaskFields).mockReturnValueOnce(saving.promise);
      vm.detailTitle = '改';
      const commit = vm.commitDetailTitle();
      await vm.openDetail(third.id);
      saving.resolve({ kind: 'saved', task: first });
      await commit;
      expect(vm.detailTaskId).toBe(third.id);
      expect(vm.detailTitle).toBe(first.title);

      vi.mocked(actions.openSnapshot).mockRejectedValueOnce(new Error('读回失败'));
      await vm.commitDetailDue('2026-02-02');
      expect(vm.notice).toBe('读回失败');
      expect(vm.detailStatus).toBeNull();
      vi.mocked(actions.saveTaskFields).mockResolvedValueOnce({ kind: 'unchanged' });
      await vm.commitDetailDue('2026-03-03');
      expect(vm.detailStatus).toBeNull();
    });

    it('撤销 / 重做后重读详情；任务已不存在则关闭侧栏', async () => {
      await openDetailOf(first.id);
      vi.mocked(actions.openSnapshot).mockResolvedValueOnce({ ...snapshot, dueDate: '2026-01-01' });
      await click('undo');
      expect(vm.detailBase?.dueDate).toBe('2026-01-01');
      vi.mocked(actions.openSnapshot).mockRejectedValueOnce(new Error('任务不存在'));
      await click('redo');
      expect($('detail-panel').exists()).toBe(false);
      expect($('board-notice').exists()).toBe(false);
    });
  });

  describe('卡片菜单与键盘', () => {
    it('菜单开关：同一触发器再点关闭，外部点击关闭并不抢焦点', async () => {
      await openTaskMenu(first.id);
      expect(vm.popover).toMatchObject({ kind: 'task-menu', targetId: first.id, width: 240 });
      expect(inCard(first.id, 'task-menu-trigger').attributes('aria-expanded')).toBe('true');
      expect($('popover').attributes('aria-label')).toBe('任务操作：A');
      await openTaskMenu(first.id);
      expect($('popover').exists()).toBe(false);

      await openColumnMenu(firstColumn.id);
      expect($('popover').attributes('role')).toBe('menu');
      const outside = document.createElement('button');
      document.body.append(outside);
      outside.focus();
      outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await settle();
      expect($('popover').exists()).toBe(false);
      expect(document.activeElement).toBe(outside);
      outside.remove();
    });

    it('移到列选择器：移到目标列末尾；原位零写；失败提示不移动', async () => {
      await openTaskMenu(first.id);
      await click('task-move-to-column');
      expect(vm.popover?.kind).toBe('move-picker');
      expect($('popover').attributes('aria-label')).toBe('移到列');
      expect(vm.pickerOptions.find(option => option.selected)?.id).toBe(firstColumn.id);
      await click(pickerOption('empty'));
      expect(actions.moveTask).toHaveBeenCalledWith(first.id, { kind: 'end', columnId: emptyColumn.id });

      await openTaskMenu(second.id);
      await click('task-move-to-column');
      await click(pickerOption('first'));
      expect(actions.moveTask).toHaveBeenCalledOnce();

      vi.mocked(actions.moveTask).mockRejectedValueOnce(new Error('移动失败'));
      await openTaskMenu(first.id);
      expect($('task-move-up').attributes('disabled')).toBeDefined();
      await click('task-move-down');
      expect($('board-notice').text()).toContain('移动失败');
    });

    it('卡片菜单：打开详情 / 上移 / 删除', async () => {
      await openTaskMenu(first.id);
      await click('task-menu-open');
      expect(vm.detailTaskId).toBe(first.id);
      expect(cardOf(first.id).classes()).toContain('is-selected');
      await openTaskMenu(second.id);
      await click('task-move-up');
      expect(actions.moveTask).toHaveBeenCalledWith(second.id, {
        kind: 'between',
        columnId: firstColumn.id,
        prevId: null,
        nextId: first.id
      });
      await openTaskMenu(second.id);
      await click('task-delete');
      expect($('confirm-delete').text()).toContain('删除任务「A」');
    });

    it('方向键移动焦点、Alt + 方向键移动卡片、Enter / F2 / Del / Shift+F10', async () => {
      const cardA = cardOf(first.id).element;
      expect(cardA.getAttribute('tabindex')).toBe('0');
      await press(cardA, 'ArrowDown');
      expect(document.activeElement?.getAttribute('data-task-id')).toBe('B');
      expect(cardA.getAttribute('tabindex')).toBe('-1');
      await press(cardA, 'ArrowRight');
      expect(document.activeElement?.getAttribute('data-task-id')).toBe('C');
      await press(cardA, 'End');
      expect(document.activeElement?.getAttribute('data-task-id')).toBe('B');

      await press(cardA, 'ArrowDown', { altKey: true });
      expect(actions.moveTask).toHaveBeenCalledWith(first.id, {
        kind: 'between',
        columnId: firstColumn.id,
        prevId: second.id,
        nextId: null
      });

      await press(cardA, 'Enter');
      expect(vm.detailTaskId).toBe(first.id);
      await press(cardA, 'F2');
      expect($('task-title-editor').exists()).toBe(true);
      await press(cardA, 'Delete');
      expect(vm.dialog?.kind).toBe('confirm-delete');
      await click('confirm-delete-no');
      await press(cardA, 'F10', { shiftKey: true });
      expect(vm.popover?.kind).toBe('task-menu');

      const ignored = await press(wrapper.get('[data-testid="task-title-editor"]'), 'ArrowDown');
      expect(ignored.defaultPrevented).toBe(false);
      const unknown = await press(cardA, 'x');
      expect(unknown.defaultPrevented).toBe(false);
      const altHome = await press(cardA, 'Home', { altKey: true });
      expect(altHome.defaultPrevented).toBe(false);
    });

    it('全局快捷键：/ 聚焦筛选、? 打开快捷键、⌘Z / ⇧⌘Z、Esc 由内向外关闭', async () => {
      await press(document.body, '/');
      expect(document.activeElement?.getAttribute('data-testid')).toBe('board-filter-input');
      (document.activeElement as HTMLElement).blur();
      await press(document.body, '?');
      expect($('shortcuts-dialog').exists()).toBe(true);
      expect($('shortcuts-dialog').findAll('kbd').length).toBeGreaterThan(10);
      await press(document.body, 'Escape');
      expect($('shortcuts-dialog').exists()).toBe(false);
      await press(document.body, 'z', { metaKey: true });
      await press(document.body, 'z', { metaKey: true, shiftKey: true });
      expect(actions.undo).toHaveBeenCalledOnce();
      expect(actions.redo).toHaveBeenCalledOnce();

      await openDetailOf(first.id);
      await openTaskMenu(first.id);
      await press(document.body, 'Escape');
      expect($('popover').exists()).toBe(false);
      expect($('detail-panel').exists()).toBe(true);
      await press(document.body, 'Escape');
      expect($('detail-panel').exists()).toBe(false);
      const unhandled = await press(document.body, 'Escape');
      expect(unhandled.defaultPrevented).toBe(false);
    });

    it('全局按键：看板外或编辑框内忽略，对话框打开时不响应单键，⌘K 打开搜索', async () => {
      const outside = document.createElement('button');
      document.body.append(outside);
      outside.focus();
      await press(outside, '?');
      expect(vm.dialog).toBeNull();
      outside.remove();
      const input = wrapper.get('[data-testid="board-filter-input"]');
      (input.element as HTMLInputElement).focus();
      await press(input, '?');
      expect(vm.dialog).toBeNull();
      (input.element as HTMLInputElement).blur();
      await press(document.body, 'k', { ctrlKey: true });
      expect(vm.dialog).toBeNull();
      expect($('search-open').exists()).toBe(false);

      mountView({ searchUnavailableReason: 'adapter_unsupported' });
      await press(document.body, 'k', { ctrlKey: true });
      expect($('board-search').exists()).toBe(true);
      await press(document.body, '?');
      expect(vm.dialog?.kind).toBe('search');
      await click('dialog-close');
      await press(document.body, 'x', { altKey: true });
      await press(document.body, 'x');
      expect(vm.dialog).toBeNull();
    });

    it('弹层内的点击不关闭；视口变化与列区滚动关闭；删除详情任务从侧栏发起', async () => {
      await openTaskMenu(first.id);
      wrapper.get('[data-testid="popover"]').element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      expect(vm.popover).not.toBeNull();
      window.dispatchEvent(new Event('resize'));
      await settle();
      expect($('popover').exists()).toBe(false);
      await openTaskMenu(first.id);
      await wrapper.get('[data-testid="columns"]').trigger('scroll');
      expect($('popover').exists()).toBe(false);

      await openDetailOf(first.id);
      await click('detail-delete');
      expect(vm.dialog?.kind).toBe('confirm-delete');
      await click('confirm-delete-yes');
      expect($('detail-panel').exists()).toBe(false);
      expect($('board-toast').text()).toContain('已删除任务「A」');

      await click('board-menu-trigger');
      await click('shortcuts-open');
      await wrapper.get('[data-testid="shortcuts-dialog"]').trigger('mousedown');
      expect(vm.dialog?.kind).toBe('shortcuts');
      await wrapper.get('[data-testid="dialog-backdrop"]').trigger('mousedown');
      expect(vm.dialog).toBeNull();
      await click('board-menu-trigger');
      await click('shortcuts-open');
      await click('dialog-close');
      expect(vm.dialog).toBeNull();
    });
  });

  describe('筛选', () => {
    it('补全用键盘选择；Esc 先收起补全；点击卡片标签切换筛选', async () => {
      const input = wrapper.get('[data-testid="board-filter-input"]');
      await input.trigger('focus');
      await setInput(input, 'la');
      expect(vm.suggestionsOpen).toBe(true);
      expect($$('board-filter-suggestion').map(item => item.text())).toEqual([expect.stringContaining('label:')]);
      expect(input.attributes('aria-activedescendant')).toMatch(/-suggestions-0$/);
      await press(input, 'ArrowDown');
      await press(input, 'Enter');
      expect(vm.filterQuery).toBe('label:');
      expect($$('board-filter-suggestion')[0].find('.rxb-swatch').exists()).toBe(true);
      await press(input, 'Escape');
      expect(vm.suggestionsOpen).toBe(false);
      expect(input.attributes('aria-expanded')).toBe('false');

      vm.clearFilter();
      await settle();
      await click(inCard(first.id, 'card-label'));
      expect(vm.filterQuery).toBe('label:标签');
      expect(inCard(first.id, 'card-label').attributes('aria-pressed')).toBe('true');
      expect(inCard(first.id, 'card-label').classes()).toContain('is-active');
      expect(wrapper.findAll(`[data-column-id="first"] [data-testid="task-card"]`)).toHaveLength(1);
      expect($('board-filter-count').text()).toBe('1 项');
      expect(inColumn(firstColumn.id, 'column-count').attributes('title')).toBe('筛选后 1 / 共 2 个任务');
      expect(inColumn(secondColumn.id, 'column-empty').text()).toBe('没有匹配筛选的任务');
      expect(inColumn(emptyColumn.id, 'column-empty').text()).toBe('暂无任务');
      await click(inCard(first.id, 'card-label'));
      expect(vm.filterQuery).toBe('');
      await setInput(input, 'label:文档');
      await click('board-filter-clear');
      expect(vm.filterQuery).toBe('');
    });

    it('补全尚未选中时：↑ 到最后一项、↓ 到第一项', async () => {
      const focusFilter = async () => {
        const input = wrapper.get('[data-testid="board-filter-input"]');
        await input.trigger('focus');
        return input;
      };
      let input = await focusFilter();
      expect($$('board-filter-suggestion')).toHaveLength(5);
      expect(input.attributes('aria-activedescendant')).toBeUndefined();
      await press(input, 'ArrowUp');
      expect(vm.activeSuggestion).toBe(4);
      expect($$('board-filter-suggestion')[4].attributes('aria-selected')).toBe('true');
      mountView();
      input = await focusFilter();
      await press(input, 'ArrowDown');
      expect(vm.activeSuggestion).toBe(0);
    });

    it('补全项点击采纳且 mousedown 不抢输入框焦点；失焦收起', async () => {
      const input = wrapper.get('[data-testid="board-filter-input"]');
      await input.trigger('focus');
      await setInput(input, 'label:');
      const suggestion = $$('board-filter-suggestion')[1];
      const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      suggestion.element.dispatchEvent(mousedown);
      expect(mousedown.defaultPrevented).toBe(true);
      await click(suggestion);
      expect(vm.filterQuery).toBe('label:文档 ');
      await input.trigger('blur');
      expect($('board-filter-suggestions').exists()).toBe(false);
    });

    it('筛选键盘的其余分支：无补全时方向键 / 回车透传；Tab 采纳；补全收起后 Esc 失焦', async () => {
      const input = wrapper.get('[data-testid="board-filter-input"]');
      const arrow = await press(input, 'ArrowUp');
      expect(arrow.defaultPrevented).toBe(false);
      await input.trigger('focus');
      vm.onFilterInput('');
      await press(input, 'ArrowUp');
      expect(vm.activeSuggestion).toBe(4);
      await setInput(input, '登录');
      const enter = await press(input, 'Enter');
      expect(enter.defaultPrevented).toBe(false);
      await setInput(input, 'co');
      await press(input, 'ArrowUp');
      await press(input, 'Tab');
      expect(vm.filterQuery).toBe('column:');
      vm.suggestionsDismissed = true;
      (input.element as HTMLInputElement).focus();
      await press(input, 'Escape');
      expect(document.activeElement).not.toBe(input.element);
      await press(input, 'x');
    });

    it('逾期计数、截止日文字与漫游 tabindex 取本地今天与筛选结果', async () => {
      expect(inColumn(firstColumn.id, 'column-overdue').text()).toBe('逾期 1');
      expect(inCard(second.id, 'task-due').text()).toBe('已逾期 2000-01-01');
      expect(inCard(second.id, 'task-due').classes()).toContain('is-overdue');
      installed.tasks.value = [first, { ...second, dueDate: vm.today } as Task, third];
      await settle();
      expect(inCard(second.id, 'task-due').classes()).toContain('is-today');
      expect(inCard(second.id, 'task-due').text()).toContain('今天到期');
      installed.tasks.value = [first, second, third];
      await setInput(wrapper.get('[data-testid="board-filter-input"]'), 'due:overdue');
      expect(wrapper.findAll('[data-testid="task-card"]').map(card => card.attributes('data-task-id'))).toEqual(['B']);
      expect(cardOf(second.id).attributes('tabindex')).toBe('0');
    });
  });

  describe('创建、改名与删除', () => {
    it('新建看板对话框：空标题不提交，成功后切到新板', async () => {
      expect($('board-view').classes()).toEqual(['rxb']);
      await click('create-board');
      expect($('board-composer').exists()).toBe(true);
      // 对话框打开时根节点挂 has-overlay：错误提示浮到遮罩之上
      expect($('board-view').classes()).toEqual(['rxb', 'has-overlay']);
      const input = wrapper.get('[data-testid="board-composer-input"]');
      await press(input, 'Enter');
      expect(actions.createBoard).not.toHaveBeenCalled();
      expect($('board-composer-submit').attributes('disabled')).toBeDefined();
      await setInput(input, ' 新板 ');
      await click('board-composer-submit');
      expect(actions.createBoard).toHaveBeenCalledWith({ title: '新板' });
      expect(installed.selectBoard).toHaveBeenCalledWith(boardId);
      expect($('board-composer').exists()).toBe(false);
      expect($('board-view').classes()).toEqual(['rxb']);

      await click('create-board');
      await click(wrapper.get('[data-testid="board-composer"] .rxb-dialog-footer .rxb-btn'));
      expect(vm.dialog).toBeNull();
      await click('create-board');
      await click('dialog-close');
      expect(vm.dialog).toBeNull();
    });

    it('建板落库期间用户已自己切板：尊重用户选择，不再自动切到新板', async () => {
      const pending = deferred<Board>();
      vi.mocked(actions.createBoard).mockReturnValueOnce(pending.promise);
      await click('create-board');
      const input = wrapper.get('[data-testid="board-composer-input"]');
      await setInput(input, '新板');
      await press(input, 'Enter');
      installed.currentBoardId.value = id('other');
      pending.resolve({ ...current, id: id('created') } as Board);
      await settle();
      expect(installed.selectBoard).not.toHaveBeenCalled();
      expect(vm.dialog).toBeNull();
    });

    it('写入口失败：建板 / 删除清单 / 标签保存失败时保留对话框与草稿并提示', async () => {
      vi.mocked(actions.createBoard).mockRejectedValueOnce(new Error('标题不能为空'));
      await click('create-board');
      const input = wrapper.get('[data-testid="board-composer-input"]');
      await setInput(input, '新板');
      await press(input, 'Enter');
      expect($('board-composer').exists()).toBe(true);
      expect((input.element as HTMLInputElement).value).toBe('新板');
      expect($('board-notice').text()).toContain('标题不能为空');
      await click('dialog-close');

      vi.mocked(actions.planBoardDelete).mockRejectedValueOnce(new Error('板已变化'));
      vi.mocked(actions.planColumnDelete).mockRejectedValueOnce(new Error('列已变化'));
      vi.mocked(actions.planTaskDelete).mockRejectedValueOnce(new Error('任务已变化'));
      await click('board-menu-trigger');
      await click('delete-board');
      await openColumnMenu(firstColumn.id);
      await click('column-delete');
      await openTaskMenu(first.id);
      await click('task-delete');
      expect(vm.dialog).toBeNull();
      expect($('board-notice').text()).toContain('任务已变化');

      vi.mocked(actions.planLabelDelete).mockRejectedValueOnce(new Error('标签已变化'));
      vi.mocked(actions.createLabel).mockRejectedValueOnce(new Error('重名'));
      await click('labels-open');
      await click($$('label-delete')[0]);
      expect(vm.dialog?.kind).toBe('labels');
      await click('create-label');
      await setInput(wrapper.get('[data-testid="label-name-input"]'), '文档');
      await click('label-editor-save');
      expect($('label-editor').exists()).toBe(true);
      expect($('board-notice').text()).toContain('重名');
    });

    it('板标题 / 描述 / 列标题就地编辑：未改动零调用，失败保留编辑器', async () => {
      await click('rename-board');
      const titleEditor = () => wrapper.get('[data-testid="board-title-editor"]');
      await titleEditor().trigger('blur');
      await settle();
      expect(actions.updateBoard).not.toHaveBeenCalled();
      await click('rename-board');
      await setInput(titleEditor(), '新标题');
      vi.mocked(actions.updateBoard).mockRejectedValueOnce(new Error('标题不能为空'));
      await press(titleEditor(), 'Enter');
      expect($('board-title-editor').exists()).toBe(true);
      await press(titleEditor(), 'Escape');
      expect($('board-title-editor').exists()).toBe(false);

      expect(wrapper.get('[data-testid="board-description"] .rxb-placeholder').text()).toBe('添加描述');
      await click('board-description');
      await setInput(wrapper.get('[data-testid="board-description-editor"]'), '描述 ');
      await wrapper.get('[data-testid="board-description-editor"]').trigger('blur');
      await settle();
      expect(actions.updateBoard).toHaveBeenLastCalledWith(boardId, { description: '描述' });

      await openColumnMenu(firstColumn.id);
      expect($('popover').attributes('aria-label')).toBe('列操作：first');
      await click('column-rename');
      const columnEditor = wrapper.get('[data-testid="column-title-editor"]');
      await setInput(columnEditor, '改名');
      await press(columnEditor, 'Enter');
      expect(actions.updateColumn).toHaveBeenCalledWith(firstColumn.id, { title: '改名' });
      await openColumnMenu(secondColumn.id);
      await click('column-rename');
      await press(wrapper.get('[data-testid="column-title-editor"]'), 'Escape');
      expect($('column-title-editor').exists()).toBe(false);
      await openColumnMenu(secondColumn.id);
      await click('column-rename');
      await wrapper.get('[data-testid="column-title-editor"]').trigger('blur');
      await settle();
      vi.mocked(actions.updateColumn).mockRejectedValueOnce(new Error('列名不能为空'));
      await openColumnMenu(secondColumn.id);
      await click('column-rename');
      await setInput(wrapper.get('[data-testid="column-title-editor"]'), ' ');
      await press(wrapper.get('[data-testid="column-title-editor"]'), 'Enter');
      expect($('column-title-editor').exists()).toBe(true);
      expect(actions.updateColumn).toHaveBeenCalledTimes(2);
    });

    it('板标题 / 描述编辑的取消与快捷键', async () => {
      await vm.commitBoardTitle();
      await click('board-description');
      await press(wrapper.get('[data-testid="board-description-editor"]'), 'Escape');
      expect($('board-description-editor').exists()).toBe(false);
      await vm.commitBoardDescription();
      await click('board-description');
      const editor = wrapper.get('[data-testid="board-description-editor"]');
      await setInput(editor, '新描述');
      await press(editor, 'Enter', { metaKey: true });
      expect(actions.updateBoard).toHaveBeenCalledWith(boardId, { description: '新描述' });
      await click('board-description');
      await vm.commitBoardDescription();
      expect(actions.updateBoard).toHaveBeenCalledOnce();

      installed.currentBoard.value = { ...current, description: '已有描述' } as Board;
      await settle();
      expect($('board-description').text()).toBe('已有描述');
    });

    it('列底建任务：回车即建并保持输入框；建任务中拒绝重复提交；失败保留草稿', async () => {
      const pending = deferred<Task>();
      vi.mocked(actions.createTask).mockReturnValueOnce(pending.promise);
      await click(inColumn(firstColumn.id, 'add-task'));
      const input = () => wrapper.get('[data-testid="add-task-input"]');
      await setInput(input(), '只创建一次');
      await press(input(), 'Enter');
      await vm.commitAddTask();
      vm.cancelAddTask();
      vm.openAddTask(secondColumn.id);
      expect(vm.addTaskColumnId).toBe(firstColumn.id);
      expect(actions.createTask).toHaveBeenCalledOnce();
      expect(input().attributes('disabled')).toBeDefined();
      pending.reject(new Error('写入失败'));
      await settle();
      expect(vm.addTaskTitle).toBe('只创建一次');
      expect($('board-notice').text()).toContain('写入失败');
      await click('add-task-submit');
      expect(vm.addTaskColumnId).toBe(firstColumn.id);
      expect(vm.addTaskTitle).toBe('');
      await vi.waitFor(() => expect(document.activeElement).toBe(input().element));
      await click('add-task-cancel');
      expect($('add-task-form').exists()).toBe(false);
      await click(inColumn(secondColumn.id, 'column-add-task'));
      await press(input(), 'Escape');
      expect($('add-task-form').exists()).toBe(false);

      await click('create-column');
      const composer = () => wrapper.get('[data-testid="column-composer-input"]');
      await setInput(composer(), '新列');
      await press(composer(), 'Enter');
      expect(actions.createColumn).toHaveBeenCalledWith({ title: '新列' });
      expect($('column-composer-input').exists()).toBe(false);
    });

    it('卡片标题内联编辑：失败保留草稿，成功收起；取消回到卡片', async () => {
      await openTaskMenu(first.id);
      await click('task-edit-title');
      const editor = () => wrapper.get('[data-testid="task-title-editor"]');
      await setInput(editor(), '');
      vi.mocked(actions.updateTaskTitle).mockRejectedValueOnce(new Error('标题不能为空'));
      await click('task-title-save');
      expect(vm.editingTaskId).toBe(first.id);
      await setInput(editor(), '新标题');
      await press(editor(), 'Enter');
      expect(actions.updateTaskTitle).toHaveBeenLastCalledWith(first.id, '新标题');
      expect($('task-title-editor').exists()).toBe(false);

      await openTaskMenu(first.id);
      await click('task-edit-title');
      await click('task-title-cancel');
      expect($('task-title-editor').exists()).toBe(false);
      await openTaskMenu(first.id);
      await click('task-edit-title');
      await press(editor(), 'Escape');
      expect($('task-title-editor').exists()).toBe(false);
      await vi.waitFor(() => expect(document.activeElement).toBe(cardOf(first.id).element));
    });

    it('删除任务 / 列走确认清单；取消零写；确认后给出可撤销提示', async () => {
      await openTaskMenu(first.id);
      await click('task-delete');
      expect($('confirm-delete').attributes('role')).toBe('alertdialog');
      expect($('confirm-delete').text()).toContain('将同时移除 0 条标签关联');
      await click('confirm-delete-no');
      expect(actions.executeDelete).not.toHaveBeenCalled();
      await openColumnMenu(firstColumn.id);
      await click('column-delete');
      await click('confirm-delete-yes');
      expect(actions.executeDelete).toHaveBeenCalledWith(expect.objectContaining({ kind: 'column' }));
      expect($('board-toast').text()).toContain('已删除列「first」');
      await click('board-toast-undo');
      expect(actions.undo).toHaveBeenCalledOnce();
      expect($('board-toast').exists()).toBe(false);
    });

    it('标签对话框：新建取下一个预设色，编辑只写改动字段；删除先确认再回到列表', async () => {
      await click('labels-open');
      expect($('label-manager').find('.rxb-dialog-title').text()).toBe('标签');
      expect($$('label-chip').map(chip => chip.text())).toEqual(['标签', '文档']);
      await click('create-label');
      expect(vm.labelEditor?.color).toBe(BOARD_LABEL_COLORS[0].color);
      expect($('label-manager').find('.rxb-dialog-title').text()).toBe('新建标签');
      expect($('label-editor').find('.rxb-label').text()).toBe('标签预览');
      await setInput(wrapper.get('[data-testid="label-name-input"]'), '新');
      await click($$('label-color-option')[2]);
      expect($$('label-color-option')[2].attributes('aria-pressed')).toBe('true');
      await click('label-editor-save');
      expect(actions.createLabel).toHaveBeenCalledWith({ name: '新', color: BOARD_LABEL_COLORS[2].color });
      expect($('label-editor').exists()).toBe(false);

      await click($$('label-edit')[0]);
      expect($('label-manager').find('.rxb-dialog-title').text()).toBe('编辑标签');
      await setInput(wrapper.get('[data-testid="label-color-input"]'), '#000000');
      await click('label-editor-save');
      expect(actions.renameLabel).not.toHaveBeenCalled();
      expect(actions.recolorLabel).toHaveBeenCalledWith(label.id, '#000000');

      await click($$('label-edit')[0]);
      await setInput(wrapper.get('[data-testid="label-name-input"]'), '改名');
      await setInput(wrapper.get('[data-testid="label-color-input"]'), 'red');
      expect($('label-editor-save').attributes('disabled')).toBeDefined();
      await press(wrapper.get('[data-testid="label-name-input"]'), 'Enter');
      expect(actions.recolorLabel).toHaveBeenCalledOnce();
      await setInput(wrapper.get('[data-testid="label-color-input"]'), '#ffffff');
      await click('label-editor-save');
      expect(actions.renameLabel).toHaveBeenCalledWith(label.id, '改名');
      expect(actions.recolorLabel).toHaveBeenCalledOnce();
      await click($$('label-edit')[1]);
      await click('label-editor-cancel');
      expect($('label-editor').exists()).toBe(false);

      await click($$('label-delete')[0]);
      expect(vm.dialog?.kind).toBe('confirm-label-delete');
      expect($('confirm-delete').text()).toContain('删除标签「标签」');
      await click('confirm-delete-no');
      expect(vm.dialog?.kind).toBe('labels');
      await click($$('label-delete')[0]);
      await click('confirm-delete-yes');
      expect(actions.executeLabelDelete).toHaveBeenCalledOnce();
      expect(vm.dialog?.kind).toBe('labels');
      expect($('board-toast').text()).toContain('已删除标签「标签」');
      await click('dialog-close');
      expect(vm.dialog).toBeNull();
    });

    it('标签对话框：空板提示；编辑已被删除的标签直接重设颜色', async () => {
      installed.labels.value = [];
      await click('labels-open');
      expect($('label-manager').text()).toContain('当前看板还没有标签');
      vm.updateLabelEditor({ name: '无编辑器' });
      await vm.saveLabelEditor();
      await click('create-label');
      vm.updateLabelEditor({ name: '幽灵', color: '#123456' });
      await settle();
      expect(vm.labelEditor?.labelId).toBeNull();
      await click('label-editor-cancel');
      installed.labels.value = [label];
      await settle();
      await click($$('label-edit')[0]);
      installed.labels.value = [];
      await click('label-editor-save');
      expect(actions.renameLabel).toHaveBeenCalledWith(label.id, label.name);
      expect(actions.recolorLabel).toHaveBeenCalledWith(label.id, label.color);

      // 删除失败：回到列表、给出提示，不出「已删除」提示
      installed.labels.value = [label];
      await settle();
      vi.mocked(actions.executeLabelDelete).mockRejectedValueOnce(new Error('标签引用已变化'));
      await click($$('label-delete')[0]);
      await click('confirm-delete-yes');
      expect(vm.dialog?.kind).toBe('labels');
      expect($('board-notice').text()).toContain('标签引用已变化');
      expect($('board-toast').exists()).toBe(false);
    });

    it('本列排序：执行中阻止重复；无变化提示不可撤销；失败复位', async () => {
      vm.sortingColumnId = firstColumn.id;
      await vm.sortColumnBy(firstColumn.id, 'title');
      expect(actions.sortColumn).not.toHaveBeenCalled();
      vm.sortingColumnId = null;
      await openColumnMenu(firstColumn.id);
      await click('column-sort-due');
      expect($('board-toast').text()).toContain('已按截止日排序「first」');
      vi.mocked(actions.sortColumn).mockResolvedValueOnce({ written: false });
      await openColumnMenu(firstColumn.id);
      await click('column-sort-title');
      expect(vm.toast).toEqual({ message: '已按目标顺序排列，无变化', undoable: false });
      expect($('board-toast-undo').exists()).toBe(false);
      await click('board-toast-close');
      expect($('board-toast').exists()).toBe(false);
      vi.mocked(actions.sortColumn).mockRejectedValueOnce(new Error('排序失败'));
      await openColumnMenu(firstColumn.id);
      await click('column-sort-due');
      expect(vm.sortingColumnId).toBeNull();
      expect($('board-notice').text()).toContain('排序失败');
      await click('board-notice-close');
      expect($('board-notice').exists()).toBe(false);
    });

    it('导出备份透传宿主回调；缺省给占位提示（空库也可导出）', async () => {
      await click('board-menu-trigger');
      expect($('popover').attributes('aria-label')).toBe('看板操作');
      await click('export-backup');
      expect($('board-notice').text()).toContain('宿主接线');
      const exportBackup = vi.fn(async () => undefined);
      mountView(
        { currentBoard: ref<Board | null>(null), currentBoardId: ref<UUID | null>(null), boards: ref<Board[]>([]) },
        { onExportBackup: exportBackup }
      );
      await click('board-menu-trigger');
      expect($('delete-board').attributes('disabled')).toBeDefined();
      await click('export-backup');
      expect(exportBackup).toHaveBeenCalledOnce();
      expect($('board-toast').text()).toContain('备份已生成');
    });

    it('无当前板 / 无详情 / 无弹层时各入口零调用', async () => {
      installed.currentBoard.value = null;
      await settle();
      expect($('labels-open').attributes('disabled')).toBeDefined();
      expect($('columns').exists()).toBe(false);
      expect($('empty-board').text()).toContain('请选择看板');
      await vm.confirmBoardDelete();
      await vm.commitBoardTitle();
      await vm.commitBoardDescription();
      expect(actions.planBoardDelete).not.toHaveBeenCalled();
      const event = { currentTarget: document.body } as unknown as Event;
      vm.openDetailColumnPicker(event);
      vm.openDetailLabelPicker(event);
      await vm.choosePickerOption(label.id);
      await vm.commitDetailTitle();
      await vm.commitDetailDescription();
      await vm.commitDetailDue('2026-01-01');
      await vm.executeConfirmedDelete();
      await vm.commitColumnTitle();
      vm.closePopover();
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      vm.updateLabelEditor({ name: 'x' });
      await vm.saveLabelEditor();
      await vm.commitAddColumn();
      await vm.commitAddTask();
      expect(vm.popover).toBeNull();
      expect(actions.saveTaskFields).not.toHaveBeenCalled();
      expect(actions.createColumn).not.toHaveBeenCalled();
      expect(actions.createTask).not.toHaveBeenCalled();

      installed.boards.value = [];
      await settle();
      expect($('empty-board').text()).toContain('还没有看板');
      await click('create-board-empty');
      expect($('board-composer').exists()).toBe(true);
    });

    it('卡片编辑取消、列 / 列底取消、拖拽无主时零调用', async () => {
      vm.cancelTaskTitle();
      await click('create-column');
      await press(wrapper.get('[data-testid="column-composer-input"]'), 'Escape');
      expect(vm.addingColumn).toBe(false);
      await click('create-column');
      await click('column-composer-cancel');
      expect(vm.addingColumn).toBe(false);
      vi.mocked(actions.createColumn).mockRejectedValueOnce(new Error('失败'));
      await click('create-column');
      await setInput(wrapper.get('[data-testid="column-composer-input"]'), '列');
      await click('column-composer-submit');
      expect(vm.addingColumn).toBe(true);

      const drag = { clientX: 10, clientY: 50, preventDefault: vi.fn(), dataTransfer: { getData: () => '' } };
      vm.onTaskDragOver(drag as unknown as DragEvent);
      vm.onColumnDragOver(drag as unknown as DragEvent);
      await vm.onColumnDrop(drag as unknown as DragEvent);
      await vm.onTaskDrop(drag as unknown as DragEvent);
      expect(wrapper.findAll('.is-drop-before, .is-drop-after, .is-drop-end, .is-drop-target')).toHaveLength(0);
      expect(actions.moveColumn).not.toHaveBeenCalled();
      await vm.moveTaskBy(first, 'up');
      expect(actions.moveTask).not.toHaveBeenCalled();
    });

    it('非 Error 拒绝也转成提示；撤销 / 重做透传', async () => {
      vi.mocked(actions.undo).mockRejectedValueOnce('字符串原因');
      await click('undo');
      expect($('board-notice').text()).toContain('字符串原因');
      await vm.redo();
      expect(actions.redo).toHaveBeenCalledOnce();
      vi.mocked(actions.moveTask).mockRejectedValueOnce('移动原因');
      await vm.moveTaskBy(first, 'right');
      expect(vm.notice).toBe('移动原因');
    });
  });

  describe('页头、横幅与生命周期', () => {
    it('选板事件：切到所选板；被拒时选择器回到实际当前板', async () => {
      const next = { id: id('next'), title: '下一块', description: null } as Board;
      installed.boards.value = [current, next];
      await settle();
      const selector = wrapper.get('[data-testid="board-selector"]');
      expect(element<HTMLSelectElement>('[data-testid="board-selector"]').value).toBe('board');
      await selector.setValue('next');
      expect(installed.selectBoard).toHaveBeenCalledWith('next');
      expect((selector.element as HTMLSelectElement).value).toBe('board');
      installed.currentBoardId.value = next.id;
      await settle();
      expect(element<HTMLSelectElement>('[data-testid="board-selector"]').value).toBe('next');
    });

    it('提示与操作提示定时消失，跨午夜刷新今天', async () => {
      unmountView();
      vi.useFakeTimers();
      mountView();
      // 排序走 guard（会先清掉旧提示），所以先排序出 toast、再导出出提示
      await openColumnMenu(firstColumn.id);
      await click('column-sort-due');
      await click('board-menu-trigger');
      await click('export-backup');
      expect(vm.notice).not.toBeNull();
      expect(vm.toast).not.toBeNull();
      vi.advanceTimersByTime(6000);
      expect(vm.notice).toBeNull();
      expect(vm.toast).toBeNull();
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      expect(vm.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('读取中 / 读取失败 / 恢复中横幅与写门禁', async () => {
      mountView({ loading: ref(true), currentBoard: ref<Board | null>(null) });
      expect($('board-loading').exists()).toBe(true);
      expect($('empty-board').exists()).toBe(false);
      expect($('create-board').attributes('disabled')).toBeDefined();

      mountView({ readError: ref<string | null>('读失败'), currentBoard: ref<Board | null>(null) });
      expect($('board-read-error').text()).toContain('读取看板数据失败：读失败');
      await click('board-read-retry');
      expect(installed.retryReads).toHaveBeenCalledOnce();

      mountView({ restoring: ref(true) });
      expect($('restoring-badge').text()).toBe('恢复中');
      expect($('restoring-note').exists()).toBe(true);
      for (const testId of ['create-board', 'create-column', 'undo', 'redo', 'rename-board']) {
        expect($(testId).attributes('disabled'), testId).toBeDefined();
      }
      expect($$('add-task').every(button => button.attributes('disabled') !== undefined)).toBe(true);
      expect(cardOf(first.id).attributes('draggable')).toBe('false');
      expect($('labels-open').attributes('disabled')).toBeUndefined();
    });

    it('生命周期读取跨页恢复标记并卸载监听', async () => {
      expect(installed.setRestoring).toHaveBeenLastCalledWith(false);
      vi.mocked(localStorage.getItem).mockReturnValue('restoring');
      window.dispatchEvent(new StorageEvent('storage', { key: RESTORING_MARKER_KEY }));
      expect(installed.setRestoring).toHaveBeenLastCalledWith(true);
      unmountView();
      vi.mocked(installed.setRestoring).mockClear();
      window.dispatchEvent(new StorageEvent('storage'));
      expect(installed.setRestoring).not.toHaveBeenCalled();
      // 卸载后全局快捷键不再响应
      const after = keydown('?');
      document.body.dispatchEvent(after);
      expect(after.defaultPrevented).toBe(false);
    });

    it('弹层标签与颜色辅助', () => {
      for (const [kind, targetId, expected] of [
        ['board-menu', null, '看板操作'],
        ['column-menu', firstColumn.id, '列操作：first'],
        ['task-menu', first.id, '任务操作：A'],
        ['detail-label-picker', first.id, '选择标签'],
        ['move-picker', first.id, '移到列']
      ] as const) {
        expect(vm.popoverLabel({ kind, targetId, top: 0, left: 0, width: 240 })).toBe(expected);
      }
      expect(vm.popoverLabel({ kind: 'task-menu', targetId: id('missing'), top: 0, left: 0, width: 1 })).toBe(
        '任务操作：'
      );
      expect(vm.previewColor('#12')).toBe(BOARD_LABEL_COLORS[0].color);
      expect(vm.previewColor(' #000000 ')).toBe('#000000');
      expect(vm.sameColor('#ABCDEF', ' #abcdef ')).toBe(true);
      expect(vm.countLabel(firstColumn)).toBe('2 个任务');
      expect(vm.canMoveTask(first, 'up')).toBe(false);
      expect(vm.canMoveTask(first, 'right')).toBe(true);
      expect(vm.columnTitleOf(null)).toBe('');
      expect(vm.searchUnavailableText('plugin_not_installed')).toBe('搜索插件未安装');
      expect(vm.searchUnavailableText('adapter_unsupported')).toBe('当前适配器不支持搜索');
      expect(vm.searchUnavailableText('query_failed')).toBe('搜索查询失败');
      expect(vm.searchUnavailableText(null)).toBe('');
    });

    it('选择器键盘：上下循环、回车选中或创建；Esc 关闭，其余按键透传', async () => {
      await openDetailOf(first.id);
      await click('detail-labels');
      const filter = () => wrapper.get('[data-testid="picker-filter"]');
      await press(filter(), 'ArrowUp');
      expect(vm.pickerActive).toBe(1);
      expect($$('picker-option')[1].classes()).toContain('is-active');
      await press(filter(), 'ArrowDown');
      expect(vm.pickerActive).toBe(0);
      await press(filter(), 'Enter');
      expect(vm.pickerOptions[0].selected).toBe(true);
      await setInput(filter(), '全新');
      await press(filter(), 'Enter');
      expect(actions.createLabel).toHaveBeenCalledOnce();
      await setInput(filter(), '标签');
      expect(vm.canCreateLabelFromPicker).toBe(false);
      const passthrough = await press(filter(), 'x');
      expect(passthrough.defaultPrevented).toBe(false);
      await setInput(filter(), '不存在');
      await press(filter(), 'ArrowDown');
      await press(wrapper.get('[data-testid="popover"]'), 'x');
      expect(vm.popover).not.toBeNull();
      await press(wrapper.get('[data-testid="popover"]'), 'Escape');
      expect(vm.popover).toBeNull();
      // 关闭即提交标签：等这笔保存落定（它的写入口会先清掉旧提示）
      await vi.waitFor(() => expect(vm.detailStatus).toBe('已保存'));
      await vm.choosePickerOption(label.id);
      vi.mocked(actions.createLabel).mockRejectedValueOnce(new Error('重名'));
      await click('detail-labels');
      await setInput(filter(), '重名');
      await click('picker-create');
      expect(vm.notice).toBe('重名');
      await setInput(filter(), '');
      await press(filter(), 'Enter');
      await vm.createLabelFromPicker();
      expect(vm.canCreateLabelFromPicker).toBe(false);
    });
  });

  describe('搜索（对话框）', () => {
    it('搜索插件探测：未安装 / 适配器不支持 / 可用分别下发原因或上游；props 代理先 toRaw', () => {
      const upstream = { searchCollection: vi.fn() };
      const cases: [readonly unknown[], unknown][] = [
        [[], { searchUnavailableReason: 'plugin_not_installed' }],
        [[{}], { searchUnavailableReason: 'adapter_unsupported' }],
        [[upstream], { search: { upstream } }]
      ];
      for (const [plugins, expected] of cases) {
        bridge.calls.length = 0;
        const db = reactive({ getPlugins: (name: string) => (name === 'search' ? plugins : []) });
        mountView({}, {}, db as unknown as RxDB);
        const [received, options] = bridge.calls[0] as [object, unknown];
        expect(isProxy(received)).toBe(false);
        expect(options).toEqual(expected);
      }
    });

    const createHandle = (state: SearchHandle['state$'] = new BehaviorSubject('success' as const)): SearchHandle => ({
      state$: state,
      results$: of([result]),
      hasMore$: of(true),
      error$: of(undefined),
      setQuery: vi.fn(),
      loadMore: vi.fn(async () => undefined),
      retry: vi.fn(),
      clear: vi.fn(),
      destroy: vi.fn()
    });

    it('复用句柄、切板重建、点结果关闭对话框并定位高亮聚焦', async () => {
      const handle = createHandle();
      const source = { search: vi.fn(() => handle) } as unknown as BoardSearchSource;
      mountView({ searchSource: source });
      await click('search-open');
      const input = () => wrapper.get('[data-testid="board-search-input"]');
      expect(input().attributes('placeholder')).toBe('全文搜索标题与描述');
      await vi.waitFor(() => expect(document.activeElement).toBe(input().element));
      await setInput(input(), ' 搜索 ');
      await setInput(input(), '新词');
      expect(source.search).toHaveBeenCalledWith('搜索');
      expect(handle.setQuery).toHaveBeenCalledWith('新词');
      await click('board-search-more');
      expect(handle.loadMore).toHaveBeenCalledOnce();
      const hit = wrapper.get('[data-testid="board-search-result"]');
      expect(hit.find('.rxb-search-result-title').text()).toBe('A');
      expect(hit.find('.rxb-search-result-column').text()).toBe('first');
      expect(hit.find('.rxb-search-result-snippet').text()).toBe('匹配');

      const scrollIntoView = vi.fn();
      Object.defineProperty(cardOf(first.id).element, 'scrollIntoView', { value: scrollIntoView });
      vi.useFakeTimers();
      await hit.trigger('click');
      await nextTick();
      expect($('board-search').exists()).toBe(false);
      vi.advanceTimersByTime(1500);
      await click('search-open');
      await wrapper.get('[data-testid="board-search-result"]').trigger('click');
      await nextTick();
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'center' });
      expect(cardOf(first.id).classes()).toContain('is-search-hit');
      expect(document.activeElement).toBe(cardOf(first.id).element);
      vi.advanceTimersByTime(2000);
      await nextTick();
      expect(cardOf(first.id).classes()).not.toContain('is-search-hit');
      vi.useRealTimers();

      installed.boards.value = [current, { id: id('other'), title: '另一块' } as Board];
      await settle();
      await wrapper.get('[data-testid="board-selector"]').setValue('other');
      expect(handle.destroy).toHaveBeenCalledOnce();
      expect(source.search).toHaveBeenCalledTimes(2);
      await click('search-open');
      expect((input().element as HTMLInputElement).value).toBe('新词');
      await setInput(input(), ' ');
      expect(handle.destroy).toHaveBeenCalledTimes(2);
      expect($('board-search-results').exists()).toBe(false);
    });

    it('加载中 / 出错 / 无匹配三态，加载中不响应更多与点击；删板销毁句柄', async () => {
      const state = new BehaviorSubject<'idle' | 'loading' | 'success' | 'empty' | 'error'>('loading');
      const handle: SearchHandle = {
        ...createHandle(state),
        error$: of('查询炸了') as unknown as SearchHandle['error$']
      };
      mountView({ searchSource: { search: () => handle } as unknown as BoardSearchSource });
      await press(document.body, 'k', { metaKey: true });
      await setInput(wrapper.get('[data-testid="board-search-input"]'), '任务');
      expect($('board-search-loading').text()).toBe('搜索中…');
      state.next('error');
      await settle();
      expect($('board-search-error').text()).toBe('查询炸了');
      state.next('empty');
      await settle();
      expect($('board-search-empty').text()).toBe('无匹配');
      state.next('success');
      await settle();
      const hit = wrapper.get('[data-testid="board-search-result"]');
      state.next('loading');
      await (vm as unknown as { onSearchMore(): void }).onSearchMore();
      await (vm as unknown as { onSearchResultClick(value: SearchResult): void }).onSearchResultClick(result);
      expect(handle.loadMore).not.toHaveBeenCalled();
      expect(hit.text()).toContain('匹配');
      expect(vm.dialog?.kind).toBe('search');
      await click('dialog-close');

      await vm.confirmBoardDelete();
      await vm.executeConfirmedDelete();
      expect(handle.destroy).toHaveBeenCalledOnce();
    });

    it('搜索不可用：入口仍在，对话框说明原因且输入框禁用', async () => {
      mountView({ searchUnavailableReason: 'plugin_not_installed' });
      await click('search-open');
      expect($('board-search-unavailable').text()).toBe('搜索插件未安装');
      expect($('board-search-input').attributes('disabled')).toBeDefined();
      expect($('board-search-input').attributes('placeholder')).toBe('搜索插件未安装');
      await (vm as unknown as { onSearchInput(value: string): void }).onSearchInput('任务');
      await settle();
      expect($('board-search-results').text()).toBe('');
    });
  });

  describe('拖拽（只采集指针事件，落点由核心包换算）', () => {
    const dataTransfer = (payload: Record<string, string> = {}) => ({
      setData: vi.fn((key: string, value: string) => void (payload[key] = value)),
      getData: vi.fn((key: string) => payload[key] ?? '')
    });

    const mockRect = (target: Element, rect: DOMRect) =>
      vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect);

    /** 列宽 180、列距 200；列头高 30；卡片自 y=40 起每张高 50、间距 10。 */
    const layout = (): void => {
      for (const [index, column] of wrapper.findAll('[data-testid="column"]').entries()) {
        mockRect(column.element, new DOMRect(index * 200, 0, 180, 300));
        mockRect(column.get('[data-testid="column-header"]').element, new DOMRect(index * 200, 0, 180, 30));
        column
          .findAll('[data-testid="task-card"]')
          .forEach((card, row) => mockRect(card.element, new DOMRect(index * 200, 40 + row * 60, 180, 50)));
      }
    };

    it('筛选状态下拖拽：两侧邻居都被隐藏时退回整列反馈，落点仍取完整序列', async () => {
      await setInput(wrapper.get('[data-testid="board-filter-input"]'), 'label:标签');
      layout();
      const transfer = dataTransfer();
      await cardOf(first.id).trigger('dragstart', { dataTransfer: transfer });
      await wrapper.get('[data-column-id="second"]').trigger('dragover', { clientX: 210, clientY: 100 });
      expect(wrapper.get('[data-column-id="second"]').classes()).toContain('is-drop-end');
      expect(wrapper.findAll('.is-drop-before, .is-drop-after')).toHaveLength(0);
      await wrapper
        .get('[data-column-id="second"]')
        .trigger('drop', { dataTransfer: transfer, clientX: 210, clientY: 100 });
      await settle();
      expect(actions.moveTask).toHaveBeenCalledWith(first.id, {
        kind: 'between',
        columnId: secondColumn.id,
        prevId: null,
        nextId: third.id
      });
    });

    it('Shift+F10 打开卡片菜单前先提交已开的标签选择器草稿', async () => {
      await openDetailOf(first.id);
      await click('detail-labels');
      await click(pickerOption('标签'));
      await press(cardOf(first.id).element, 'F10', { shiftKey: true });
      expect(vm.popover?.kind).toBe('task-menu');
      await vi.waitFor(() =>
        expect(actions.saveTaskFields).toHaveBeenCalledWith(first.id, expect.anything(), { labelIds: [label.id] })
      );
    });

    it('任务拖拽：落点反馈识别首尾与空列，筛选隐藏的卡片仍按完整序列取邻居', async () => {
      layout();
      const transfer = dataTransfer();
      await openTaskMenu(first.id);
      await cardOf(first.id).trigger('dragstart', { dataTransfer: transfer });
      expect(transfer.setData).toHaveBeenCalledWith('application/x-board-task', first.id);
      expect($('popover').exists()).toBe(false);
      expect(cardOf(first.id).classes()).toContain('is-dragging');
      await cardOf(second.id).trigger('dragover', { clientX: 10, clientY: 140 });
      expect(cardOf(second.id).classes()).toContain('is-drop-after');
      expect(wrapper.get('[data-column-id="first"]').classes()).toContain('is-drop-target');
      await cardOf(third.id).trigger('dragover', { clientX: 210, clientY: 45 });
      expect(cardOf(third.id).classes()).toContain('is-drop-before');
      expect(wrapper.get('[data-column-id="second"]').classes()).toContain('is-drop-target');
      // 拖到自己卡片上 = 原位，无落点反馈
      await cardOf(first.id).trigger('dragover', { clientX: 10, clientY: 45 });
      expect(wrapper.findAll('.is-drop-before, .is-drop-after')).toHaveLength(0);
      await wrapper.get('[data-column-id="empty"]').trigger('dragover', { clientX: 410, clientY: 100 });
      expect(wrapper.get('[data-column-id="empty"]').classes()).toContain('is-drop-end');
      await wrapper.get('[data-testid="board-view"]').trigger('dragover', { clientX: -1, clientY: 45 });
      expect(wrapper.findAll('.is-drop-before, .is-drop-after, .is-drop-end')).toHaveLength(0);
      await wrapper
        .get('[data-column-id="second"]')
        .trigger('drop', { dataTransfer: transfer, clientX: 210, clientY: 45 });
      await settle();
      expect(actions.moveTask).toHaveBeenCalledWith(first.id, expect.objectContaining({ columnId: secondColumn.id }));
      expect(cardOf(first.id).classes()).not.toContain('is-dragging');
      expect($('board-toast').text()).toContain('已移动到「second」');

      // 载荷缺失时退回拖拽态；越界零写；dragend 清理
      await cardOf(first.id).trigger('dragstart');
      await wrapper.get('[data-column-id="first"]').trigger('drop', { clientX: -1, clientY: -1 });
      await settle();
      expect(actions.moveTask).toHaveBeenCalledOnce();
      await cardOf(first.id).trigger('dragstart', { dataTransfer: dataTransfer() });
      await wrapper.get('[data-testid="board-view"]').trigger('dragend');
      expect(vm.dragging).toBeNull();

      // 筛选下：几何只取可见卡片，邻居取完整序列
      await setInput(wrapper.get('[data-testid="board-filter-input"]'), 'has:due');
      layout();
      await cardOf(second.id).trigger('dragstart', { dataTransfer: dataTransfer() });
      await wrapper.get('[data-column-id="second"]').trigger('drop', { clientX: 210, clientY: 10 });
      await settle();
      expect(actions.moveTask).toHaveBeenLastCalledWith(second.id, {
        kind: 'between',
        columnId: secondColumn.id,
        prevId: null,
        nextId: third.id
      });
    });

    it('列拖拽与左右移：首尾不越界，本列排序与列移动走领域动作', async () => {
      layout();
      const transfer = dataTransfer();
      const headers = wrapper.findAll('[data-testid="column-header"]');
      await headers[0].trigger('dragstart', { dataTransfer: transfer });
      expect(headers[0].classes()).toContain('is-dragging');
      await headers[1].trigger('dragover', { clientX: 370, clientY: 5 });
      expect(headers[1].classes()).toContain('is-drop-after');
      // 列拖拽冒泡到列体的任务落点处理：不清理拖拽态
      await vm.onTaskDrop({ preventDefault: vi.fn(), clientX: 370, clientY: 5 } as unknown as DragEvent);
      expect(vm.dragging?.kind).toBe('column');
      await headers[0].trigger('dragover', { clientX: 10, clientY: 5 });
      expect(wrapper.findAll('.is-drop-before, .is-drop-after')).toHaveLength(0);
      await wrapper.get('[data-column-id="second"]').trigger('drop', { dataTransfer: transfer, clientX: 370 });
      await settle();
      expect(actions.moveColumn).toHaveBeenCalledWith(firstColumn.id, {
        prevId: secondColumn.id,
        nextId: emptyColumn.id
      });
      expect(vm.dragging).toBeNull();
      await headers[2].trigger('dragstart');
      await headers[0].trigger('dragover', { clientX: 10, clientY: 5 });
      expect(headers[0].classes()).toContain('is-drop-before');
      await wrapper.get('[data-testid="board-view"]').trigger('drop', { clientX: -1 });
      await settle();
      expect(actions.moveColumn).toHaveBeenCalledOnce();

      await vm.moveColumnBy(firstColumn.id, -1);
      await vm.moveColumnBy(emptyColumn.id, 1);
      expect(actions.moveColumn).toHaveBeenCalledOnce();
      await openColumnMenu(firstColumn.id);
      expect($('column-move-back').text()).toContain('已是最左列');
      expect($('column-move-back').attributes('disabled')).toBeDefined();
      await openColumnMenu(firstColumn.id);
      await openColumnMenu(emptyColumn.id);
      expect($('column-move-forward').text()).toContain('已是最右列');
      await openColumnMenu(secondColumn.id);
      await click('column-move-back');
      expect(actions.moveColumn).toHaveBeenLastCalledWith(secondColumn.id, { prevId: null, nextId: firstColumn.id });
      await openColumnMenu(secondColumn.id);
      await click('column-move-forward');
      expect(actions.moveColumn).toHaveBeenLastCalledWith(secondColumn.id, { prevId: emptyColumn.id, nextId: null });
    });
  });
});
