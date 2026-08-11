import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import type { SqliteTransactionExecutor } from '@aiao/rxdb-adapter-sqlite-core';
import type { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import { rxDBPluginGraph } from '../plugin.js';
import type { SqliteGraphRepository } from '../sqlite/SqliteGraphRepository.js';
import { cleanup_db, create_graph_test_adapter } from './test-utils.js';

/**
 * GRAPH-008：findPaths 的路径 CTE 与节点回填过去是两次无共享快照的独立查询，
 * 回填缺行时 `if (node) push` 静默跳过，返回 `nodes.length !== length + 1`
 * 的破损结构 —— 违反 GraphPath 声明的不变量，且让 nodes 与 edges 索引错位。
 */
@GraphEntity({
  name: 'Waypoint',
  properties: [{ type: PropertyType.string, name: 'label' }],
  features: { graph: { type: 'directed-graph', weight: false } }
})
class Waypoint extends GraphEntityBase {
  label!: string;
}

const NODE_BACKFILL_SQL = 'WHERE id IN (';
const PATH_CTE_SQL = 'WITH RECURSIVE paths(';

describe('findPaths 节点回填一致性（GRAPH-008）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterWaSqlite;
  let repo: SqliteGraphRepository<typeof Waypoint>;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'graph_backfill_' + Math.random().toString(36).substring(7),
      entities: [Waypoint],
      sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
    });
    rxdb.use(rxDBPluginGraph).adapter('wa-sqlite', create_graph_test_adapter);
    adapter = (await rxdb.connect('wa-sqlite')) as RxDBAdapterWaSqlite;
    rxdb.init();
    repo = adapter.getRepository(Waypoint);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup_db(adapter);
  });

  const seedChain = async (): Promise<[Waypoint, Waypoint, Waypoint]> => {
    const a = new Waypoint({ label: 'A' });
    const b = new Waypoint({ label: 'B' });
    const c = new Waypoint({ label: 'C' });
    await rxdb.entityManager.saveMany([a, b, c]);
    await repo.addEdge(a, b);
    await repo.addEdge(b, c);
    return [a, b, c];
  };

  /**
   * 包住 adapter.transaction，记录每条 SQL 落在哪个 executor 上，
   * 并可选地改写某条 SQL 的返回结果。
   */
  const instrumentTransaction = (
    rewrite?: (sql: string, result: { results: Array<{ rows: unknown[][] }> }) => void
  ): Array<{ executorId: string; sql: string }> => {
    const seen: Array<{ executorId: string; sql: string }> = [];
    const original = adapter.transaction.bind(adapter);
    vi.spyOn(adapter, 'transaction').mockImplementation(((fun: never, log?: boolean) =>
      original(async (executor: SqliteTransactionExecutor) => {
        const realExecute = executor.execute.bind(executor);
        executor.execute = async (sql: string, params?: never) => {
          seen.push({ executorId: executor.id, sql });
          const result = await realExecute(sql, params);
          rewrite?.(sql, result as never);
          return result;
        };
        return (fun as unknown as (e: SqliteTransactionExecutor) => Promise<unknown>)(executor);
      }, log)) as never);
    return seen;
  };

  it('返回的每条路径都满足 nodes.length === length + 1', async () => {
    const [a, , c] = await seedChain();

    const paths = await repo.findPaths({ fromId: a.id, toId: c.id, direction: 'out', maxDepth: 5 });

    expect(paths).toHaveLength(1);
    expect(paths[0].nodes).toHaveLength(paths[0].length + 1);
    expect(paths[0].edges).toHaveLength(paths[0].length);
  });

  it('路径 CTE 与节点回填必须落在同一个事务 executor 上', async () => {
    const [a, , c] = await seedChain();
    const seen = instrumentTransaction();

    await repo.findPaths({ fromId: a.id, toId: c.id, direction: 'out', maxDepth: 5 });

    const cte = seen.find(entry => entry.sql.includes(PATH_CTE_SQL));
    const backfill = seen.find(entry => entry.sql.includes(NODE_BACKFILL_SQL));
    expect(cte).toBeDefined();
    expect(backfill).toBeDefined();
    // 同一个 executorId 即同一个事务，两次查询共享读快照
    expect(backfill?.executorId).toBe(cte?.executorId);
  });

  it('节点回填缺行时应抛错，而不是返回缺节点的破损路径', async () => {
    const [a, , c] = await seedChain();
    // 模拟路径结果与节点表不一致：回填查询返回空行
    instrumentTransaction((sql, result) => {
      if (sql.includes(NODE_BACKFILL_SQL)) result.results[0].rows = [];
    });

    await expect(repo.findPaths({ fromId: a.id, toId: c.id, direction: 'out', maxDepth: 5 })).rejects.toThrow(
      /回填失败/
    );
  });
});
