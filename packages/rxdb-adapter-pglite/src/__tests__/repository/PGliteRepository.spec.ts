import { getEntityStatus, RxDB, RxDBChange, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../index.js';
import { RxdbAdapterPGliteError } from '../../pglite.utils.js';
import type { PGliteRepository } from '../../repository/PGliteRepository.js';

describe.sequential('PGliteRepository', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `module-test-repo-${Date.now()}`,
      context: { userId: 'userId' },
      entities: [Todo],
      sync: {
        local: {
          adapter: 'pglite'
        },
        type: SyncType.None
      }
    });

    rxdb.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('RxDBChange should be created', async () => {
    const todo = new Todo();
    // 创建。
    todo.title = 'Fanny';
    await todo.save();
    // 更新。
    todo.title = 'Fanny2';
    await todo.save();
    // 删除。
    await todo.remove();
    const result = await firstValueFrom(
      rxdb.entityManager.getRepository(RxDBChange).findAll({
        where: {
          combinator: 'and',
          rules: []
        }
      })
    );
    expect(result.length).equal(3);
  });

  it('get throws when the entity id is missing', async () => {
    const repo = adapter.getRepository<typeof Todo, PGliteRepository<typeof Todo>>(Todo);
    const missingId = '00000000-0000-0000-0000-000000000001';
    await expect(repo.get(missingId)).rejects.toBeInstanceOf(RxdbAdapterPGliteError);
    await expect(repo.get(missingId)).rejects.toThrow(/not found/);
  });

  it('findOne returns undefined for empty results', async () => {
    const repo = adapter.getRepository<typeof Todo, PGliteRepository<typeof Todo>>(Todo);
    await expect(
      repo.findOne({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: '00000000-0000-0000-0000-000000000002' }]
        }
      })
    ).resolves.toBeUndefined();
  });

  it('remove rejects entities that are not saved locally', async () => {
    const repo = adapter.getRepository<typeof Todo, PGliteRepository<typeof Todo>>(Todo);
    const todo = new Todo();
    todo.title = 'unsaved';
    getEntityStatus(todo).local = false;

    await expect(repo.remove(todo)).rejects.toBeInstanceOf(RxdbAdapterPGliteError);
    await expect(repo.remove(todo)).rejects.toThrow(/not saved local/);
  });

  it('count and findAll cover repository query helpers', async () => {
    const repo = adapter.getRepository<typeof Todo, PGliteRepository<typeof Todo>>(Todo);
    const todo = new Todo();
    todo.title = 'count-me';
    await repo.create(todo);

    const count = await repo.count({
      where: {
        combinator: 'and',
        rules: [{ field: 'title', operator: '=', value: 'count-me' }]
      }
    });
    expect(count).toBeGreaterThanOrEqual(1);

    const all = await repo.findAll({
      where: {
        combinator: 'and',
        rules: [{ field: 'title', operator: '=', value: 'count-me' }]
      }
    });
    expect(all.some(item => item.id === todo.id)).toBe(true);

    const found = await repo.get(todo.id);
    expect(found.id).toBe(todo.id);

    await repo.update(found, { title: 'count-me-updated' });
    const updated = await repo.get(todo.id);
    expect(updated.title).toBe('count-me-updated');
  });
});
