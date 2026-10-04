import type { EntityUpdateData, IRxDBAdapter, QueryCacheEntityMetadata, RuleGroup } from '@aiao/rxdb';
import { Entity, ENTITY_STATIC_TYPES, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { defer, of, Subject } from 'rxjs';
import { vi } from 'vitest';
import { RxDBQueryCacheEngineFactory } from '../../query-cache-engine.factory.js';
import { noPendingWriteOutbox } from './pending-writes.js';

@Entity({
  name: 'ReviewCachedArticle',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.QueryCache, local: { adapter: 'local' }, remote: { adapter: 'remote' } }
})
export class ReviewCachedArticle extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: string };
  title!: string;
}

export interface ReviewRow {
  id: string;
  title: string;
  updatedAt: string;
}

export const OLD_ROW: ReviewRow = { id: 'a', title: 'remote-before-write', updatedAt: '2026-10-02T00:00:00.000Z' };
export const NEW_ROW: ReviewRow = { id: 'a', title: 'confirmed-new-write', updatedAt: '2026-10-04T00:00:00.000Z' };
export const ALL: RuleGroup<ReviewCachedArticle> = { combinator: 'and', rules: [] };

let sequence = 0;

/** 使用实际 RxDB / Repository / QueryManager / 插件工厂；两侧存储与远端响应时序是接缝。 */
export const createReviewQueryCache = (initial: ReviewRow = OLD_ROW) => {
  const localRows = new Map([[initial.id, { ...initial }]]);
  const remoteRows = new Map([[OLD_ROW.id, { ...OLD_ROW }]]);
  const rxdb = new RxDB({
    dbName: `ReviewQueryCache${++sequence}`,
    entities: [ReviewCachedArticle],
    sync: { type: SyncType.QueryCache, local: { adapter: 'local' }, remote: { adapter: 'remote' } }
  });
  const toEntity = (data: ReviewRow) =>
    rxdb.entityManager.createEntityRef(
      ReviewCachedArticle,
      data as unknown as EntityUpdateData<typeof ReviewCachedArticle>,
      { local: true }
    );
  const localRepository = {
    find: vi.fn(async () => [...localRows.values()].map(toEntity)),
    count: vi.fn(async () => localRows.size),
    create: vi.fn(async (entity: ReviewCachedArticle) => entity),
    update: vi.fn(async (entity: ReviewCachedArticle) => entity),
    remove: vi.fn(async (entity: ReviewCachedArticle) => entity)
  };
  const local = {
    name: 'local',
    disconnect: vi.fn(async () => undefined),
    getRepository: () => localRepository,
    getMetadataByIds: vi.fn(() => of(new Map([...localRows.values()].map(row => [row.id, row.updatedAt])))),
    upsertMany: vi.fn((_entity: string, rows: ReviewRow[]) =>
      defer(() => {
        rows.forEach(row => localRows.set(row.id, { ...row }));
        return of(undefined);
      })
    ),
    deleteByIds: vi.fn((_entity: string, ids: string[]) =>
      defer(() => {
        ids.forEach(id => localRows.delete(id));
        return of(undefined);
      })
    )
  };
  const remote = {
    name: 'remote',
    disconnect: vi.fn(async () => undefined),
    getRepository: () => {
      throw new Error('远端只提供 QueryCache REST 能力');
    },
    fetchMetadata: vi.fn(() =>
      of<QueryCacheEntityMetadata[]>([...remoteRows.values()].map(({ id, updatedAt }) => ({ id, updatedAt })))
    ),
    findByIds: vi.fn((_entity: string, ids: string[]) =>
      of(ids.flatMap(id => (remoteRows.has(id) ? [{ ...remoteRows.get(id)! }] : [])))
    ),
    create: vi.fn((_entity: string, data: ReviewRow) => of(data)),
    update: vi.fn((_entity: string, id: string, patch: Partial<ReviewRow>) =>
      defer(() => {
        const row = { ...NEW_ROW, ...patch, id };
        remoteRows.set(id, row);
        return of({ ...row });
      })
    ),
    delete: vi.fn((_entity: string, ids: string | string[]) =>
      defer(() => {
        (Array.isArray(ids) ? ids : [ids]).forEach(id => remoteRows.delete(id));
        return of(undefined);
      })
    )
  };
  rxdb.adapter('local', () => local as unknown as IRxDBAdapter);
  rxdb.adapter('remote', () => remote as unknown as IRxDBAdapter);
  rxdb.queryCacheEngine(new RxDBQueryCacheEngineFactory());
  rxdb.queryCacheOutbox(noPendingWriteOutbox);
  rxdb.init();
  const repository = rxdb.entityManager.getRepository(ReviewCachedArticle);
  return { rxdb, repository, local, localRows, remote, remoteRows, toEntity };
};

/** 远端读取已经取到旧快照，只推迟响应交付；不通过睡眠猜测并发顺序。 */
export const holdReviewPull = (ctx: ReturnType<typeof createReviewQueryCache>) => {
  const reply = new Subject<ReviewRow[]>();
  let announce!: () => void;
  const started = new Promise<void>(resolve => {
    announce = resolve;
  });
  const snapshot = [...ctx.remoteRows.values()].map(row => ({ ...row }));
  ctx.remote.findByIds.mockImplementationOnce(() => {
    announce();
    return reply.asObservable();
  });
  const release = () => {
    reply.next(snapshot);
    reply.complete();
  };
  return { started, release };
};
