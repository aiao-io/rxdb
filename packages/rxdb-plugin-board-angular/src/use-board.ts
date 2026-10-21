import { type RxDB, type UUID } from '@aiao/rxdb';
import {
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
  type BoardSearchUpstream,
  type CardDropTarget,
  type ColumnSortMode,
  type DeletePlan,
  type LabelDeletePlan,
  type SaveTaskDraftResult,
  type TaskDraft,
  type TaskDraftSnapshot
} from '@aiao/rxdb-plugin-board';
import type {} from '@aiao/rxdb-plugin-history';
import { DestroyRef, inject, signal, type Signal } from '@angular/core';
import { BehaviorSubject, combineLatest, map, of, Subscription, switchMap } from 'rxjs';

import { eq, inRule } from './query-helpers.js';

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

export interface UseBoardStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface UseBoardOptions {
  /** 本地记录存储（默认 localStorage；测试注入内存表）。 */
  readonly storage?: UseBoardStorage;
  /** 板内搜索（US-539 阶段 B）：注入上游全文源（搜索插件实例）。不传则无搜索能力。 */
  readonly search?: { readonly upstream: BoardSearchUpstream };
}

export interface UseBoardReturn {
  /** 板级搜索源（US-539 阶段 B）；宿主未注入上游时为 `null`（入口禁用）。 */
  readonly searchSource: BoardSearchSource | null;
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

export interface UseBoardActions {
  createBoard(input: { title: string; description?: string }): Promise<Board>;
  createColumn(input: { title: string }): Promise<Column>;
  createTask(input: { columnId: UUID; title: string }): Promise<Task>;
  updateBoard(boardId: UUID, patch: { title?: string; description?: string }): Promise<Board>;
  updateColumn(columnId: UUID, patch: { title: string }): Promise<Column>;
  updateTaskTitle(taskId: UUID, title: string): Promise<Task>;
  openSnapshot(taskId: UUID): Promise<TaskDraftSnapshot>;
  saveTaskDraft(taskId: UUID, snapshot: TaskDraftSnapshot, draft: TaskDraft): Promise<SaveTaskDraftResult>;
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
  const candidate = typeof localStorage !== 'undefined' ? (localStorage as unknown as UseBoardStorage | null) : null;
  // happy-dom 等环境的 localStorage 可能是没有方法的占位对象，逐方法探测
  if (candidate && typeof candidate.get === 'function' && typeof candidate.set === 'function') return candidate;
  const memory = new Map<string, string>();
  return { get: key => memory.get(key) ?? null, set: (key, value) => void memory.set(key, value) };
};

const bind = <T>(source: import('rxjs').Observable<T>, target: { set(value: T): void }, subs: Subscription): void => {
  subs.add(source.subscribe(value => target.set(value)));
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

  const boards = signal<readonly Board[]>([]);
  const currentBoardId = signal<UUID | null>(null);
  const currentBoard = signal<Board | null>(null);
  const columns = signal<readonly Column[]>([]);
  const tasks = signal<readonly Task[]>([]);
  const labels = signal<readonly BoardLabel[]>([]);
  const taskLabels = signal<ReadonlyMap<string, readonly BoardLabel[]>>(new Map());
  const restoring = signal<boolean>(false);
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
  const columnRepo = rxdb.entityManager.getRepository(Column);
  const taskRepo = rxdb.entityManager.getRepository(Task);
  const labelRepo = rxdb.entityManager.getRepository(BoardLabel);
  const linkRepo = rxdb.entityManager.getRepository(TaskLabel);

  const subs = new Subscription();

  // 板列表：创建时间升序、同时刻按 id
  const boards$ = boardRepo.find({
    where: { combinator: 'and', rules: [] },
    orderBy: [
      { field: 'createdAt', sort: 'asc' },
      { field: 'id', sort: 'asc' }
    ]
  });
  bind(boards$, boards, subs);
  // 当前板
  subs.add(
    combineLatest([boards$, boardId$]).subscribe(([list, id]) => {
      currentBoard.set(list.find(board => board.id === id) ?? null);
    })
  );
  // 列 / 任务 / 标签随当前板切换（活查询 switchMap；signal 只是流的镜像）
  const columns$ = boardId$.pipe(
    switchMap(boardId =>
      boardId === null ? of([] as readonly Column[]) : columnRepo.find({ where: eq('boardId', boardId) })
    )
  );
  bind(columns$, columns, subs);
  const tasks$ = combineLatest([boardId$, columns$]).pipe(
    switchMap(([boardId, cols]) => {
      if (boardId === null || cols.length === 0) return of([] as readonly Task[]);
      return taskRepo.find({
        where: {
          combinator: 'and',
          rules: [
            inRule(
              'columnId',
              cols.map(column => column.id)
            )
          ]
        }
      });
    })
  );
  bind(tasks$, tasks, subs);
  const labels$ = boardId$.pipe(
    switchMap(boardId =>
      boardId === null ?
        of([] as readonly BoardLabel[])
      : labelRepo.find({
          where: eq('boardId', boardId),
          orderBy: [
            { field: 'createdAt', sort: 'asc' },
            { field: 'id', sort: 'asc' }
          ]
        })
    )
  );
  bind(labels$, labels, subs);
  // 任务 → 标签：当前板全部关联与标签定义求交
  const taskLabels$ = combineLatest([boardId$, tasks$, labels$]).pipe(
    switchMap(([boardId, currentTasks, currentLabels]) => {
      if (boardId === null || currentTasks.length === 0) return of(new Map<UUID, readonly BoardLabel[]>());
      const ids = currentTasks.map(task => task.id);
      return linkRepo.find({ where: { combinator: 'and', rules: [inRule('taskId', ids)] } }).pipe(
        map(links => {
          const labelById = new Map(currentLabels.map(label => [label.id, label]));
          const grouped = new Map<UUID, BoardLabel[]>();
          for (const link of links) {
            const label = labelById.get(link.labelId);
            if (!label) continue;
            const list = grouped.get(link.taskId) ?? [];
            list.push(label);
            grouped.set(link.taskId, list);
          }
          return grouped as ReadonlyMap<string, readonly BoardLabel[]>;
        })
      );
    })
  );
  bind(taskLabels$, taskLabels, subs);

  // 撤销 / 重做计数（数据库级历史，跨实体一次保存一个事务）
  const history = rxdb.versionManager.history();
  bind(history.undoCount$, undoCount, subs);
  bind(history.redoCount$, redoCount, subs);
  subs.add(
    notifier.events$.subscribe(event =>
      writeEvent.set({ kind: event.kind, reason: 'reason' in event ? event.reason : undefined })
    )
  );
  subs.add(restoring$.subscribe(value => restoring.set(value)));

  // 当前板初始选择：本地记录 → 第一块板（板列表首个快照到达时确定）
  const stored = storage.get(LAST_BOARD_KEY);
  let picked = false;
  subs.add(
    boards$.subscribe(list => {
      if (picked || list.length === 0) return;
      const target = list.find(board => board.id === stored) ?? list[0];
      picked = true;
      boardId$.next(target.id);
      currentBoardId.set(target.id);
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
    undo: () => history.undo(),
    redo: () => history.redo()
  };

  return {
    searchSource,
    boards: boards.asReadonly(),
    currentBoardId: currentBoardId.asReadonly(),
    currentBoard: currentBoard.asReadonly(),
    columns: columns.asReadonly(),
    tasks: tasks.asReadonly(),
    labels: labels.asReadonly(),
    taskLabels: taskLabels.asReadonly(),
    restoring: restoring.asReadonly(),
    undoCount: undoCount.asReadonly(),
    redoCount: redoCount.asReadonly(),
    writeEvent: writeEvent.asReadonly(),
    selectBoard,
    setRestoring,
    actions
  };
}
