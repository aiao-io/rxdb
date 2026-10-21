import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BoardDomain } from '../board-domain.js';
import { BoardDeleteService } from '../delete-service.js';
import { Board, BoardLabel, Column, Task, TaskLabel } from '../entities/index.js';
import { matchAll, readFirst, whereEq } from '../query.js';

/**
 * 删除确认 / 级联 / 撤销（US-526 AC#6 / #7 / #9 / #11）：真实 PGlite + 历史插件。
 * 带标签的级联扩展随 US-528 验收（schema 自首版就含标签表，本套用例已含关联行）。
 */
describe('BoardDeleteService 删除级联与撤销（US-526）', () => {
  let rxdb: RxDB;
  let domain: BoardDomain;
  let deletes: BoardDeleteService;
  let ctx: { boardId: string | null; restoring: boolean };

  const boardRepo = () => rxdb.entityManager.getRepository(Board);
  const columnRepo = () => rxdb.entityManager.getRepository(Column);
  const taskRepo = () => rxdb.entityManager.getRepository(Task);
  const labelRepo = () => rxdb.entityManager.getRepository(BoardLabel);
  const taskLabelRepo = () => rxdb.entityManager.getRepository(TaskLabel);

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: `board-delete-${Math.random().toString(36).slice(2)}`,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.use(rxDBPluginHistory);
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');
    ctx = { boardId: null, restoring: false };
    domain = new BoardDomain(rxdb, () => ctx);
    deletes = new BoardDeleteService(rxdb, () => ctx);
  });

  afterEach(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  /** 建板 + 两列 + 各 2 任务 + 1 标签挂在首任务上；返回各 id。 */
  const seedBoard = async () => {
    const board = await domain.createBoard({ title: '发布计划' });
    ctx.boardId = board.id;
    const c1 = await domain.createColumn({ title: 'To do' });
    const c2 = await domain.createColumn({ title: 'Done' });
    const t1 = await domain.createTask({ columnId: c1.id, title: '任务 1' });
    const t2 = await domain.createTask({ columnId: c1.id, title: '任务 2' });
    const t3 = await domain.createTask({ columnId: c2.id, title: '任务 3' });
    const t4 = await domain.createTask({ columnId: c2.id, title: '任务 4' });
    const label = await labelRepo().create(
      rxdb.entityManager.instantiate(BoardLabel, { boardId: board.id, name: '核心', color: '#e11d48' })
    );
    const link = await taskLabelRepo().create(
      rxdb.entityManager.instantiate(TaskLabel, { taskId: t1.id, labelId: label.id })
    );
    return { board, c1, c2, t1, t2, t3, t4, label, link };
  };

  it('AC#6：删列只删该列与其任务（含关联），他列不动；删板全清不留孤儿', async () => {
    const { board, c1, c2, t3, t4, label } = await seedBoard();

    const columnPlan = await deletes.planColumnDelete(c1.id);
    expect(columnPlan.taskIds).toHaveLength(2);
    await deletes.executeDelete(columnPlan);

    expect(await readFirst(columnRepo().find({ where: whereEq('id', c1.id) }))).toHaveLength(0);
    expect(await readFirst(taskRepo().find({ where: whereEq('columnId', c1.id) }))).toHaveLength(0);
    expect(await readFirst(taskLabelRepo().find({ where: matchAll() }))).toHaveLength(0);
    // 他列与板级标签保留
    expect((await readFirst(taskRepo().find({ where: whereEq('columnId', c2.id) }))).map(t => t.id)).toEqual([
      t3.id,
      t4.id
    ]);
    expect(await readFirst(labelRepo().find({ where: whereEq('id', label.id) }))).toHaveLength(1);

    const boardPlan = await deletes.planBoardDelete(board.id);
    expect(boardPlan.columnIds).toEqual([c2.id]);
    expect(boardPlan.boardLabelIds).toEqual([label.id]);
    await deletes.executeDelete(boardPlan);

    expect(await readFirst(boardRepo().find({ where: matchAll() }))).toHaveLength(0);
    expect(await readFirst(columnRepo().find({ where: matchAll() }))).toHaveLength(0);
    expect(await readFirst(taskRepo().find({ where: matchAll() }))).toHaveLength(0);
    expect(await readFirst(labelRepo().find({ where: matchAll() }))).toHaveLength(0);
    expect(await readFirst(taskLabelRepo().find({ where: matchAll() }))).toHaveLength(0);
  });

  it('AC#9：确认期间集合变化则零写退出并要求重新确认；取消路径无写', async () => {
    const { c1 } = await seedBoard();

    const stalePlan = await deletes.planColumnDelete(c1.id);
    // 确认前另一入口新增任务 → 集合变化
    await domain.createTask({ columnId: c1.id, title: '新任务' });
    await expect(deletes.executeDelete(stalePlan)).rejects.toMatchObject({ code: 'confirm_stale' });
    // 零写：列与其任务原样
    expect(await readFirst(columnRepo().find({ where: whereEq('id', c1.id) }))).toHaveLength(1);
    expect(await readFirst(taskRepo().find({ where: whereEq('columnId', c1.id) }))).toHaveLength(3);

    // 重新计划（新集合）后执行成功
    const freshPlan = await deletes.planColumnDelete(c1.id);
    await deletes.executeDelete(freshPlan);
    expect(await readFirst(columnRepo().find({ where: whereEq('id', c1.id) }))).toHaveLength(0);
  });

  it('AC#11：删除列的事务撤销后按原 ID 全部插回，列序与任务顺序复原', async () => {
    const { c1, c2, t1, t2 } = await seedBoard();
    const plan = await deletes.planColumnDelete(c1.id);
    await deletes.executeDelete(plan);
    expect(await readFirst(taskRepo().find({ where: whereEq('columnId', c1.id) }))).toHaveLength(0);

    const history = rxdb.versionManager.history();
    await history.undo();

    const restored = await readFirst(columnRepo().find({ where: whereEq('id', c1.id) }));
    expect(restored).toHaveLength(1);
    expect(restored[0].boardId).toBe(c2.boardId);
    const tasks = await readFirst(taskRepo().find({ where: whereEq('columnId', c1.id) }));
    expect(tasks.map(task => task.id)).toEqual([t1.id, t2.id]);
    // 关联一并插回
    expect(await readFirst(taskLabelRepo().find({ where: matchAll() }))).toHaveLength(1);
  });

  it('AC#7：级联写入的整批回滚（子先父后顺序 + 事务回滚不留半状态）', async () => {
    const { board, c1, t1, t2 } = await seedBoard();
    const plan = await deletes.planBoardDelete(board.id);

    // 同一事务内按服务同款顺序执行删除（先清关联、再任务、再列），中途抛错 → 整批回滚
    const local = await firstValueFrom(rxdb.localAdapter$);
    await expect(
      local.transaction(async executor => {
        const links = await executor.getRepository(TaskLabel).find({ where: matchAll() });
        for (const link of links) await executor.getRepository(TaskLabel).remove(link);
        for (const taskId of [t1.id, t2.id]) {
          const task = (await executor.getRepository(Task).find({ where: whereEq('id', taskId) }))[0];
          await executor.getRepository(Task).remove(task);
        }
        const column = (await executor.getRepository(Column).find({ where: whereEq('id', c1.id) }))[0];
        await executor.getRepository(Column).remove(column);
        throw new Error('模拟中断');
      })
    ).rejects.toThrow('模拟中断');

    // 半状态不存在：任务与列全部原样
    expect(await readFirst(taskRepo().find({ where: matchAll() }))).toHaveLength(4);
    expect(await readFirst(columnRepo().find({ where: matchAll() }))).toHaveLength(2);
    expect(plan.taskLabelIds).toHaveLength(1);
  });

  it('任务删除清关联且可撤销', async () => {
    const { t1, t2 } = await seedBoard();
    const plan = await deletes.planTaskDelete(t1.id);
    expect(plan.taskTitle).toBe('任务 1');
    await deletes.executeDelete(plan);
    expect(await readFirst(taskRepo().find({ where: whereEq('id', t1.id) }))).toHaveLength(0);
    expect(await readFirst(taskLabelRepo().find({ where: matchAll() }))).toHaveLength(0);
    expect(await readFirst(taskRepo().find({ where: whereEq('id', t2.id) }))).toHaveLength(1);

    await rxdb.versionManager.history().undo();
    expect(await readFirst(taskRepo().find({ where: whereEq('id', t1.id) }))).toHaveLength(1);
    expect(await readFirst(taskLabelRepo().find({ where: matchAll() }))).toHaveLength(1);
  });
});
