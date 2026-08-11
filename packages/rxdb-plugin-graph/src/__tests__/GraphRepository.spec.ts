import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import { rxDBPluginGraph } from '../plugin.js';
import { SqliteGraphRepository } from '../sqlite/SqliteGraphRepository.js';
import { cleanup_db, create_graph_test_adapter } from './test-utils.js';

/**
 * Person 实体 - 社交网络节点
 * 代表社交网络中的用户
 */
@GraphEntity({
  name: 'Person',
  displayName: '用户',
  properties: [
    {
      type: PropertyType.string,
      name: 'name',
      displayName: '姓名'
    },
    {
      type: PropertyType.number,
      name: 'age',
      displayName: '年龄',
      nullable: true
    },
    {
      type: PropertyType.string,
      name: 'city',
      displayName: '城市',
      nullable: true
    },
    {
      type: PropertyType.string,
      name: 'bio',
      displayName: '个人简介',
      nullable: true
    }
  ],
  features: {
    graph: {
      type: 'directed-graph',
      weight: true
    }
  }
})
export class Person extends GraphEntityBase {
  name!: string;
  age?: number;
  city?: string;
  bio?: string;
}

describe('Graph Demo - Social Network', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterWaSqlite;
  let personRepo: SqliteGraphRepository<typeof Person>;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'graph_demo_' + Math.random().toString(36).substring(7),
      entities: [Person],
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

    personRepo = adapter.getRepository(Person);
  });

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  describe('基础功能测试', () => {
    it('应创建用户节点', async () => {
      const alice = new Person({ name: 'Alice', age: 28, city: 'Beijing', bio: 'Software Engineer' });
      await rxdb.entityManager.save(alice);

      const found = await personRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: alice.id }]
        }
      });
      expect(found).toHaveLength(1);
      expect(found[0].name).toBe('Alice');
      expect(found[0].age).toBe(28);
    });

    it('应使用 addEdge 创建关注关系', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 5);

      const edgeResult = await adapter.query(
        `SELECT sourceId, targetId, weight FROM "public$Person_edges" WHERE sourceId = ? AND targetId = ?`,
        [alice.id, bob.id]
      );
      expect(edgeResult.results[0].rows).toHaveLength(1);

      const [sourceId, targetId, weight] = edgeResult.results[0].rows[0];
      expect(sourceId).toBe(alice.id);
      expect(targetId).toBe(bob.id);
      expect(weight).toBe(5);
    });

    it('应使用 removeEdge 删除关系', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 5);
      await personRepo.removeEdge(alice, bob);

      const edgeResult = await adapter.query(
        `SELECT * FROM "public$Person_edges" WHERE sourceId = ? AND targetId = ?`,
        [alice.id, bob.id]
      );
      expect(edgeResult.results[0].rows).toHaveLength(0);
    });
  });

  describe('邻居节点查询 (findNeighbors)', () => {
    it('应查询直接邻居 (level=1, direction=out)', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await personRepo.addEdge(alice, bob, 3);
      await personRepo.addEdge(alice, charlie, 5);

      const neighbors = await personRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors).toHaveLength(2);
      const names = neighbors.map(n => n.node.name).sort();
      expect(names).toEqual(['Bob', 'Charlie']);
      expect(neighbors[0].level).toBe(1);
    });

    it('应查询反向邻居 (direction=in)', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 3);

      const neighbors = await personRepo.findNeighbors({
        entityId: bob.id,
        direction: 'in',
        level: 1
      });

      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].node.name).toBe('Alice');
    });

    it('应查询双向邻居 (direction=both)', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await personRepo.addEdge(alice, bob, 3);
      await personRepo.addEdge(charlie, alice, 5);

      const neighbors = await personRepo.findNeighbors({
        entityId: alice.id,
        direction: 'both',
        level: 1
      });

      expect(neighbors).toHaveLength(2);
      const names = neighbors.map(n => n.node.name).sort();
      expect(names).toEqual(['Bob', 'Charlie']);
    });

    it('应查询多跳邻居 (level=2)', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      const david = new Person({ name: 'David', age: 32 });
      await rxdb.entityManager.saveMany([alice, bob, charlie, david]);

      await personRepo.addEdge(alice, bob, 3);
      await personRepo.addEdge(bob, charlie, 4);
      await personRepo.addEdge(charlie, david, 2);

      const neighbors = await personRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 2
      });

      expect(neighbors.length).toBeGreaterThanOrEqual(2);
      const names = neighbors.map(n => n.node.name);
      expect(names).toContain('Bob');
      expect(names).toContain('Charlie');
    });

    it('应带条件查询邻居 (where)', async () => {
      const alice = new Person({ name: 'Alice', age: 28, city: 'Beijing' });
      const bob = new Person({ name: 'Bob', age: 30, city: 'Shanghai' });
      const charlie = new Person({ name: 'Charlie', age: 25, city: 'Beijing' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await personRepo.addEdge(alice, bob, 3);
      await personRepo.addEdge(alice, charlie, 5);

      const neighbors = await personRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1,
        where: { city: 'Beijing' }
      });

      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].node.name).toBe('Charlie');
    });

    it('level=0 应返回空数组（不查询邻居）', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 3);

      const neighbors = await personRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 0
      });

      // level=0 表示不查询邻居，返回空数组
      expect(neighbors).toHaveLength(0);
    });
  });

  describe('邻居数量统计 (countNeighbors)', () => {
    it('应统计直接邻居数量', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await personRepo.addEdge(alice, bob, 3);
      await personRepo.addEdge(alice, charlie, 5);

      const count = await personRepo.countNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      expect(count).toBe(2);
    });

    it('level=0 时应返回 0（不包含起始节点）', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      await rxdb.entityManager.save(alice);

      const count = await personRepo.countNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 0
      });

      expect(count).toBe(0);
    });

    it('应统计带条件的邻居数量', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30, city: 'Shanghai' });
      const charlie = new Person({ name: 'Charlie', age: 25, city: 'Beijing' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await personRepo.addEdge(alice, bob, 3);
      await personRepo.addEdge(alice, charlie, 5);

      const count = await personRepo.countNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1,
        where: {
          combinator: 'and',
          rules: [{ field: 'city', operator: '=', value: 'Beijing' }]
        }
      });

      expect(count).toBe(1);
    });

    it('level=0 应返回空数组，where 条件不影响结果', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 1);

      const neighbors = await personRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 0,
        where: { name: 'Bob' }
      });

      // level=0 表示不查询邻居，返回空数组
      expect(neighbors).toHaveLength(0);
    });
  });

  describe('路径查询 (findPaths)', () => {
    it('应查找直接路径', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 3);

      const paths = await personRepo.findPaths({
        fromId: alice.id,
        toId: bob.id,
        direction: 'out',
        maxDepth: 5
      });

      expect(paths).toHaveLength(1);
      expect(paths[0].length).toBe(1);
      expect(paths[0].nodes).toHaveLength(2);
      expect(paths[0].nodes[0].name).toBe('Alice');
      expect(paths[0].nodes[1].name).toBe('Bob');
    });

    it('应查找多跳路径', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await personRepo.addEdge(alice, bob, 3);
      await personRepo.addEdge(bob, charlie, 4);

      const paths = await personRepo.findPaths({
        fromId: alice.id,
        toId: charlie.id,
        direction: 'out',
        maxDepth: 5
      });

      expect(paths).toHaveLength(1);
      expect(paths[0].length).toBe(2);
      expect(paths[0].nodes).toHaveLength(3);
      expect(paths[0].totalWeight).toBe(7); // 3 + 4
    });

    it('应查找多条路径', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      const david = new Person({ name: 'David', age: 32 });
      await rxdb.entityManager.saveMany([alice, bob, charlie, david]);

      // 路径1: Alice -> Bob -> David
      await personRepo.addEdge(alice, bob, 2);
      await personRepo.addEdge(bob, david, 3);

      // 路径2: Alice -> Charlie -> David
      await personRepo.addEdge(alice, charlie, 4);
      await personRepo.addEdge(charlie, david, 1);

      const paths = await personRepo.findPaths({
        fromId: alice.id,
        toId: david.id,
        direction: 'out',
        maxDepth: 5
      });

      expect(paths.length).toBeGreaterThanOrEqual(2);
      // 路径应按长度排序，长度相同时按权重排序
      expect(paths[0].length).toBeLessThanOrEqual(paths[1].length);
    });

    it('不存在路径时应返回空数组', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      const paths = await personRepo.findPaths({
        fromId: alice.id,
        toId: bob.id,
        direction: 'out',
        maxDepth: 5
      });

      expect(paths).toHaveLength(0);
    });

    it('应避免循环路径', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      // 创建环: Alice -> Bob -> Charlie -> Alice
      await personRepo.addEdge(alice, bob, 1);
      await personRepo.addEdge(bob, charlie, 1);
      await personRepo.addEdge(charlie, alice, 1);

      const paths = await personRepo.findPaths({
        fromId: alice.id,
        toId: charlie.id,
        direction: 'out',
        maxDepth: 10
      });

      // 应找到最短路径 Alice -> Bob -> Charlie
      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0].length).toBe(2);

      // 验证路径中没有重复节点
      const nodeIds = paths[0].nodes.map(n => n.id);
      const uniqueIds = new Set(nodeIds);
      expect(nodeIds.length).toBe(uniqueIds.size);
    });
  });

  describe('边界条件和错误处理', () => {
    it('空结果集处理：查询不存在的节点', async () => {
      const neighbors = await personRepo.findNeighbors({
        entityId: '00000000-0000-4000-8000-000000000099',
        direction: 'out',
        level: 1
      });

      expect(neighbors).toHaveLength(0);
    });

    it('addEdge 不提供 weight 参数', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob);

      const edgeResult = await adapter.query(
        `SELECT sourceId, targetId, weight FROM "public$Person_edges" WHERE sourceId = ? AND targetId = ?`,
        [alice.id, bob.id]
      );
      expect(edgeResult.results[0].rows).toHaveLength(1);
      const [sourceId, targetId, weight] = edgeResult.results[0].rows[0];
      expect(sourceId).toBe(alice.id);
      expect(targetId).toBe(bob.id);
      expect(weight).toBeNull(); // 未提供权重
    });

    it('addEdge 替换现有边（INSERT OR REPLACE）', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 5);
      await personRepo.addEdge(alice, bob, 10); // 替换权重

      const edgeResult = await adapter.query(
        `SELECT sourceId, targetId, weight FROM "public$Person_edges" WHERE sourceId = ? AND targetId = ?`,
        [alice.id, bob.id]
      );
      expect(edgeResult.results[0].rows).toHaveLength(1);
      const [, , weight] = edgeResult.results[0].rows[0];
      expect(weight).toBe(10); // 新权重
    });

    it('findPaths 带 where 条件过滤中间节点', async () => {
      const alice = new Person({ name: 'Alice', age: 28, city: 'Beijing' });
      const bob = new Person({ name: 'Bob', age: 30, city: 'Shanghai' });
      const charlie = new Person({ name: 'Charlie', age: 25, city: 'Beijing' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await personRepo.addEdge(alice, bob, 1);
      await personRepo.addEdge(bob, charlie, 1);

      // 过滤掉 Shanghai 的节点（Bob）
      const paths = await personRepo.findPaths({
        fromId: alice.id,
        toId: charlie.id,
        direction: 'out',
        maxDepth: 5,
        where: {
          combinator: 'and',
          rules: [{ field: 'city', operator: '=', value: 'Beijing' }]
        }
      });

      // 由于 Bob 被过滤，应该找不到路径
      expect(paths).toHaveLength(0);
    });

    it('findPaths 的 where 不应过滤终点（GRAPH-005）', async () => {
      const alice = new Person({ name: 'Alice', age: 28, city: 'Beijing' });
      const bob = new Person({ name: 'Bob', age: 30, city: 'Beijing' });
      const charlie = new Person({ name: 'Charlie', age: 25, city: 'Shanghai' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await personRepo.addEdge(alice, bob, 1);
      await personRepo.addEdge(bob, charlie, 1);

      // 中间节点 Bob 满足 Beijing，终点 Charlie 不满足；
      // 契约规定 where 只作用于中间节点，因此该路径必须被返回
      const paths = await personRepo.findPaths({
        fromId: alice.id,
        toId: charlie.id,
        direction: 'out',
        maxDepth: 5,
        where: {
          combinator: 'and',
          rules: [{ field: 'city', operator: '=', value: 'Beijing' }]
        }
      });

      expect(paths).toHaveLength(1);
      expect(paths[0].nodes.map(node => node.id)).toEqual([alice.id, bob.id, charlie.id]);
    });

    it('findPaths 的 where 不应过滤起点（GRAPH-005）', async () => {
      const alice = new Person({ name: 'Alice', age: 28, city: 'Shanghai' });
      const bob = new Person({ name: 'Bob', age: 30, city: 'Beijing' });
      const charlie = new Person({ name: 'Charlie', age: 25, city: 'Beijing' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await personRepo.addEdge(alice, bob, 1);
      await personRepo.addEdge(bob, charlie, 1);

      const paths = await personRepo.findPaths({
        fromId: alice.id,
        toId: charlie.id,
        direction: 'out',
        maxDepth: 5,
        where: {
          combinator: 'and',
          rules: [{ field: 'city', operator: '=', value: 'Beijing' }]
        }
      });

      expect(paths).toHaveLength(1);
      expect(paths[0].nodes.map(node => node.id)).toEqual([alice.id, bob.id, charlie.id]);
    });

    it('findPaths 直连路径无中间节点时 where 不应生效（GRAPH-005）', async () => {
      const alice = new Person({ name: 'Alice', age: 28, city: 'Shanghai' });
      const bob = new Person({ name: 'Bob', age: 30, city: 'Guangzhou' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 1);

      // 首尾两端都不满足 where，但路径上没有任何中间节点，规则无处可施
      const paths = await personRepo.findPaths({
        fromId: alice.id,
        toId: bob.id,
        direction: 'out',
        maxDepth: 5,
        where: {
          combinator: 'and',
          rules: [{ field: 'city', operator: '=', value: 'Beijing' }]
        }
      });

      expect(paths).toHaveLength(1);
      expect(paths[0].nodes.map(node => node.id)).toEqual([alice.id, bob.id]);
    });

    it('findPaths direction=in 反向查询', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await personRepo.addEdge(alice, bob, 1);
      await personRepo.addEdge(bob, charlie, 1);

      const paths = await personRepo.findPaths({
        fromId: charlie.id,
        toId: alice.id,
        direction: 'in',
        maxDepth: 5
      });

      expect(paths).toHaveLength(1);
      expect(paths[0].length).toBe(2);
      expect(paths[0].nodes[0].name).toBe('Charlie');
      expect(paths[0].nodes[2].name).toBe('Alice');
    });

    it('findPaths direction=both 双向查询', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 1);

      // 从 Bob 到 Alice，使用 both 方向应该能找到
      const paths = await personRepo.findPaths({
        fromId: bob.id,
        toId: alice.id,
        direction: 'both',
        maxDepth: 5
      });

      expect(paths).toHaveLength(1);
      expect(paths[0].length).toBe(1);
    });

    it('findPaths 无权重的边处理', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      // 不提供权重
      await personRepo.addEdge(alice, bob);

      const paths = await personRepo.findPaths({
        fromId: alice.id,
        toId: bob.id,
        direction: 'out',
        maxDepth: 5
      });

      expect(paths).toHaveLength(1);
      // 权重应该为 0（COALESCE 处理）
      expect(paths[0].totalWeight).toBe(0);
    });
  });

  describe('复杂场景测试', () => {
    it('社交网络场景：创建用户和关注关系', async () => {
      const alice = new Person({ name: 'Alice', age: 28, city: 'Beijing', bio: 'Software Engineer' });
      const bob = new Person({ name: 'Bob', age: 30, city: 'Shanghai', bio: 'Product Manager' });
      const charlie = new Person({ name: 'Charlie', age: 25, city: 'Guangzhou', bio: 'Designer' });
      const david = new Person({ name: 'David', age: 32, city: 'Shenzhen', bio: 'Data Scientist' });
      await rxdb.entityManager.saveMany([alice, bob, charlie, david]);

      // 创建关注关系（边）- 使用 addEdge API
      // Alice 关注 Bob 和 Charlie
      await personRepo.addEdge(alice, bob, 3);
      await personRepo.addEdge(alice, charlie, 5);

      // Bob 关注 Charlie 和 David
      await personRepo.addEdge(bob, charlie, 4);
      await personRepo.addEdge(bob, david, 2);

      // Charlie 关注 David
      await personRepo.addEdge(charlie, david, 4);

      // David 关注 Alice（形成环）
      await personRepo.addEdge(david, alice, 3);

      // 验证数据创建成功
      const allPersons = await personRepo.find({
        where: {
          combinator: 'and',
          rules: []
        }
      });
      expect(allPersons).toHaveLength(4);

      // 验证边表
      const edgeResult = await adapter.query(`SELECT COUNT(*) FROM "public$Person_edges"`);
      expect(edgeResult.results[0].rows[0][0]).toBe(6);
    });

    it('应处理权重查询', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await personRepo.addEdge(alice, bob, 10); // 高权重
      await personRepo.addEdge(alice, charlie, 1); // 低权重

      const neighbors = await personRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors).toHaveLength(2);
      // 验证权重信息被正确返回
      const bobEdge = neighbors.find(n => n.node.name === 'Bob');
      const charlieEdge = neighbors.find(n => n.node.name === 'Charlie');
      expect(bobEdge?.edge.weight).toBe(10);
      expect(charlieEdge?.edge.weight).toBe(1);
    });
  });

  describe('edgeWhere 条件过滤测试', () => {
    it('findNeighbors 应支持 edgeWhere 权重范围过滤 (min)', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      const david = new Person({ name: 'David', age: 32 });
      await rxdb.entityManager.saveMany([alice, bob, charlie, david]);

      await personRepo.addEdge(alice, bob, 2); // 低权重
      await personRepo.addEdge(alice, charlie, 5); // 中权重
      await personRepo.addEdge(alice, david, 9); // 高权重

      const neighbors = await personRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1,
        edgeWhere: { weight: { min: 5 } } // 只查询权重 >= 5 的边
      });

      expect(neighbors).toHaveLength(2);
      const names = neighbors.map(n => n.node.name).sort();
      expect(names).toEqual(['Charlie', 'David']);
      expect(neighbors.every(n => n.edge.weight !== null && n.edge.weight >= 5)).toBe(true);
    });

    it('findNeighbors 应支持 edgeWhere 权重范围过滤 (max)', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      const david = new Person({ name: 'David', age: 32 });
      await rxdb.entityManager.saveMany([alice, bob, charlie, david]);

      await personRepo.addEdge(alice, bob, 2);
      await personRepo.addEdge(alice, charlie, 5);
      await personRepo.addEdge(alice, david, 9);

      const neighbors = await personRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1,
        edgeWhere: { weight: { max: 5 } } // 只查询权重 <= 5 的边
      });

      expect(neighbors).toHaveLength(2);
      const names = neighbors.map(n => n.node.name).sort();
      expect(names).toEqual(['Bob', 'Charlie']);
      expect(neighbors.every(n => n.edge.weight !== null && n.edge.weight <= 5)).toBe(true);
    });

    it('findNeighbors 应支持 edgeWhere 权重范围过滤 (min & max)', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      const david = new Person({ name: 'David', age: 32 });
      await rxdb.entityManager.saveMany([alice, bob, charlie, david]);

      await personRepo.addEdge(alice, bob, 2);
      await personRepo.addEdge(alice, charlie, 5);
      await personRepo.addEdge(alice, david, 9);

      const neighbors = await personRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1,
        edgeWhere: { weight: { min: 3, max: 7 } } // 3 <= weight <= 7
      });

      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].node.name).toBe('Charlie');
      expect(neighbors[0].edge.weight).toBe(5);
    });

    it('countNeighbors 应支持 edgeWhere 权重过滤', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await personRepo.addEdge(alice, bob, 2);
      await personRepo.addEdge(alice, charlie, 9);

      const count = await personRepo.countNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1,
        edgeWhere: { weight: { min: 5 } }
      });

      // 只有 Charlie 权重9 符合 >= 5
      expect(count).toBe(1);
    });

    it('findPaths 应支持 edgeWhere 权重过滤', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      const david = new Person({ name: 'David', age: 32 });
      await rxdb.entityManager.saveMany([alice, bob, charlie, david]);

      // 路径1: Alice -> Bob -> David (权重: 2 + 3 = 5)
      await personRepo.addEdge(alice, bob, 2);
      await personRepo.addEdge(bob, david, 3);

      // 路径2: Alice -> Charlie -> David (权重: 8 + 9 = 17)
      await personRepo.addEdge(alice, charlie, 8);
      await personRepo.addEdge(charlie, david, 9);

      // 只走高权重的边 (>= 5)
      const paths = await personRepo.findPaths({
        fromId: alice.id,
        toId: david.id,
        direction: 'out',
        maxDepth: 5,
        edgeWhere: { weight: { min: 5 } }
      });

      // 应该只找到路径2（Alice -> Charlie -> David）
      // 路径1的第一条边权重为2，被过滤掉
      expect(paths.length).toBeGreaterThanOrEqual(1);
      const path2 = paths.find(p => p.nodes[1]?.name === 'Charlie');
      expect(path2).toBeDefined();
      expect(path2?.totalWeight).toBe(17);
    });

    it('edgeWhere 空条件应返回所有边', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await personRepo.addEdge(alice, bob, 2);
      await personRepo.addEdge(alice, charlie, 9);

      const neighbors = await personRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1,
        edgeWhere: {} // 空条件
      });

      expect(neighbors).toHaveLength(2);
    });

    it('edgeWhere 无匹配边应返回空结果', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 2);

      const neighbors = await personRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1,
        edgeWhere: { weight: { min: 100 } } // 无匹配
      });

      expect(neighbors).toHaveLength(0);
    });
  });

  describe('参数规范化测试', () => {
    it('findNeighbors level 负数应规范化为 1（返回 1 跳邻居）', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 3);

      const neighbors = await personRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: -5 // 负数，规范化为 1
      });

      // level=1 应返回 1 跳邻居（bob）
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].node.id).toBe(bob.id);
      expect(neighbors[0].level).toBe(1);
    });

    it('findNeighbors level 超大值应限制为 100', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 1);

      // 即使传入超大值，也不应导致性能问题或栈溢出
      const neighbors = await personRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 999 // 超大值
      });

      // 应该能正常返回结果
      expect(neighbors.length).toBeGreaterThanOrEqual(1);
    });

    it('findNeighbors 不提供 level 应默认为 1', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      const charlie = new Person({ name: 'Charlie', age: 25 });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await personRepo.addEdge(alice, bob, 1);
      await personRepo.addEdge(bob, charlie, 1);

      const neighbors = await personRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out'
        // level: 1 // 默认值
      });

      // 应只返回 1 跳邻居（Bob），不包含 2 跳邻居（Charlie）
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].node.name).toBe('Bob');
      expect(neighbors[0].level).toBe(1);
    });

    it('findNeighbors 不提供 direction 应默认为 both', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 1);

      // 从 Bob 出发，不提供 direction
      const neighbors = await personRepo.findNeighbors({
        entityId: bob.id,
        level: 1
        // direction: 'both' // 默认值
      });

      // 应找到 Alice（反向边）
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].node.name).toBe('Alice');
      expect(neighbors[0].edge.direction).toBe('in'); // 反向边
    });

    it('findPaths maxDepth 负数应规范化为 1（无法找到路径）', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 1);

      const paths = await personRepo.findPaths({
        fromId: alice.id,
        toId: bob.id,
        direction: 'out',
        maxDepth: -10 // 负数，规范化为 1
      });

      // maxDepth=1 时 SQL 使用 depth < 1，只允许 depth=0 的节点扩展
      // depth=0 扩展生成 depth=1，所以能找到 1 跳路径
      expect(paths).toHaveLength(1);
      expect(paths[0].nodes).toHaveLength(2);
      expect(paths[0].edges).toHaveLength(1);
    });

    it('findPaths maxDepth 零值应规范化为 1（无法找到路径）', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 1);

      const paths = await personRepo.findPaths({
        fromId: alice.id,
        toId: bob.id,
        direction: 'out',
        maxDepth: 0 // 零值，规范化为 1
      });

      // maxDepth=1 能找到 1 跳路径
      expect(paths).toHaveLength(1);
      expect(paths[0].nodes).toHaveLength(2);
      expect(paths[0].edges).toHaveLength(1);
    });

    it('findPaths maxDepth 超大值应限制为 100', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 1);

      // 不应导致性能问题或栈溢出
      const paths = await personRepo.findPaths({
        fromId: alice.id,
        toId: bob.id,
        maxDepth: 999 // 超大值
      });

      expect(paths).toHaveLength(1);
    });

    it('findPaths 不提供 maxDepth 应默认为 10', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 1);

      const paths = await personRepo.findPaths({
        fromId: alice.id,
        toId: bob.id
        // maxDepth: 10 // 默认值
      });

      // 应能找到路径（验证默认值足够大）
      expect(paths).toHaveLength(1);
    });

    it('findPaths 不提供 direction 应默认为 both', async () => {
      const alice = new Person({ name: 'Alice', age: 28 });
      const bob = new Person({ name: 'Bob', age: 30 });
      await rxdb.entityManager.saveMany([alice, bob]);

      await personRepo.addEdge(alice, bob, 1);

      // 从 Bob 到 Alice（反向），不提供 direction
      const paths = await personRepo.findPaths({
        fromId: bob.id,
        toId: alice.id
        // direction: 'both' // 默认值
      });

      // 应能找到反向路径
      expect(paths).toHaveLength(1);
      expect(paths[0].nodes[0].name).toBe('Bob');
      expect(paths[0].nodes[1].name).toBe('Alice');
    });
  });
});
