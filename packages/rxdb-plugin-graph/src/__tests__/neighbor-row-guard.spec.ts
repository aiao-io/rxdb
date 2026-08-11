import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import type { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import { rxDBPluginGraph } from '../plugin.js';
import type { SqliteGraphRepository } from '../sqlite/SqliteGraphRepository.js';
import { cleanup_db, create_graph_test_adapter } from './test-utils.js';

/**
 * GRAPH-009：邻居解析器过去在内部列缺失时伪造 ''/'out'/1，
 * 让 SQL 生成与解析之间的漂移变成一批空 ID 的"正常"结果，
 * 一路进入实体引用缓存与 UI。这里用受控的畸形结果集锁定它必须抛错。
 */
@GraphEntity({
  name: 'GuardNode',
  properties: [{ type: PropertyType.string, name: 'label' }],
  features: { graph: { type: 'directed-graph', weight: true } }
})
class GuardNode extends GraphEntityBase {
  label!: string;
}

const NODE_1 = '00000000-0000-4000-8000-000000000001' as const;
const NODE_2 = '00000000-0000-4000-8000-000000000002' as const;

const FULL_COLUMNS = [
  'id',
  'label',
  '_edge_sourceId',
  '_edge_targetId',
  '_edge_direction',
  '_edge_level',
  '_edge_weight',
  '_edge_properties'
];

describe('findNeighbors 结果行守卫（GRAPH-009）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterWaSqlite;
  let repo: SqliteGraphRepository<typeof GuardNode>;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'graph_guard_' + Math.random().toString(36).substring(7),
      entities: [GuardNode],
      sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
    });
    rxdb.use(rxDBPluginGraph).adapter('wa-sqlite', create_graph_test_adapter);
    adapter = (await rxdb.connect('wa-sqlite')) as RxDBAdapterWaSqlite;
    rxdb.init();
    repo = adapter.getRepository(GuardNode);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup_db(adapter);
  });

  /**
   * 只拦截邻居递归 CTE，其余查询（连接、sync 元数据等）仍走真实实现，
   * 避免把整个 adapter.query 换掉造成无关告警、也避免掩盖真实调用路径。
   */
  const stubQuery = (columns: string[], rows: unknown[][]): void => {
    const original = adapter.query.bind(adapter);
    vi.spyOn(adapter, 'query').mockImplementation((async (sql: string, params?: unknown[]) => {
      if (!sql.includes('WITH RECURSIVE neighbors')) return original(sql, params as never);
      return { sql, rowsAffected: 0, elapsed: 0, results: [{ columns, rows: rows as never }] };
    }) as never);
  };

  it('内部边列缺失时应抛错，而不是伪造空 ID', async () => {
    // SQL 侧漂移：_edge_sourceId / _edge_targetId 没有被 SELECT 出来
    stubQuery(['id', 'label', '_edge_direction', '_edge_level'], [[NODE_1, 'A', 'out', 1]]);

    await expect(repo.findNeighbors({ entityId: NODE_1, direction: 'out', level: 1 })).rejects.toThrow(
      /_edge_sourceId/
    );
  });

  it('direction 取值不合法时应抛错', async () => {
    stubQuery(FULL_COLUMNS, [[NODE_2, 'B', NODE_1, NODE_2, 'sideways', 1, null, null]]);

    await expect(repo.findNeighbors({ entityId: NODE_1, direction: 'out', level: 1 })).rejects.toThrow(
      /_edge_direction/
    );
  });

  it('sourceId 不是字符串时应抛错', async () => {
    stubQuery(FULL_COLUMNS, [[NODE_2, 'B', 42, NODE_2, 'out', 1, null, null]]);

    await expect(repo.findNeighbors({ entityId: NODE_1, direction: 'out', level: 1 })).rejects.toThrow(
      /_edge_sourceId/
    );
  });

  it('level 不是数字时应抛错', async () => {
    stubQuery(FULL_COLUMNS, [[NODE_2, 'B', NODE_1, NODE_2, 'out', 'deep', null, null]]);

    await expect(repo.findNeighbors({ entityId: NODE_1, direction: 'out', level: 1 })).rejects.toThrow(/_edge_level/);
  });

  it('结果行完整时应正常解析', async () => {
    stubQuery(FULL_COLUMNS, [[NODE_2, 'B', NODE_1, NODE_2, 'out', 1, 5, null]]);

    const neighbors = await repo.findNeighbors({ entityId: NODE_1, direction: 'out', level: 1 });

    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].level).toBe(1);
    expect(neighbors[0].edge.sourceId).toBe(NODE_1);
    expect(neighbors[0].edge.targetId).toBe(NODE_2);
    expect(neighbors[0].edge.weight).toBe(5);
  });
});
