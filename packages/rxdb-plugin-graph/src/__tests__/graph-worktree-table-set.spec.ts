import {
  getEntityMetadata,
  PropertyType,
  RxDB,
  SyncType,
  WorktreeTableSet,
  type EntityType,
  type SwitchVersionActions
} from '@aiao/rxdb';
import type { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import graphEdgeEntityFactory from '../graph_edge_entity.js';
import { rxDBPluginGraph } from '../plugin.js';
import type { SqliteGraphRepository } from '../sqlite/SqliteGraphRepository.js';
import { cleanup_db, create_graph_test_adapter } from './test-utils.js';

@GraphEntity({
  name: 'WtPeer',
  displayName: '检出位里的伙伴',
  properties: [{ type: PropertyType.string, name: 'name', displayName: '姓名' }],
  features: { graph: { type: 'undirected-graph', weight: false } }
})
class WtPeer extends GraphEntityBase {
  name!: string;
}

const emptyActions = (): SwitchVersionActions => ({ inserts: new Map(), updates: new Map(), deletes: new Map() });

/**
 * 可写检出位上的图（US-314 B2.1）：边表是单独登记的实体，按它自己的元数据进影子表集；
 * 节点与边一个进、一个不进时，图查询拒绝，不拼两个检出位的图。
 */
describe('可写检出位上的图（US-314 B2.1）', () => {
  const heldBranch = 'graph-held';
  let rxdb: RxDB;
  let adapter: RxDBAdapterWaSqlite;
  let repo: SqliteGraphRepository<typeof WtPeer>;
  let EdgeType: EntityType;
  const created: WorktreeTableSet[] = [];

  /** 手写持有键、经适配器槽位建一套表（不装工作树插件，与 sqlite-core 的表集套件同一种做法） */
  const openTableSet = async (set: WorktreeTableSet): Promise<void> => {
    await adapter.internalQuery(
      `INSERT INTO "rxdb$rxdb_branch" (id,activated,activeKey,fromChangeId,local,remote) VALUES (?,0,?,NULL,1,0)`,
      [heldBranch, set.holderKey]
    );
    await adapter.transaction(
      executor => adapter.createWorktreeTableSet(executor, set, { branchId: heldBranch, actions: emptyActions() }),
      false
    );
    created.push(set);
  };

  const neighborNames = async (node: WtPeer): Promise<string[]> =>
    (await repo.findNeighbors({ entityId: node.id, level: 1 })).map(neighbor => neighbor.node.name).sort();

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'graph_worktree_' + Math.random().toString(36).substring(7),
      entities: [WtPeer],
      sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
    });
    rxdb.use(rxDBPluginGraph).adapter('wa-sqlite', create_graph_test_adapter);
    adapter = (await rxdb.connect('wa-sqlite')) as RxDBAdapterWaSqlite;
    rxdb.init();
    repo = adapter.getRepository(WtPeer);
    const { name, namespace } = getEntityMetadata(WtPeer);
    EdgeType = rxdb.schemaManager.getEntityType(`${name}_edges`, namespace)!;
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  // 先挂回主表集、删掉这条用例开的表集，再清库
  afterEach(async () => {
    await rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);
    for (const set of created.splice(0)) {
      await adapter.transaction(executor => adapter.dropWorktreeTableSet(executor, set), false);
    }
    await cleanup_db(adapter);
  });

  it('挂在检出位上：邻居查询只看影子表里的点和边，写边落进影子表；主检出位的图原样', async () => {
    const alice = new WtPeer({ name: 'Alice' });
    const bob = new WtPeer({ name: 'Bob' });
    await rxdb.entityManager.saveMany([alice, bob]);
    await repo.addEdge(alice, bob);

    const tableSet = WorktreeTableSet.of('wt_graph', [WtPeer, EdgeType]);
    await openTableSet(tableSet);
    await rxdb.mountWorktreeTableSet(tableSet);
    const carol = new WtPeer({ name: 'Carol' });
    await rxdb.entityManager.saveMany([carol]);
    await repo.addEdge(alice, carol);

    expect(await neighborNames(alice)).toEqual(['Bob', 'Carol']);

    await rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);
    expect(await neighborNames(alice)).toEqual(['Bob']);
  });

  it('节点进了影子表、边没进：查邻居与写边都拒绝，不拼两个检出位的图', async () => {
    const tableSet = WorktreeTableSet.of('wt_graphhalf', [WtPeer]);
    await openTableSet(tableSet);
    await rxdb.mountWorktreeTableSet(tableSet);
    const alice = new WtPeer({ name: 'Alice' });
    const bob = new WtPeer({ name: 'Bob' });
    await rxdb.entityManager.saveMany([alice, bob]);

    // 包进 Promise 链：生成 SQL 时同步抛的错也收成拒绝
    const attempt = (run: () => Promise<unknown>) => Promise.resolve().then(run);
    await expect(attempt(() => repo.findNeighbors({ entityId: alice.id, level: 1 }))).rejects.toThrow(/不在同一套表里/);
    await expect(attempt(() => repo.addEdge(alice, bob))).rejects.toThrow(/不在同一套表里/);
  });

  // 与多对多中间表同一条规则：节点不写变更日志，边也不写
  it('边实体随节点继承 log: false，节点记日志时边不带这一项', () => {
    const metadata = getEntityMetadata(WtPeer);

    expect(graphEdgeEntityFactory({ ...metadata, log: false }).log).toBe(false);
    expect('log' in graphEdgeEntityFactory(metadata)).toBe(false);
  });
});
