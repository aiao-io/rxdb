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
import { DestroyRef, inject, signal, type Signal } from '@angular/core';
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
 * Angular 集成 - rxdb-plugin-board
 *
 * 提供 `useBoard()`：看板领域数据（板 / 列 / 任务 / 标签 / 撤销计数）桥接为
 * Angular signal，动作走核心包领域服务（创建 / 编辑 / 移动 / 排序 / 删除 / 标签 /
 * 撤销重做），移动与排序的写入事件经 {@link BoardWriteNotifier} 发布。
 * 命名与 React / Vue 绑定层一致（`useBoard`）。
 *
 * 板选择与恢复中状态由绑定自持：当前板记在本地（`rxdb-board-last-board`），
 * 打开时进入上次打开的板、没有则进第一块（US-539）。
 *
 * @packageDocumentation
 */

/** 上一次打开板的本地记录键（US-539：打开时进入上次打开的板）。 */
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

/** {@link useBoard} 的返回值：看板状态（signal）与领域动作。 */
export interface UseBoardReturn {
  /** 板级搜索源（US-539 阶段 B）；宿主未注入上游时为 `null`。 */
  readonly searchSource: BoardSearchSource | null;
  /** 搜索入口不可用时的稳定原因。 */
  readonly searchUnavailableReason: BoardSearchUnavailableReason | null;
  /** 全部板（创建时间升序、同时刻按 id）。 */
  readonly boards: Signal<readonly Board[]>;
  /** 当前板 id（本地记录持久化）。 */
  readonly currentBoardId: Signal<UUID | null>;
  /** 当前板；无板为 `null`。 */
  readonly currentBoard: Signal<Board | null>;
  /** 当前板的列（板内列序）。 */
  readonly columns: Signal<readonly Column[]>;
  /** 当前板全部任务（各列库序）。 */
  readonly tasks: Signal<readonly Task[]>;
  /** 当前板的板级标签（创建时间升序、同时刻按 id）。 */
  readonly labels: Signal<readonly BoardLabel[]>;
  /** 任务 → 其标签（按标签创建顺序）。 */
  readonly taskLabels: Signal<ReadonlyMap<string, readonly BoardLabel[]>>;
  /** 恢复中写门禁（US-534 / US-537）。 */
  readonly restoring: Signal<boolean>;
  /** 首次读取或重试中：板列表与当前板数据都就绪前为 `true`，读取失败即为 `false`。 */
  readonly loading: Signal<boolean>;
  /** 读取失败原因；读取正常为 `null`。 */
  readonly readError: Signal<string | null>;
  /** 清除读取失败并重建全部读取订阅。 */
  readonly retryReads: () => void;
  /** 本次会话可撤销事务数（undo 入口禁用判据）。 */
  readonly undoCount: Signal<number>;
  /** redo 栈深度（redo 入口禁用判据）。 */
  readonly redoCount: Signal<number>;
  /** 最近一次移动 / 排序写入事件（成功或失败）。 */
  readonly writeEvent: Signal<{ readonly kind: string; readonly reason?: string } | null>;
  /** 切板：写本地记录并切换数据流。 */
  readonly selectBoard: (boardId: UUID) => void;
  /** 进入 / 退出恢复中（恢复编排由宿主驱动，本绑定只持状态）。 */
  readonly setRestoring: (value: boolean) => void;
  /** 领域动作（全部过核心包服务的写门禁与校验）。 */
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

/** 同一查询的多个下游共享一条订阅与同一份快照（派生链只跑一遍）。 */
const shareLatest = <T>(source: Observable<T>): Observable<T> =>
  source.pipe(shareReplay({ bufferSize: 1, refCount: true }));

const bind = <T>(
  source: Observable<T>,
  target: { set(value: T): void },
  subs: Subscription,
  onError: (error: unknown) => void
): void => {
  subs.add(source.subscribe({ next: value => target.set(value), error: onError }));
};

/**
 * 看板领域桥：数据 signal + 动作集合。必须在注入上下文中调用（内部 `inject(DestroyRef)`）。
 *
 * @param rxdb - 已连接的看板 RxDB 实例（实体含 board 命名空间五实体）
 * @param options - 本地记录存储（默认 localStorage）
 */
export function useBoard(rxdb: RxDB, options?: UseBoardOptions): UseBoardReturn {
  const destroyRef = inject(DestroyRef);
  const storage: UseBoardStorage = options?.storage ?? defaultStorage();

  // 流源是 Subject，signal 是其镜像：切板 / 恢复中经 Subject 驱动，UI 经 signal 读
  const boardId$ = new BehaviorSubject<UUID | null>(null);
  const restoring$ = new BehaviorSubject<boolean>(false);
  const readAttempt$ = new BehaviorSubject(0);

  const boards = signal<readonly Board[]>([]);
  const currentBoardId = signal<UUID | null>(null);
  const currentBoard = signal<Board | null>(null);
  const columns = signal<readonly Column[]>([]);
  const tasks = signal<readonly Task[]>([]);
  const labels = signal<readonly BoardLabel[]>([]);
  const taskLabels = signal<ReadonlyMap<string, readonly BoardLabel[]>>(new Map());
  const restoring = signal<boolean>(false);
  const loading = signal(true);
  const readError = signal<string | null>(null);
  const undoCount = signal<number>(0);
  const redoCount = signal<number>(0);
  const writeEvent = signal<{ readonly kind: string; readonly reason?: string } | null>(null);

  const ctx = () => ({ boardId: boardId$.value, restoring: restoring$.value });
  const searchSource = options?.search ? new BoardSearchSource(rxdb, ctx, options.search.upstream, {}) : null;
  const domain = new BoardDomain(rxdb, ctx);
  const deletes = new BoardDeleteService(rxdb, ctx);
  const details = new BoardDetailService(rxdb, ctx);
  const labelService = new BoardLabelService(rxdb, ctx);
  const notifier = new BoardWriteNotifier();
  const moves = new BoardMoveService(rxdb, ctx, notifier);
  const sorts = new BoardColumnSortService(rxdb, ctx, notifier);

  const boardRepo = rxdb.entityManager.getRepository(Board);

  const subs = new Subscription();
  let boardsReady = false;
  let dataReady = false;
  let failed = false;
  const settleRead = (): void => {
    loading.set(!failed && !(boardsReady && dataReady));
  };
  const failRead = (error: unknown): void => {
    failed = true;
    loading.set(false);
    readError.set(error instanceof Error ? error.message : String(error));
  };
  const read = <T>(factory: () => Observable<T>): Observable<T> =>
    readAttempt$.pipe(
      tap(() => {
        boardsReady = false;
        failed = false;
      }),
      switchMap(() =>
        factory().pipe(
          catchError(error => {
            failRead(error);
            return EMPTY;
          })
        )
      )
    );

  // 板列表：创建时间升序、同时刻按 id
  const boards$ = shareLatest(
    read(() =>
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
  bind(boards$, boards, subs, failRead);
  // 当前板
  subs.add(
    combineLatest([boards$, boardId$]).subscribe({
      next: ([list, id]) => {
        currentBoard.set(list.find(board => board.id === id) ?? null);
      },
      error: failRead
    })
  );
  // 列 / 任务 / 标签随当前板切换（活查询 switchMap；signal 只是流的镜像）
  const applyReadState = (state: BoardReadState): void => {
    dataReady = state.kind === 'ready';
    if (state.kind === 'failed') {
      failRead(state.message);
      return;
    }
    if (state.kind === 'loading') {
      columns.set([]);
      tasks.set([]);
      labels.set([]);
      taskLabels.set(new Map());

      settleRead();
      return;
    }
    const snapshot = state.snapshot;
    columns.set(snapshot.columns);
    tasks.set(snapshot.tasks);
    labels.set(snapshot.labels);
    taskLabels.set(snapshot.taskLabels);
    settleRead();
  };
  subs.add(
    combineLatest([boardId$, readAttempt$])
      .pipe(switchMap(([boardId]) => observeBoardRead(rxdb, boardId)))
      .subscribe(applyReadState)
  );

  // 撤销 / 重做计数（数据库级历史，跨实体一次保存一个事务）
  const history = rxdb.versionManager.history();
  bind(history.undoCount$, undoCount, subs, failRead);
  bind(history.redoCount$, redoCount, subs, failRead);
  subs.add(
    notifier.events$.subscribe({
      next: event => writeEvent.set({ kind: event.kind, reason: 'reason' in event ? event.reason : undefined }),
      error: failRead
    })
  );
  subs.add(restoring$.subscribe(value => restoring.set(value)));

  // 当前选择失效时，恢复本地记录或选中第一块板。
  subs.add(
    boards$.subscribe({
      next: list => {
        const selected = boardId$.value;
        if (list.some(board => board.id === selected)) return;
        const target = list.find(board => board.id === storage.get(LAST_BOARD_KEY)) ?? list[0];
        const next = target?.id ?? null;
        if (next === selected) return;
        boardId$.next(next);
        currentBoardId.set(next);
      },
      error: failRead
    })
  );

  const selectBoard = (boardId: UUID): void => {
    storage.set(LAST_BOARD_KEY, boardId);
    boardId$.next(boardId);
    currentBoardId.set(boardId);
  };

  const setRestoring = (value: boolean): void => {
    restoring$.next(value);
  };
  const retryReads = (): void => {
    readError.set(null);
    loading.set(true);
    readAttempt$.next(readAttempt$.value + 1);
  };

  destroyRef.onDestroy(() => {
    subs.unsubscribe();
    notifier.complete();
  });

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
      await history.undo();
    },
    redo: async () => {
      assertBoardWritable(ctx());
      await history.redo();
    }
  };

  return {
    searchSource,
    searchUnavailableReason: options?.searchUnavailableReason ?? null,
    boards: boards.asReadonly(),
    currentBoardId: currentBoardId.asReadonly(),
    currentBoard: currentBoard.asReadonly(),
    columns: columns.asReadonly(),
    tasks: tasks.asReadonly(),
    labels: labels.asReadonly(),
    taskLabels: taskLabels.asReadonly(),
    restoring: restoring.asReadonly(),
    loading: loading.asReadonly(),
    readError: readError.asReadonly(),
    retryReads,
    undoCount: undoCount.asReadonly(),
    redoCount: redoCount.asReadonly(),
    writeEvent: writeEvent.asReadonly(),
    selectBoard,
    setRestoring,
    actions
  };
}
