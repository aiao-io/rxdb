import { RxDB, SyncType, type UUID } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { BoardDomain } from '../board-domain.js';
import { BoardDeleteService } from '../delete-service.js';
import { Board, BoardLabel, Column, Task, TaskLabel } from '../entities/index.js';

let db: RxDB;
afterEach(async () => {
  if (db) await db.disconnectAll();
});
describe('看板完整集合回归', () => {
  it('板内第101个任务仍可查询且整列可删除', async () => {
    db = new RxDB({
      dbName: 'pr139-review-101',
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None },
      multiInstance: false
    });
    db.adapter('pglite', rxdb => new RxDBAdapterPGlite(rxdb, { store: 'memory' }));
    await db.connect('pglite');
    const ctx: { boardId: UUID | null; restoring: boolean } = { boardId: null, restoring: false };
    const domain = new BoardDomain(db, () => ctx);
    ctx.boardId = (await domain.createBoard({ title: 'review' })).id;
    const column = await domain.createColumn({ title: 'column' });
    for (let i = 0; i < 101; i++) await domain.createTask({ columnId: column.id, title: `task-${i}` });
    const count = await firstValueFrom(
      db.entityManager.getRepository(Task).count({ where: { combinator: 'and', rules: [] } })
    );
    const visible = await domain.listTasksOfBoard(ctx.boardId);
    const deletes = new BoardDeleteService(db, () => ctx);
    const plan = await deletes.planColumnDelete(column.id);
    let deleteError: unknown;
    try {
      await deletes.executeDelete(plan);
    } catch (error) {
      deleteError = error;
    }
    expect(count).toBe(101);
    expect.soft(visible).toHaveLength(101);
    expect.soft(plan.taskIds).toHaveLength(101);
    expect(deleteError).toBeUndefined();
  });
});
