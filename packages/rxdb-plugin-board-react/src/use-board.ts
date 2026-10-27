'use client';

import { type RxDB, type UUID } from '@aiao/rxdb';
import {
  assertBoardWritable,
  Board,
  BoardColumnSortService,
  BoardDeleteService,
  BoardDetailService,
  BoardDomain,
  BoardLabel,
  BoardLabelService,
  BoardMoveService,
  BoardSearchSource,
  BoardWriteNotifier,
  Column,
  Task,
  TaskLabel,
  type BoardSearchUnavailableReason,
  type BoardSearchUpstream,
  type CardDropTarget,
  type ColumnSortMode,
  type DeletePlan,
  type LabelDeletePlan,
  type SaveTaskDraftResult,
  type TaskDraft,
  type TaskDraftSnapshot,
  type TaskFieldPatch
} from '@aiao/rxdb-plugin-board';
import type {} from '@aiao/rxdb-plugin-history';
import { useEffect, useRef, useState } from 'react';
import { BehaviorSubject, catchError, combineLatest, EMPTY, map, of, Subscription, switchMap, tap } from 'rxjs';

/**
 * React 集成 - rxdb-plugin-board
 *
 * 提供 `useBoard()`：看板领域数据（板 / 列 / 任务 / 标签 / 撤销计数）桥接为
 * React state，动作走核心包领域服务。命名与 Angular / Vue 绑定层一致（`useBoard`）。
 * 板选择与恢复中状态由绑定自持（当前板记本地 `rxdb-board-last-board`）。
 *
 * @packageDocumentation
 */

/** 上一次打开板的本地记录键。 */
export const LAST_BOARD_KEY = 'rxdb-board-last-board';

export interface UseBoardStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface UseBoardOptions {
  readonly storage?: UseBoardStorage;
  /** 板内搜索（US-539 阶段 B）：注入上游全文源（搜索插件实例）。不传则无搜索能力。 */
  readonly search?: { readonly upstream: BoardSearchUpstream };
  /** 搜索不可用时由宿主说明原因。 */
  readonly searchUnavailableReason?: BoardSearchUnavailableReason;
}

export interface UseBoardReturn {
  /** 板级搜索源（US-539 阶段 B）；宿主未注入上游时为 `null`。 */
  readonly searchSource: BoardSearchSource | null;
  /** 搜索入口不可用时的稳定原因。 */
  readonly searchUnavailableReason: BoardSearchUnavailableReason | null;
  readonly boards: readonly Board[];
  readonly currentBoardId: UUID | null;
  readonly currentBoard: Board | null;
  readonly columns: readonly Column[];
  readonly tasks: readonly Task[];
  readonly labels: readonly BoardLabel[];
  readonly taskLabels: ReadonlyMap<string, readonly BoardLabel[]>;
  readonly restoring: boolean;
  readonly loading: boolean;
  readonly readError: string | null;
  readonly retryReads: () => void;
  readonly undoCount: number;
  readonly redoCount: number;
  readonly writeEvent: { readonly kind: string; readonly reason?: string } | null;
  readonly selectBoard: (boardId: UUID) => void;
  readonly setRestoring: (value: boolean) => void;
  readonly actions: UseBoardActions;
}

