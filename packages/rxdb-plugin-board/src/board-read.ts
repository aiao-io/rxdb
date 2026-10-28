import type { RxDB, UUID } from '@aiao/rxdb';
import { catchError, combineLatest, map, of, startWith, switchMap, type Observable } from 'rxjs';

import { BoardLabel } from './entities/board-label.entity.js';
import { Column } from './entities/column.entity.js';
import { TaskLabel } from './entities/task-label.entity.js';
import { Task } from './entities/task.entity.js';
import { inRule, whereEq } from './query.js';

/** 一块板的完整读取快照，关联与任务来自同一轮查询。 */
export interface BoardReadSnapshot {
  readonly columns: readonly Column[];
  readonly tasks: readonly Task[];
  readonly labels: readonly BoardLabel[];
  readonly taskLabels: ReadonlyMap<UUID, readonly BoardLabel[]>;
}

/** 子集合全部就绪后才发布快照，失败保持可判别状态。 */
export type BoardReadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly snapshot: BoardReadSnapshot };

const groupLabels = (
  tasks: readonly Task[],
  labels: readonly BoardLabel[],
  links: readonly TaskLabel[]
): ReadonlyMap<UUID, readonly BoardLabel[]> => {
  const labelIds = new Map<UUID, Set<UUID>>();
  for (const link of links) {
    const ids = labelIds.get(link.taskId) ?? new Set<UUID>();
    ids.add(link.labelId);
    labelIds.set(link.taskId, ids);
  }
  const grouped = new Map<UUID, readonly BoardLabel[]>();
  for (const task of tasks) {
    const ids = labelIds.get(task.id);
    const selected = labels.filter(label => ids?.has(label.id));
    if (selected.length > 0) grouped.set(task.id, selected);
  }
  return grouped;
};

const readTasks = (rxdb: RxDB, columns: readonly Column[]): Observable<readonly Task[]> =>
  columns.length === 0 ?
    of([])
  : rxdb.entityManager.getRepository(Task).findAll({
      where: {
        combinator: 'and',
        rules: [
          inRule(
            'columnId',
            columns.map(column => column.id)
          )
        ]
      }
    });

const readLinks = (rxdb: RxDB, tasks: readonly Task[]): Observable<readonly TaskLabel[]> =>
  tasks.length === 0 ?
    of([])
  : rxdb.entityManager.getRepository(TaskLabel).findAll({
      where: {
        combinator: 'and',
        rules: [
          inRule(
            'taskId',
            tasks.map(task => task.id)
          )
        ]
      }
    });

const readTaskSnapshot = (
  rxdb: RxDB,
  columns: readonly Column[],
  labels: readonly BoardLabel[]
): Observable<BoardReadSnapshot> =>
  readTasks(rxdb, columns).pipe(
    switchMap(tasks =>
      readLinks(rxdb, tasks).pipe(
        map(links => ({ columns, tasks, labels, taskLabels: groupLabels(tasks, labels, links) }))
      )
    )
  );

const readSnapshot = (rxdb: RxDB, boardId: UUID | null): Observable<BoardReadSnapshot> => {
  const columns$ =
    boardId === null ?
      of([])
    : rxdb.entityManager.getRepository(Column).findAll({ where: whereEq('boardId', boardId) });
  const labels$ =
    boardId === null ?
      of([])
    : rxdb.entityManager.getRepository(BoardLabel).findAll({
        where: whereEq('boardId', boardId),
        orderBy: [
          { field: 'createdAt', sort: 'asc' },
          { field: 'id', sort: 'asc' }
        ]
      });
  return combineLatest([columns$, labels$]).pipe(
    switchMap(([columns, labels]) => readTaskSnapshot(rxdb, columns, labels))
  );
};

/**
 * 观察当前板的全部子集合；退订会同时取消所有在途子查询。
 * @param rxdb - 已连接的看板实例
 * @param boardId - 当前板，未选板时为 null
 * @returns 先发布读取中，再发布完整快照或可判别失败
 */
export const observeBoardRead = (rxdb: RxDB, boardId: UUID | null): Observable<BoardReadState> =>
  readSnapshot(rxdb, boardId).pipe(
    map(snapshot => ({ kind: 'ready' as const, snapshot })),
    startWith({ kind: 'loading' as const }),
    catchError((error: unknown) =>
      of({ kind: 'failed' as const, message: error instanceof Error ? error.message : String(error) })
    )
  );
