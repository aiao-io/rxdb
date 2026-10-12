import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import assert from 'node:assert/strict';

@Entity({
  name: 'AiNote',
  namespace: 'ai_example',
  tableName: 'notes',
  log: false,
  properties: [{ name: 'label', type: PropertyType.string, required: true }]
})
export class Note extends EntityBase {
  label!: string;
}

const database = new RxDB({
  dbName: 'aiao-ai-local',
  context: { userId: 'ai-example' },
  entities: [Note],
  sync: { local: { adapter: 'pglite' }, type: SyncType.None }
});

database.use(rxDBPluginHistory);
database.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));

try {
  const adapter = await database.connect('pglite');
  assert.ok(adapter instanceof RxDBAdapterPGlite);
  await adapter.transaction(async executor => {
    const repository = executor.getRepository(Note);
    const draft = database.entityManager.instantiate(Note);
    draft.label = 'created';
    const created = await repository.create(draft);
    const query = { where: { combinator: 'and' as const, rules: [] } };
    const rows = await repository.find(query);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.label, 'created');
    await repository.update(created, { label: 'updated' });
    assert.equal((await repository.find(query))[0]?.label, 'updated');
    await repository.remove(created);
    assert.equal((await repository.find(query)).length, 0);
  });
  console.log('✅ 离线样例：初始化、CRUD 与事务执行器全部通过');
} finally {
  await database.disconnectAll();
}
