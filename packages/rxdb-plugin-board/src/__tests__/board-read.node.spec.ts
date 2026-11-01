import type { RxDB, UUID } from '@aiao/rxdb';
import { Subject, type Observable } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { observeBoardRead, type BoardReadState } from '../board-read.js';
import { BoardLabel, Column, Task, TaskLabel } from '../entities/index.js';

const boardId = 'board' as UUID;
const row = <T extends object>(data: Partial<T>): T => data as T;
const createSources = () => {
  const columns = new Subject<Column[]>();
  const labels = new Subject<BoardLabel[]>();
  const tasks = new Subject<Task[]>();
  const links = new Subject<TaskLabel[]>();
  const sources = new Map<unknown, Observable<readonly unknown[]>>([
    [Column, columns],
    [BoardLabel, labels],
    [Task, tasks],
    [TaskLabel, links]
  ]);
  const db = {
    entityManager: { getRepository: (entity: unknown) => ({ findAll: () => sources.get(entity)! }) }
  } as unknown as RxDB;
  return { db, columns, labels, tasks, links };
};

describe('完整看板快照', () => {
  it('列、标签、任务、关联全部返回前不发布ready，退订取消整条读取链', () => {
    const sources = createSources();
    const states: BoardReadState[] = [];
    const subscription = observeBoardRead(sources.db, boardId).subscribe(state => states.push(state));
    expect(states).toEqual([{ kind: 'loading' }]);
    sources.columns.next([row<Column>({ id: 'c0000000-0000-4000-8000-000000000001', boardId, title: '待办' })]);
    sources.labels.next([row<BoardLabel>({ id: 'a0000000-0000-4000-8000-000000000001', name: '标签' })]);
    sources.tasks.next([
      row<Task>({ id: 'e0000000-0000-4000-8000-000000000001', columnId: 'c0000000-0000-4000-8000-000000000001' })
    ]);
    expect(states).toEqual([{ kind: 'loading' }]);
    sources.links.next([
      row<TaskLabel>({
        id: 'f0000000-0000-4000-8000-000000000001',
        taskId: 'e0000000-0000-4000-8000-000000000001',
        labelId: 'a0000000-0000-4000-8000-000000000001'
      })
    ]);
    const ready = states.at(-1);
    expect(ready?.kind).toBe('ready');
    if (ready?.kind !== 'ready') throw new Error('完整快照未就绪');
    expect(
      ready.snapshot.taskLabels.get('e0000000-0000-4000-8000-000000000001' as UUID)?.map(label => label.name)
    ).toEqual(['标签']);
    subscription.unsubscribe();
    expect([sources.columns, sources.labels, sources.tasks, sources.links].some(source => source.observed)).toBe(false);
  });

  it('子查询失败显式失败，重新订阅可恢复；空列在标签就绪后正常完成', () => {
    const sources = createSources();
    const states: BoardReadState[] = [];
    observeBoardRead(sources.db, boardId).subscribe(state => states.push(state));
    sources.columns.next([row<Column>({ id: 'c0000000-0000-4000-8000-000000000001', boardId })]);
    sources.labels.next([]);
    sources.tasks.error(new Error('任务读取失败'));
    expect(states.at(-1)).toEqual({ kind: 'failed', message: '任务读取失败' });
    const next = createSources();
    const retried: BoardReadState[] = [];
    const sub = observeBoardRead(next.db, boardId).subscribe(state => retried.push(state));
    next.columns.next([]);
    expect(retried.at(-1)?.kind).toBe('loading');
    next.labels.next([]);
    expect(retried.at(-1)?.kind).toBe('ready');
    sub.unsubscribe();
  });
});

it('未选板返回完整空快照，不访问任何仓储', () => {
  const states: BoardReadState[] = [];
  observeBoardRead({} as RxDB, null).subscribe(state => states.push(state));
  expect(states).toEqual([
    { kind: 'loading' },
    { kind: 'ready', snapshot: { columns: [], tasks: [], labels: [], taskLabels: new Map() } }
  ]);
});

it('完整快照保留101个任务与关联，未命中的标签不泄漏到当前板', () => {
  const sources = createSources();
  const states: BoardReadState[] = [];
  const sub = observeBoardRead(sources.db, boardId).subscribe(state => states.push(state));
  const columnId = 'c0000000-0000-4000-8000-000000000001' as UUID;
  const labelId = 'a0000000-0000-4000-8000-000000000001' as UUID;
  const tasks = Array.from({ length: 101 }, (_, index) =>
    row<Task>({ id: `e0000000-0000-4000-8000-${String(index).padStart(12, '0')}` as UUID, columnId })
  );
  sources.columns.next([row<Column>({ id: columnId, boardId })]);
  sources.labels.next([row<BoardLabel>({ id: labelId, name: '本板' })]);
  sources.tasks.next(tasks);
  sources.links.next(tasks.map(task => row<TaskLabel>({ id: task.id, taskId: task.id, labelId })));
  const ready = states.at(-1);
  if (ready?.kind !== 'ready') throw new Error('完整快照未就绪');
  expect(ready.snapshot.tasks).toHaveLength(101);
  expect(ready.snapshot.taskLabels.size).toBe(101);
  sources.links.next([
    row<TaskLabel>({ id: tasks[0].id, taskId: tasks[0].id, labelId: 'a0000000-0000-4000-8000-000000000002' })
  ]);
  const filtered = states.at(-1);
  if (filtered?.kind !== 'ready') throw new Error('关联刷新未就绪');
  expect(filtered.snapshot.taskLabels.size).toBe(0);
  sub.unsubscribe();
});
