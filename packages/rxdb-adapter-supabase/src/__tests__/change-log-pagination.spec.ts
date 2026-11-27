/**
 * @fileoverview 拉变更日志的结果集超过 PostgREST `max-rows` 时不得静默截断（与 SUPA-004 / SUPA-005 同类）
 *
 * @remarks
 * 三条拉日志的路径都按「最多 `limit` 条、按 id 升序」交回结果，同步插件据此判断还有没有下一页：
 * 拿到的条数够了才算可能还有。服务端的 `max-rows`（docker compose 默认 1000）把超出的行直接砍掉、照样 200，
 * 调用方要 3000 条、远端只给 1000 条时，插件就当成已经拉完——新客户端第一次拉取漏掉后面的变更，
 * 待拉数在拉取之后又冒出来。批量拉取默认就会撞上：它一次要「每个仓库的上限 × 仓库数」条。
 *
 * 必须跑在真实 PostgREST 上：截断由服务端做，替身只能复述我们自己的假设。判据是「一行都不能少、也不能多」。
 * 日志经 service_role 直插在本轮专用的分支上，结束时按分支删掉，不碰演示数据与别的用例。
 */
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { CatalogItem } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { createAuthenticatedTestClient, getSupabaseServiceRoleClient } from './test-utils.js';

/** 服务端 `max-rows`，与 docker compose 的默认值一致 */
const SERVER_MAX_ROWS = 1000;
/** 单个仓库的日志条数，必须严格大于 SERVER_MAX_ROWS 才能触发截断 */
const WIDE = SERVER_MAX_ROWS + 100;
/** 批量拉取里第二个仓库的日志条数 */
const NARROW = 150;
/** 单次插入的行数，避免请求体过大 */
const INSERT_CHUNK = 400;
const LONG_RUNNING_MS = 120_000;

@Entity({ name: 'ChangeLogPageA', properties: [{ name: 'value', type: PropertyType.string }] })
class ChangeLogPageA extends EntityBase {}

@Entity({ name: 'ChangeLogPageB', properties: [{ name: 'value', type: PropertyType.string }] })
class ChangeLogPageB extends EntityBase {}

describe('拉变更日志超过 PostgREST max-rows', () => {
  const branchId = `change-log-pages-${crypto.randomUUID().slice(0, 8)}`;
  const service = getSupabaseServiceRoleClient();
  let adapter: RxDBAdapterSupabase;
  let rxdb: RxDB;

  async function insertChanges(entity: string, count: number, bucket: string | null): Promise<void> {
    for (let offset = 0; offset < count; offset += INSERT_CHUNK) {
      const rows = Array.from({ length: Math.min(INSERT_CHUNK, count - offset) }, () => ({
        namespace: 'public',
        entity,
        bucket,
        entityId: crypto.randomUUID(),
        branchId,
        type: 'INSERT',
        patch: { value: 'x' }
      }));
      const { error } = await service.from('rxdb_change').insert(rows);
      if (error) throw new Error(`插入日志失败: ${error.message}`);
    }
  }

  const expectAscendingUnique = (ids: readonly number[]) => {
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  };

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `change-log-pagination-${Date.now()}`,
      context: { userId: 'test-user' },
      entities: [ChangeLogPageA, ChangeLogPageB, CatalogItem],
      sync: { remote: { adapter: 'supabase' }, type: SyncType.None }
    });
    rxdb.adapter(
      'supabase',
      async db => new RxDBAdapterSupabase(db, { client: createAuthenticatedTestClient(), rlsCheck: false })
    );
    rxdb.init();
    adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    await adapter.connect();

    await insertChanges('ChangeLogPageA', WIDE, null);
    await insertChanges('ChangeLogPageB', NARROW, null);
    await insertChanges('CatalogItem', WIDE, 'public');
  }, LONG_RUNNING_MS);

  afterAll(async () => {
    await rxdb?.disconnectAll();
    const { error } = await service.from('rxdb_change').delete().eq('branchId', branchId);
    expect(error).toBeNull();
  }, LONG_RUNNING_MS);

  it(
    'pullChanges：要的条数超过 max-rows 时一条不少，按 id 升序',
    async () => {
      const changes = await adapter.pullChanges(0, WIDE + 500, ['public:ChangeLogPageA'], undefined, branchId);

      expect(changes).toHaveLength(WIDE);
      expectAscendingUnique(changes.map(change => change.id));
    },
    LONG_RUNNING_MS
  );

  it(
    'pullChanges：上限落在 max-rows 与总数之间时正好交回上限条',
    async () => {
      const changes = await adapter.pullChanges(
        0,
        SERVER_MAX_ROWS + 50,
        ['public:ChangeLogPageA'],
        undefined,
        branchId
      );

      expect(changes).toHaveLength(SERVER_MAX_ROWS + 50);
      expectAscendingUnique(changes.map(change => change.id));
    },
    LONG_RUNNING_MS
  );

  it(
    'pullChanges 带同步规则（rxdb_pull_changes）：同样一条不少',
    async () => {
      const changes = await adapter.pullChanges(
        0,
        WIDE + 500,
        ['public:ChangeLogPageA'],
        { combinator: 'and', rules: [{ field: 'value', operator: '=', value: 'x' }] },
        branchId
      );

      expect(changes).toHaveLength(WIDE);
      expectAscendingUnique(changes.map(change => change.id));
    },
    LONG_RUNNING_MS
  );

  it(
    'pullChangesBatch：几个仓库合起来超过 max-rows 时一条不少（批量拉取默认要「上限 × 仓库数」条）',
    async () => {
      const changes = await adapter.pullChangesBatch(
        [
          { namespace: 'public', entity: 'ChangeLogPageA', sinceId: 0 },
          { namespace: 'public', entity: 'ChangeLogPageB', sinceId: 0 }
        ],
        2 * SERVER_MAX_ROWS * 2,
        [branchId]
      );

      expect(changes).toHaveLength(WIDE + NARROW);
      expect(changes.filter(change => change.entity === 'ChangeLogPageB')).toHaveLength(NARROW);
      expectAscendingUnique(changes.map(change => change.id));
    },
    LONG_RUNNING_MS
  );

  it(
    'pullBucketChanges（rxdb_pull_bucket_changes）：一个区的日志超过 max-rows 时一条不少',
    async () => {
      const changes = await adapter.pullBucketChanges(
        0,
        WIDE + 500,
        'public',
        'CatalogItem',
        'public',
        undefined,
        branchId
      );

      expect(changes).toHaveLength(WIDE);
      expectAscendingUnique(changes.map(change => change.id));
    },
    LONG_RUNNING_MS
  );
});
