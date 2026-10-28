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
import { getCurrentScope, onScopeDispose, readonly, ref, type Ref } from 'vue';

/**
 * Vue 集成 - rxdb-plugin-board
 *
 * 提供 `useBoard()`：看板领域数据桥接为 Vue ref，动作走核心包领域服务。
 * 命名与 Angular / React 绑定层一致（`useBoard`）。
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
  readonly boards: Ref<readonly Board[]>;
  readonly currentBoardId: Ref<UUID | null>;
  readonly currentBoard: Ref<Board | null>;
  readonly columns: Ref<readonly Column[]>;
  readonly tasks: Ref<readonly Task[]>;
  readonly labels: Ref<readonly BoardLabel[]>;
  readonly taskLabels: Ref<ReadonlyMap<string, readonly BoardLabel[]>>;
  readonly restoring: Ref<boolean>;
  readonly loading: Ref<boolean>;
  readonly readError: Ref<string | null>;
  readonly retryReads: () => void;
  readonly undoCount: Ref<number>;
  readonly redoCount: Ref<number>;
  readonly writeEvent: Ref<{ readonly kind: string; readonly reason?: string } | null>;
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

/** 同一查询的多个下游共享一条订阅与同一份快照（派生链只跑一遍）。 */
const shareLatest = <T>(source: Observable<T>): Observable<T> =>
  source.pipe(shareReplay({ bufferSize: 1, refCount: true }));

/**
 * 看板领域桥：Vue ref + 动作集合。组件卸载（或作用域释放）时自动清理订阅。
 *
 * @param rxdb - 已连接的看板 RxDB 实例（实体含 board 命名空间五实体，需历史插件）
 * @param options - 本地记录存储（默认 localStorage）
 * @throws Error 不在 `setup()` 或活动的 `effectScope()` 里调用（订阅与通知器将无人释放）
 */
export function useBoard(rxdb: RxDB, options?: UseBoardOptions): UseBoardReturn {
  if (!getCurrentScope()) {
    throw new Error(
      '[rxdb-plugin-board-vue] useBoard() 必须在 setup() 或活动的 effectScope() 里调用——否则订阅与写入通知器永远不会释放'
    );
  }
  const storage: UseBoardStorage = options?.storage ?? defaultStorage();

  const boards = ref<readonly Board[]>([]);
  const currentBoardId = ref<UUID | null>(null);
  const currentBoard = ref<Board | null>(null);
  const columns = ref<readonly Column[]>([]);
  const tasks = ref<readonly Task[]>([]);
  const labels = ref<readonly BoardLabel[]>([]);
  const taskLabels = ref<ReadonlyMap<string, readonly BoardLabel[]>>(new Map());
  const restoring = ref<boolean>(false);
  const loading = ref(true);
  const readError = ref<string | null>(null);
  const undoCount = ref<number>(0);
  const redoCount = ref<number>(0);
  const writeEvent = ref<{ readonly kind: string; readonly reason?: string } | null>(null);

  const boardId$ = new BehaviorSubject<UUID | null>(null);
  const restoring$ = new BehaviorSubject<boolean>(false);
  const readAttempt$ = new BehaviorSubject(0);

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
  onScopeDispose(() => {
    subs.unsubscribe();
    notifier.complete();
  });
  let boardsReady = false;
  let dataReady = false;
  let failed = false;
  const settleRead = (): void => {
    loading.value = !failed && !(boardsReady && dataReady);
  };
  const failRead = (error: unknown): void => {
    failed = true;
    loading.value = false;
    readError.value = error instanceof Error ? error.message : String(error);
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
  subs.add(boards$.subscribe({ next: list => void (boards.value = list), error: failRead }));
  subs.add(
    combineLatest([boards$, boardId$]).subscribe({
      next: ([list, id]) => void (currentBoard.value = list.find(board => board.id === id) ?? null),
      error: failRead
    })
  );

  const applyReadState = (state: BoardReadState): void => {
    dataReady = state.kind === 'ready';
    if (state.kind === 'failed') {
      failRead(state.message);
      return;
    }
    if (state.kind === 'loading') {
      columns.value = [];
      tasks.value = [];
      labels.value = [];
      taskLabels.value = new Map();

      settleRead();
      return;
    }
    const snapshot = state.snapshot;
    columns.value = snapshot.columns;
    tasks.value = snapshot.tasks;
    labels.value = snapshot.labels;
    taskLabels.value = snapshot.taskLabels;
    settleRead();
  };
  subs.add(
    combineLatest([boardId$, readAttempt$])
      .pipe(switchMap(([boardId]) => observeBoardRead(rxdb, boardId)))
      .subscribe(applyReadState)
  );

  const history = rxdb.versionManager.history();
  subs.add(history.undoCount$.subscribe({ next: count => void (undoCount.value = count), error: failRead }));
  subs.add(history.redoCount$.subscribe({ next: count => void (redoCount.value = count), error: failRead }));
  subs.add(
    notifier.events$.subscribe({
      next: event =>
        void (writeEvent.value = { kind: event.kind, reason: 'reason' in event ? event.reason : undefined }),
      error: failRead
    })
  );
  subs.add(restoring$.subscribe(value => void (restoring.value = value)));

  subs.add(
    boards$.subscribe({
      next: list => {
        const selected = boardId$.value;
        if (list.some(board => board.id === selected)) return;
        const target = list.find(board => board.id === storage.get(LAST_BOARD_KEY)) ?? list[0];
        const next = target?.id ?? null;
        if (next === selected) return;
        boardId$.next(next);
        currentBoardId.value = next;
      },
      error: failRead
    })
  );

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

  const selectBoard = (boardId: UUID): void => {
    storage.set(LAST_BOARD_KEY, boardId);
    boardId$.next(boardId);
    currentBoardId.value = boardId;
  };
  const setRestoring = (value: boolean): void => {
    restoring$.next(value);
  };
  const retryReads = (): void => {
    readError.value = null;
    loading.value = true;
    readAttempt$.next(readAttempt$.value + 1);
  };

  return {
    searchSource,
    searchUnavailableReason: options?.searchUnavailableReason ?? null,
    boards: readonly(boards),
    currentBoardId: readonly(currentBoardId),
    currentBoard: readonly(currentBoard),
    columns: readonly(columns),
    tasks: readonly(tasks),
    labels: readonly(labels),
    taskLabels: readonly(taskLabels),
    restoring: readonly(restoring),
    loading: readonly(loading),
    readError: readonly(readError),
    retryReads,
    undoCount: readonly(undoCount),
    redoCount: readonly(redoCount),
    writeEvent: readonly(writeEvent),
    selectBoard,
    setRestoring,
    actions
  };
}
