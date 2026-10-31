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
  matchAll,
  observeBoardRead,
  Task,
  type BoardHostContext,
  type BoardReadState,
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
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  EMPTY,
  shareReplay,
  Subscription,
  switchMap,
  tap,
  type Observable
} from 'rxjs';

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

/** 本地记录存储：记住上次打开的板（默认 localStorage，测试注入内存表）。 */
export interface UseBoardStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** {@link useBoard} 的可选参数。 */
export interface UseBoardOptions {
  /** 本地记录存储（默认 localStorage；测试注入内存表）。 */
  readonly storage?: UseBoardStorage;
  /** 板内搜索（US-539 阶段 B）：注入上游全文源（搜索插件实例）。不传则无搜索能力。 */
  readonly search?: { readonly upstream: BoardSearchUpstream };
  /** 搜索不可用时由宿主说明原因。 */
  readonly searchUnavailableReason?: BoardSearchUnavailableReason;
}

/** {@link useBoard} 的返回值：看板状态（React state）与领域动作。 */
export interface UseBoardReturn {
  /** 板级搜索源（US-539 阶段 B）；宿主未注入上游时为 `null`，注入后随上游重建。 */
  readonly searchSource: BoardSearchSource | null;
  /** 搜索入口不可用时的稳定原因。 */
  readonly searchUnavailableReason: BoardSearchUnavailableReason | null;
  /** 全部板（创建时间升序、同时刻按 id）。 */
  readonly boards: readonly Board[];
  /** 当前板 id（本地记录持久化）。 */
  readonly currentBoardId: UUID | null;
  /** 当前板；无板为 `null`。 */
  readonly currentBoard: Board | null;
  /** 当前板的列（板内列序）。 */
  readonly columns: readonly Column[];
  /** 当前板全部任务（各列库序）。 */
  readonly tasks: readonly Task[];
  /** 当前板的板级标签（创建时间升序、同时刻按 id）。 */
  readonly labels: readonly BoardLabel[];
  /** 任务 → 其标签（按标签创建顺序）。 */
  readonly taskLabels: ReadonlyMap<string, readonly BoardLabel[]>;
  /** 恢复中写门禁（US-534 / US-537）。 */
  readonly restoring: boolean;
  /** 首次读取或重试中：板列表与当前板数据都就绪前为 `true`，读取失败即为 `false`。 */
  readonly loading: boolean;
  /** 读取失败原因；读取正常为 `null`。 */
  readonly readError: string | null;
  /** 清除读取失败并重建全部读取订阅。 */
  readonly retryReads: () => void;
  /** 本次会话可撤销事务数（undo 入口禁用判据）。 */
  readonly undoCount: number;
  /** redo 栈深度（redo 入口禁用判据）。 */
  readonly redoCount: number;
  /** 最近一次移动 / 排序写入事件（成功或失败）。 */
  readonly writeEvent: { readonly kind: string; readonly reason?: string } | null;
  /** 切板：写本地记录并切换数据流。 */
  readonly selectBoard: (boardId: UUID) => void;
  /** 进入 / 退出恢复中（恢复编排由宿主驱动，本绑定只持状态）。 */
  readonly setRestoring: (value: boolean) => void;
  /** 领域动作（首帧即完整，同一 `rxdb` 实例内引用稳定）。 */
  readonly actions: UseBoardActions;
}

/** 看板领域动作：逐个委托核心包领域服务，恢复中写门禁与校验在服务层复核。 */
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

/** 领域服务、写入通知器与动作集合：构造无副作用，可在渲染期按实例创建。 */
const createBoardServices = (
  rxdb: RxDB,
  boardId$: BehaviorSubject<UUID | null>,
  restoring$: BehaviorSubject<boolean>
): {
  readonly ctx: () => BoardHostContext;
  readonly notifier: BoardWriteNotifier;
  readonly actions: UseBoardActions;
} => {
  const ctx = () => ({ boardId: boardId$.value, restoring: restoring$.value });
  const domain = new BoardDomain(rxdb, ctx);
  const deletes = new BoardDeleteService(rxdb, ctx);
  const details = new BoardDetailService(rxdb, ctx);
  const labelService = new BoardLabelService(rxdb, ctx);
  const notifier = new BoardWriteNotifier();
  const moves = new BoardMoveService(rxdb, ctx, notifier);
  const sorts = new BoardColumnSortService(rxdb, ctx, notifier);
  const actions: UseBoardActions = {
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
      await rxdb.versionManager.history().undo();
    },
    redo: async () => {
      assertBoardWritable(ctx());
      await rxdb.versionManager.history().redo();
    }
  };
  return { ctx, notifier, actions };
};

