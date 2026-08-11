import { RxDB, SyncType, getEntityStatus, uuid } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { generateDbName } from './test-utils.js';

describe('entity id 变更行为', () => {
  let rxdb: RxDB;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'userId' },
      entities: [Todo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');
  });

  it('new 出来的 entity 可以改 id', () => {
    const todo = new Todo();
    const originalId = todo.id;
    const customId = uuid();
    expect(Reflect.set(todo, 'id', customId)).toBe(true);
    expect(todo.id).toBe(customId);
    expect(todo.id).not.toBe(originalId);
  });

  it('改了 id 再 save，数据库里存的是改后的 id', async () => {
    const todo = new Todo();
    todo.title = 'test-custom-id';
    const customId = uuid();
    expect(Reflect.set(todo, 'id', customId)).toBe(true);

    const statusBefore = getEntityStatus(todo);
    expect(statusBefore.local).toBe(false);

    await todo.save();

    const statusAfter = getEntityStatus(todo);
    expect(statusAfter.local).toBe(true);
    expect(todo.id).toBe(customId);

    const found = await firstValueFrom(Todo.get(customId));
    expect(found.id).toBe(customId);
    expect(found.title).toBe('test-custom-id');
  });

  it('save 后再改 id，不会更新数据库中的原记录', async () => {
    const todo = new Todo();
    todo.title = 'before-id-change';
    await todo.save();

    const savedId = todo.id;
    const newId = uuid();

    expect(Reflect.set(todo, 'id', newId)).toBe(true);
    todo.title = 'after-id-change';

    await todo.save();

    expect(todo.id).toBe(newId);

    const foundByOld = await firstValueFrom(
      Todo.findOne({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: savedId }] } })
    );
    expect(foundByOld?.title).toBe('before-id-change');
    expect(foundByOld?.id).toBe(savedId);

    const foundByNew = await firstValueFrom(
      Todo.findOne({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: newId }] } })
    );
    expect(foundByNew).toBeNull();
  });
});
