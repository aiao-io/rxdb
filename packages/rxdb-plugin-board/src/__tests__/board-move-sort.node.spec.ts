import { RxDB, SyncType, type UUID } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BoardDomain } from '../board-domain.js';
import { BoardColumnSortService } from '../column-sort-service.js';
import { BoardDeleteService } from '../delete-service.js';
import { resolveCardDrop, type CardDropColumnView } from '../drop-resolution.js';
import { Board, BoardLabel, Column, Task, TaskLabel } from '../entities/index.js';
import { BoardMoveService } from '../move-service.js';
import { matchAll, readFirst, whereEq } from '../query.js';
import { BoardWriteNotifier } from '../write-notifier.js';

/**
 * 跨列移动 / 同列改序 / 本列排序（US-535 AC#1～12 服务层）：真实 PGlite + 历史插件。
 * 拖拽几何由核心包换算表驱动；三端 Playwright 真实拖拽在 US-539 阶段 A 验收。
 */
describe('BoardMoveService / BoardColumnSortService（US-535）', () => {
  let rxdb: RxDB;
  let domain: BoardDomain;
  let moves: BoardMoveService;
  let sorts: BoardColumnSortService;
  let notifier: BoardWriteNotifier;
  let events: { kind: string; taskId?: string; columnId?: string }[];
  let ctx: { boardId: UUID | null; restoring: boolean };

  const columnRepo = () => rxdb.entityManager.getRepository(Column);
  const taskRepo = () => rxdb.entityManager.getRepository(Task);

  const tasksOf = (columnId: UUID) => readFirst(taskRepo().find({ where: whereEq('columnId', columnId) }));

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: `board-move-${Math.random().toString(36).slice(2)}`,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.use(rxDBPluginHistory);
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');
    ctx = { boardId: null, restoring: false };
    domain = new BoardDomain(rxdb, () => ctx);
    notifier = new BoardWriteNotifier();
    events = [];
    notifier.events$.subscribe(event =>
      events.push({
        kind: event.kind,
        taskId: 'taskId' in event ? event.taskId : undefined,
        columnId: 'columnId' in event ? event.columnId : undefined
      })
    );
    moves = new BoardMoveService(rxdb, () => ctx, notifier);
    sorts = new BoardColumnSortService(rxdb, () => ctx, notifier);
  });

  afterEach(async () => {
    notifier.complete();
    if (rxdb) await rxdb.disconnectAll();
  });

  /** 建板 + 三列（C1/C2 各 3 任务、C3 空）。任务 id 按 a1..c 排序。 */
  const seedColumns = async () => {
    const board = await domain.createBoard({ title: '看板' });
    ctx.boardId = board.id;
    const c1 = await domain.createColumn({ title: 'C1' });
    const c2 = await domain.createColumn({ title: 'C2' });
    const c3 = await domain.createColumn({ title: 'C3' });
    const t1: UUID[] = [];
    const t2: UUID[] = [];
    for (const title of ['a1', 'a2', 'a3']) t1.push((await domain.createTask({ columnId: c1.id, title })).id);
    for (const title of ['b1', 'b2', 'b3']) t2.push((await domain.createTask({ columnId: c2.id, title })).id);
    return { board, c1, c2, c3, t1, t2 };
  };

  /** 几何占位用的空列 id（指针从不落在这些列内，仅占矩形布局）。 */
  const NO_COLUMN: UUID = '00000000-0000-4000-8000-0000000000ee';

  /** 三列并排的合成几何：每列宽 100、高 400，卡片从 y=100 起每 50 一张。 */
  const geometry = (c1: UUID, c2: UUID, c3: UUID, t1: UUID[], t2: UUID[]): CardDropColumnView[] => {
    const column = (columnId: UUID, left: number, taskIds: UUID[]): CardDropColumnView => ({
      columnId,
      rect: { left, right: left + 100, top: 0, bottom: 400 },
      cards: taskIds.map((id, index) => ({ id, top: 100 + index * 50, bottom: 100 + index * 50 + 30 })),
      taskIds
    });
    return [column(c1, 0, t1), column(c2, 100, t2), column(c3, 200, [])];
  };

  it('AC#1：跨列两邻之间——一个事务只写 column_id 与 sortOrder，源列其余行不改写', async () => {
    const { c1, c2, t1, t2 } = await seedColumns();
    const before1 = await tasksOf(c1.id);
    const before2 = await tasksOf(c2.id);

    // 指针落在 C2 的 b2 卡片上半 → before b2 → 邻居 (b1, b2)
    const target = resolveCardDrop(geometry(c1.id, c2.id, NO_COLUMN, t1, t2), t1[0], 150, 115);
    expect(target).toMatchObject({ kind: 'between', columnId: c2.id, prevId: t2[0], nextId: t2[1] });
    await moves.moveTask(t1[0], target!);

    const after1 = await tasksOf(c1.id);
    const after2 = await tasksOf(c2.id);
    expect(after1.map(t => t.id)).toEqual([t1[1], t1[2]]);
    expect(after2.map(t => t.id)).toEqual([t2[0], t1[0], t2[1], t2[2]]);
    // 只写 column_id 与 sortOrder：标题原样、源列剩余行 sortOrder 不变
    expect(after1.map(t => t.title)).toEqual(['a2', 'a3']);
    expect(after1.map(t => t.sortOrder)).toEqual(before1.slice(1).map(t => t.sortOrder));
    expect(before2.find(t => t.id === t2[0])?.sortOrder).toBe(after2.find(t => t.id === t2[0])?.sortOrder);
    expect(events).toContainEqual({ kind: 'move-committed', taskId: t1[0], columnId: undefined });
  });

  it('AC#2：空列落点用 { group } 目标，任务落入空列', async () => {
    const { c1, c3, t1 } = await seedColumns();
    const target = resolveCardDrop(geometry(c1.id, NO_COLUMN, c3.id, t1, []), t1[0], 250, 50);
    expect(target).toEqual({ kind: 'end', columnId: c3.id });
    await moves.moveTask(t1[0], target!);
    expect((await tasksOf(c3.id)).map(t => t.id)).toEqual([t1[0]]);
  });

  it('AC#3：同列改序只写 sortOrder；原位落点零写', async () => {
    const { c1, t1 } = await seedColumns();
    // 把 a3 拖到 a1 的上半（首部）
    const target = resolveCardDrop(geometry(c1.id, NO_COLUMN, NO_COLUMN, t1, []), t1[2], 50, 100);
    expect(target).toMatchObject({ kind: 'between', columnId: c1.id, prevId: null, nextId: t1[0] });
    await moves.moveTask(t1[2], target!);
    expect((await tasksOf(c1.id)).map(t => t.id)).toEqual([t1[2], t1[0], t1[1]]);
    expect((await tasksOf(c1.id)).map(t => t.columnId)).toEqual([c1.id, c1.id, c1.id]);

    // 原位：a2 仍在原位，落点换算返回 null，不发起重排
    const inPlace = resolveCardDrop(geometry(c1.id, NO_COLUMN, NO_COLUMN, [t1[2], t1[0], t1[1]], []), t1[1], 50, 210);
    expect(inPlace).toBeNull();
    const before = await tasksOf(c1.id);
    expect(before.map(t => t.id)).toEqual([t1[2], t1[0], t1[1]]);
  });

  it('单卡列：列首 / 列尾空区都是原位（null），不产出 undefined 邻居', () => {
    const task: UUID = '00000000-0000-4000-8000-0000000000a1';
    const view: CardDropColumnView[] = [
      {
        columnId: '00000000-0000-4000-8000-0000000000c1',
        rect: { left: 0, right: 100, top: 0, bottom: 400 },
        cards: [{ id: task, top: 100, bottom: 130 }],
        taskIds: [task]
      }
    ];
    // 去掉被拖行后没有邻居，任何空区落点都是原位，不能生成 undefined 邻居
    expect(resolveCardDrop(view, task, 50, 50)).toBeNull();
    expect(resolveCardDrop(view, task, 50, 200)).toBeNull();
  });

  it('卡片间隙按最近卡归 before/after，不一律落列尾', () => {
    const ids: UUID[] = [
      '00000000-0000-4000-8000-0000000000a1',
      '00000000-0000-4000-8000-0000000000a2',
      '00000000-0000-4000-8000-0000000000a3'
    ];
    const view: CardDropColumnView[] = [
      {
        columnId: '00000000-0000-4000-8000-0000000000c1',
        rect: { left: 0, right: 100, top: 0, bottom: 400 },
        cards: ids.map((id, index) => ({ id, top: 100 + index * 50, bottom: 130 + index * 50 })),
        taskIds: ids
      }
    ];
    // a2 与 a3 之间的间隙（180..200）：近 a2 → after a2；近 a3 → before a3，同为 (a2, a3)
    expect(resolveCardDrop(view, ids[0], 50, 185)).toMatchObject({ kind: 'between', prevId: ids[1], nextId: ids[2] });
    expect(resolveCardDrop(view, ids[0], 50, 195)).toMatchObject({ kind: 'between', prevId: ids[1], nextId: ids[2] });
    // 列尾空区（末卡下沿以下）仍落列尾
    expect(resolveCardDrop(view, ids[0], 50, 350)).toMatchObject({ prevId: ids[2], nextId: null });
    // 异列任务落入间隙
    const other: UUID = '00000000-0000-4000-8000-0000000000b1';
    expect(resolveCardDrop(view, other, 50, 195)).toMatchObject({ prevId: ids[1], nextId: ids[2] });
    // 间隙贴着自己的卡（锚点即被拖行）= 原位零写
    expect(resolveCardDrop(view, ids[1], 50, 185)).toBeNull();
  });

  it('AC#6：目标邻居被另一入口删除 → 拒绝（staleTarget），零写，状态机发布失败', async () => {
    const { c2, t1, t2 } = await seedColumns();
    const target = resolveCardDrop(geometry(NO_COLUMN, c2.id, NO_COLUMN, [], t2), t1[0], 150, 115);
    expect(target).toMatchObject({ prevId: t2[0], nextId: t2[1] });
    // 几何计算后 b1 被删除
    const deletes = new BoardDeleteService(rxdb, () => ctx);
    await deletes.executeDelete(await deletes.planTaskDelete(t2[0]));

    await expect(moves.moveTask(t1[0], target!)).rejects.toBeTruthy();
    expect(events.some(e => e.kind === 'move-failed' && e.taskId === t1[0])).toBe(true);
    // 零写：任务仍在原列原位置
    expect((await readFirst(taskRepo().find({ where: whereEq('id', t1[0]) })))[0].columnId).toBe(
      (await readFirst(columnRepo().find({ where: matchAll() })))[0].id
    );
  });

  it('AC#7：一次 undo 反转整个移动事务', async () => {
    const { c1, c2, t1, t2 } = await seedColumns();
    const target = resolveCardDrop(geometry(c1.id, c2.id, NO_COLUMN, t1, t2), t1[0], 150, 115);
    await moves.moveTask(t1[0], target!);
    expect((await tasksOf(c2.id)).map(t => t.id)).toContain(t1[0]);

    await rxdb.versionManager.history().undo();
    expect((await tasksOf(c1.id)).map(t => t.id)).toEqual([t1[0], t1[1], t1[2]]);
    expect((await tasksOf(c2.id)).map(t => t.id)).toEqual(t2);
  });

  it('AC#8：不存在的列 / 跨板列拒绝，零写并发布可展示原因', async () => {
    const { c1, t1 } = await seedColumns();
    const otherBoard = await domain.createBoard({ title: '异板' });
    ctx.boardId = otherBoard.id;
    const foreignColumn = await domain.createColumn({ title: '异板列' });
    ctx.boardId = (
      await readFirst(rxdb.entityManager.getRepository(Board).find({ where: whereEq('title', '看板') }))
    )[0].id;

    await expect(
      moves.moveTask(t1[0], { kind: 'end', columnId: '00000000-0000-4000-8000-0000000000ff' })
    ).rejects.toMatchObject({
      code: 'column_not_found'
    });
    await expect(moves.moveTask(t1[0], { kind: 'end', columnId: foreignColumn.id })).rejects.toMatchObject({
      code: 'cross_board'
    });
    expect((await tasksOf(c1.id)).map(t => t.id)).toEqual(t1);
    expect(events.filter(e => e.kind === 'move-failed')).toHaveLength(2);
  });

  it('AC#12：换算表逐行确定——两邻 / 列首 / 列尾 / 空列 / 原位', async () => {
    const { c1, c2, c3, t1, t2 } = await seedColumns();
    const geo = geometry(c1.id, c2.id, c3.id, t1, t2);

    // b2 上半（y=155 < 中心 165）→ before b2 → 邻居 (b1, b2)
    expect(resolveCardDrop(geo, t1[0], 150, 155)).toMatchObject({ kind: 'between', prevId: t2[0], nextId: t2[1] });
    // b2 下半 → after b2 → 邻居 (b2, b3)
    expect(resolveCardDrop(geo, t1[0], 150, 175)).toMatchObject({ kind: 'between', prevId: t2[1], nextId: t2[2] });
    // 列首空区（拖 a3 到列首）
    expect(resolveCardDrop(geo, t1[2], 50, 0)).toMatchObject({
      kind: 'between',
      columnId: c1.id,
      prevId: null,
      nextId: t1[0]
    });
    // 列尾空区
    expect(resolveCardDrop(geo, t1[0], 50, 390)).toMatchObject({
      kind: 'between',
      columnId: c1.id,
      prevId: t1[2],
      nextId: null
    });
    // 空列整区
    expect(resolveCardDrop(geo, t1[0], 250, 50)).toEqual({ kind: 'end', columnId: c3.id });
    // 指针不在任何列容器
    expect(resolveCardDrop(geo, t1[0], 999, 50)).toBeNull();
    // 拖到自己卡片上 = 原位
    expect(resolveCardDrop(geo, t1[1], 50, 160)).toBeNull();
  });

  it('AC#4：按截止日排序——升序、空值在后、同日按标题再按 id；只写 sortOrder', async () => {
    const { c1 } = await seedColumns();
    // 清掉默认任务，建 5 条带截止日（含空值与同日）的任务
    const deletes = new BoardDeleteService(rxdb, () => ctx);
    for (const task of await tasksOf(c1.id)) {
      await deletes.executeDelete(await deletes.planTaskDelete(task.id));
    }
    const mk = async (title: string, dueDate: string | null) => {
      const task = await domain.createTask({ columnId: c1.id, title });
      await taskRepo().update(task, { dueDate });
      return task;
    };
    const e = await mk('乙', '2026-11-12');
    const a = await mk('甲', '2026-11-05');
    const n = await mk('无日期', null);
    const c = await mk('丙', '2026-11-08');
    const d = await mk('甲同', '2026-11-12');

    const result = await sorts.sortColumn(c1.id, 'dueDate');
    expect(result.written).toBe(true);
    const ordered = await tasksOf(c1.id);
    // 空值最后；11-12 同日按标题（甲同 < 乙）再按 id
    expect(ordered.map(t => t.id)).toEqual([a.id, c.id, d.id, e.id, n.id]);
    const titleById = new Map(ordered.map(t => [t.id, t.title]));
    expect([a.id, c.id, d.id, e.id, n.id].map(id => titleById.get(id))).toEqual(['甲', '丙', '甲同', '乙', '无日期']);
    expect(ordered.every(t => t.columnId === c1.id)).toBe(true);
    expect(events).toContainEqual({ kind: 'sort-committed', columnId: c1.id, taskId: undefined });
  });

  it('AC#9：已排好再排零写，且不新增撤销项', async () => {
    const { c1 } = await seedColumns();
    const deletes = new BoardDeleteService(rxdb, () => ctx);
    for (const task of await tasksOf(c1.id)) {
      await deletes.executeDelete(await deletes.planTaskDelete(task.id));
    }
    // 乱序标题：排序可写；再排一次零写
    const ids: UUID[] = [];
    for (const title of ['c', 'a', 'b']) ids.push((await domain.createTask({ columnId: c1.id, title })).id);

    const result = await sorts.sortColumn(c1.id, 'title');
    expect(result.written).toBe(true);
    const afterFirst = await tasksOf(c1.id);
    expect(afterFirst.map(t => t.id)).toEqual([ids[1], ids[2], ids[0]]);

    const second = await sorts.sortColumn(c1.id, 'title');
    expect(second.written).toBe(false);
    expect((await tasksOf(c1.id)).map(t => t.id)).toEqual(afterFirst.map(t => t.id));
    // 已排好不新增撤销项：undo 一次只回退第一次排序
    await rxdb.versionManager.history().undo();
    expect((await tasksOf(c1.id)).map(t => t.id)).toEqual(ids);
  });

  it('AC#10：按标题排序——中英文、数字与重名按 zh-Hans-CN 数值序，重复执行结果一致', async () => {
    const { c1 } = await seedColumns();
    const deletes = new BoardDeleteService(rxdb, () => ctx);
    for (const task of await tasksOf(c1.id)) {
      await deletes.executeDelete(await deletes.planTaskDelete(task.id));
    }
    const titles = ['任务 10', '任务 2', 'Beta', 'alpha', '任务 2'];
    for (const title of titles) await domain.createTask({ columnId: c1.id, title });
    // 同标题「任务 2」两条，按 id 决胜
    const duplicates = await tasksOf(c1.id);
    const idsByTitle = new Map<string, UUID[]>();
    for (const task of duplicates) {
      idsByTitle.set(task.title, [...(idsByTitle.get(task.title) ?? []), task.id]);
    }

    await sorts.sortColumn(c1.id, 'title');
    const first = (await tasksOf(c1.id)).map(t => t.id);
    const byTitle = (await tasksOf(c1.id)).map(t => t.title);
    const collator = new Intl.Collator('zh-Hans-CN', { numeric: true });
    const expected = [...byTitle].sort((x, y) => collator.compare(x, y));
    expect(byTitle).toEqual(expected);
    const duo = idsByTitle.get('任务 2')!;
    expect(first.indexOf(duo[0])).toBeLessThan(first.indexOf(duo[1]));

    // 重复执行结果一致
    const beforeSecond = (await tasksOf(c1.id)).map(t => t.sortOrder);
    const second = await sorts.sortColumn(c1.id, 'title');
    expect(second.written).toBe(false);
    expect((await tasksOf(c1.id)).map(t => t.sortOrder)).toEqual(beforeSecond);
  });

  it('AC#11：一次 undo / redo 还原 / 重放整列', async () => {
    const { c1 } = await seedColumns();
    const deletes = new BoardDeleteService(rxdb, () => ctx);
    for (const task of await tasksOf(c1.id)) {
      await deletes.executeDelete(await deletes.planTaskDelete(task.id));
    }
    const ids: UUID[] = [];
    for (const title of ['c', 'a', 'b']) ids.push((await domain.createTask({ columnId: c1.id, title })).id);
    const beforeKeys = (await tasksOf(c1.id)).map(t => t.sortOrder);

    await sorts.sortColumn(c1.id, 'title');
    const sortedKeys = (await tasksOf(c1.id)).map(t => t.sortOrder);
    expect(sortedKeys).not.toEqual(beforeKeys);
    expect((await tasksOf(c1.id)).map(t => t.id)).toEqual([ids[1], ids[2], ids[0]]);

    const history = rxdb.versionManager.history();
    await history.undo();
    expect((await tasksOf(c1.id)).map(t => t.id)).toEqual(ids);
    await history.redo();
    expect((await tasksOf(c1.id)).map(t => t.sortOrder)).toEqual(sortedKeys);
  });

  it('AC#11b：remote-only 主端在写入前明确拒绝', async () => {
    const remoteRxdb = new RxDB({
      dbName: `board-remote-${Math.random().toString(36).slice(2)}`,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { remote: { adapter: 'pglite' }, type: SyncType.None }
    });
    remoteRxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await remoteRxdb.connect('pglite');
    ctx.boardId = null;
    const remoteSorts = new BoardColumnSortService(remoteRxdb, () => ctx, notifier);
    await expect(remoteSorts.sortColumn('00000000-0000-4000-8000-0000000000aa', 'title')).rejects.toMatchObject({
      code: 'cross_board'
    });
    await remoteRxdb.disconnectAll();
  });
});
