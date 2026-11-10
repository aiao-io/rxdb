/**
 * RV-01a1bb299b62：public 与 tenant 下同名的 QueryCache 实体并存时，真实读链路与离线重放的本地回填
 * 都必须落在 public 表上，不能报实体名歧义。
 *
 * @remarks
 * 三个批量方法在 `query-cache-metadata.spec.ts` 里逐条钉住；本文件把同一场景放回生产链路：
 * 核心 `Repository` → `@aiao/rxdb-plugin-querycache` 的主仓储 → `queryCacheEntityIdentifier`
 * （public 写裸名）→ 本适配器；离线写由 `@aiao/rxdb-plugin-sync` 的出站队列重放，LWW 判远端赢之后的
 * 本地回填同样经本适配器的 `upsertMany`。
 *
 * 远端是内存桩，行按 id 存放并记下每次收到的实体标识：要验的是本地缓存怎么解析这个标识，
 * 远端怎么存不是这里的命题。
 */
import { Entity, EntityBase, NetworkOfflineError, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
import { countQueryCacheOutbox, flushQueryCacheOutbox, rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { firstValueFrom, of, type Observable } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

const REMOTE_ADAPTER = 'qc-public-namespace-remote';

@Entity({
  name: 'QcCachedTwin',
  tableName: 'qc_cached_twins',
  properties: [{ name: 'label', type: PropertyType.string }],
  sync: { type: SyncType.QueryCache, local: { adapter: 'pglite' }, remote: { adapter: REMOTE_ADAPTER } }
})
class PublicCachedTwin extends EntityBase {
  label!: string;
}

@Entity({
  name: 'QcCachedTwin',
  namespace: 'tenant',
  tableName: 'qc_cached_twins',
  properties: [{ name: 'label', type: PropertyType.string }],
  sync: { type: SyncType.QueryCache, local: { adapter: 'pglite' }, remote: { adapter: REMOTE_ADAPTER } }
})
class TenantCachedTwin extends EntityBase {
  label!: string;
}

/** 远端行：带齐 QueryCache 回填要求的列 */
interface RemoteRow {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

/** 远端桩：行按 id 存在内存里，每次调用都记下收到的实体标识 */
const createRemote = () => {
  const rows = new Map<string, RemoteRow>();
  const identifiers: string[] = [];
  const answer = <T>(identifier: string, value: T): Observable<T> => {
    identifiers.push(identifier);
    return of(value);
  };
  const adapter = {
    fetchMetadata: (identifier: string) =>
      answer(
        identifier,
        [...rows.values()].map(({ id, updatedAt }) => ({ id, updatedAt }))
      ),
    findByIds: (identifier: string, ids: string[]) =>
      answer(
        identifier,
        ids.flatMap(id => rows.get(id) ?? [])
      ),
    // 离线写要求远端具备 update 动词；LWW 判本地赢时才会真的走到这里
    update: (identifier: string, id: string, patch: Partial<RemoteRow>) => {
      const row = { ...(rows.get(id) as RemoteRow), ...patch, updatedAt: new Date().toISOString() };
      rows.set(id, row);
      return answer(identifier, row);
    },
    disconnect: async () => undefined
  };
  return { adapter, rows, identifiers };
};

const isoAt = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();

describe('RV-01a1bb299b62 QueryCache 的 public 裸名经真实链路落在 public 表', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;
  const remote = createRemote();

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'qc-public-namespace' },
      entities: [PublicCachedTwin, TenantCachedTwin],
      sync: { local: { adapter: 'pglite' }, remote: { adapter: REMOTE_ADAPTER }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    rxdb.adapter(REMOTE_ADAPTER, () => remote.adapter as never);
    // sync 插件声明了 `inject: ['plugin:history']`，缺历史插件时它不装，出站队列随之报缺插件
    rxdb.use(rxDBPluginQueryCache);
    rxdb.use(rxDBPluginSync);
    rxdb.use(rxDBPluginHistory);
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) await rxdb.destroy();
  });

  const labelsIn = async (schema: 'public' | 'tenant', ids: string[]): Promise<Map<unknown, unknown>> => {
    const result = await adapter.internalQuery<Record<string, unknown>>(
      `SELECT id, "label" FROM "${schema}"."qc_cached_twins" WHERE id = ANY($1)`,
      [ids]
    );
    return new Map(result.rows.map(row => [row.id, row.label]));
  };

  it('经 QueryCache 仓储读、计数 public 实体：远端与本地缓存都按裸名定位，回填落进 public 表', async () => {
    const id = crypto.randomUUID();
    remote.rows.set(id, { id, label: 'remote', createdAt: isoAt(-1_000), updatedAt: isoAt(-1_000) });
    const repository = rxdb.entityManager.getRepository(PublicCachedTwin);

    const found = await firstValueFrom(repository.find({ where: { combinator: 'and', rules: [] } }));
    const counted = await firstValueFrom(repository.count({ where: { combinator: 'and', rules: [] } }));

    expect(found.map(twin => twin.label)).toEqual(['remote']);
    expect(counted).toBe(1);
    expect(new Set(remote.identifiers)).toEqual(new Set(['QcCachedTwin']));
    expect(await labelsIn('public', [id])).toEqual(new Map([[id, 'remote']]));
    expect(await labelsIn('tenant', [id])).toEqual(new Map());
  });

  it('离线改动被 LWW 判远端赢后，出站队列按裸名把远端行回填进 public 表', async () => {
    const id = crypto.randomUUID();
    const seeded = { id, label: 'seeded', createdAt: isoAt(-60_000), updatedAt: isoAt(-60_000) };
    remote.rows.set(id, seeded);
    // 本地缓存按显式限定名预置：不经裸名，修复前也写得进去，红灯只落在重放那一腿
    await firstValueFrom(adapter.upsertMany('public:QcCachedTwin', [seeded]));
    const [twin] = await adapter.getRepository(PublicCachedTwin).find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] }
    });
    // 本地离线改动之后远端又被改过：LWW 判远端赢，本地缓存要按远端行回填
    remote.rows.set(id, { ...seeded, label: 'remote-winner', updatedAt: isoAt(60_000) });

    rxdb.reachability.report(new NetworkOfflineError(new Error('受控离线')));
    await rxdb.entityManager.getRepository(PublicCachedTwin).update(twin, { label: 'offline' });
    expect(await countQueryCacheOutbox(rxdb)).toBe(1);
    rxdb.reachability.report(null);

    const result = await flushQueryCacheOutbox(rxdb, 'public', 'QcCachedTwin');

    expect(result.failures).toEqual([]);
    expect(result.discarded).toBe(1);
    expect(await labelsIn('public', [id])).toEqual(new Map([[id, 'remote-winner']]));
    expect(await labelsIn('tenant', [id])).toEqual(new Map());
    expect(await countQueryCacheOutbox(rxdb)).toBe(0);
    expect(new Set(remote.identifiers)).toEqual(new Set(['QcCachedTwin']));
  });
});
