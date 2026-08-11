import type { RxDBEntityId } from '@aiao/rxdb';
import { encodeRxDBChangeEntityId, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import { rxDBPluginGraph } from '../plugin.js';
import { SqliteGraphRepository } from '../sqlite/SqliteGraphRepository.js';
import { cleanup_db, create_graph_test_adapter } from './test-utils.js';

/**
 * Buddy 实体 - 无权无向图
 * 用于锁定起点排除与自环语义
 */
@GraphEntity({
  name: 'Buddy',
  displayName: '伙伴',
  properties: [
    {
      type: PropertyType.string,
      name: 'name',
      displayName: '姓名'
    }
  ],
  features: {
    graph: {
      type: 'undirected-graph',
      weight: false
    }
  }
})
export class Buddy extends GraphEntityBase {
  name!: string;
}

/**
 * Route 实体 - 有权有向图 + 边属性
 * 用于锁定去重、最短层级、排序、边属性语义
 */
@GraphEntity({
  name: 'Route',
  displayName: '路线',
  properties: [
    {
      type: PropertyType.string,
      name: 'name',
      displayName: '名称'
    }
  ],
  features: {
    graph: {
      type: 'directed-graph',
      weight: true,
      properties: [
        { name: 'category', type: PropertyType.string, displayName: '类别' },
        { name: 'active', type: PropertyType.boolean, displayName: '启用' },
        { name: 'since', type: PropertyType.date, displayName: '开通时间' }
      ]
    }
  }
})
export class Route extends GraphEntityBase {
  name!: string;
}

/**
 * Station 实体 - 自定义 tableName 的有向图
 * 用于锁定 findPaths 节点回填使用 tableName 而非 name
 */
@GraphEntity({
  name: 'Station',
  tableName: 'stations_custom',
  displayName: '站点',
  properties: [
    {
      type: PropertyType.string,
      name: 'name',
      displayName: '名称'
    }
  ],
  features: {
    graph: {
      type: 'directed-graph',
      weight: false
    }
  }
})
export class Station extends GraphEntityBase {
  name!: string;
}

describe('图语义锁定（起点排除 / 去重 / 边属性 / 表名）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterWaSqlite;
  let buddyRepo: SqliteGraphRepository<typeof Buddy>;
  let routeRepo: SqliteGraphRepository<typeof Route>;
  let stationRepo: SqliteGraphRepository<typeof Station>;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'graph_semantics_' + Math.random().toString(36).substring(7),
      entities: [Buddy, Route, Station],
      sync: {
        type: SyncType.None,
        local: {
          adapter: 'wa-sqlite'
        }
      }
    });

    rxdb.use(rxDBPluginGraph).adapter('wa-sqlite', create_graph_test_adapter);

    adapter = (await rxdb.connect('wa-sqlite')) as RxDBAdapterWaSqlite;
    rxdb.init();

    buddyRepo = adapter.getRepository(Buddy);
    routeRepo = adapter.getRepository(Route);
    stationRepo = adapter.getRepository(Station);
  });

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  describe('起点排除（findNeighbors 不返回起始节点）', () => {
    it('无向图 A-B 查 2 跳不返回起点 A', async () => {
      const alice = new Buddy({ name: 'Alice' });
      const bob = new Buddy({ name: 'Bob' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await buddyRepo.addEdge(alice, bob);

      const neighbors = await buddyRepo.findNeighbors({
        entityId: alice.id,
        level: 2
      });

      const ids = neighbors.map(n => n.node.id);
      expect(ids).not.toContain(alice.id);
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].node.name).toBe('Bob');
    });

    it('无向图三角形查 3 跳不返回起点，每个邻居只出现一次', async () => {
      const alice = new Buddy({ name: 'Alice' });
      const bob = new Buddy({ name: 'Bob' });
      const carol = new Buddy({ name: 'Carol' });
      await rxdb.entityManager.saveMany([alice, bob, carol]);

      await buddyRepo.addEdge(alice, bob);
      await buddyRepo.addEdge(bob, carol);
      await buddyRepo.addEdge(carol, alice);

      const neighbors = await buddyRepo.findNeighbors({
        entityId: alice.id,
        level: 3
      });

      const ids = neighbors.map(n => n.node.id);
      expect(ids).not.toContain(alice.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(neighbors).toHaveLength(2);
      neighbors.forEach(n => expect(n.level).toBe(1));
    });

    it('有向图环 A->B->A 查 2 跳不返回起点 A', async () => {
      const a = new Route({ name: 'A' });
      const b = new Route({ name: 'B' });
      await rxdb.entityManager.saveMany([a, b]);

      await routeRepo.addEdge(a, b, 1);
      await routeRepo.addEdge(b, a, 1);

      const neighbors = await routeRepo.findNeighbors({
        entityId: a.id,
        direction: 'out',
        level: 2
      });

      const ids = neighbors.map(n => n.node.id);
      expect(ids).not.toContain(a.id);
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].node.name).toBe('B');
    });

    it('countNeighbors 同样不计入起点', async () => {
      const alice = new Buddy({ name: 'Alice' });
      const bob = new Buddy({ name: 'Bob' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await buddyRepo.addEdge(alice, bob);

      const count = await buddyRepo.countNeighbors({
        entityId: alice.id,
        level: 2
      });
      expect(count).toBe(1);
    });
  });

  describe('有向图去重与最短层级', () => {
    it('A->B 与 A->C->B 只返回一个 B 且 level=1', async () => {
      const a = new Route({ name: 'A' });
      const b = new Route({ name: 'B' });
      const c = new Route({ name: 'C' });
      await rxdb.entityManager.saveMany([a, b, c]);

      await routeRepo.addEdge(a, b, 5);
      await routeRepo.addEdge(a, c, 1);
      await routeRepo.addEdge(c, b, 1);

      const neighbors = await routeRepo.findNeighbors({
        entityId: a.id,
        direction: 'out',
        level: 2
      });

      const bResults = neighbors.filter(n => n.node.id === b.id);
      expect(bResults).toHaveLength(1);
      expect(bResults[0].level).toBe(1);
      expect(neighbors).toHaveLength(2);
    });

    it('findNeighbors 数量与 countNeighbors 一致', async () => {
      const a = new Route({ name: 'A' });
      const b = new Route({ name: 'B' });
      const c = new Route({ name: 'C' });
      await rxdb.entityManager.saveMany([a, b, c]);

      await routeRepo.addEdge(a, b, 5);
      await routeRepo.addEdge(a, c, 1);
      await routeRepo.addEdge(c, b, 1);

      const neighbors = await routeRepo.findNeighbors({
        entityId: a.id,
        direction: 'out',
        level: 2
      });
      const count = await routeRepo.countNeighbors({
        entityId: a.id,
        direction: 'out',
        level: 2
      });

      expect(neighbors.length).toBe(count);
      expect(count).toBe(2);
    });
  });

  describe('排序（level 升序、同层 weight 升序）', () => {
    it('同层邻居按 weight 升序返回', async () => {
      const a = new Route({ name: 'A' });
      const heavy = new Route({ name: 'Heavy' });
      const light = new Route({ name: 'Light' });
      await rxdb.entityManager.saveMany([a, heavy, light]);

      await routeRepo.addEdge(a, heavy, 9);
      await routeRepo.addEdge(a, light, 1);

      const neighbors = await routeRepo.findNeighbors({
        entityId: a.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors.map(n => n.node.name)).toEqual(['Light', 'Heavy']);
    });
  });

  describe('findPaths 边属性', () => {
    it('启用 properties 后路径边包含 properties', async () => {
      const a = new Route({ name: 'A' });
      const b = new Route({ name: 'B' });
      await rxdb.entityManager.saveMany([a, b]);

      await routeRepo.addEdge(a, b, 3, {
        category: 'rail',
        active: true,
        since: new Date('2024-01-01T00:00:00.000Z')
      });

      const paths = await routeRepo.findPaths({
        fromId: a.id,
        toId: b.id,
        direction: 'out',
        maxDepth: 1
      });

      expect(paths).toHaveLength(1);
      expect(paths[0].edges).toHaveLength(1);
      const edge = paths[0].edges[0];
      expect(edge.weight).toBe(3);
      expect(edge.properties).toBeDefined();
      expect(edge.properties?.['category']).toBe('rail');
      expect(edge.properties?.['since']).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('edgeWhere 属性过滤（Date / boolean）', () => {
    it('Date 属性按 ISO 字符串匹配', async () => {
      const a = new Route({ name: 'A' });
      const b = new Route({ name: 'B' });
      const c = new Route({ name: 'C' });
      await rxdb.entityManager.saveMany([a, b, c]);

      await routeRepo.addEdge(a, b, 1, {
        category: 'rail',
        active: true,
        since: new Date('2024-01-01T00:00:00.000Z')
      });
      await routeRepo.addEdge(a, c, 1, {
        category: 'rail',
        active: true,
        since: new Date('2025-06-15T00:00:00.000Z')
      });

      const neighbors = await routeRepo.findNeighbors({
        entityId: a.id,
        direction: 'out',
        level: 1,
        edgeWhere: {
          properties: { since: new Date('2024-01-01T00:00:00.000Z') }
        }
      });

      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].node.name).toBe('B');
    });

    it('boolean 属性可过滤', async () => {
      const a = new Route({ name: 'A' });
      const b = new Route({ name: 'B' });
      const c = new Route({ name: 'C' });
      await rxdb.entityManager.saveMany([a, b, c]);

      await routeRepo.addEdge(a, b, 1, {
        category: 'rail',
        active: true,
        since: new Date('2024-01-01T00:00:00.000Z')
      });
      await routeRepo.addEdge(a, c, 1, {
        category: 'rail',
        active: false,
        since: new Date('2024-01-01T00:00:00.000Z')
      });

      const neighbors = await routeRepo.findNeighbors({
        entityId: a.id,
        direction: 'out',
        level: 1,
        edgeWhere: {
          properties: { active: true }
        }
      });

      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].node.name).toBe('B');
    });
  });

  describe('损坏边属性', () => {
    it('findNeighbors 遇到非法 JSON 时直接失败', async () => {
      const a = new Route({ name: 'A' });
      const b = new Route({ name: 'B' });
      const query = vi.spyOn(adapter, 'query').mockResolvedValueOnce({
        sql: 'findNeighbors',
        rowsAffected: 0,
        elapsed: 0,
        results: [
          {
            columns: [
              'id',
              'name',
              '_edge_sourceId',
              '_edge_targetId',
              '_edge_direction',
              '_edge_level',
              '_edge_weight',
              '_edge_properties'
            ],
            rows: [[b.id, b.name, a.id, b.id, 'out', 1, 1, '{invalid']]
          }
        ]
      });

      try {
        await expect(
          routeRepo.findNeighbors({
            entityId: a.id,
            direction: 'out',
            level: 1
          })
        ).rejects.toThrow();
      } finally {
        query.mockRestore();
      }
    });
  });

  describe('自定义 tableName', () => {
    it('findPaths 节点回填使用自定义表名', async () => {
      const s1 = new Station({ name: 'S1' });
      const s2 = new Station({ name: 'S2' });
      await rxdb.entityManager.saveMany([s1, s2]);

      await stationRepo.addEdge(s1, s2);

      const paths = await stationRepo.findPaths({
        fromId: s1.id,
        toId: s2.id,
        direction: 'out',
        maxDepth: 1
      });

      expect(paths).toHaveLength(1);
      expect(paths[0].nodes).toHaveLength(2);
      expect(paths[0].nodes.map(n => n.name)).toEqual(['S1', 'S2']);
    });
  });

  describe('自环边', () => {
    it('无向图自环只写入一条边，且起点不作为自己的邻居返回', async () => {
      const alice = new Buddy({ name: 'Alice' });
      await rxdb.entityManager.save(alice);

      await buddyRepo.addEdge(alice, alice);

      const edgeResult = await adapter.query(`SELECT COUNT(*) FROM "public$Buddy_edges"`, []);
      expect(edgeResult.results[0].rows[0][0]).toBe(1);

      const neighbors = await buddyRepo.findNeighbors({
        entityId: alice.id,
        level: 2
      });
      expect(neighbors).toHaveLength(0);

      const count = await buddyRepo.countNeighbors({
        entityId: alice.id,
        level: 2
      });
      expect(count).toBe(0);

      await buddyRepo.removeEdge(alice, alice);
      const afterRemove = await adapter.query(`SELECT COUNT(*) FROM "public$Buddy_edges"`, []);
      expect(afterRemove.results[0].rows[0][0]).toBe(0);
    });

    // 递归 CTE 的锚点行（depth=0、path_nodes=["a"]、cycle=0）同样满足 `currentId = toId`，
    // 于是被当成一条合法路径返回。调用方 `paths[0]` 取最短路径会拿到 `{nodes:[A], edges:[], length:0}`。
    it('fromId === toId 时不返回 0 长度的退化路径', async () => {
      const alice = new Buddy({ name: 'Alice' });
      const bob = new Buddy({ name: 'Bob' });
      await rxdb.entityManager.saveMany([alice, bob]);
      await buddyRepo.addEdge(alice, bob);

      const paths = await buddyRepo.findPaths({ fromId: alice.id, toId: alice.id, maxDepth: 3 });

      expect(paths.every(path => path.length > 0)).toBe(true);
      expect(paths.every(path => path.nodes.length > 1)).toBe(true);
    });

    it('fromId === toId 时仍返回真实环路', async () => {
      const alice = new Buddy({ name: 'Alice' });
      const bob = new Buddy({ name: 'Bob' });
      await rxdb.entityManager.saveMany([alice, bob]);
      await buddyRepo.addEdge(alice, bob);

      const paths = await buddyRepo.findPaths({ fromId: alice.id, toId: alice.id, maxDepth: 3 });

      // 无向图 A-B 构成 A→B→A 环路
      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0].nodes.map(node => node.name)).toEqual(['Alice', 'Bob', 'Alice']);
    });
  });

  describe('无向边事务原子性', () => {
    it('反向写入失败时回滚正向边', async () => {
      const alice = new Buddy({ name: 'Alice' });
      const bob = new Buddy({ name: 'Bob' });
      await rxdb.entityManager.saveMany([alice, bob]);
      await adapter.query(
        `CREATE TRIGGER "fail_reverse_edge_insert"
         BEFORE INSERT ON "public$Buddy_edges"
         WHEN NEW.sourceId = '${bob.id}' AND NEW.targetId = '${alice.id}'
         BEGIN
           SELECT RAISE(ABORT, 'reverse insert blocked');
         END`,
        []
      );

      try {
        await expect(buddyRepo.addEdge(alice, bob)).rejects.toThrow();
        const edgeResult = await adapter.query(`SELECT COUNT(*) FROM "public$Buddy_edges"`, []);
        expect(edgeResult.results[0].rows[0][0]).toBe(0);
      } finally {
        await adapter.query(`DROP TRIGGER IF EXISTS "fail_reverse_edge_insert"`, []);
      }
    });

    it('反向删除失败时回滚正向删除', async () => {
      const alice = new Buddy({ name: 'Alice' });
      const bob = new Buddy({ name: 'Bob' });
      await rxdb.entityManager.saveMany([alice, bob]);
      await buddyRepo.addEdge(alice, bob);
      await adapter.query(
        `CREATE TRIGGER "fail_reverse_edge_delete"
         BEFORE DELETE ON "public$Buddy_edges"
         WHEN OLD.sourceId = '${bob.id}' AND OLD.targetId = '${alice.id}'
         BEGIN
           SELECT RAISE(ABORT, 'reverse delete blocked');
         END`,
        []
      );

      try {
        await expect(buddyRepo.removeEdge(alice, bob)).rejects.toThrow();
        const edgeResult = await adapter.query(`SELECT COUNT(*) FROM "public$Buddy_edges"`, []);
        expect(edgeResult.results[0].rows[0][0]).toBe(2);
      } finally {
        await adapter.query(`DROP TRIGGER IF EXISTS "fail_reverse_edge_delete"`, []);
      }
    });
  });

  describe('addEdge 更新语义（S3：UPSERT 保持行身份稳定）', () => {
    it('重复 addEdge 更新权重时边行 id/createdAt 不变，变更日志记为 INSERT+UPDATE 而非重复 INSERT', async () => {
      const a = new Route({ name: 'A' });
      const b = new Route({ name: 'B' });
      await rxdb.entityManager.saveMany([a, b]);

      await routeRepo.addEdge(a, b, 1);

      const before = await adapter.query(
        `SELECT id, createdAt FROM "public$Route_edges" WHERE sourceId = ? AND targetId = ?`,
        [a.id, b.id]
      );
      expect(before.results[0].rows).toHaveLength(1);
      const [beforeId, beforeCreatedAt] = before.results[0].rows[0];

      await routeRepo.addEdge(a, b, 5);

      const after = await adapter.query(
        `SELECT id, createdAt, weight FROM "public$Route_edges" WHERE sourceId = ? AND targetId = ?`,
        [a.id, b.id]
      );
      expect(after.results[0].rows).toHaveLength(1);
      const [afterId, afterCreatedAt, afterWeight] = after.results[0].rows[0];
      expect(afterId).toBe(beforeId);
      expect(afterCreatedAt).toBe(beforeCreatedAt);
      expect(afterWeight).toBe(5);

      const changes = await adapter.query(
        `SELECT type FROM "rxdb$rxdb_change" WHERE entity = 'Route_edges' AND entityId = ? ORDER BY rowid ASC`,
        [encodeRxDBChangeEntityId(beforeId as RxDBEntityId)]
      );
      expect(changes.results[0].rows.map(r => r[0])).toEqual(['INSERT', 'UPDATE']);
    });
  });

  describe('edgeWhere 未启用特性校验（S6）', () => {
    it('无权无属性图上使用 edgeWhere.weight 应抛出可读错误而非底层 SQL 报错', async () => {
      const alice = new Buddy({ name: 'Alice' });
      const bob = new Buddy({ name: 'Bob' });
      await rxdb.entityManager.saveMany([alice, bob]);
      await buddyRepo.addEdge(alice, bob);

      await expect(
        buddyRepo.findNeighbors({
          entityId: alice.id,
          level: 1,
          edgeWhere: { weight: { min: 1 } }
        })
      ).rejects.toThrow(/features\.graph\.weight/);

      await expect(
        buddyRepo.countNeighbors({
          entityId: alice.id,
          level: 1,
          edgeWhere: { weight: { min: 1 } }
        })
      ).rejects.toThrow(/features\.graph\.weight/);

      await expect(
        buddyRepo.findPaths({
          fromId: alice.id,
          toId: bob.id,
          maxDepth: 1,
          edgeWhere: { weight: { min: 1 } }
        })
      ).rejects.toThrow(/features\.graph\.weight/);
    });

    it('无属性图上使用 edgeWhere.properties 应抛出可读错误而非底层 SQL 报错', async () => {
      const alice = new Buddy({ name: 'Alice' });
      const bob = new Buddy({ name: 'Bob' });
      await rxdb.entityManager.saveMany([alice, bob]);
      await buddyRepo.addEdge(alice, bob);

      await expect(
        buddyRepo.findNeighbors({
          entityId: alice.id,
          level: 1,
          edgeWhere: { properties: { category: 'x' } }
        })
      ).rejects.toThrow(/features\.graph\.properties/);
    });

    it('有权有属性图上正常使用 edgeWhere.weight/properties 不受影响', async () => {
      const a = new Route({ name: 'A' });
      const b = new Route({ name: 'B' });
      await rxdb.entityManager.saveMany([a, b]);
      await routeRepo.addEdge(a, b, 5, { category: 'rail', active: true, since: new Date('2024-01-01T00:00:00.000Z') });

      const neighbors = await routeRepo.findNeighbors({
        entityId: a.id,
        direction: 'out',
        level: 1,
        edgeWhere: { weight: { min: 1 }, properties: { category: 'rail' } }
      });
      expect(neighbors).toHaveLength(1);
    });
  });
});