/** 同一查询的多个下游共享一条订阅与同一份快照（派生链只跑一遍）。 */
const shareLatest = <T>(source: Observable<T>): Observable<T> =>
  source.pipe(shareReplay({ bufferSize: 1, refCount: true }));

/**
 * 看板领域桥：React state + 动作集合。卸载时自动释放全部订阅。
 *
 * @remarks
 * 领域服务构造无副作用，在渲染期按 `rxdb` 实例创建：首帧返回的 `actions` 就是完整动作集
 * （子组件的 effect 先于本 hook 的 effect 执行，也能直接调用），与 Angular 构造期、Vue setup 期就绪对称。
 * 订阅只在 effect 里建立；搜索源随宿主注入的上游变化重建（搜索插件可以晚于看板装好）。
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

  // 板选择与恢复中的 Subject 在实例生命周期内保持同一引用；state 更新经 setState
  const stateRef = useRef({
    boardId$: new BehaviorSubject<UUID | null>(null),
    restoring$: new BehaviorSubject<boolean>(false)
  });
  const { boardId$, restoring$ } = stateRef.current;
  const services = useMemo(() => createBoardServices(rxdb, boardId$, restoring$), [rxdb, boardId$, restoring$]);
  const upstream = options?.search?.upstream;
  const searchSource = useMemo(
    () => (upstream ? new BoardSearchSource(rxdb, services.ctx, upstream, {}) : null),
    [rxdb, services, upstream]
  );

  useEffect(() => {
    const boardRepo = rxdb.entityManager.getRepository(Board);

    const subs = new Subscription();
    let boardsReady = false;
    let dataReady = false;
    let failed = false;
    const settleRead = (): void => {
      setLoading(!failed && !(boardsReady && dataReady));
    };
    const failRead = (error: unknown): void => {
      failed = true;
      setLoading(false);
      setReadError(error instanceof Error ? error.message : String(error));
    };
    const read = <T>(source: Observable<T>): Observable<T> =>
      source.pipe(
        catchError(error => {
          failRead(error);
          return EMPTY;
        })
      );
    const boards$ = shareLatest(
      read(
        boardRepo.findAll({
          where: matchAll(),
          orderBy: [
            { field: 'createdAt', sort: 'asc' },
            { field: 'id', sort: 'asc' }
          ]
        })
      ).pipe(
        tap(() => {
          boardsReady = true;
          settleRead();
        })
      )
    );
    subs.add(boards$.subscribe({ next: setBoards, error: failRead }));
    subs.add(
      combineLatest([boards$, boardId$]).subscribe(([list, id]) =>
        setCurrentBoard(list.find(board => board.id === id) ?? null)
      )
    );

    const applyReadState = (state: BoardReadState): void => {
      dataReady = state.kind === 'ready';
      if (state.kind === 'failed') {
        failRead(state.message);
        return;
      }
      if (state.kind === 'loading') {
        setColumns([]);
        setTasks([]);
        setLabels([]);
        setTaskLabels(new Map());

        settleRead();
        return;
      }
      const snapshot = state.snapshot;
      setColumns(snapshot.columns);
      setTasks(snapshot.tasks);
      setLabels(snapshot.labels);
      setTaskLabels(snapshot.taskLabels);
      settleRead();
    };
    subs.add(boardId$.pipe(switchMap(boardId => observeBoardRead(rxdb, boardId))).subscribe(applyReadState));

    const history = rxdb.versionManager.history();
    subs.add(history.undoCount$.subscribe({ next: setUndoCount, error: failRead }));
    subs.add(history.redoCount$.subscribe({ next: setRedoCount, error: failRead }));
    subs.add(
      services.notifier.events$.subscribe({
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

    // 通知器随服务存活（重试读取只重建订阅），这里只退订、不 complete
    return () => subs.unsubscribe();
  }, [readAttempt, rxdb, services, boardId$, restoring$]);

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

  return {
    searchSource,
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
    actions: services.actions
  };
}
