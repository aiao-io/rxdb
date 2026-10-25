import type { RxDB, UUID } from '@aiao/rxdb';
import {
  type Board,
  type BoardLabel,
  type BoardSearchSource,
  type Column,
  RESTORING_MARKER_KEY,
  type SearchHandle,
  type SearchResult,
  type Task,
  type TaskDraftSnapshot
} from '@aiao/rxdb-plugin-board';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UseBoardReturn } from '../use-board.js';

let state: UseBoardReturn;
vi.mock('../use-board.js', () => ({ useBoard: () => state }));

import { BoardView } from '../board-view.js';

const id = (value: number): UUID => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}` as UUID;
const current = { id: id(1), title: '板一' } as Board;
const second = { id: id(2), title: '板二' } as Board;
const columns = [3, 4, 5].map(
  (value, index) => ({ id: id(value), boardId: current.id, title: `列${index + 1}` }) as Column
);
const tasks = [6, 7, 8].map(
  (value, index) =>
    ({
      id: id(value),
      columnId: columns[0].id,
      title: `任务${index + 1}`,
      description: null,
      dueDate: ['2000-01-01', new Date().toLocaleDateString('sv-SE'), '2999-01-01'][index]
    }) as Task
);
const label = { id: id(9), boardId: current.id, name: '标签', color: '#e11d48' } as BoardLabel;
const snapshot = (task: Task): TaskDraftSnapshot => ({
  title: task.title,
  description: task.description,
  dueDate: task.dueDate,
  columnId: task.columnId,
  labelIds: []
});
const rxdb = { getPlugins: () => [] } as unknown as RxDB;
const click = (testId: string): void => {
  fireEvent.click(screen.getByTestId(testId));
};
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.stubGlobal(
    'prompt',
    vi.fn(() => null)
  );
  vi.stubGlobal(
    'confirm',
    vi.fn(() => false)
  );
  state = {
    searchSource: null,
    boards: [current, second],
    currentBoardId: current.id,
    currentBoard: current,
    columns,
    tasks,
    labels: [label],
    taskLabels: new Map([[tasks[0].id, [label]]]),
    restoring: false,
    undoCount: 1,
    redoCount: 1,
    writeEvent: null,
    selectBoard: vi.fn(),
    setRestoring: vi.fn(),
    actions: {
      createBoard: vi.fn().mockResolvedValue(current),
      createColumn: vi.fn().mockResolvedValue(columns[0]),
      createTask: vi.fn().mockResolvedValue(tasks[0]),
      updateBoard: vi.fn().mockResolvedValue(current),
      updateColumn: vi.fn().mockResolvedValue(columns[0]),
      updateTaskTitle: vi.fn().mockResolvedValue(tasks[0]),
      openSnapshot: vi.fn(async taskId => snapshot(tasks.find(task => task.id === taskId)!)),
      saveTaskDraft: vi.fn().mockResolvedValue({ kind: 'unchanged' }),
      planTaskDelete: vi
        .fn()
        .mockResolvedValue({ kind: 'task', taskId: tasks[0].id, taskTitle: tasks[0].title, taskLabelIds: [] }),
      planColumnDelete: vi.fn().mockResolvedValue({
        kind: 'column',
        columnId: columns[0].id,
        columnTitle: columns[0].title,
        taskIds: [tasks[0].id],
        taskLabelIds: []
      }),
      planBoardDelete: vi.fn().mockResolvedValue({
        kind: 'board',
        boardId: current.id,
        boardTitle: current.title,
        columnIds: columns.map(column => column.id),
        taskIds: tasks.map(task => task.id),
        taskLabelIds: [],
        boardLabelIds: [label.id]
      }),
      executeDelete: vi.fn().mockResolvedValue(undefined),
      moveTask: vi.fn().mockResolvedValue(undefined),
      moveColumn: vi.fn().mockResolvedValue(undefined),
      sortColumn: vi.fn().mockResolvedValue({ written: true }),
      createLabel: vi.fn().mockResolvedValue(label),
      renameLabel: vi.fn().mockResolvedValue(label),
      recolorLabel: vi.fn().mockResolvedValue(label),
      planLabelDelete: vi.fn().mockResolvedValue({ labelId: label.id, labelName: label.name, taskLabelIds: [] }),
      executeLabelDelete: vi.fn().mockResolvedValue(undefined),
      undo: vi.fn().mockResolvedValue(undefined),
      redo: vi.fn().mockResolvedValue(undefined)
    }
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('看板公开交互', () => {
  it('删除其他列不打断正在加载的详情', async () => {
    let resolve!: (value: TaskDraftSnapshot) => void;
    vi.mocked(state.actions.openSnapshot).mockReturnValueOnce(
      new Promise(done => {
        resolve = done;
      })
    );
    vi.mocked(state.actions.planColumnDelete).mockResolvedValueOnce({
      kind: 'column',
      columnId: columns[1].id,
      columnTitle: columns[1].title,
      taskIds: [],
      taskLabelIds: []
    });
    render(<BoardView rxdb={rxdb} />);
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    fireEvent.click(screen.getAllByTestId('column-delete')[1]);
    fireEvent.click(await screen.findByTestId('confirm-delete-yes'));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      resolve(snapshot(tasks[0]));
    });
    expect(screen.getByTestId('detail-panel')).toBeTruthy();
  });

  it('删除所属列后应丢弃此前尚未返回的详情快照', async () => {
    let resolve!: (value: TaskDraftSnapshot) => void;
    vi.mocked(state.actions.openSnapshot).mockReturnValueOnce(
      new Promise(done => {
        resolve = done;
      })
    );
    const view = render(<BoardView rxdb={rxdb} />);
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    expect(state.actions.openSnapshot).toHaveBeenCalledWith(tasks[0].id);
    fireEvent.click(screen.getAllByTestId('column-delete')[0]);
    fireEvent.click(await screen.findByTestId('confirm-delete-yes'));
    await waitFor(() => expect(state.actions.executeDelete).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    state = { ...state, tasks: [], columns: columns.slice(1) };
    view.rerender(<BoardView rxdb={rxdb} />);
    await act(async () => {
      resolve(snapshot(tasks[0]));
    });
    expect(screen.queryByTestId('detail-panel')).toBeNull();
  });

  it('确认删除包含当前任务的板后关闭已失效的详情', async () => {
    render(<BoardView rxdb={rxdb} />);
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    await screen.findByTestId('detail-panel');
    fireEvent.change(screen.getByTestId('detail-description'), { target: { value: '待删除草稿' } });
    click('delete-board');
    fireEvent.click(await screen.findByTestId('confirm-delete-yes'));
    await waitFor(() => expect(screen.queryByTestId('detail-panel')).toBeNull());
  });

  it('创建任务在同一轮重复 Enter 只提交一次，失败后允许重试', async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(state.actions.createTask).mockReturnValueOnce(
      new Promise((_resolve, fail) => {
        reject = fail;
      })
    );
    render(<BoardView rxdb={rxdb} />);
    fireEvent.click(screen.getAllByTestId('add-task')[0]);
    const input = screen.getByTestId('add-task-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '只创建一次' } });
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(state.actions.createTask).toHaveBeenCalledTimes(1);
    expect(input.disabled).toBe(true);
    await act(async () => {
      reject(new Error('创建失败'));
    });
    expect(input.value).toBe('只创建一次');
    expect(input.disabled).toBe(false);
    click('add-task-submit');
    await waitFor(() => expect(screen.queryByTestId('add-task-form')).toBeNull());
    expect(state.actions.createTask).toHaveBeenCalledTimes(2);
  });

  it('创建和改名遵守取消、提交约定，导出调用宿主', async () => {
    const onExportBackup = vi.fn();
    render(<BoardView rxdb={rxdb} onExportBackup={onExportBackup} />);
    click('create-board');
    fireEvent.change(screen.getByTestId('board-composer-input'), { target: { value: '新板' } });
    click('board-composer-submit');
    click('create-column');
    fireEvent.change(screen.getByTestId('column-composer-input'), { target: { value: '新列' } });
    click('column-composer-submit');
    click('create-column');
    click('column-composer-cancel');
    fireEvent.click(screen.getByTestId('rename-board'));
    fireEvent.change(screen.getByTestId('board-title-editor'), { target: { value: '改板' } });
    click('board-title-save');
    fireEvent.click(screen.getAllByTestId('column-actions')[0]);
    fireEvent.click(screen.getAllByTestId('column-rename')[0]);
    fireEvent.change(screen.getByTestId('column-title-editor'), { target: { value: '改列' } });
    click('column-title-save');
    click('create-label');
    click('label-composer-cancel');
    click('create-label');
    fireEvent.change(screen.getByTestId('label-composer-input'), { target: { value: '新标签' } });
    fireEvent.change(screen.getByTestId('label-composer-color'), { target: { value: '#123456' } });
    click('label-composer-submit');
    fireEvent.click(screen.getByRole('button', { name: '改名' }));
    const labelEditor = screen.getByRole('textbox', { name: `标签名称 ${label.name}` });
    fireEvent.change(labelEditor, { target: { value: '改标签' } });
    fireEvent.keyDown(labelEditor, { key: 'Enter' });
    click('export-backup');
    click('undo');
    click('redo');
    await waitFor(() => expect(state.actions.createLabel).toHaveBeenCalledWith({ name: '新标签', color: '#123456' }));
    expect(state.actions.createBoard).toHaveBeenCalledWith({ title: '新板' });
    expect(state.actions.createColumn).toHaveBeenCalledWith({ title: '新列' });
    expect(state.actions.updateBoard).toHaveBeenCalledWith(current.id, { title: '改板' });
    expect(state.actions.updateColumn).toHaveBeenCalledWith(columns[0].id, { title: '改列' });
    expect(state.actions.renameLabel).toHaveBeenCalledWith(label.id, '改标签');
    expect(onExportBackup).toHaveBeenCalledOnce();
  });

  it('内联任务支持提交、失败保留、Esc 和按钮取消', async () => {
    render(<BoardView rxdb={rxdb} />);
    const add = (): void => {
      fireEvent.click(screen.getAllByTestId('add-task')[0]);
    };
    add();
    fireEvent.keyDown(screen.getByTestId('add-task-input'), { key: 'Enter' });
    expect(screen.queryByTestId('add-task-form')).toBeNull();
    add();
    fireEvent.keyDown(screen.getByTestId('add-task-input'), { key: 'Escape' });
    add();
    click('add-task-cancel');
    add();
    fireEvent.change(screen.getByTestId('add-task-input'), { target: { value: ' 新任务 ' } });
    vi.mocked(state.actions.createTask).mockRejectedValueOnce(new Error('写入失败'));
    click('add-task-submit');
    await screen.findByText('写入失败');
    expect((screen.getByTestId('add-task-input') as HTMLInputElement).value).toBe(' 新任务 ');
    click('board-notice-close');
    click('add-task-submit');
    await waitFor(() => expect(screen.queryByTestId('add-task-form')).toBeNull());
    expect(state.actions.createTask).toHaveBeenCalledWith({ columnId: columns[0].id, title: '新任务' });
    fireEvent.click(screen.getAllByTestId('task-edit-title')[0]);
    fireEvent.keyDown(screen.getByTestId('task-title-editor'), { key: 'Escape' });
    fireEvent.click(screen.getAllByTestId('task-edit-title')[0]);
    click('task-title-cancel');
    fireEvent.click(screen.getAllByTestId('task-edit-title')[0]);
    fireEvent.change(screen.getByTestId('task-title-editor'), { target: { value: '已修改' } });
    fireEvent.keyDown(screen.getByTestId('task-title-editor'), { key: 'Enter' });
    await waitFor(() => expect(screen.queryByTestId('task-title-editor')).toBeNull());
    expect(state.actions.updateTaskTitle).toHaveBeenCalledWith(tasks[0].id, '已修改');
  });

  it('删除完整确认清单，标签先确认才写', async () => {
    render(<BoardView rxdb={rxdb} />);
    click('delete-board');
    expect((await screen.findByTestId('confirm-delete')).textContent).toContain('3 列、3 任务');
    click('confirm-delete-yes');
    await waitFor(() => expect(state.actions.executeDelete).toHaveBeenCalledOnce());
    expect(state.actions.executeDelete).toHaveBeenCalledWith(await state.actions.planBoardDelete(current.id));
    fireEvent.click(screen.getByRole('button', { name: '删除标签 标签' }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(state.actions.executeLabelDelete).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '删除标签 标签' }));
    await waitFor(() => expect(state.actions.executeLabelDelete).toHaveBeenCalledOnce());
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    await screen.findByTestId('detail-panel');
    click('detail-delete');
    expect((await screen.findByTestId('confirm-delete')).textContent).toContain('删除任务');
    click('confirm-delete-yes');
    await waitFor(() => expect(state.actions.executeDelete).toHaveBeenCalledTimes(2));
  });

  it('详情取消和切板保留脏草稿，保存传递所有字段', async () => {
    render(<BoardView rxdb={rxdb} />);
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    await screen.findByTestId('detail-panel');
    fireEvent.change(screen.getByTestId('detail-description'), { target: { value: '描述' } });
    fireEvent.change(screen.getByTestId('detail-due'), { target: { value: '2030-02-01' } });
    fireEvent.click(screen.getByTestId('detail-label-check'));
    fireEvent.click(screen.getByTestId('detail-label-check'));
    fireEvent.click(screen.getByTestId('detail-label-check'));
    click('detail-cancel');
    expect(screen.queryByTestId('detail-panel')).not.toBeNull();
    fireEvent.change(screen.getByTestId('board-selector'), { target: { value: second.id } });
    expect(state.selectBoard).not.toHaveBeenCalled();
    vi.mocked(state.actions.saveTaskDraft).mockRejectedValueOnce('保存失败');
    click('detail-save');
    await screen.findByText('保存失败');
    click('detail-save');
    await waitFor(() => expect(screen.queryByTestId('detail-panel')).toBeNull());
    expect(state.actions.saveTaskDraft).toHaveBeenLastCalledWith(tasks[0].id, snapshot(tasks[0]), {
      title: tasks[0].title,
      description: '描述',
      dueDate: '2030-02-01',
      labelIds: [label.id]
    });
    fireEvent.click(screen.getAllByTestId('task-title')[1]);
    await screen.findByTestId('detail-panel');
    click('detail-cancel');
    expect(screen.queryByTestId('detail-panel')).toBeNull();
    fireEvent.click(screen.getAllByTestId('task-title')[1]);
    await screen.findByTestId('detail-panel');
    fireEvent.change(screen.getByTestId('detail-title'), { target: { value: '脏草稿' } });
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.change(screen.getByTestId('board-selector'), { target: { value: second.id } });
    expect(state.selectBoard).toHaveBeenCalledWith(second.id);
    expect(screen.queryByTestId('detail-panel')).toBeNull();
  });

  it('详情快照晚到不覆盖后打开的任务，关闭和切板使请求过期', async () => {
    let resolveFirst: ((value: TaskDraftSnapshot) => void) | undefined;
    vi.mocked(state.actions.openSnapshot).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveFirst = resolve;
        })
    );
    render(<BoardView rxdb={rxdb} />);
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    fireEvent.click(screen.getAllByTestId('task-title')[1]);
    await screen.findByTestId('detail-panel');
    await act(async () => {
      resolveFirst?.(snapshot(tasks[0]));
    });
    expect((screen.getByTestId('detail-title') as HTMLInputElement).value).toBe(tasks[1].title);
    fireEvent.change(screen.getByTestId('detail-title'), { target: { value: '编辑' } });
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getAllByTestId('task-title')[2]);
    await waitFor(() => expect((screen.getByTestId('detail-title') as HTMLInputElement).value).toBe(tasks[2].title));
    click('detail-cancel');
    vi.mocked(state.actions.openSnapshot).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveFirst = resolve;
        })
    );
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    fireEvent.change(screen.getByTestId('board-selector'), { target: { value: second.id } });
    await act(async () => {
      resolveFirst?.(snapshot(tasks[0]));
    });
    expect(screen.queryByTestId('detail-panel')).toBeNull();
  });

  it('列移动边界无写，排序无变化有提示，移动失败保留详情', async () => {
    render(<BoardView rxdb={rxdb} />);
    fireEvent.click(screen.getAllByTestId('column-move-back')[0]);
    fireEvent.click(screen.getAllByTestId('column-move-forward')[2]);
    expect(state.actions.moveColumn).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByTestId('column-move-forward')[0]);
    fireEvent.click(screen.getAllByTestId('column-move-back')[2]);
    await waitFor(() => expect(state.actions.moveColumn).toHaveBeenCalledTimes(2));
    vi.mocked(state.actions.sortColumn).mockResolvedValueOnce({ written: false });
    fireEvent.click(screen.getAllByTestId('column-sort-title')[0]);
    await screen.findByText('已按目标顺序排列，无变化');
    fireEvent.click(screen.getAllByTestId('column-sort-due')[0]);
    click('export-backup');
    await screen.findByText('备份导出由宿主接线（US-537）');
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    await screen.findByTestId('detail-panel');
    click('move-task');
    await screen.findByText('任务已在该位置');
    fireEvent.change(screen.getByTestId('move-column'), { target: { value: columns[1].id } });
    vi.mocked(state.actions.moveTask).mockRejectedValueOnce(new Error('移动失败'));
    click('move-task');
    await screen.findByText('移动失败');
    expect(screen.queryByTestId('detail-panel')).not.toBeNull();
  });

  it('空态仍可建板和选择其他板，恢复中禁写', () => {
    state = { ...state, currentBoard: null, currentBoardId: null };
    const fixture = render(<BoardView rxdb={rxdb} />);
    click('create-board-empty');
    fireEvent.change(screen.getByTestId('board-composer-input'), { target: { value: '空态建板' } });
    click('board-composer-submit');
    expect(state.actions.createBoard).toHaveBeenCalledWith({ title: '空态建板' });
    state = {
      ...state,
      currentBoard: current,
      currentBoardId: current.id,
      restoring: true,
      undoCount: 0,
      redoCount: 0
    };
    fixture.rerender(<BoardView rxdb={rxdb} />);
    expect(screen.getByTestId('restoring-badge').textContent).toBe('恢复中');
    expect((screen.getByTestId('undo') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('redo') as HTMLButtonElement).disabled).toBe(true);
    fireEvent(window, new StorageEvent('storage', { key: RESTORING_MARKER_KEY }));
    expect(state.setRestoring).toHaveBeenCalled();
  });
});

describe('详情请求与当前编辑意图', () => {
  it('重选当前任务保留脏草稿且取消另一任务的慢请求', async () => {
    let finish: ((value: TaskDraftSnapshot) => void) | undefined;
    render(<BoardView rxdb={rxdb} />);
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    await screen.findByTestId('detail-panel');
    vi.mocked(state.actions.openSnapshot).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    fireEvent.click(screen.getAllByTestId('task-title')[1]);
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    await act(async () => {
      finish?.(snapshot(tasks[1]));
    });
    expect((screen.getByTestId('detail-title') as HTMLInputElement).value).toBe(tasks[0].title);
    expect(state.actions.openSnapshot).toHaveBeenCalledTimes(2);
    fireEvent.change(screen.getByTestId('detail-title'), { target: { value: '保留当前草稿' } });
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    expect(window.confirm).not.toHaveBeenCalled();
    expect((screen.getByTestId('detail-title') as HTMLInputElement).value).toBe('保留当前草稿');
    expect(state.actions.openSnapshot).toHaveBeenCalledTimes(2);
  });

  it('等待另一任务快照时继续编辑，迟到快照不得覆盖新草稿', async () => {
    let finish: ((value: TaskDraftSnapshot) => void) | undefined;
    render(<BoardView rxdb={rxdb} />);
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    await screen.findByTestId('detail-panel');
    vi.mocked(state.actions.openSnapshot).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    fireEvent.click(screen.getAllByTestId('task-title')[1]);
    fireEvent.change(screen.getByTestId('detail-description'), { target: { value: '等待期间新增的草稿' } });
    await act(async () => {
      finish?.(snapshot(tasks[1]));
    });
    expect((screen.getByTestId('detail-title') as HTMLInputElement).value).toBe(tasks[0].title);
    expect((screen.getByTestId('detail-description') as HTMLTextAreaElement).value).toBe('等待期间新增的草稿');
  });
});

describe('看板搜索生命周期', () => {
  it('反映加载、空态、失败、分页与高亮，清空及切板销毁旧句柄', async () => {
    const status = new BehaviorSubject<'idle' | 'loading' | 'success' | 'empty' | 'error'>('loading');
    const results = new BehaviorSubject<readonly SearchResult[]>([]);
    const hasMore = new BehaviorSubject(false);
    const handle: SearchHandle = {
      state$: status,
      results$: results,
      hasMore$: hasMore,
      error$: of(undefined),
      setQuery: vi.fn(),
      loadMore: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
      retry: vi.fn(),
      destroy: vi.fn()
    };
    const search = vi.fn(() => handle);
    state = { ...state, searchSource: { search } as unknown as BoardSearchSource };
    HTMLElement.prototype.scrollIntoView = vi.fn();
    render(<BoardView rxdb={rxdb} />);
    const input = screen.getByTestId('board-search-input');
    fireEvent.change(input, { target: { value: ' 任务 ' } });
    expect(search).toHaveBeenCalledWith('任务');
    expect(screen.getByTestId('board-search-loading')).toBeTruthy();
    act(() => {
      status.next('empty');
    });
    expect(screen.getByTestId('board-search-empty')).toBeTruthy();
    act(() => {
      status.next('error');
    });
    expect(screen.getByTestId('board-search-error')).toBeTruthy();
    act(() => {
      status.next('success');
      results.next([
        { id: tasks[0].id, entity: 'Task', collection: 'task', rank: 1, matchedField: 'title', snippet: '命中' },
        { id: id(99), entity: 'Task', collection: 'task', rank: 2, matchedField: 'title', snippet: '已删除' }
      ]);
      hasMore.next(true);
    });
    fireEvent.click(screen.getAllByTestId('board-search-result')[0]);
    expect(screen.getAllByTestId('task-card')[0].classList.contains('search-hit')).toBe(true);
    fireEvent.click(screen.getAllByTestId('board-search-result')[0]);
    click('board-search-more');
    expect(handle.loadMore).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { value: '下一个词' } });
    expect(handle.setQuery).toHaveBeenCalledWith('下一个词');
    fireEvent.change(screen.getByTestId('board-selector'), { target: { value: second.id } });
    expect(handle.destroy).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledTimes(2);
    fireEvent.change(input, { target: { value: '' } });
    expect(handle.destroy).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('board-search-results')).toBeNull();
    expect(status.observed).toBe(false);
    expect(results.observed).toBe(false);
    expect(hasMore.observed).toBe(false);
    act(() => {
      status.next('loading');
      results.next([]);
    });
    expect(screen.queryByTestId('board-search-results')).toBeNull();
  });
});

describe('看板拖拽落点反馈', () => {
  const dragEvent = (name: string, x: number, y: number, data: Map<string, string>): MouseEvent => {
    const event = new MouseEvent(name, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        setData: (key: string, value: string) => data.set(key, value),
        getData: (key: string) => data.get(key) ?? ''
      }
    });
    return event;
  };

  it('卡片列首、列尾和列间落点显示反馈并提交领域动作，外部落点不写', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const columnIndex = columns.findIndex(
        column => column.id === this.dataset['columnId'] || column.id === this.dataset['columnHeaderId']
      );
      const taskIndex = tasks.findIndex(task => task.id === this.dataset['taskId']);
      return {
        left: Math.max(columnIndex, 0) * 100,
        right: (Math.max(columnIndex, 0) + 1) * 100,
        top: taskIndex < 0 ? 0 : 30 + taskIndex * 30,
        bottom: taskIndex < 0 ? 200 : 60 + taskIndex * 30,
        width: 100,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({})
      };
    });
    render(<BoardView rxdb={rxdb} />);
    const cards = screen.getAllByTestId('task-card');
    const renderedColumns = screen.getAllByTestId('column');
    const headers = screen.getAllByTestId('column-header');
    const data = new Map<string, string>();
    fireEvent(cards[2], dragEvent('dragstart', 20, 100, data));
    fireEvent(renderedColumns[0], dragEvent('dragover', 20, 31, data));
    expect(cards[0].classList.contains('drop-before')).toBe(true);
    fireEvent(renderedColumns[0], dragEvent('dragover', 20, 65, data));
    expect(cards[0].classList.contains('drop-after')).toBe(true);
    fireEvent(renderedColumns[1], dragEvent('dragover', 150, 150, data));
    expect(renderedColumns[1].classList.contains('drop-end')).toBe(true);
    fireEvent(renderedColumns[1], dragEvent('drop', 150, 150, data));
    await waitFor(() =>
      expect(state.actions.moveTask).toHaveBeenCalledWith(tasks[2].id, { kind: 'end', columnId: columns[1].id })
    );
    fireEvent(cards[0], dragEvent('dragstart', 20, 40, data));
    fireEvent(renderedColumns[0], dragEvent('dragover', 500, 500, data));
    fireEvent(renderedColumns[0], dragEvent('drop', 500, 500, data));
    expect(state.actions.moveTask).toHaveBeenCalledOnce();
    fireEvent(headers[0], dragEvent('dragstart', 20, 10, data));
    fireEvent(headers[1], dragEvent('dragover', 180, 10, data));
    expect(headers[1].classList.contains('drop-after')).toBe(true);
    fireEvent(screen.getByTestId('board-view'), dragEvent('drop', 180, 10, data));
    await waitFor(() => expect(state.actions.moveColumn).toHaveBeenCalledOnce());
    data.clear();
    fireEvent(headers[2], dragEvent('dragstart', 250, 10, data));
    fireEvent(headers[0], dragEvent('dragover', 20, 10, data));
    expect(headers[0].classList.contains('drop-before')).toBe(true);
    fireEvent(headers[0], dragEvent('dragover', 500, 10, data));
    fireEvent(screen.getByTestId('board-view'), dragEvent('drop', 500, 10, data));
    expect(state.actions.moveColumn).toHaveBeenCalledOnce();
    fireEvent.dragEnd(screen.getByTestId('board-view'));
    data.clear();
    fireEvent(renderedColumns[0], dragEvent('drop', 20, 40, data));
    fireEvent(screen.getByTestId('board-view'), dragEvent('drop', 20, 40, data));
    expect(state.actions.moveTask).toHaveBeenCalledOnce();
  });
});

describe('异步保存与提示生命周期', () => {
  it('旧任务保存结束不关闭后来打开的详情', async () => {
    let finish: (() => void) | undefined;
    vi.mocked(state.actions.saveTaskDraft).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = () => resolve({ kind: 'unchanged' });
        })
    );
    render(<BoardView rxdb={rxdb} />);
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    await screen.findByTestId('detail-panel');
    fireEvent.change(screen.getByTestId('detail-title'), { target: { value: '保存旧任务' } });
    click('detail-save');
    for (const testId of [
      'detail-title',
      'detail-description',
      'detail-due',
      'move-column',
      'move-position',
      'move-task'
    ]) {
      expect((screen.getByTestId(testId) as HTMLInputElement).disabled).toBe(true);
    }
    expect(screen.getAllByTestId('detail-label-check').every(element => (element as HTMLInputElement).disabled)).toBe(
      true
    );
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getAllByTestId('task-title')[1]);
    await waitFor(() => expect((screen.getByTestId('detail-title') as HTMLInputElement).value).toBe(tasks[1].title));
    await act(async () => {
      finish?.();
    });
    expect((screen.getByTestId('detail-title') as HTMLInputElement).value).toBe(tasks[1].title);
    fireEvent.change(screen.getByTestId('detail-title'), { target: { value: '放弃' } });
    click('detail-cancel');
    expect(screen.queryByTestId('detail-panel')).toBeNull();
  });

  it('新失败重置提示消失计时，卸载释放计时器', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(state.actions.updateTaskTitle).mockRejectedValue(new Error('稍后重试'));
      const fixture = render(<BoardView rxdb={rxdb} />);
      fireEvent.click(screen.getAllByTestId('task-edit-title')[0]);
      await act(async () => {
        click('task-title-save');
      });
      expect(screen.getByTestId('board-notice').textContent).toContain('稍后重试');
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      await act(async () => {
        click('task-title-save');
      });
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.getByTestId('board-notice')).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.queryByTestId('board-notice')).toBeNull();
      fixture.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
