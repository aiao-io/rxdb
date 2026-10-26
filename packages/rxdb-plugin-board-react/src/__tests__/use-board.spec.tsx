import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { act, renderHook, waitFor as waitForUpdate, type RenderHookResult } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LAST_BOARD_KEY, useBoard, type UseBoardReturn } from '../use-board.js';

/**
 * useBoard 桥接（React）：真实 PGlite + 历史插件，与 Angular / Vue 同组验收语义。
 */
describe('useBoard（React 桥接）', () => {
  let rxdb: RxDB;
  let rendered: RenderHookResult<UseBoardReturn, unknown>;

  const waitFor = async (probe: () => boolean, label: string, timeoutMs = 5000): Promise<void> => {
    await waitForUpdate(() => expect(probe(), label).toBe(true), { timeout: timeoutMs });
  };

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: `board-react-${Math.random().toString(36).slice(2)}`,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None },
      multiInstance: false
    });
    rxdb.use(rxDBPluginHistory);
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');

    rendered = renderHook(() =>
      useBoard(rxdb, {
        storage: { get: () => null, set: () => undefined },
        search: { upstream: { searchCollection: vi.fn() } }
      })
    );
  });

  const run = async <T,>(operation: () => Promise<T>): Promise<T> => {
    let result: T;
    await act(async () => {
      result = await operation();
    });
    return result!;
  };

  /** 每次渲染后的最新返回值（React 每次渲染返回新对象，不能缓存首帧）。 */
  const board = (): UseBoardReturn => rendered.result.current;

  afterEach(async () => {
    rendered.unmount();
    await rxdb.disconnectAll();
  });

  it('删除当前板重新选中有效板，清空后重建仍自动打开', async () => {
    const first = await run(() => board().actions.createBoard({ title: '旧板' }));
    await waitFor(() => board().currentBoardId === first.id, '选中旧板');
    const second = await run(() => board().actions.createBoard({ title: '保留板' }));
    await waitFor(() => board().boards.length === 2, '两块板');
    expect(board().currentBoardId).toBe(first.id);
    const firstPlan = await run(() => board().actions.planBoardDelete(first.id));
    await run(() => board().actions.executeDelete(firstPlan));
    await waitFor(() => board().currentBoardId === second.id, '选中剩余板');
    const secondPlan = await run(() => board().actions.planBoardDelete(second.id));
    await run(() => board().actions.executeDelete(secondPlan));
    await waitFor(() => board().boards.length === 0, '清空看板');
    expect(board().currentBoardId).toBeNull();
    const next = await run(() => board().actions.createBoard({ title: '新板' }));
    await waitFor(() => board().currentBoardId === next.id, '选中新板');
  });

  it('自定义存储绕过被浏览器禁止访问的本地存储', async () => {
    rendered.unmount();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const blockedStorage = vi.fn(() => {
      throw new DOMException('禁止访问本地存储', 'SecurityError');
    });
    const storage = { get: vi.fn(() => null), set: vi.fn() };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: blockedStorage });
    try {
      rendered = renderHook(() => useBoard(rxdb, { storage }));
      const created = await run(() => board().actions.createBoard({ title: '自定义存储板' }));
      await waitFor(() => board().currentBoardId === created.id, '自动选中板');
      act(() => board().selectBoard(created.id));
      expect(storage.set).toHaveBeenCalledWith(LAST_BOARD_KEY, created.id);
      expect(blockedStorage).not.toHaveBeenCalled();
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('空库建板进入第一块；建列建任务后数据就位', async () => {
    const created = await run(() => board().actions.createBoard({ title: '发布计划' }));
    await waitFor(() => board().currentBoard?.id === created.id, '进入第一块板');
    expect(board().boards.map(b => b.title)).toEqual(['发布计划']);
    expect(board().searchSource).not.toBeNull();

    const c1 = await run(() => board().actions.createColumn({ title: 'To do' }));
    const c2 = await run(() => board().actions.createColumn({ title: 'Done' }));
    await run(() => board().actions.createTask({ columnId: c1.id, title: '任务 1' }));
    await run(() => board().actions.createTask({ columnId: c1.id, title: '任务 2' }));
    await run(() => board().actions.createTask({ columnId: c2.id, title: '任务 3' }));
    await waitFor(() => board().columns.length === 2 && board().tasks.length === 3, '数据');
    expect(board().columns.map(column => column.title)).toEqual(['To do', 'Done']);
    expect(board().tasks.filter(task => task.columnId === c1.id)).toHaveLength(2);
  });

  it('切板只显示所选板数据', async () => {
    const b1 = await run(() => board().actions.createBoard({ title: '板 1' }));
    await waitFor(() => board().currentBoard?.id === b1.id, '进入板 1');
    const c1 = await run(() => board().actions.createColumn({ title: 'C1' }));
    await run(() => board().actions.createTask({ columnId: c1.id, title: '板 1 任务' }));

    const b2 = await run(() => board().actions.createBoard({ title: '板 2' }));
    act(() => board().selectBoard(b2.id));
    await waitFor(() => board().currentBoard?.id === b2.id && board().tasks.length === 0, '切到板 2');
    act(() => board().selectBoard(b1.id));
    await waitFor(() => board().tasks.length === 1, '切回板 1');
    expect(board().tasks[0].title).toBe('板 1 任务');
  });

  it('标签与任务标签求交；恢复中门禁；undo 计数', async () => {
    const b1 = await run(() => board().actions.createBoard({ title: '板' }));
    await waitFor(() => board().currentBoard?.id === b1.id, '进入板');
    const c1 = await run(() => board().actions.createColumn({ title: 'C1' }));
    const task = await run(() => board().actions.createTask({ columnId: c1.id, title: '任务' }));
    const label = await run(() => board().actions.createLabel({ name: '核心', color: '#e11d48' }));
    const secondary = await run(() => board().actions.createLabel({ name: '次要', color: '#2563eb' }));
    const snapshot = await run(() => board().actions.openSnapshot(task.id));
    await run(() =>
      board().actions.saveTaskDraft(task.id, snapshot, {
        title: snapshot.title,
        description: snapshot.description ?? '',
        dueDate: snapshot.dueDate,
        labelIds: [secondary.id, label.id]
      })
    );
    await waitFor(() => (board().taskLabels.get(task.id) ?? []).length === 2, '任务标签');
    expect(board().taskLabels.get(task.id)?.map(item => item.name)).toEqual(['核心', '次要']);

    act(() => board().setRestoring(true));
    await waitFor(() => board().restoring, '恢复中状态');
    await expect(board().actions.createTask({ columnId: c1.id, title: 'x' })).rejects.toMatchObject({
      code: 'restore_in_progress'
    });
    act(() => board().setRestoring(false));
    await waitFor(() => !board().restoring, '恢复解除');

    await waitFor(() => board().undoCount >= 1, 'undo 计数');
    await run(() => board().actions.undo());
    await waitFor(() => board().tasks.find(t => t.id === task.id)?.title === '任务', 'undo 回退');
  });
  it('公开动作保持领域契约，标签删除、列删除和板删除都执行原清单', async () => {
    const created = await run(() => board().actions.createBoard({ title: '动作板' }));
    await waitFor(() => board().currentBoardId === created.id, '选中动作板');
    await run(() => board().actions.updateBoard(created.id, { title: '改名板', description: '说明' }));
    const first = await run(() => board().actions.createColumn({ title: '一列' }));
    const second = await run(() => board().actions.createColumn({ title: '二列' }));
    await run(() => board().actions.updateColumn(first.id, { title: '改名列' }));
    const task = await run(() => board().actions.createTask({ columnId: first.id, title: '原任务' }));
    await run(() => board().actions.updateTaskTitle(task.id, '改名任务'));
    const label = await run(() => board().actions.createLabel({ name: '原标签', color: '#123456' }));
    await run(() => board().actions.renameLabel(label.id, '改名标签'));
    await run(() => board().actions.recolorLabel(label.id, '#654321'));
    await run(() => board().actions.moveTask(task.id, { kind: 'end', columnId: second.id }));
    await run(() => board().actions.moveColumn(second.id, { prevId: null, nextId: first.id }));
    await run(() => board().actions.sortColumn(second.id, 'title'));
    await waitFor(() => board().tasks[0]?.columnId === second.id, '任务移动');
    expect(board().currentBoard?.title).toBe('改名板');
    expect(board().labels[0].name).toBe('改名标签');
    expect(board().labels[0].color).toBe('#654321');
    await run(async () => board().actions.executeLabelDelete(await board().actions.planLabelDelete(label.id)));
    await run(async () => board().actions.executeDelete(await board().actions.planTaskDelete(task.id)));
    await run(() => board().actions.undo());
    await run(() => board().actions.redo());
    await run(async () => board().actions.executeDelete(await board().actions.planColumnDelete(first.id)));
    await waitFor(() => board().columns.length === 1, '列删除完成');
    await run(async () => board().actions.executeDelete(await board().actions.planBoardDelete(created.id)));
    await waitFor(() => board().boards.length === 0, '删除板');
  });
});
