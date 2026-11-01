import type { RxDB, UUID } from '@aiao/rxdb';
import type { Board, BoardLabel, Column, Task, TaskDraftSnapshot } from '@aiao/rxdb-plugin-board';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { UseBoardActions, UseBoardReturn } from '../use-board.js';
import { useBoardViewModel } from '../view/use-board-view-model.js';
let state: UseBoardReturn;
vi.mock('../use-board.js', () => ({ useBoard: () => state }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('排队的截止日编辑始终写入入队时的任务', async () => {
  const a = 'A' as UUID,
    b = 'B' as UUID,
    column = 'column' as UUID,
    board = 'board' as UUID;
  const snap = (id: UUID): TaskDraftSnapshot => ({
    title: id,
    description: null,
    dueDate: null,
    columnId: column,
    labelIds: []
  });
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  const save = vi.fn(async (id: UUID) => {
    if (save.mock.calls.length === 1) await pending;
    return { kind: 'saved' as const, task: { id } as Task };
  });
  state = {
    boards: [{ id: board, title: 'board' } as Board],
    currentBoardId: board,
    currentBoard: { id: board, title: 'board' } as Board,
    columns: [{ id: column, title: 'column', boardId: board } as Column],
    tasks: [
      { id: a, title: a, columnId: column },
      { id: b, title: b, columnId: column }
    ] as Task[],
    labels: [],
    taskLabels: new Map<UUID, readonly BoardLabel[]>(),
    retryReads: () => undefined,
    selectBoard: () => undefined,
    writeEvent: null,
    restoring: false,
    loading: false,
    readError: null,
    undoCount: 0,
    redoCount: 0,
    searchSource: null,
    searchUnavailableReason: null,
    setRestoring: () => undefined,
    actions: { openSnapshot: async (id: UUID) => snap(id), saveTaskFields: save } as unknown as UseBoardActions
  } as UseBoardReturn;
  const hook = renderHook(() => useBoardViewModel({ getPlugins: () => [] } as unknown as RxDB, undefined));
  await act(async () => {
    await hook.result.current.detail.openDetail(a);
  });
  let first!: Promise<void>, second!: Promise<void>;
  await act(async () => {
    first = hook.result.current.detail.commitDetailDue('2026-12-01');
    await Promise.resolve();
  });
  await act(async () => {
    second = hook.result.current.detail.commitDetailDue('2026-12-02');
    await hook.result.current.detail.openDetail(b);
  });
  await act(async () => {
    release();
    await Promise.all([first, second]);
  });
  expect(save.mock.calls.map(([id]) => id)).toEqual([a, a]);
});
