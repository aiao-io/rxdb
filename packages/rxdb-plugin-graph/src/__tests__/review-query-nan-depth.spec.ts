import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import type { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import { rxDBPluginGraph } from '../plugin.js';
import { SqliteGraphRepository } from '../sqlite/SqliteGraphRepository.js';
import { create_graph_test_adapter } from './test-utils.js';

@GraphEntity({
  name: 'ReviewDepthNode',
  properties: [{ name: 'label', type: PropertyType.string }],
  features: { graph: { type: 'directed-graph', weight: false } }
})
class ReviewDepthNode extends GraphEntityBase {
  label!: string;
}

let db: RxDB;
let repository: SqliteGraphRepository<typeof ReviewDepthNode>;
let from: ReviewDepthNode;
let to: ReviewDepthNode;

beforeAll(async () => {
  db = new RxDB({
    dbName: `review-gdepth-${crypto.randomUUID().slice(0, 8)}`,
    entities: [ReviewDepthNode],
    multiInstance: false,
    sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
  });
  db.use(rxDBPluginGraph);
  const adapter: RxDBAdapterWaSqlite = create_graph_test_adapter(db);
  db.adapter('wa-sqlite', () => adapter);
  await db.connect('wa-sqlite');
  repository = adapter.getRepository(ReviewDepthNode);
  from = db.entityManager.instantiate(ReviewDepthNode);
  from.label = 'from';
  const middle = db.entityManager.instantiate(ReviewDepthNode);
  middle.label = 'middle';
  to = db.entityManager.instantiate(ReviewDepthNode);
  to.label = 'to';
  await db.entityManager.saveMany([from, middle, to]);
  await repository.addEdge(from, middle);
  await repository.addEdge(middle, to);
});

afterAll(async () => {
  await db?.destroy();
});

describe('评审：NaN 图深度不能被当作成功的空结果', () => {
  it('findNeighbors level=NaN 应明确拒绝', async () => {
    await expect(repository.findNeighbors({ entityId: from.id, direction: 'out', level: Number.NaN })).rejects.toThrow(
      RangeError
    );
  });
  it('countNeighbors level=NaN 应明确拒绝', async () => {
    await expect(repository.countNeighbors({ entityId: from.id, direction: 'out', level: Number.NaN })).rejects.toThrow(
      RangeError
    );
  });
  it('findPaths maxDepth=NaN 应明确拒绝', async () => {
    await expect(
      repository.findPaths({ fromId: from.id, toId: to.id, direction: 'out', maxDepth: Number.NaN })
    ).rejects.toThrow(RangeError);
  });
  it('对照：level=2 的实际图有两个邻居', async () => {
    await expect(repository.countNeighbors({ entityId: from.id, direction: 'out', level: 2 })).resolves.toBe(2);
  });
  it('对照：maxDepth=2 的实际图存在一条路径', async () => {
    await expect(
      repository.findPaths({ fromId: from.id, toId: to.id, direction: 'out', maxDepth: 2 })
    ).resolves.toHaveLength(1);
  });
});
