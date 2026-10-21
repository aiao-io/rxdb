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
import { BehaviorSubject, combineLatest, map, of, Subscription, switchMap } from 'rxjs';
import { effectScope, getCurrentScope, onScopeDispose, readonly, ref, type Ref } from 'vue';

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
}

export interface UseBoardReturn {
  /** 板级搜索源（US-539 阶段 B）；宿主未注入上游时为 `null`（入口禁用）。 */
  readonly searchSource: BoardSearchSource | null;
  readonly boards: Ref<readonly Board[]>;
  readonly currentBoardId: Ref<UUID | null>;
  readonly currentBoard: Ref<Board | null>;
  readonly columns: Ref<readonly Column[]>;
  readonly tasks: Ref<readonly Task[]>;
  readonly labels: Ref<readonly BoardLabel[]>;
  readonly taskLabels: Ref<ReadonlyMap<string, readonly BoardLabel[]>>;
  readonly restoring: Ref<boolean>;
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

const eq = <F extends string, V>(field: F, value: V) => ({
  combinator: 'and' as const,
  rules: [{ field, operator: '=' as const, value }]
});
const inRule = <F extends string, V>(field: F, values: readonly V[]) => ({
  combinator: 'and' as const,
  rules: [{ field, operator: 'in' as const, value: [...values] }]
});

/**
 * 看板领域桥：Vue ref + 动作集合。组件卸载（或作用域释放）时自动清理订阅。
 *
 * @param rxdb - 已连接的看板 RxDB 实例（实体含 board 命名空间五实体，需历史插件）
 * @param options - 本地记录存储（默认 localStorage）
 */
export function useBoard(rxdb: RxDB, options?: UseBoardOptions): UseBoardReturn {
  const storage: UseBoardStorage = options?.storage ?? defaultStorage();

  const boards = ref<readonly Board[]>([]);
  const currentBoardId = ref<UUID | null>(null);
  const currentBoard = ref<Board | null>(null);
  const columns = ref<readonly Column[]>([]);
  const tasks = ref<readonly Task[]>([]);
  const labels = ref<readonly BoardLabel[]>([]);
  const taskLabels = ref<ReadonlyMap<string, readonly BoardLabel[]>>(new Map());
  const restoring = ref<boolean>(false);
  const undoCount = ref<number>(0);
  const redoCount = ref<number>(0);
  const writeEvent = ref<{ readonly kind: string; readonly reason?: string } | null>(null);

  const boardId$ = new BehaviorSubject<UUID | null>(null);
  const restoring$ = new BehaviorSubject<boolean>(false);

  let actions!: UseBoardActions;
  let searchSource: BoardSearchSource | null = null;

  const scope = effectScope();
  scope.run(() => {
    const ctx = () => ({ boardId: boardId$.value, restoring: restoring$.value });
    searchSource = options?.search ? new BoardSearchSource(rxdb, ctx, options.search.upstream, {}) : null;
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
    onScopeDispose(() => {
      subs.unsubscribe();
      notifier.complete();
    });

    const boards$ = boardRepo.find({
      where: { combinator: 'and', rules: [] },
      orderBy: [
        { field: 'createdAt', sort: 'asc' },
        { field: 'id', sort: 'asc' }
      ]
    });
    subs.add(boards$.subscribe(list => void (boards.value = list)));
    subs.add(
      combineLatest([boards$, boardId$]).subscribe(
        ([list, id]) => void (currentBoard.value = list.find(board => board.id === id) ?? null)
      )
    );

    const columns$ = boardId$.pipe(
      switchMap(boardId =>
        boardId === null ? of([] as readonly Column[]) : columnRepo.find({ where: eq('boardId', boardId) })
      )
    );
    subs.add(columns$.subscribe(list => void (columns.value = list)));
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
    subs.add(tasks$.subscribe(list => void (tasks.value = list)));
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
    subs.add(labels$.subscribe(list => void (labels.value = list)));
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
    subs.add(taskLabels$.subscribe(mapValue => void (taskLabels.value = mapValue)));

    const history = rxdb.versionManager.history();
    subs.add(history.undoCount$.subscribe(count => void (undoCount.value = count)));
    subs.add(history.redoCount$.subscribe(count => void (redoCount.value = count)));
    subs.add(
      notifier.events$.subscribe(
        event => void (writeEvent.value = { kind: event.kind, reason: 'reason' in event ? event.reason : undefined })
      )
    );
    subs.add(restoring$.subscribe(value => void (restoring.value = value)));

    let picked = false;
    subs.add(
      boards$.subscribe(list => {
        if (picked || list.length === 0) return;
        const target = list.find(board => board.id === storage.get(LAST_BOARD_KEY)) ?? list[0];
        picked = true;
        boardId$.next(target.id);
        currentBoardId.value = target.id;
      })
    );

    actions = {
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
  });

  // 组件内调用时随组件卸载停用；独立调用（测试）由调用方 stop
  if (getCurrentScope()) {
    onScopeDispose(() => scope.stop());
  }

  const selectBoard = (boardId: UUID): void => {
    storage.set(LAST_BOARD_KEY, boardId);
    boardId$.next(boardId);
    currentBoardId.value = boardId;
  };
  const setRestoring = (value: boolean): void => {
    restoring$.next(value);
  };

  return {
    searchSource,
    boards: readonly(boards),
    currentBoardId: readonly(currentBoardId),
    currentBoard: readonly(currentBoard),
    columns: readonly(columns),
    tasks: readonly(tasks),
    labels: readonly(labels),
    taskLabels: readonly(taskLabels),
    restoring: readonly(restoring),
    undoCount: readonly(undoCount),
    redoCount: readonly(redoCount),
    writeEvent: readonly(writeEvent),
    selectBoard,
    setRestoring,
    actions
  };
}
