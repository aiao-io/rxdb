import { RxDBBranch } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { describe, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../../../rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.js';
import { waSqliteFactory } from './wa-sqlite-factory.js';

describe('branch probe', () => {
  it('dumps state after switchBranch', async () => {
    const adapter = await waSqliteFactory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
    const rxdb = adapter.rxdb;

    const branch = await rxdb.versionManager.createBranch('branch_01');
    console.log('AFTER_CREATE', branch.id, branch.activated);

    await rxdb.versionManager.switchBranch('branch_01');
    console.log('AFTER_SWITCH_ENTITY', branch.activated);

    const raw = await adapter.rawQuery('SELECT id, activated FROM "rxdb$rxdb_branch";');
    console.log('DB_ROWS', JSON.stringify(raw.rows));

    const found = await adapter.getRepository(RxDBBranch).find({ where: { combinator: 'and', rules: [] }, limit: 100 });
    console.log('REPO_ROWS', JSON.stringify(found.map(entity => [entity.id, entity.activated])));
    console.log('SAME_IDENTITY', found.find(entity => entity.id === 'branch_01') === branch);
    console.log('AFTER_FIND_ENTITY', branch.activated);

    await rxdb.disconnectAll();
  });
});
