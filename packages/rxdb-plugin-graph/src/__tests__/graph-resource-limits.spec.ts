import { PropertyType, RxDB, SyncType, getEntityMetadata } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import type { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GRAPH_DEFAULT_RESULT_LIMIT, GRAPH_MAX_PATH_EXPANSIONS } from '../constants.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import { rxDBPluginGraph } from '../plugin.js';
import { generate_entity_find_neighbors_sql, generate_entity_find_paths_sql } from '../sqlite/query_graph_sql.js';
import type { SqliteGraphRepository } from '../sqlite/SqliteGraphRepository.js';
import { normalizeNeighborsOptions, normalizePathsOptions } from '../utils.js';
import { cleanup_db, create_graph_test_adapter } from './test-utils.js';

@GraphEntity({
  name: 'BoundedGraphNode',
  properties: [{ name: 'label', type: PropertyType.string }],
  features: { graph: { type: 'directed-graph', weight: true } }
})
class BoundedGraphNode extends GraphEntityBase {
  label!: string;
}

describe('图查询资源上限（GRAPH-007）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterWaSqlite;
  let repository: SqliteGraphRepository<typeof BoundedGraphNode>;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `graph_limits_${Math.random().toString(36).slice(2)}`,
      entities: [BoundedGraphNode],
      sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
    });
    rxdb.use(rxDBPluginGraph).adapter('wa-sqlite', create_graph_test_adapter);
    adapter = (await rxdb.connect('wa-sqlite')) as RxDBAdapterWaSqlite;
    rxdb.init();
    repository = adapter.getRepository(BoundedGraphNode);
  });

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  it('邻居遍历按层去重，不携带每条简单路径', () => {
    const options = normalizeNeighborsOptions({ entityId: 'a', direction: 'out', level: 8 });
    const { sql, params } = generate_entity_find_neighbors_sql(
      adapter as unknown as RxDBAdapterSqliteBase,
      getEntityMetadata(BoundedGraphNode),
      options
    );

    expect(sql).not.toContain('path_nodes');
    expect(sql).toContain('GROUP BY id');
    expect(sql).toContain('LIMIT ?');
    expect(params?.at(-1)).toBe(GRAPH_DEFAULT_RESULT_LIMIT + 1);
  });

  it('路径遍历同时限制递归展开数和返回结果数', () => {
    const options = normalizePathsOptions({ fromId: 'a', toId: 'b', maxDepth: 100 });
    const { sql, params } = generate_entity_find_paths_sql(
      adapter as unknown as RxDBAdapterSqliteBase,
      getEntityMetadata(BoundedGraphNode),
      options
    );

    expect(sql.match(/LIMIT \?/g)).toHaveLength(2);
    expect(sql).toContain('_search_truncated');
    expect(params).toContain(GRAPH_MAX_PATH_EXPANSIONS + 1);
    expect(params).toContain(GRAPH_MAX_PATH_EXPANSIONS);
    expect(params?.at(-1)).toBe(GRAPH_DEFAULT_RESULT_LIMIT + 1);
  });

  it('邻居结果达到调用方上限时返回可观察的截断标志', async () => {
    const [a, b, c] = ['A', 'B', 'C'].map(label => new BoundedGraphNode({ label }));
    await rxdb.entityManager.saveMany([a, b, c]);
    await repository.addEdge(a, b, 1);
    await repository.addEdge(a, c, 2);

    const neighbors = await repository.findNeighbors({ entityId: a.id, direction: 'out', level: 1, limit: 1 });

    expect(neighbors).toHaveLength(1);
    expect(neighbors.truncated).toBe(true);
  });

  it('路径结果达到调用方上限时返回可观察的截断标志', async () => {
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(label => new BoundedGraphNode({ label }));
    await rxdb.entityManager.saveMany([a, b, c, d]);
    await repository.addEdge(a, b, 1);
    await repository.addEdge(b, d, 1);
    await repository.addEdge(a, c, 2);
    await repository.addEdge(c, d, 2);

    const paths = await repository.findPaths({ fromId: a.id, toId: d.id, direction: 'out', limit: 1 });

    expect(paths).toHaveLength(1);
    expect(paths.truncated).toBe(true);
  });

  it('路径递归达到展开上限但尚未命中目标时仍返回截断标志', async () => {
    const source = new BoundedGraphNode({ label: 'Source' });
    const target = new BoundedGraphNode({ label: 'Target' });
    const layers = Array.from({ length: 16 }, (_, layer) =>
      Array.from({ length: 2 }, (_, branch) => new BoundedGraphNode({ label: `${layer}:${branch}` }))
    );
    await rxdb.entityManager.saveMany([source, target, ...layers.flat()]);

    await Promise.all(layers[0].map(node => repository.addEdge(source, node, 1)));
    for (let layer = 1; layer < layers.length; layer++) {
      await Promise.all(layers[layer - 1].flatMap(from => layers[layer].map(to => repository.addEdge(from, to, 1))));
    }

    const paths = await repository.findPaths({
      fromId: source.id,
      toId: target.id,
      direction: 'out',
      maxDepth: layers.length,
      limit: 1
    });

    expect(paths).toHaveLength(0);
    expect(paths.truncated).toBe(true);
  }, 30_000);
});
