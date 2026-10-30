import { getEntityMetadata, PropertyType, RxDB, SyncType, uuid } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import type { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import type { GraphWhere } from '../graph-repository.interface.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import { rxDBPluginGraph } from '../plugin.js';
import { generate_entity_find_neighbors_sql } from '../sqlite/query_graph_sql.js';
import type { SqliteGraphRepository } from '../sqlite/SqliteGraphRepository.js';
import { cleanup_db, create_graph_test_adapter } from './test-utils.js';

/**
 * RV-084 P3-2：主键属性名恒为 `id`，但 `columnName` 是公开可配的，物理列可以叫别的名字（SQLC-014）。
 * 图查询过去把节点表的主键列写死成 `id`：锚点、JOIN、排序与路径节点回填在自定义主键列上全部查不到节点。
 */
@GraphEntity({
  name: 'CpkGraphNode',
  properties: [
    {
      name: 'id',
      displayName: 'ID',
      columnName: 'pk_id',
      type: PropertyType.uuid,
      primary: true,
      unique: true,
      readonly: true,
      default: () => uuid()
    },
    { name: 'label', type: PropertyType.string }
  ],
  features: { graph: { type: 'directed-graph', weight: true } }
})
class CpkGraphNode extends GraphEntityBase {
  label!: string;
}

const NODE_TABLE = 'public$CpkGraphNode';
const EDGE_TABLE = 'public$CpkGraphNode_edges';

describe('自定义主键列的图查询（RV-084 P3-2）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterWaSqlite;
  let repo: SqliteGraphRepository<typeof CpkGraphNode>;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `graph_custom_pk_${Math.random().toString(36).slice(2)}`,
      entities: [CpkGraphNode],
      sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
    });
    rxdb.use(rxDBPluginGraph).adapter('wa-sqlite', create_graph_test_adapter);
    adapter = (await rxdb.connect('wa-sqlite')) as RxDBAdapterWaSqlite;
    rxdb.init();
    repo = adapter.getRepository(CpkGraphNode);
  });

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  afterAll(async () => {
    await rxdb.disconnect('wa-sqlite');
  });

  /** A → B → C 一条链，边权依次为 1、2 */
  const seedChain = async (): Promise<[CpkGraphNode, CpkGraphNode, CpkGraphNode]> => {
    const a = new CpkGraphNode({ label: 'A' });
    const b = new CpkGraphNode({ label: 'B' });
    const c = new CpkGraphNode({ label: 'C' });
    await rxdb.entityManager.saveMany([a, b, c]);
    await repo.addEdge(a, b, 1);
    await repo.addEdge(b, c, 2);
    return [a, b, c];
  };

  // 前提：节点表上确实没有名为 id 的列，否则下面的用例都测不到写死的 `id`；
  // 边表的 sourceId / targetId 走关系建表，外键本就指向自定义主键列
  it('节点表的主键落在自定义物理列 pk_id 上，边表外键也指向它', async () => {
    const nodeColumns = await adapter.query('SELECT name FROM pragma_table_info(?)', [NODE_TABLE]);
    const edgeForeignKeys = await adapter.query('SELECT "from", "to" FROM pragma_foreign_key_list(?)', [EDGE_TABLE]);
    const columns = nodeColumns.results[0].rows.map(row => row[0]);

    expect(columns).toContain('pk_id');
    expect(columns).not.toContain('id');
    expect(edgeForeignKeys.results[0].rows.map(([from, to]) => `${String(from)}->${String(to)}`).sort()).toEqual([
      'sourceId->pk_id',
      'targetId->pk_id'
    ]);
  });

  it('findNeighbors 查得出多跳邻居，节点按属性名 id 回填', async () => {
    const [a, b, c] = await seedChain();

    const neighbors = await repo.findNeighbors({ entityId: a.id, direction: 'out', level: 2 });

    expect(neighbors.map(n => [n.node.id, n.node.label, n.level])).toEqual([
      [b.id, 'B', 1],
      [c.id, 'C', 2]
    ]);
    expect(neighbors.map(n => [n.edge.sourceId, n.edge.targetId, n.edge.weight])).toEqual([
      [a.id, b.id, 1],
      [b.id, c.id, 2]
    ]);
  });

  it('findNeighbors 的 where 作用在按主键接上的节点上', async () => {
    const [a, , c] = await seedChain();

    const byLabel = await repo.findNeighbors({ entityId: a.id, direction: 'out', level: 2, where: { label: 'C' } });
    const byId = await repo.findNeighbors({
      entityId: a.id,
      direction: 'out',
      level: 2,
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: c.id }] }
    });

    expect(byLabel.map(n => n.node.id)).toEqual([c.id]);
    expect(byId.map(n => n.node.id)).toEqual([c.id]);
  });

  // 仓储在 level 0 直接返回空结果，生成器的这一支只能直接拿 SQL 交给 SQLite 执行
  it('level 0 的邻居 SQL 只回起点，where 照常生效', async () => {
    const [a] = await seedChain();
    const runLevelZero = async (where?: GraphWhere<typeof CpkGraphNode>) => {
      const { sql, params } = generate_entity_find_neighbors_sql(
        adapter as unknown as RxDBAdapterSqliteBase,
        getEntityMetadata(CpkGraphNode),
        { entityId: a.id, level: 0, where }
      );
      return (await adapter.query(sql, params)).results[0];
    };

    const start = await runLevelZero();
    const matched = await runLevelZero({ label: 'A' });
    const filtered = await runLevelZero({ label: 'B' });

    expect(start.rows).toHaveLength(1);
    expect(start.rows[0][start.columns.indexOf('pk_id')]).toBe(a.id);
    expect(matched.rows).toHaveLength(1);
    expect(filtered.rows).toHaveLength(0);
  });

  it('countNeighbors 数得出两跳邻居，where 照常生效', async () => {
    const [a] = await seedChain();

    await expect(repo.countNeighbors({ entityId: a.id, direction: 'out', level: 2 })).resolves.toBe(2);
    await expect(
      repo.countNeighbors({ entityId: a.id, direction: 'out', level: 2, where: { label: 'C' } })
    ).resolves.toBe(1);
  });

  it('findPaths 的路径与节点回填都按主键物理列', async () => {
    const [a, b, c] = await seedChain();

    const paths = await repo.findPaths({ fromId: a.id, toId: c.id, direction: 'out', maxDepth: 3 });
    const viaB = await repo.findPaths({ fromId: a.id, toId: c.id, direction: 'out', where: { label: 'B' } });
    const viaX = await repo.findPaths({ fromId: a.id, toId: c.id, direction: 'out', where: { label: 'X' } });

    expect(paths).toHaveLength(1);
    expect(paths[0].nodes.map(n => [n.id, n.label])).toEqual([
      [a.id, 'A'],
      [b.id, 'B'],
      [c.id, 'C']
    ]);
    expect(paths[0].edges.map(e => [e.sourceId, e.targetId])).toEqual([
      [a.id, b.id],
      [b.id, c.id]
    ]);
    expect(paths[0].totalWeight).toBe(3);
    expect(viaB).toHaveLength(1);
    expect(viaX).toHaveLength(0);
  });

  // 门面层的 createEntityRef 按属性名 id 认身份：节点记录缺 id 时所有节点都会落进 undefined 这一个缓存槽
  it('门面查询按 id 认回已有实体', async () => {
    const [a, b, c] = await seedChain();

    const neighbors = await CpkGraphNode.findNeighbors({ entityId: a.id, direction: 'out', level: 2 });
    const paths = await CpkGraphNode.findPaths({ fromId: a.id, toId: c.id, direction: 'out' });

    expect(neighbors).toHaveLength(2);
    expect(neighbors[0].node).toBe(b);
    expect(neighbors[1].node).toBe(c);
    expect(paths).toHaveLength(1);
    expect(paths[0].nodes).toHaveLength(3);
    paths[0].nodes.forEach((node, index) => expect(node).toBe([a, b, c][index]));
  });
});