export interface UseBoardActions {
  createBoard(input: { title: string; description?: string }): Promise<Board>;
  createColumn(input: { title: string }): Promise<Column>;
  createTask(input: { columnId: UUID; title: string }): Promise<Task>;
  updateBoard(boardId: UUID, patch: { title?: string; description?: string }): Promise<Board>;
  updateColumn(columnId: UUID, patch: { title: string }): Promise<Column>;
  updateTaskTitle(taskId: UUID, title: string): Promise<Task>;
  openSnapshot(taskId: UUID): Promise<TaskDraftSnapshot>;
  saveTaskDraft(taskId: UUID, snapshot: TaskDraftSnapshot, draft: TaskDraft): Promise<SaveTaskDraftResult>;
  /** 即改即存（看板 v2 详情侧栏）：只提交补丁里的字段，一次调用一个事务（一次 undo）。 */
  saveTaskFields(taskId: UUID, base: TaskDraftSnapshot, patch: TaskFieldPatch): Promise<SaveTaskDraftResult>;
  planTaskDelete(taskId: UUID): ReturnType<BoardDeleteService['planTaskDelete']>;
  planColumnDelete(columnId: UUID): ReturnType<BoardDeleteService['planColumnDelete']>;
  planBoardDelete(boardId: UUID): ReturnType<BoardDeleteService['planBoardDelete']>;
  executeDelete(plan: DeletePlan): Promise<void>;
  moveTask(taskId: UUID, target: CardDropTarget): Promise<void>;
  moveColumn(columnId: UUID, target: { readonly prevId: UUID | null; readonly nextId: UUID | null }): Promise<void>;
  sortColumn(columnId: UUID, mode: ColumnSortMode): Promise<{ readonly written: boolean }>;
  createLabel(input: { name: string; color: string }): Promise<BoardLabel>;
  renameLabel(labelId: UUID, name: string): Promise<BoardLabel>;
  recolorLabel(labelId: UUID, color: string): Promise<BoardLabel>;
  planLabelDelete(labelId: UUID): Promise<LabelDeletePlan>;
  executeLabelDelete(plan: LabelDeletePlan): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
}

const defaultStorage = (): UseBoardStorage => {
  const candidate = typeof localStorage !== 'undefined' ? localStorage : null;
  if (candidate && typeof candidate.getItem === 'function' && typeof candidate.setItem === 'function') {
    return { get: key => candidate.getItem(key), set: (key, value) => candidate.setItem(key, value) };
  }
  const memory = new Map<string, string>();
  return { get: key => memory.get(key) ?? null, set: (key, value) => void memory.set(key, value) };
};

const eq = <F extends string, V>(field: F, value: V) => ({
  combinator: 'and' as const,
  rules: [{ field, operator: '=' as const, value }]
});
const inRule = <F extends string, V>(field: F, values: readonly V[]) => ({
  combinator: 'and' as const,
  rules: [{ field, operator: 'in' as const, value: [...values] }]
});

/**
 * 看板领域桥：React state + 动作集合。卸载时自动释放全部订阅。
 *
 * @param rxdb - 已连接的看板 RxDB 实例（实体含 board 命名空间五实体，需历史插件）
 * @param options - 本地记录存储（默认 localStorage）
 */
