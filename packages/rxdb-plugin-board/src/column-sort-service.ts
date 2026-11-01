import {
  assertEntityOperationAllowed,
  assertSortOrderKey,
  getEntitySync,
  SyncType,
  type RxDB,
  type UUID
} from '@aiao/rxdb';
import { generateKeysBetween } from '@aiao/utils';
import { firstValueFrom } from 'rxjs';

import { Column } from './entities/column.entity.js';
import { Task } from './entities/task.entity.js';
import { BoardDomainError } from './errors.js';
import { assertBoardWritable, requireBoardId, type BoardHostContext } from './host-context.js';
import { whereEq } from './query.js';
import { BoardWriteNotifier, describeBoardFailure } from './write-notifier.js';

/** 本列排序方式（US-535 AC#4 / #10）。 */
export type ColumnSortMode = 'dueDate' | 'title';

/** 本列排序结果：是否实际写入（已是目标顺序则零写）。 */
export interface ColumnSortResult {
  readonly written: boolean;
}

/** 标题比较器：`Intl.Collator('zh-Hans-CN', { numeric: true })`，重名按 `id`。 */
const TITLE_COLLATOR = new Intl.Collator('zh-Hans-CN', { numeric: true });

type SortableTask = {
  readonly id: UUID;
  readonly title: string;
  readonly dueDate: string | null;
  readonly sortOrder: string;
};

const compareById = (a: SortableTask, b: SortableTask): number =>
  a.id < b.id ? -1
  : a.id > b.id ? 1
  : 0;

const compareByTitle = (a: SortableTask, b: SortableTask): number => {
  const order = TITLE_COLLATOR.compare(a.title, b.title);
  return order !== 0 ? order : compareById(a, b);
};

const compareByDueDate = (a: SortableTask, b: SortableTask): number => {
  if (a.dueDate === null && b.dueDate === null) return compareByTitle(a, b);
  if (a.dueDate === null) return 1;
  if (b.dueDate === null) return -1;
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  return compareByTitle(a, b);
};

/**
 * 本列排序（US-535）：列菜单「按截止日排序」「按标题排序」的一次性重排。
 *
 * @remarks
 * 不是持久排序模式：之后新建的任务仍追加到列尾，拖拽照常生效。
 * 门面 `Repository.reorder()` 自行开启事务，executor 的 `IRepository` 没有 `reorder()`；
 * 在外层事务里等待门面会排队等待自身而永久挂起——所以本服务走 executor 事务：
 * 重读整列 → 校验键 → 算目标顺序 → 生成整列新键 → 只写 `sortOrder`。
 * 只支持本地完整版本化主端：remote-only / QueryCache 在写入前拒绝
 * （引擎 `Repository` 的同款判据，本地只有序列子集时拿它算键会与远端不一致）。
 */
export class BoardColumnSortService {
  constructor(
    private readonly rxdb: RxDB,
    private readonly ctx: () => BoardHostContext,
    private readonly notifier: BoardWriteNotifier
  ) {}

  async sortColumn(columnId: UUID, mode: ColumnSortMode): Promise<ColumnSortResult> {
    assertBoardWritable(this.ctx());
    const sync = getEntitySync(Task, this.rxdb.entitySync);
    if (sync?.type === SyncType.QueryCache || (!sync?.local && sync?.remote)) {
      throw new BoardDomainError(
        'unsupported_primary',
        '本列排序只支持本地完整版本化主端；remote-only / QueryCache 读不到完整序列'
      );
    }
    const boardId = requireBoardId(this.ctx());
    assertEntityOperationAllowed(Task, 'update');
    const local = await firstValueFrom(this.rxdb.localAdapter$);

    try {
      const written = await local.transaction(async executor => {
        const columns = await executor.getRepository(Column).find({ where: whereEq('id', columnId) });
        if (columns.length === 0) throw new BoardDomainError('column_not_found', `列不存在：${columnId}`);
        if (columns[0].boardId !== boardId) {
          throw new BoardDomainError('cross_board', '目标列不属于当前看板');
        }
        const rows = await executor.getRepository(Task).find({
          where: whereEq('columnId', columnId),
          orderBy: [
            { field: 'sortOrder', sort: 'asc' },
            { field: 'id', sort: 'asc' }
          ]
        });
        const tasks: SortableTask[] = rows.map(task => {
          assertSortOrderKey('Task', task.sortOrder);
          return { id: task.id, title: task.title, dueDate: task.dueDate ?? null, sortOrder: task.sortOrder };
        });
        if (tasks.length < 2) return false;

        const comparator = mode === 'dueDate' ? compareByDueDate : compareByTitle;
        const ordered = [...tasks].sort(comparator);
        if (ordered.every((task, index) => task.id === tasks[index].id)) return false;

        // 新键严格大于全部旧键：码点比较取当前最大键，向后生成整列新键，
        // 按目标顺序分配给对应任务。读最大键与写新键在同一事务里：SQLite 事务可串行化（并发的
        // 后一个要么读到前一个的提交、要么升级写锁时 BUSY 失败走 sort-failed），PGlite 单连接串行，
        // 不会两边读到同一个最大键写出重复键
        const maxKey = tasks.reduce((max, task) => (task.sortOrder > max ? task.sortOrder : max), '');
        const keys = generateKeysBetween(maxKey, null, ordered.length);
        const rowById = new Map(rows.map(row => [row.id, row]));
        for (let index = 0; index < ordered.length; index++) {
          const row = rowById.get(ordered[index].id);
          if (!row) throw new BoardDomainError('task_not_found', `任务不存在：${ordered[index].id}`);
          await executor.getRepository(Task).update(row, { sortOrder: keys[index] });
        }
        return true;
      });
      this.notifier.next({ kind: 'sort-committed', columnId, written });
      return { written };
    } catch (error) {
      this.notifier.next({ kind: 'sort-failed', columnId, reason: describeBoardFailure(error) });
      throw error;
    }
  }
}
