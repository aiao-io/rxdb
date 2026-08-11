/**
 * @fileoverview SUPA-004 / SUPA-005：结果集超过 PostgREST `max-rows` 时的静默截断
 *
 * 这些用例必须跑在**真实** PostgREST 上：截断由服务端做，任何 mock 都只能复述我们
 * 自己对截断的假设。CI 测试环境（docker/docker-compose.ci.yml）此前不设
 * `PGRST_DB_MAX_ROWS`，等于服务端不限行数，这一整类缺陷在门禁里物理上无法复现；
 * 现已与 docker-compose.yml 的默认值（1000）对齐。
 *
 * 判据统一是「**一行都不能少**」，不是「发了几次请求」——
 * 后者会把某一种具体的分页实现锁成契约。
 */

import { type RuleGroup, RxDB, SyncType, type UUID } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import type { SupabaseTreeRepository } from '../SupabaseTreeRepository.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

/** 服务端 `max-rows`，与 docker compose 的默认值一致 */
const SERVER_MAX_ROWS = 1000;
/** 单层子节点数，必须严格大于 SERVER_MAX_ROWS 才能触发截断 */
const WIDE_LEVEL_SIZE = 1200;
/** 分支数，同样需要越过 max-rows */
const BRANCH_COUNT = 1100;
/** 单次 insert 的行数，避免单个请求体过大 */
const INSERT_CHUNK = 400;

const LONG_RUNNING_MS = 120_000;

describe('SUPA-004 / SUPA-005 — 超过 PostgREST max-rows 的结果集', () => {
  let adapter: RxDBAdapterSupabase;
  let treeRepository: SupabaseTreeRepository<typeof MenuLarge>;
  /** MenuLarge 的 `idType` 是 `UUID`，直接喂给 `entityId` */
  let rootId: UUID;
  let childIds: string[] = [];
  const titlePrefix = `wide-${Date.now()}`;

  beforeAll(async () => {
    const rxdb = new RxDB({
      dbName: `pagination-truncation-${Date.now()}`,
      context: { userId: 'test-user' },
      entities: [MenuLarge],
      sync: { remote: { adapter: 'supabase' }, type: SyncType.None }
    });

    rxdb.adapter(
      'supabase',
      async db => new RxDBAdapterSupabase(db, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY })
    );
    rxdb.init();

    adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    await adapter.connect();
    treeRepository = adapter.getRepository(MenuLarge) as SupabaseTreeRepository<typeof MenuLarge>;

    const table = () => adapter.client.from('menu_large');

    const { data: rootRows, error: rootError } = await table()
      .insert({ title: `${titlePrefix}-root` })
      .select('id');
    if (rootError) throw new Error(`创建根节点失败: ${rootError.message}`);
    rootId = (rootRows as { id: UUID }[])[0].id;

    for (let offset = 0; offset < WIDE_LEVEL_SIZE; offset += INSERT_CHUNK) {
      const batch = Array.from({ length: Math.min(INSERT_CHUNK, WIDE_LEVEL_SIZE - offset) }, (_v, index) => ({
        title: `${titlePrefix}-child-${offset + index}`,
        parentId: rootId
      }));
      const { data, error } = await table().insert(batch).select('id');
      if (error) throw new Error(`创建子节点失败: ${error.message}`);
      childIds.push(...(data as { id: string }[]).map(row => row.id));
    }

    expect(childIds.length).toBe(WIDE_LEVEL_SIZE);
  }, LONG_RUNNING_MS);

  afterAll(async () => {
    // 子节点由 ON DELETE CASCADE 带走；变更日志按实体清理，避免污染后续用例的变更计数
    await adapter.client.from('menu_large').delete().eq('id', rootId);
    await adapter.client.from('rxdb_change').delete().eq('entity', 'MenuLarge');
    childIds = [];
  }, LONG_RUNNING_MS);

  it(
    'SUPA-004：单层子节点超过 max-rows 时 findDescendants 不得丢节点',
    async () => {
      const descendants = await treeRepository.findDescendants({ entityId: rootId, level: 1 });

      expect(descendants.length).toBe(WIDE_LEVEL_SIZE + 1);
      expect(new Set(descendants.map(node => node.id)).size).toBe(WIDE_LEVEL_SIZE + 1);
    },
    LONG_RUNNING_MS
  );

  it(
    'SUPA-005：fetchMetadata 结果超过 max-rows 时不得静默截断',
    async () => {
      const metadata = await firstValueFrom(
        adapter.fetchMetadata('MenuLarge', {
          combinator: 'and',
          rules: [{ field: 'parentId', operator: '=', value: rootId }]
        } as RuleGroup<Record<string, unknown>> as RuleGroup<unknown>)
      );

      expect(metadata.length).toBe(WIDE_LEVEL_SIZE);
      expect(new Set(metadata.map(row => row.id)).size).toBe(WIDE_LEVEL_SIZE);
    },
    LONG_RUNNING_MS
  );

  it(
    'SUPA-005：findByIds 传入超过 max-rows 个 id 时必须全部返回',
    async () => {
      const rows = await firstValueFrom(adapter.findByIds<{ id: string }>('MenuLarge', childIds));

      expect(rows.length).toBe(WIDE_LEVEL_SIZE);
      expect(new Set(rows.map(row => row.id))).toEqual(new Set(childIds));
    },
    LONG_RUNNING_MS
  );

  it(
    'SUPA-005：分支数超过 max-rows 时 pullBranches 不得静默截断',
    async () => {
      const branchIds = Array.from({ length: BRANCH_COUNT }, (_v, index) => `${titlePrefix}-branch-${index}`);
      try {
        for (let offset = 0; offset < branchIds.length; offset += INSERT_CHUNK) {
          const batch = branchIds.slice(offset, offset + INSERT_CHUNK).map(id => ({ id }));
          const { error } = await adapter.client.from('rxdb_branch').insert(batch);
          if (error) throw new Error(`创建分支失败: ${error.message}`);
        }

        const branches = await adapter.pullBranches();
        const pulled = new Set(branches.map(branch => branch.id));

        expect(branches.length).toBeGreaterThan(SERVER_MAX_ROWS);
        for (const id of branchIds) {
          expect(pulled.has(id)).toBe(true);
        }
      } finally {
        for (let offset = 0; offset < branchIds.length; offset += INSERT_CHUNK) {
          await adapter.client
            .from('rxdb_branch')
            .delete()
            .in('id', branchIds.slice(offset, offset + INSERT_CHUNK));
        }
      }
    },
    LONG_RUNNING_MS
  );
});
