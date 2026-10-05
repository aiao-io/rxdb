import { encodeRxDBChangeEntityId, getEntityMetadata, RxDB, SyncType, type RuleGroup } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, sqliteGetTableNameByMetadata } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { ENTITIES, User, type UserStaticTypes } from '@aiao/rxdb-test/shop';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const database = new RxDB({
  dbName: `rq-${crypto.randomUUID().slice(0, 16)}`,
  entities: ENTITIES,
  context: { userId: `review-${crypto.randomUUID()}` },
  sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } },
  syncOverrides: [
    {
      entity: User,
      sync: { type: SyncType.QueryCache, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } }
    }
  ]
});
database.use(rxDBPluginHistory);
database.use(rxDBPluginSync);
database.use(rxDBPluginQueryCache);
database.adapter(
  'wa-sqlite',
  db =>
    new RxDBAdapterWaSqlite(db, {
      vfs: 'MemoryAsyncVFS',
      async: true,
      worker: false,
      wasmPath: asyncWasmPath
    })
);
const adapter = new RxDBAdapterSupabase(database, {
  supabaseUrl: import.meta.env['VITE_SUPABASE_URL'],
  supabaseKey: import.meta.env['VITE_SUPABASE_KEY'],
  rlsCheck: false
});
database.adapter('supabase', () => adapter);
database.init();
const users = Array.from({ length: 2 }, (_, index) => {
  const user = database.entityManager.instantiate(User);
  user.name = `review-querycache-${crypto.randomUUID()}-${index}`;
  user.age = 30;
  return user;
});
const idFilter: UserStaticTypes['findOptions']['where'] = {
  combinator: 'and',
  rules: [{ field: 'id', operator: 'in', value: users.map(user => user.id) }]
};

let localAdapter: RxDBAdapterWaSqlite;

beforeAll(async () => {
  localAdapter = (await database.connect('wa-sqlite')) as RxDBAdapterWaSqlite;
  expect(await adapter.saveMany(users)).toHaveLength(users.length);
});

afterAll(async () => {
  const removed = await adapter.client
    .schema('shop')
    .from('user')
    .delete()
    .in(
      'id',
      users.map(user => user.id)
    );
  expect(removed.error).toBeNull();
  const count = await adapter.client
    .schema('shop')
    .from('user')
    .select('id', { count: 'exact', head: true })
    .in(
      'id',
      users.map(user => user.id)
    );
  expect(count.error).toBeNull();
  expect(count.count).toBe(0);
  const changes = await adapter.client
    .from('rxdb_change')
    .delete()
    .eq('namespace', 'shop')
    .eq('entity', 'User')
    .in(
      'entityId',
      users.flatMap(user => [user.id, encodeRxDBChangeEntityId(user.id)])
    );
  expect(changes.error).toBeNull();
  await database.destroy();
});

describe('深审：QueryCache 元数据和普通仓储的关系条件对照', () => {
  it('非 public 实体的 QueryCache 标量查询应写入正确的 namespace 物理表', async () => {
    const directRows = await adapter.getRepository(User).find({ where: idFilter });
    const localRows = await localAdapter.getRepository(User).find({ where: idFilter });
    const physicalTable = sqliteGetTableNameByMetadata(getEntityMetadata(User));
    expect(directRows).toHaveLength(2);
    expect(localRows).toHaveLength(0);
    console.info(
      'REVIEW_CACHE_NAMESPACE',
      JSON.stringify({ entity: 'shop:User', physicalTable, remote: directRows.length, local: localRows.length })
    );
    const rows = await firstValueFrom(
      database.entityManager.getRepository(User).findAll({ where: idFilter as unknown as RuleGroup<User> })
    );
    expect(new Set(rows.map(row => row.id))).toEqual(new Set(users.map(user => user.id)));
  });

  it('用既有物理表原语写入同一份远端行后，真实本地仓储能读回全部主键', async () => {
    const remoteRows = await firstValueFrom(
      adapter.findByIds<User>(
        'shop:User',
        users.map(user => user.id)
      )
    );
    expect(remoteRows).toHaveLength(2);
    const physicalTable = sqliteGetTableNameByMetadata(getEntityMetadata(User));
    await firstValueFrom(localAdapter.upsertMany(physicalTable, remoteRows));
    const localRows = await localAdapter.getRepository(User).find({ where: idFilter });
    expect(new Set(localRows.map(row => row.id))).toEqual(new Set(users.map(user => user.id)));
    console.info('REVIEW_CACHE_PHYSICAL_CONTROL', JSON.stringify({ physicalTable, rows: localRows.length }));
  });

  it('QueryCache 公开 findAll 不应因合法 notExists 条件失去正常仓储能返回的行', async () => {
    const where: UserStaticTypes['findOptions']['where'] = {
      combinator: 'and',
      rules: [...idFilter.rules, { field: 'orders', operator: 'notExists' }]
    };
    const ordinaryRows = await adapter.getRepository(User).find({ where });
    expect(ordinaryRows).toHaveLength(2);
    const cachedRows = await firstValueFrom(
      database.entityManager.getRepository(User).findAll({ where: where as unknown as RuleGroup<User> })
    );
    expect(new Set(cachedRows.map(row => row.id))).toEqual(new Set(ordinaryRows.map(row => row.id)));
  });

  it('标量条件可在两条公开查询路径中得到相同主键', async () => {
    const rows = await adapter.getRepository(User).find({ where: idFilter });
    const metadata = await firstValueFrom(
      adapter.fetchMetadata('shop:User', idFilter as unknown as RuleGroup<unknown>)
    );
    expect(new Set(metadata.map(row => row.id))).toEqual(new Set(rows.map(row => row.id)));
    expect(metadata).toHaveLength(2);
  });

  it.each(['exists', 'notExists'] as const)('fetchMetadata 应支持普通仓储已支持的 %s 关系条件', async operator => {
    const where: UserStaticTypes['findOptions']['where'] = {
      combinator: 'and',
      rules: [...idFilter.rules, { field: 'orders', operator }]
    };
    const rows = await adapter.getRepository(User).find({ where });
    expect(rows).toHaveLength(operator === 'exists' ? 0 : 2);
    console.info('REVIEW_RELATION_QUERY', JSON.stringify({ operator, ordinaryRepositoryRows: rows.length }));
    const metadata = await firstValueFrom(adapter.fetchMetadata('shop:User', where as unknown as RuleGroup<unknown>));
    expect(new Set(metadata.map(row => row.id))).toEqual(new Set(rows.map(row => row.id)));
  });
});
