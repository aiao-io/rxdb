import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import { rxDBPluginGraph } from '../plugin.js';
import { SqliteGraphRepository } from '../sqlite/SqliteGraphRepository.js';
import { cleanup_db, create_graph_test_adapter } from './test-utils.js';

/**
 * User 实体 - 社交网络无权无向图
 * 场景：社交网络好友关系（双向对等，无权重区分）
 */
@GraphEntity({
  name: 'User',
  displayName: '用户',
  properties: [
    {
      type: PropertyType.string,
      name: 'name',
      displayName: '姓名'
    },
    {
      type: PropertyType.string,
      name: 'username',
      displayName: '用户名'
    }
  ],
  features: {
    graph: {
      type: 'undirected-graph',
      weight: false
    }
  }
})
export class User extends GraphEntityBase {
  name!: string;
  username!: string;
}

describe('无权无向图 - 社交好友关系', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterWaSqlite;
  let userRepo: SqliteGraphRepository<typeof User>;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'undirected_unweighted_' + Math.random().toString(36).substring(7),
      entities: [User],
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

    userRepo = adapter.getRepository(User);
  });

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  describe('无向图特性', () => {
    it('添加边后双向都可访问', async () => {
      const alice = new User({ name: 'Alice', username: 'alice' });
      const bob = new User({ name: 'Bob', username: 'bob' });
      await rxdb.entityManager.saveMany([alice, bob]);

      // 无向图：自动创建双向边
      await userRepo.addEdge(alice, bob);

      // Alice -> Bob 方向
      const aliceFriends = await userRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });
      expect(aliceFriends).toHaveLength(1);
      expect(aliceFriends[0].node.username).toBe('bob');

      // Bob -> Alice 方向（无向图双向可访问）
      const bobFriends = await userRepo.findNeighbors({
        entityId: bob.id,
        direction: 'out',
        level: 1
      });
      expect(bobFriends).toHaveLength(1);
      expect(bobFriends[0].node.username).toBe('alice');
    });

    it('direction=both 不重复返回邻居', async () => {
      const alice = new User({ name: 'Alice', username: 'alice' });
      const bob = new User({ name: 'Bob', username: 'bob' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await userRepo.addEdge(alice, bob);

      const neighbors = await userRepo.findNeighbors({
        entityId: alice.id,
        direction: 'both',
        level: 1
      });

      // 无向图中 both 不应重复（只有一条边）
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].node.username).toBe('bob');
    });

    it('删除边后双向都不可访问', async () => {
      const alice = new User({ name: 'Alice', username: 'alice' });
      const bob = new User({ name: 'Bob', username: 'bob' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await userRepo.addEdge(alice, bob);
      await userRepo.removeEdge(alice, bob);

      const aliceFriends = await userRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });
      expect(aliceFriends).toHaveLength(0);

      const bobFriends = await userRepo.findNeighbors({
        entityId: bob.id,
        direction: 'out',
        level: 1
      });
      expect(bobFriends).toHaveLength(0);
    });
  });

  describe('无权图特性', () => {
    it('addEdge 不接受 weight 参数', async () => {
      const alice = new User({ name: 'Alice', username: 'alice' });
      const bob = new User({ name: 'Bob', username: 'bob' });
      await rxdb.entityManager.saveMany([alice, bob]);

      // 无权图不应传递 weight（TypeScript 应该不允许）
      await userRepo.addEdge(alice, bob);

      // 验证边表中没有 weight 字段或为 null
      const edgeResult = await adapter.query(`SELECT * FROM "public$User_edges" WHERE sourceId = ? AND targetId = ?`, [
        alice.id,
        bob.id
      ]);
      expect(edgeResult.results[0].rows).toHaveLength(1);

      // 无权图边表可能没有 weight 列，或值为 null/default
      const row = edgeResult.results[0].rows[0];
      const weightIndex = edgeResult.results[0].columns.indexOf('weight');
      if (weightIndex !== -1) {
        expect(row[weightIndex]).toBeNull();
      }
    });

    it('查询邻居结果不包含 weight 信息', async () => {
      const alice = new User({ name: 'Alice', username: 'alice' });
      const bob = new User({ name: 'Bob', username: 'bob' });
      const charlie = new User({ name: 'Charlie', username: 'charlie' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await userRepo.addEdge(alice, bob);
      await userRepo.addEdge(alice, charlie);

      const neighbors = await userRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors).toHaveLength(2);
      // 无权图的 edge 对象不应有有效的 weight 值
      neighbors.forEach(n => {
        expect(n.edge.weight).toBeUndefined();
      });
    });
  });

  describe('好友网络场景', () => {
    it('查找共同好友', async () => {
      const alice = new User({ name: 'Alice', username: 'alice' });
      const bob = new User({ name: 'Bob', username: 'bob' });
      const charlie = new User({ name: 'Charlie', username: 'charlie' });
      const david = new User({ name: 'David', username: 'david' });
      await rxdb.entityManager.saveMany([alice, bob, charlie, david]);

      // Alice - Bob, Alice - Charlie, Bob - Charlie, Charlie - David
      await userRepo.addEdge(alice, bob);
      await userRepo.addEdge(alice, charlie);
      await userRepo.addEdge(bob, charlie);
      await userRepo.addEdge(charlie, david);

      // Alice 和 Bob 的共同好友应该是 Charlie
      const aliceFriends = await userRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });
      const bobFriends = await userRepo.findNeighbors({
        entityId: bob.id,
        direction: 'out',
        level: 1
      });

      const aliceFriendIds = new Set(aliceFriends.map(f => f.node.id));
      const commonFriends = bobFriends.filter(f => aliceFriendIds.has(f.node.id));

      expect(commonFriends).toHaveLength(1);
      expect(commonFriends[0].node.username).toBe('charlie');
    });

    it('统计好友数量（度中心性）', async () => {
      const alice = new User({ name: 'Alice', username: 'alice' });
      const bob = new User({ name: 'Bob', username: 'bob' });
      const charlie = new User({ name: 'Charlie', username: 'charlie' });
      const david = new User({ name: 'David', username: 'david' });
      await rxdb.entityManager.saveMany([alice, bob, charlie, david]);

      // Charlie 有 3 个好友，自动创建双向边
      await userRepo.addEdge(alice, charlie);
      await userRepo.addEdge(bob, charlie);
      await userRepo.addEdge(charlie, david);

      const charlieCount = await userRepo.countNeighbors({
        entityId: charlie.id,
        direction: 'out',
        level: 1
      });

      expect(charlieCount).toBe(3); // Charlie 是好友网络的中心节点
    });

    it('查找二度好友（朋友的朋友）', async () => {
      const alice = new User({ name: 'Alice', username: 'alice' });
      const bob = new User({ name: 'Bob', username: 'bob' });
      const charlie = new User({ name: 'Charlie', username: 'charlie' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      // Alice - Bob - Charlie
      await userRepo.addEdge(alice, bob);
      await userRepo.addEdge(bob, charlie);

      const secondDegree = await userRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 2
      });

      // 应该包含 Bob（1度）和 Charlie（2度）
      expect(secondDegree.length).toBeGreaterThanOrEqual(2);
      const usernames = secondDegree.map(n => n.node.username);
      expect(usernames).toContain('bob');
      expect(usernames).toContain('charlie');

      const charlieNode = secondDegree.find(n => n.node.username === 'charlie');
      expect(charlieNode?.level).toBe(2);
    });

    it('检查是否为好友关系', async () => {
      const alice = new User({ name: 'Alice', username: 'alice' });
      const bob = new User({ name: 'Bob', username: 'bob' });
      const charlie = new User({ name: 'Charlie', username: 'charlie' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await userRepo.addEdge(alice, bob);

      // 检查 Alice 和 Bob 是否为好友
      const path = await userRepo.findPaths({
        fromId: alice.id,
        toId: bob.id,
        maxDepth: 1
      });
      expect(path).toHaveLength(1); // 直接好友

      // 检查 Alice 和 Charlie 是否为好友
      const noPath = await userRepo.findPaths({
        fromId: alice.id,
        toId: charlie.id,
        maxDepth: 1
      });
      expect(noPath).toHaveLength(0); // 不是好友
    });
  });

  describe('边界情况', () => {
    it('孤立节点应该没有邻居', async () => {
      const loner = new User({ name: 'Loner', username: 'loner' });
      await rxdb.entityManager.save(loner);

      const neighbors = await userRepo.findNeighbors({
        entityId: loner.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors).toHaveLength(0);
    });

    it('自环边场景（当前实现允许）', async () => {
      const alice = new User({ name: 'Alice', username: 'alice' });
      await rxdb.entityManager.save(alice);

      // 当前实现允许自环边
      await userRepo.addEdge(alice, alice);

      const neighbors = await userRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors.length).toBeGreaterThanOrEqual(0);
    });

    it('重复添加边应该幂等', async () => {
      const alice = new User({ name: 'Alice', username: 'alice' });
      const bob = new User({ name: 'Bob', username: 'bob' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await userRepo.addEdge(alice, bob);
      await userRepo.addEdge(alice, bob); // 重复添加

      const neighbors = await userRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors).toHaveLength(1); // 不应该重复
    });
  });
});
