import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import type { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import { rxDBPluginGraph } from '../plugin.js';
import type { SqliteGraphRepository } from '../sqlite/SqliteGraphRepository.js';
import { cleanup_db, create_graph_test_adapter } from './test-utils.js';

/**
 * GRAPH-004：addEdge 过去在「图未启用该特性」时静默丢弃对应实参。
 * 最典型的触发路径是 properties-only 图 —— 生成器把签名排成
 * `addEdge(from, to, properties?)`，而运行时 ABI 固定是
 * `addEdge(from, to, weight?, properties?)`，属性对象落进 weight 槽后
 * 无错误、无告警地消失。这里锁定它必须抛错。
 */

/** 无权、无属性图 */
@GraphEntity({
  name: 'PlainLink',
  properties: [{ type: PropertyType.string, name: 'label' }],
  features: { graph: { type: 'directed-graph', weight: false } }
})
class PlainLink extends GraphEntityBase {
  label!: string;
}

/** properties-only 图：不启用 weight，但有边属性 */
@GraphEntity({
  name: 'TaggedLink',
  properties: [{ type: PropertyType.string, name: 'label' }],
  features: {
    graph: {
      type: 'directed-graph',
      weight: false,
      properties: [{ name: 'tag', type: PropertyType.string, displayName: '标签' }]
    }
  }
})
class TaggedLink extends GraphEntityBase {
  label!: string;
}

/** 仅启用 weight 的图 */
@GraphEntity({
  name: 'WeightedLink',
  properties: [{ type: PropertyType.string, name: 'label' }],
  features: { graph: { type: 'directed-graph', weight: true } }
})
class WeightedLink extends GraphEntityBase {
  label!: string;
}

/** 同时启用 weight 与 properties 的图 */
@GraphEntity({
  name: 'FullLink',
  properties: [{ type: PropertyType.string, name: 'label' }],
  features: {
    graph: {
      type: 'directed-graph',
      weight: true,
      properties: [{ name: 'tag', type: PropertyType.string, displayName: '标签' }]
    }
  }
})
class FullLink extends GraphEntityBase {
  label!: string;
}

describe('addEdge 特性守卫（GRAPH-004）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterWaSqlite;
  let plainRepo: SqliteGraphRepository<typeof PlainLink>;
  let taggedRepo: SqliteGraphRepository<typeof TaggedLink>;
  let weightedRepo: SqliteGraphRepository<typeof WeightedLink>;
  let fullRepo: SqliteGraphRepository<typeof FullLink>;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'graph_edge_guard_' + Math.random().toString(36).substring(7),
      entities: [PlainLink, TaggedLink, WeightedLink, FullLink],
      sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
    });
    rxdb.use(rxDBPluginGraph).adapter('wa-sqlite', create_graph_test_adapter);
    adapter = (await rxdb.connect('wa-sqlite')) as RxDBAdapterWaSqlite;
    rxdb.init();
    plainRepo = adapter.getRepository(PlainLink);
    taggedRepo = adapter.getRepository(TaggedLink);
    weightedRepo = adapter.getRepository(WeightedLink);
    fullRepo = adapter.getRepository(FullLink);
  });

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  it('图未启用 weight 时传 weight 应抛错，而不是静默丢弃', async () => {
    const a = new PlainLink({ label: 'A' });
    const b = new PlainLink({ label: 'B' });
    await rxdb.entityManager.saveMany([a, b]);

    await expect(plainRepo.addEdge(a, b, 5)).rejects.toThrow(/weight/);
  });

  it('图未定义 properties 时传 properties 应抛错', async () => {
    const a = new PlainLink({ label: 'A' });
    const b = new PlainLink({ label: 'B' });
    await rxdb.entityManager.saveMany([a, b]);

    await expect(plainRepo.addEdge(a, b, undefined, { tag: 'x' } as never)).rejects.toThrow(/properties/);
  });

  it('properties-only 图上把属性对象误传进 weight 槽应抛错（生成器签名错位的实际触发路径）', async () => {
    const a = new TaggedLink({ label: 'A' });
    const b = new TaggedLink({ label: 'B' });
    await rxdb.entityManager.saveMany([a, b]);

    // 生成的 `addEdge(from, to, properties?)` 让调用方写出这一行
    await expect(taggedRepo.addEdge(a, b, { tag: 'x' } as never)).rejects.toThrow(/weight/);
  });

  it('properties-only 图按真实 ABI 传第四参时应正常落库', async () => {
    const a = new TaggedLink({ label: 'A' });
    const b = new TaggedLink({ label: 'B' });
    await rxdb.entityManager.saveMany([a, b]);

    await taggedRepo.addEdge(a, b, undefined, { tag: 'x' });

    const result = await adapter.query(
      `SELECT properties FROM "public$TaggedLink_edges" WHERE sourceId = ? AND targetId = ?`,
      [a.id, b.id]
    );
    expect(result.results[0].rows).toHaveLength(1);
    expect(JSON.parse(result.results[0].rows[0][0] as string)).toEqual({ tag: 'x' });
  });

  it('不传可选参数时应正常落库', async () => {
    const a = new PlainLink({ label: 'A' });
    const b = new PlainLink({ label: 'B' });
    await rxdb.entityManager.saveMany([a, b]);

    await plainRepo.addEdge(a, b);

    const result = await adapter.query(`SELECT sourceId, targetId FROM "public$PlainLink_edges" WHERE sourceId = ?`, [
      a.id
    ]);
    expect(result.results[0].rows).toHaveLength(1);
  });

  it('四种特性组合只暴露已启用字段，启用字段的空值稳定返回 null', async () => {
    const [plainA, plainB] = ['A', 'B'].map(label => new PlainLink({ label }));
    const [taggedA, taggedB] = ['A', 'B'].map(label => new TaggedLink({ label }));
    const [weightedA, weightedB] = ['A', 'B'].map(label => new WeightedLink({ label }));
    const [fullA, fullB] = ['A', 'B'].map(label => new FullLink({ label }));
    await rxdb.entityManager.saveMany([plainA, plainB, taggedA, taggedB, weightedA, weightedB, fullA, fullB]);

    await plainRepo.addEdge(plainA, plainB);
    await taggedRepo.addEdge(taggedA, taggedB);
    await weightedRepo.addEdge(weightedA, weightedB);
    await fullRepo.addEdge(fullA, fullB);

    const plain = await plainRepo.findNeighbors({ entityId: plainA.id, direction: 'out' });
    const tagged = await taggedRepo.findNeighbors({ entityId: taggedA.id, direction: 'out' });
    const weighted = await weightedRepo.findNeighbors({ entityId: weightedA.id, direction: 'out' });
    const full = await fullRepo.findNeighbors({ entityId: fullA.id, direction: 'out' });

    expect(plain[0].edge).not.toHaveProperty('weight');
    expect(plain[0].edge).not.toHaveProperty('properties');
    expect(tagged[0].edge).not.toHaveProperty('weight');
    expect(tagged[0].edge.properties).toBeNull();
    expect(weighted[0].edge.weight).toBeNull();
    expect(weighted[0].edge).not.toHaveProperty('properties');
    expect(full[0].edge.weight).toBeNull();
    expect(full[0].edge.properties).toBeNull();
  });

  it('UPSERT 省略字段时保留旧值，显式 null 时清空', async () => {
    const a = new FullLink({ label: 'A' });
    const b = new FullLink({ label: 'B' });
    await rxdb.entityManager.saveMany([a, b]);

    await fullRepo.addEdge(a, b, 7, { tag: 'old' });
    await fullRepo.addEdge(a, b);
    const preserved = await fullRepo.findNeighbors({ entityId: a.id, direction: 'out' });
    expect(preserved[0].edge.weight).toBe(7);
    expect(preserved[0].edge.properties).toEqual({ tag: 'old' });

    await fullRepo.addEdge(a, b, null, null);
    const cleared = await fullRepo.findNeighbors({ entityId: a.id, direction: 'out' });
    expect(cleared[0].edge.weight).toBeNull();
    expect(cleared[0].edge.properties).toBeNull();

    const stored = await adapter.query(
      `SELECT weight, properties FROM "public$FullLink_edges" WHERE sourceId = ? AND targetId = ?`,
      [a.id, b.id]
    );
    expect(stored.results[0].rows[0]).toEqual([null, null]);
  });
});
