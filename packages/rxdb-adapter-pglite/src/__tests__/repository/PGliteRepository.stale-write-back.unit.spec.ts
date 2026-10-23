/**
 * @fileoverview UPDATE 回填行陈旧时不回退已合入的外部写（PGlite 侧接线）。
 *
 * 判定在 `EntityStatus.prepareUpdate().apply`；这里验证适配器把解码后的 RETURNING 行交给它：
 * UPDATE 已提交、回填尚未合入时，另一个来源的更晚写入先合进了缓存，回填不得把它连同 updatedAt 盖回旧值。
 * 用替身适配器而不是真引擎：真引擎写入后的 NOTIFY 回刷会重读库，时序决定它是否把回退「修好」，用例就不确定了。
 */
import { Entity, EntityBase, type EntityUpdateData, getEntityStatus, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { PGliteRepository } from '../../repository/PGliteRepository.js';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';

const TODO_ID = '00000000-0000-4000-8000-000000000001';
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
const SAVED_AT = new Date('2026-01-02T00:00:00.000Z');
const EXTERNAL_AT = new Date('2026-01-03T00:00:00.000Z');

@Entity({
  name: 'PGliteStaleWriteBackTodo',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
class StaleWriteBackTodo extends EntityBase {
  title!: string;
  completed!: boolean;
}

describe('PGliteRepository.update 回填行陈旧', () => {
  it('写入提交后先合入的更晚外部写不被 RETURNING 旧行回退，本次写入的字段照常推进基线', async () => {
    const rxdb = new RxDB({
      dbName: `pglite-stale-write-back-${Date.now()}`,
      entities: [StaleWriteBackTodo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' })).init();
    const entity = rxdb.entityManager.createEntityRef(
      StaleWriteBackTodo,
      {
        id: TODO_ID,
        title: 'before',
        completed: false,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT
      } as EntityUpdateData<typeof StaleWriteBackTodo>,
      { local: true, modified: false }
    );
    const adapter = {
      rxdb,
      encryptionContext: undefined,
      writeQuery: async () => {
        // RETURNING 捕获的是提交那一刻的整行；回填之前，另一个来源改了 completed 并先合进缓存
        getEntityStatus(entity).applyExternal({ completed: true, updatedAt: EXTERNAL_AT });
        return {
          rows: [{ id: TODO_ID, title: 'next', completed: false, createdAt: CREATED_AT, updatedAt: SAVED_AT }],
          fields: [],
          affectedRows: 1
        };
      }
    };
    const repository = new PGliteRepository(adapter as never, StaleWriteBackTodo);
    entity.title = 'next';

    await repository.update(entity, getEntityStatus(entity).patch);

    const status = getEntityStatus(entity);
    expect(entity.completed).toBe(true);
    expect(status.origin.completed).toBe(true);
    expect(entity.updatedAt.getTime()).toBe(EXTERNAL_AT.getTime());
    expect(entity.title).toBe('next');
    expect(status.origin.title).toBe('next');
    expect(status.patch).toEqual({});
    expect(status.modified).toBe(false);
  });
});
