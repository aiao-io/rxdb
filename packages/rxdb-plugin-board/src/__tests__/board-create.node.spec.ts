import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BoardDomain } from '../board-domain.js';
import { Board, BoardLabel, Column, Task, TaskLabel } from '../entities/index.js';
import { BoardDomainError } from '../errors.js';
import { inRule, matchAll, readFirst, whereEq } from '../query.js';

/**
 * 创建与归属（US-534 AC#1～5）：真实 PGlite 上验收实体、排序域追加与领域入口约束。
 * 重开、删除级联、撤销与恢复中门禁的完整验收在后续 spec 与本包浏览器趟补齐。
 */
describe('BoardDomain 创建与归属（US-534 AC#1～5）', () => {
  let rxdb: RxDB;
  let domain: BoardDomain;
  let ctx: { boardId: string | null; restoring: boolean };

  const boardRepo = () => rxdb.entityManager.getRepository(Board);
  const columnRepo = () => rxdb.entityManager.getRepository(Column);
  const taskRepo = () => rxdb.entityManager.getRepository(Task);

  const allTasks = () => readFirst(taskRepo().find({ where: matchAll() }));

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: `board-test-${Math.random().toString(36).slice(2)}`,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');
    ctx = { boardId: null, restoring: false };
    domain = new BoardDomain(rxdb, () => ctx);
  });

  afterEach(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  /** 建一块板并切换到它，返回板。 */
  const createActiveBoard = async (title = '发布计划') => {
    const board = await domain.createBoard({ title });
    ctx.boardId = board.id;
    return board;
  };

  it('AC#1：板下建列、列下建任务，任务经列推导所属板', async () => {
    const board = await createActiveBoard('rxdb 1.0 发布计划');
    const columnIds: string[] = [];
    for (const title of ['To do', 'Doing', 'Done']) {
      columnIds.push((await domain.createColumn({ title })).id);
    }
    const taskIds: string[] = [];
    for (const columnId of columnIds) {
      taskIds.push((await domain.createTask({ columnId, title: `任务-${columnId}-1` })).id);
      taskIds.push((await domain.createTask({ columnId, title: `任务-${columnId}-2` })).id);
    }

    const tasks = await readFirst(taskRepo().find({ where: { combinator: 'and', rules: [inRule('id', taskIds)] } }));
    expect(tasks).toHaveLength(6);
    for (const task of tasks) {
      const column = await readFirst(columnRepo().find({ where: whereEq('id', task.columnId) }));
      expect(column[0].boardId).toBe(board.id);
    }
    const boardRow = await readFirst(boardRepo().find({ where: whereEq('id', board.id) }));
    expect(boardRow[0].title).toBe('rxdb 1.0 发布计划');
  });

  it('AC#2：列内创建追加到列尾，默认排序按「分组字段 + sortOrder」，列间互不影响', async () => {
    const board = await createActiveBoard();
    const c1 = await domain.createColumn({ title: 'C1' });
    const c2 = await domain.createColumn({ title: 'C2' });

    const c1a = await domain.createTask({ columnId: c1.id, title: 'a1' });
    const c2a = await domain.createTask({ columnId: c2.id, title: 'b1' });
    const c1b = await domain.createTask({ columnId: c1.id, title: 'a2' });

    const c1Tasks = await readFirst(taskRepo().find({ where: whereEq('columnId', c1.id) }));
    expect(c1Tasks.map(task => task.id)).toEqual([c1a.id, c1b.id]);
    const c2Tasks = await readFirst(taskRepo().find({ where: whereEq('columnId', c2.id) }));
    expect(c2Tasks.map(task => task.id)).toEqual([c2a.id]);
    // c1 追加第二张卡不影响 c2 的既有顺序
    expect(c2Tasks[0].sortOrder).toBe(c2a.sortOrder);
  });

  it('AC#3：列序是板内排序域，追加顺序即默认顺序', async () => {
    const board = await createActiveBoard();
    const c1 = await domain.createColumn({ title: 'C1' });
    const c2 = await domain.createColumn({ title: 'C2' });
    const c3 = await domain.createColumn({ title: 'C3' });

    const columns = await readFirst(columnRepo().find({ where: whereEq('boardId', board.id) }));
    expect(columns.map(column => column.id)).toEqual([c1.id, c2.id, c3.id]);
    expect(new Set(columns.map(column => column.sortOrder)).size).toBe(3);
  });

  it('AC#4：空 / 全空白标题拒绝且零写入，合法标题去首尾空白后保存', async () => {
    const board = await createActiveBoard();
    const before = (await allTasks()).length;
    const firstColumn = await domain.createColumn({ title: '首列' });

    await expect(domain.createColumn({ title: '   ' })).rejects.toMatchObject({ code: 'empty_title' });
    await expect(domain.createColumn({ title: '' })).rejects.toMatchObject({ code: 'empty_title' });
    await expect(domain.createTask({ columnId: firstColumn.id, title: '  \t ' })).rejects.toMatchObject({
      code: 'empty_title'
    });

    const column = await domain.createColumn({ title: '  收尾  ' });
    expect(column.title).toBe('收尾');
    expect(await allTasks()).toHaveLength(before);
  });

  it('AC#5：跨板任务归属与列归属入口全部拒绝且零写', async () => {
    const boardA = await createActiveBoard('板 A');
    const columnA = await domain.createColumn({ title: 'A 列' });

    const boardB = await domain.createBoard({ title: '板 B' });
    ctx.boardId = boardB.id;
    const columnB = await domain.createColumn({ title: 'B 列' });

    const before = (await allTasks()).length;

    // 在板 B 语境下向板 A 的列建任务 → 拒绝
    await expect(domain.createTask({ columnId: columnA.id, title: 'x' })).rejects.toMatchObject({
      code: 'cross_board'
    });
    // 在板 B 语境下改板 A 的列标题 → 拒绝
    await expect(domain.updateColumn(columnA.id, { title: 'y' })).rejects.toMatchObject({ code: 'cross_board' });
    // 板 B 语境下自己的列照常可写
    const updated = await domain.updateColumn(columnB.id, { title: 'B 列改' });
    expect(updated.title).toBe('B 列改');

    expect(await allTasks()).toHaveLength(before);
    const columnARow = await readFirst(columnRepo().find({ where: whereEq('id', columnA.id) }));
    expect(columnARow[0].title).toBe('A 列');
    expect(columnARow[0].boardId).toBe(boardA.id);
  });

  it('恢复中写门禁：创建被拒且库零变化（US-534 AC#10 服务层半边）', async () => {
    await createActiveBoard();
    const column = await domain.createColumn({ title: 'C1' });
    const before = (await allTasks()).length;

    ctx.restoring = true;
    await expect(domain.createTask({ columnId: column.id, title: 'x' })).rejects.toMatchObject({
      code: 'restore_in_progress'
    });
    await expect(domain.createColumn({ title: 'C2' })).rejects.toMatchObject({ code: 'restore_in_progress' });
    await expect(domain.createBoard({ title: 'B2' })).rejects.toMatchObject({ code: 'restore_in_progress' });
    await expect(domain.updateColumn(column.id, { title: '改' })).rejects.toMatchObject({
      code: 'restore_in_progress'
    });

    ctx.restoring = false;
    const created = await domain.createTask({ columnId: column.id, title: '恢复后可写' });
    expect(created.title).toBe('恢复后可写');
    expect(await allTasks()).toHaveLength(before + 1);
  });

  it('错误码是 BoardDomainError 且可判别', async () => {
    await createActiveBoard();
    const error = await domain.createColumn({ title: '' }).catch(e => e);
    expect(error).toBeInstanceOf(BoardDomainError);
    expect(error.code).toBe('empty_title');
  });
});
