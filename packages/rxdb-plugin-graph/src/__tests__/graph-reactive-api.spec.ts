import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import type { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import type { GraphPath, NeighborResult } from '../graph-repository.interface.js';
import { rxDBPluginGraph } from '../plugin.js';
import { cleanup_db, create_graph_test_adapter } from './test-utils.js';

@GraphEntity({
  name: 'ReactiveGraphNode',
  properties: [{ name: 'label', type: PropertyType.string }],
  features: { graph: { type: 'directed-graph', weight: true } }
})
class ReactiveGraphNode extends GraphEntityBase {
  label!: string;
}

type ReactiveNeighbor = NeighborResult<typeof ReactiveGraphNode>;
type ReactivePath = GraphPath<typeof ReactiveGraphNode>;

describe('图查询公开 API（GRAPH-002）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterWaSqlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `graph_reactive_${Math.random().toString(36).slice(2)}`,
      entities: [ReactiveGraphNode],
      sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
    });
    rxdb.use(rxDBPluginGraph).adapter('wa-sqlite', create_graph_test_adapter);
    adapter = (await rxdb.connect('wa-sqlite')) as RxDBAdapterWaSqlite;
    rxdb.init();
  });

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  afterAll(async () => {
    await rxdb.disconnect('wa-sqlite');
  });

  it('保留 Promise 查询，同时提供接入 QueryManager 的 $ 查询', async () => {
    const a = new ReactiveGraphNode({ label: 'A' });
    const b = new ReactiveGraphNode({ label: 'B' });
    await rxdb.entityManager.saveMany([a, b]);

    const once = ReactiveGraphNode.findNeighbors({ entityId: a.id, direction: 'out' });
    expect(once).toBeInstanceOf(Promise);
    await expect(once).resolves.toEqual([]);

    const emissions: unknown[][] = [];
    const subscription = ReactiveGraphNode.findNeighbors$({ entityId: a.id, direction: 'out' }).subscribe(value =>
      emissions.push(value)
    );
    await vi.waitFor(() => expect(emissions).toHaveLength(1));
    await ReactiveGraphNode.addEdge(a, b, 3);
    await vi.waitFor(() => expect(emissions).toHaveLength(2));
    subscription.unsubscribe();

    expect(emissions[0]).toEqual([]);
    expect(emissions[1][0]).toMatchObject({ node: { id: b.id, label: 'B' }, edge: { weight: 3 } });
  });

  it('同一 Observable 退订后重订阅仍追踪边表，退订者不再收到值', async () => {
    const [a, b, c] = ['A', 'B', 'C'].map(label => new ReactiveGraphNode({ label }));
    await rxdb.entityManager.saveMany([a, b, c]);
    const neighbors$ = ReactiveGraphNode.findNeighbors$({ entityId: a.id, direction: 'out' });
    const firstEmissions: ReactiveNeighbor[][] = [];
    const first = neighbors$.subscribe(value => firstEmissions.push(value));
    await vi.waitFor(() => expect(firstEmissions).toHaveLength(1));
    first.unsubscribe();

    await ReactiveGraphNode.addEdge(a, b);
    expect(firstEmissions).toHaveLength(1);

    const secondEmissions: ReactiveNeighbor[][] = [];
    const second = neighbors$.subscribe(value => secondEmissions.push(value));
    await vi.waitFor(() => expect(secondEmissions).toHaveLength(1));
    expect(secondEmissions[0].map(item => item.node.id)).toEqual([b.id]);

    await ReactiveGraphNode.addEdge(a, c);
    await vi.waitFor(() => expect(secondEmissions).toHaveLength(2));
    expect(secondEmissions[1].map(item => item.node.id)).toEqual([b.id, c.id]);
    second.unsubscribe();
  });

  it('countNeighbors$ 与 findPaths$ 响应边的新增和删除', async () => {
    const [a, b, c] = ['A', 'B', 'C'].map(label => new ReactiveGraphNode({ label }));
    await rxdb.entityManager.saveMany([a, b, c]);
    const counts: number[] = [];
    const paths: ReactivePath[][] = [];
    const countSubscription = ReactiveGraphNode.countNeighbors$({
      entityId: a.id,
      direction: 'out',
      level: 2
    }).subscribe(value => counts.push(value));
    const pathSubscription = ReactiveGraphNode.findPaths$({
      fromId: a.id,
      toId: c.id,
      direction: 'out'
    }).subscribe(value => paths.push(value));
    await vi.waitFor(() => {
      expect(counts).toEqual([0]);
      expect(paths).toEqual([[]]);
    });

    await ReactiveGraphNode.addEdge(a, b);
    await vi.waitFor(() => expect(counts.at(-1)).toBe(1));
    await ReactiveGraphNode.addEdge(b, c);
    await vi.waitFor(() => {
      expect(counts.at(-1)).toBe(2);
      expect(paths.at(-1)).toHaveLength(1);
    });

    await ReactiveGraphNode.removeEdge(b, c);
    await vi.waitFor(() => {
      expect(counts.at(-1)).toBe(1);
      expect(paths.at(-1)).toEqual([]);
    });
    countSubscription.unsubscribe();
    pathSubscription.unsubscribe();
  });

  it('节点属性更新会刷新带 where 的邻居查询', async () => {
    const a = new ReactiveGraphNode({ label: 'source' });
    const b = new ReactiveGraphNode({ label: 'hidden' });
    await rxdb.entityManager.saveMany([a, b]);
    await ReactiveGraphNode.addEdge(a, b);
    const emissions: ReactiveNeighbor[][] = [];
    const subscription = ReactiveGraphNode.findNeighbors$({
      entityId: a.id,
      direction: 'out',
      where: { label: 'visible' }
    }).subscribe(value => emissions.push(value));
    await vi.waitFor(() => expect(emissions).toEqual([[]]));

    b.label = 'visible';
    await b.save();

    await vi.waitFor(() => expect(emissions.at(-1)).toHaveLength(1));
    expect(emissions.at(-1)?.[0].node.id).toBe(b.id);
    subscription.unsubscribe();
  });
});