export function useBoard(rxdb: RxDB, options?: UseBoardOptions): UseBoardReturn {
  const defaultStorageRef = useRef<UseBoardStorage | null>(null);
  const storage = options?.storage ?? (defaultStorageRef.current ??= defaultStorage());
  const storageRef = useRef(storage);
  storageRef.current = storage;

  const [boards, setBoards] = useState<readonly Board[]>([]);
  const [currentBoardId, setCurrentBoardId] = useState<UUID | null>(null);
  const [currentBoard, setCurrentBoard] = useState<Board | null>(null);
  const [columns, setColumns] = useState<readonly Column[]>([]);
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [labels, setLabels] = useState<readonly BoardLabel[]>([]);
  const [taskLabels, setTaskLabels] = useState<ReadonlyMap<string, readonly BoardLabel[]>>(new Map());
  const [restoring, setRestoringState] = useState<boolean>(false);
  const [undoCount, setUndoCount] = useState<number>(0);
  const [redoCount, setRedoCount] = useState<number>(0);
  const [writeEvent, setWriteEvent] = useState<{ readonly kind: string; readonly reason?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [readAttempt, setReadAttempt] = useState(0);

  // 服务与 Subject 在实例生命周期内保持同一引用；state 更新经 setState
  const searchSourceRef = useRef<BoardSearchSource | null>(null);
  const stateRef = useRef({
    rxdb,
    boardId$: new BehaviorSubject<UUID | null>(null),
    restoring$: new BehaviorSubject<boolean>(false)
  });
  const { boardId$, restoring$ } = stateRef.current;

  useEffect(() => {
    const ctx = () => ({ boardId: boardId$.value, restoring: restoring$.value });
    searchSourceRef.current = options?.search ? new BoardSearchSource(rxdb, ctx, options.search.upstream, {}) : null;
    const domain = new BoardDomain(rxdb, ctx);
    const deletes = new BoardDeleteService(rxdb, ctx);
    const details = new BoardDetailService(rxdb, ctx);
    const labelService = new BoardLabelService(rxdb, ctx);
    const notifier = new BoardWriteNotifier();
    const moves = new BoardMoveService(rxdb, ctx, notifier);
    const sorts = new BoardColumnSortService(rxdb, ctx, notifier);

    const boardRepo = rxdb.entityManager.getRepository(Board);
    const columnRepo = rxdb.entityManager.getRepository(Column);
    const taskRepo = rxdb.entityManager.getRepository(Task);
    const labelRepo = rxdb.entityManager.getRepository(BoardLabel);
    const linkRepo = rxdb.entityManager.getRepository(TaskLabel);

    const subs = new Subscription();
    const failRead = (error: unknown): void => {
      setLoading(false);
      setReadError(error instanceof Error ? error.message : String(error));
    };
    const read = <T>(source: import('rxjs').Observable<T>): import('rxjs').Observable<T> =>
      source.pipe(
        catchError(error => {
          failRead(error);
          return EMPTY;
        })
      );
    const boards$ = read(
      boardRepo.find({
        where: { combinator: 'and', rules: [] },
        orderBy: [
          { field: 'createdAt', sort: 'asc' },
          { field: 'id', sort: 'asc' }
        ]
      })
    ).pipe(tap(() => setLoading(false)));
    subs.add(boards$.subscribe({ next: setBoards, error: failRead }));
    subs.add(
      combineLatest([boards$, boardId$]).subscribe(([list, id]) =>
        setCurrentBoard(list.find(board => board.id === id) ?? null)
      )
    );

    const columns$ = boardId$.pipe(
      switchMap(boardId =>
        boardId === null ? of([] as readonly Column[]) : read(columnRepo.find({ where: eq('boardId', boardId) }))
      )
    );
    subs.add(columns$.subscribe({ next: setColumns, error: failRead }));
    const tasks$ = combineLatest([boardId$, columns$]).pipe(
      switchMap(([boardId, cols]) => {
        if (boardId === null || cols.length === 0) return of([] as readonly Task[]);
        return read(
          taskRepo.find({
            where: {
              combinator: 'and',
              rules: [
                inRule(
                  'columnId',
                  cols.map(column => column.id)
                )
              ]
            }
          })
        );
      })
    );
    subs.add(tasks$.subscribe({ next: setTasks, error: failRead }));
    const labels$ = boardId$.pipe(
      switchMap(boardId =>
        boardId === null ?
          of([] as readonly BoardLabel[])
        : read(
            labelRepo.find({
              where: eq('boardId', boardId),
              orderBy: [
                { field: 'createdAt', sort: 'asc' },
                { field: 'id', sort: 'asc' }
              ]
            })
          )
      )
    );
    subs.add(labels$.subscribe({ next: setLabels, error: failRead }));
    const taskLabels$ = combineLatest([boardId$, tasks$, labels$]).pipe(
      switchMap(([boardId, currentTasks, currentLabels]) => {
        if (boardId === null || currentTasks.length === 0) return of(new Map<UUID, readonly BoardLabel[]>());
        const ids = currentTasks.map(task => task.id);
        return read(linkRepo.find({ where: { combinator: 'and', rules: [inRule('taskId', ids)] } })).pipe(
          map(links => {
            const labelIdsByTask = new Map<UUID, Set<UUID>>();
            for (const link of links) {
              const labelIds = labelIdsByTask.get(link.taskId) ?? new Set<UUID>();
              labelIds.add(link.labelId);
              labelIdsByTask.set(link.taskId, labelIds);
            }
            const grouped = new Map<UUID, readonly BoardLabel[]>();
            for (const task of currentTasks) {
              const labelIds = labelIdsByTask.get(task.id);
              if (!labelIds) continue;
              const taskLabels = currentLabels.filter(label => labelIds.has(label.id));
              if (taskLabels.length > 0) grouped.set(task.id, taskLabels);
            }
            return grouped;
          })
        );
      })
    );
    subs.add(taskLabels$.subscribe({ next: setTaskLabels, error: failRead }));

    const history = rxdb.versionManager.history();
    subs.add(history.undoCount$.subscribe({ next: setUndoCount, error: failRead }));
    subs.add(history.redoCount$.subscribe({ next: setRedoCount, error: failRead }));
    subs.add(
      notifier.events$.subscribe({
        next: event => setWriteEvent({ kind: event.kind, reason: 'reason' in event ? event.reason : undefined }),
        error: failRead
      })
    );
    subs.add(restoring$.subscribe(setRestoringState));

    subs.add(
      boards$.subscribe(list => {
        const selected = boardId$.value;
        if (list.some(board => board.id === selected)) return;
        const target = list.find(board => board.id === storageRef.current.get(LAST_BOARD_KEY)) ?? list[0];
        const next = target?.id ?? null;
        if (next === selected) return;
        boardId$.next(next);
        setCurrentBoardId(next);
      })
    );

    actionsRef.current = {
      createBoard: input => domain.createBoard(input),
      createColumn: input => domain.createColumn(input),
      createTask: input => domain.createTask(input),
      updateBoard: (boardId, patch) => domain.updateBoard(boardId, patch),
      updateColumn: (columnId, patch) => domain.updateColumn(columnId, patch),
      updateTaskTitle: (taskId, title) => domain.updateTaskTitle(taskId, title),
      openSnapshot: taskId => details.openSnapshot(taskId),
      saveTaskDraft: (taskId, snapshot, draft) => details.saveTaskDraft(taskId, snapshot, draft),
      saveTaskFields: (taskId, base, patch) => details.saveTaskFields(taskId, base, patch),
      planTaskDelete: taskId => deletes.planTaskDelete(taskId),
      planColumnDelete: columnId => deletes.planColumnDelete(columnId),
      planBoardDelete: boardId => deletes.planBoardDelete(boardId),
      executeDelete: plan => deletes.executeDelete(plan),
      moveTask: (taskId, target) => moves.moveTask(taskId, target),
      moveColumn: (columnId, target) => moves.moveColumn(columnId, target),
      sortColumn: (columnId, mode) => sorts.sortColumn(columnId, mode),
      createLabel: input => labelService.createLabel(input),
      renameLabel: (labelId, name) => labelService.renameLabel(labelId, name),
      recolorLabel: (labelId, color) => labelService.recolorLabel(labelId, color),
      planLabelDelete: labelId => labelService.planLabelDelete(labelId),
      executeLabelDelete: plan => labelService.executeLabelDelete(plan),
      undo: async () => {
        assertBoardWritable(ctx());
        await history.undo();
      },
      redo: async () => {
        assertBoardWritable(ctx());
        await history.redo();
      }
    };

    return () => {
      subs.unsubscribe();
      notifier.complete();
    };
    // 服务与订阅随实例生命周期重建；boardId/restoring Subject 独立于本 effect
  }, [readAttempt, rxdb, boardId$, restoring$]);

  const actionsRef = useRef<UseBoardActions | null>(null);

  const selectBoard = (boardId: UUID): void => {
    storageRef.current.set(LAST_BOARD_KEY, boardId);
    boardId$.next(boardId);
    setCurrentBoardId(boardId);
  };
  const setRestoring = (value: boolean): void => {
    restoring$.next(value);
  };
  const retryReads = (): void => {
    setReadError(null);
    setLoading(true);
    setReadAttempt(value => value + 1);
  };

  const actions = actionsRef.current ?? ({} as UseBoardActions);

  return {
    searchSource: searchSourceRef.current,
    searchUnavailableReason: options?.searchUnavailableReason ?? null,
    boards,
    currentBoardId,
    currentBoard,
    columns,
    tasks,
    labels,
    taskLabels,
    restoring,
    loading,
    readError,
    retryReads,
    undoCount,
    redoCount,
    writeEvent,
    selectBoard,
    setRestoring,
    actions
  };
}
