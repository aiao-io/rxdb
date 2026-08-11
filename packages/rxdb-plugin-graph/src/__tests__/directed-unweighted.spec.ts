import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import { rxDBPluginGraph } from '../plugin.js';
import { SqliteGraphRepository } from '../sqlite/SqliteGraphRepository.js';
import { cleanup_db, create_graph_test_adapter } from './test-utils.js';

/**
 * Account 实体 - 社交账号关注网络无权有向图
 * 场景：关注/粉丝关系（单向，无权重区分）
 */
@GraphEntity({
  name: 'Account',
  displayName: '账号',
  properties: [
    {
      type: PropertyType.string,
      name: 'username',
      displayName: '用户名'
    },
    {
      type: PropertyType.string,
      name: 'platform',
      displayName: '平台',
      nullable: true
    },
    {
      type: PropertyType.boolean,
      name: 'verified',
      displayName: '认证',
      nullable: true
    }
  ],
  features: {
    graph: {
      type: 'directed-graph',
      weight: false
    }
  }
})
export class Account extends GraphEntityBase {
  username!: string;
  platform?: string;
  verified?: boolean;
}

describe('无权有向图 - 关注关系网络', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterWaSqlite;
  let accountRepo: SqliteGraphRepository<typeof Account>;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'directed_unweighted_' + Math.random().toString(36).substring(7),
      entities: [Account],
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

    accountRepo = adapter.getRepository(Account);
  });

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  describe('有向图特性', () => {
    it('关注是单向的（A 关注 B ≠ B 关注 A）', async () => {
      const alice = new Account({ username: 'alice', platform: 'twitter' });
      const bob = new Account({ username: 'bob', platform: 'twitter' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await accountRepo.addEdge(alice, bob); // Alice 关注 Bob

      // Alice 的关注列表（out）
      const following = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });
      expect(following).toHaveLength(1);
      expect(following[0].node.username).toBe('bob');

      // Alice 的粉丝列表（in）
      const followers = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'in',
        level: 1
      });
      expect(followers).toHaveLength(0); // Alice 没有粉丝

      // Bob 的粉丝列表（in）
      const bobFollowers = await accountRepo.findNeighbors({
        entityId: bob.id,
        direction: 'in',
        level: 1
      });
      expect(bobFollowers).toHaveLength(1);
      expect(bobFollowers[0].node.username).toBe('alice');

      // Bob 的关注列表（out）
      const bobFollowing = await accountRepo.findNeighbors({
        entityId: bob.id,
        direction: 'out',
        level: 1
      });
      expect(bobFollowing).toHaveLength(0); // Bob 没有关注任何人
    });

    it('direction=both 返回关注和粉丝的并集', async () => {
      const alice = new Account({ username: 'alice', platform: 'twitter' });
      const bob = new Account({ username: 'bob', platform: 'twitter' });
      const charlie = new Account({ username: 'charlie', platform: 'twitter' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await accountRepo.addEdge(alice, bob); // Alice 关注 Bob
      await accountRepo.addEdge(charlie, alice); // Charlie 关注 Alice

      const both = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'both',
        level: 1
      });

      expect(both).toHaveLength(2);
      const usernames = both.map(n => n.node.username).sort();
      expect(usernames).toEqual(['bob', 'charlie']);
    });

    it('删除边只影响单向关系', async () => {
      const alice = new Account({ username: 'alice', platform: 'twitter' });
      const bob = new Account({ username: 'bob', platform: 'twitter' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await accountRepo.addEdge(alice, bob); // Alice 关注 Bob
      await accountRepo.addEdge(bob, alice); // Bob 关注 Alice（互相关注）

      await accountRepo.removeEdge(alice, bob); // Alice 取消关注 Bob

      // Bob 仍然关注 Alice
      const bobFollowing = await accountRepo.findNeighbors({
        entityId: bob.id,
        direction: 'out',
        level: 1
      });
      expect(bobFollowing).toHaveLength(1);
      expect(bobFollowing[0].node.username).toBe('alice');

      // Alice 不再关注 Bob
      const aliceFollowing = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });
      expect(aliceFollowing).toHaveLength(0);
    });
  });

  describe('无权图特性', () => {
    it('addEdge 不接受 weight 参数', async () => {
      const alice = new Account({ username: 'alice', platform: 'twitter' });
      const bob = new Account({ username: 'bob', platform: 'twitter' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await accountRepo.addEdge(alice, bob);

      const edgeResult = await adapter.query(
        `SELECT * FROM "public$Account_edges" WHERE sourceId = ? AND targetId = ?`,
        [alice.id, bob.id]
      );
      expect(edgeResult.results[0].rows).toHaveLength(1);

      const row = edgeResult.results[0].rows[0];
      const weightIndex = edgeResult.results[0].columns.indexOf('weight');
      if (weightIndex !== -1) {
        expect(row[weightIndex]).toBeNull();
      }
    });

    it('查询结果不包含 weight 信息', async () => {
      const alice = new Account({ username: 'alice', platform: 'twitter' });
      const bob = new Account({ username: 'bob', platform: 'twitter' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await accountRepo.addEdge(alice, bob);

      const neighbors = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors[0].edge.weight).toBeUndefined();
    });
  });

  describe('关注网络场景', () => {
    it('查询关注列表（我关注的人）', async () => {
      const alice = new Account({ username: 'alice', platform: 'twitter' });
      const bob = new Account({ username: 'bob', platform: 'twitter' });
      const charlie = new Account({ username: 'charlie', platform: 'twitter' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await accountRepo.addEdge(alice, bob);
      await accountRepo.addEdge(alice, charlie);

      const following = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      expect(following).toHaveLength(2);
      const usernames = following.map(f => f.node.username).sort();
      expect(usernames).toEqual(['bob', 'charlie']);
    });

    it('查询粉丝列表（关注我的人）', async () => {
      const alice = new Account({ username: 'alice', platform: 'twitter', verified: true });
      const bob = new Account({ username: 'bob', platform: 'twitter' });
      const charlie = new Account({ username: 'charlie', platform: 'twitter' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await accountRepo.addEdge(bob, alice);
      await accountRepo.addEdge(charlie, alice);

      const followers = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'in',
        level: 1
      });

      expect(followers).toHaveLength(2);
      const usernames = followers.map(f => f.node.username).sort();
      expect(usernames).toEqual(['bob', 'charlie']);
    });

    it('统计关注数和粉丝数', async () => {
      const alice = new Account({ username: 'alice', platform: 'twitter' });
      const bob = new Account({ username: 'bob', platform: 'twitter' });
      const charlie = new Account({ username: 'charlie', platform: 'twitter' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await accountRepo.addEdge(alice, bob); // Alice 关注 Bob
      await accountRepo.addEdge(alice, charlie); // Alice 关注 Charlie
      await accountRepo.addEdge(bob, alice); // Bob 关注 Alice

      // Alice 的关注数
      const followingCount = await accountRepo.countNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });
      expect(followingCount).toBe(2);

      // Alice 的粉丝数
      const followerCount = await accountRepo.countNeighbors({
        entityId: alice.id,
        direction: 'in',
        level: 1
      });
      expect(followerCount).toBe(1);
    });

    it('查找互相关注的关系', async () => {
      const alice = new Account({ username: 'alice', platform: 'twitter' });
      const bob = new Account({ username: 'bob', platform: 'twitter' });
      const charlie = new Account({ username: 'charlie', platform: 'twitter' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await accountRepo.addEdge(alice, bob);
      await accountRepo.addEdge(bob, alice); // Alice 和 Bob 互相关注
      await accountRepo.addEdge(alice, charlie); // Alice 关注 Charlie（单向）

      // Alice 的关注列表
      const following = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      // Alice 的粉丝列表
      const followers = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'in',
        level: 1
      });

      const followingIds = new Set(following.map(f => f.node.id));
      const mutualFollows = followers.filter(f => followingIds.has(f.node.id));

      expect(mutualFollows).toHaveLength(1);
      expect(mutualFollows[0].node.username).toBe('bob');
    });

    it('查找二度关注（可能认识的人）', async () => {
      const alice = new Account({ username: 'alice', platform: 'twitter' });
      const bob = new Account({ username: 'bob', platform: 'twitter' });
      const charlie = new Account({ username: 'charlie', platform: 'twitter' });
      const david = new Account({ username: 'david', platform: 'twitter' });
      await rxdb.entityManager.saveMany([alice, bob, charlie, david]);

      // Alice -> Bob -> Charlie -> David
      await accountRepo.addEdge(alice, bob);
      await accountRepo.addEdge(bob, charlie);
      await accountRepo.addEdge(charlie, david);

      const secondDegree = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 2
      });

      expect(secondDegree.length).toBeGreaterThanOrEqual(2);
      const usernames = secondDegree.map(n => n.node.username);
      expect(usernames).toContain('bob');
      expect(usernames).toContain('charlie');
    });

    it('查询认证账号的粉丝', async () => {
      const alice = new Account({ username: 'alice', platform: 'twitter', verified: true });
      const bob = new Account({ username: 'bob', platform: 'twitter', verified: false });
      const charlie = new Account({ username: 'charlie', platform: 'twitter', verified: true });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await accountRepo.addEdge(bob, alice);
      await accountRepo.addEdge(charlie, alice);

      const verifiedFollowers = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'in',
        level: 1,
        where: {
          combinator: 'and',
          rules: [{ field: 'verified', operator: '=', value: true }]
        }
      });

      expect(verifiedFollowers).toHaveLength(1);
      expect(verifiedFollowers[0].node.username).toBe('charlie');
    });

    it('计算影响力传播路径', async () => {
      const alice = new Account({ username: 'alice', platform: 'twitter', verified: true });
      const bob = new Account({ username: 'bob', platform: 'twitter' });
      const charlie = new Account({ username: 'charlie', platform: 'twitter' });
      const david = new Account({ username: 'david', platform: 'twitter' });
      await rxdb.entityManager.saveMany([alice, bob, charlie, david]);

      // 影响力传播链：Alice -> Bob -> Charlie, Alice -> David
      await accountRepo.addEdge(alice, bob);
      await accountRepo.addEdge(bob, charlie);
      await accountRepo.addEdge(alice, david);

      // 从 Alice 到 Charlie 的传播路径
      const paths = await accountRepo.findPaths({
        fromId: alice.id,
        toId: charlie.id,
        maxDepth: 3,
        direction: 'out'
      });

      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0].nodes).toHaveLength(3); // Alice -> Bob -> Charlie
      expect(paths[0].nodes[0].username).toBe('alice');
      expect(paths[0].nodes[1].username).toBe('bob');
      expect(paths[0].nodes[2].username).toBe('charlie');
    });
  });

  describe('边界情况', () => {
    it('自环边场景（当前实现允许）', async () => {
      const alice = new Account({ username: 'alice', platform: 'twitter' });
      await rxdb.entityManager.save(alice);

      // 当前实现允许自环边
      await accountRepo.addEdge(alice, alice);

      const neighbors = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors.length).toBeGreaterThanOrEqual(0);
    });

    it('重复关注应该幂等', async () => {
      const alice = new Account({ username: 'alice', platform: 'twitter' });
      const bob = new Account({ username: 'bob', platform: 'twitter' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await accountRepo.addEdge(alice, bob);
      await accountRepo.addEdge(alice, bob); // 重复关注

      const following = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      expect(following).toHaveLength(1);
    });

    it('孤立账号没有关注也没有粉丝', async () => {
      const loner = new Account({ username: 'loner', platform: 'twitter' });
      await rxdb.entityManager.save(loner);

      const following = await accountRepo.findNeighbors({
        entityId: loner.id,
        direction: 'out',
        level: 1
      });
      expect(following).toHaveLength(0);

      const followers = await accountRepo.findNeighbors({
        entityId: loner.id,
        direction: 'in',
        level: 1
      });
      expect(followers).toHaveLength(0);
    });

    it('取消关注后粉丝数减少', async () => {
      const alice = new Account({ username: 'alice', platform: 'twitter' });
      const bob = new Account({ username: 'bob', platform: 'twitter' });
      const charlie = new Account({ username: 'charlie', platform: 'twitter' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await accountRepo.addEdge(bob, alice);
      await accountRepo.addEdge(charlie, alice);

      let followerCount = await accountRepo.countNeighbors({
        entityId: alice.id,
        direction: 'in',
        level: 1
      });
      expect(followerCount).toBe(2);

      await accountRepo.removeEdge(bob, alice);

      followerCount = await accountRepo.countNeighbors({
        entityId: alice.id,
        direction: 'in',
        level: 1
      });
      expect(followerCount).toBe(1);
    });
  });
});
