import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import { rxDBPluginGraph } from '../plugin.js';
import { SqliteGraphRepository } from '../sqlite/SqliteGraphRepository.js';
import { cleanup_db, create_graph_test_adapter } from './test-utils.js';

/**
 * Transaction 实体 - 资金流向有权有向图
 * 场景：资金/能量/影响力流动（单向，有强度/金额）
 */
@GraphEntity({
  name: 'Transaction',
  displayName: '账户',
  properties: [
    {
      type: PropertyType.string,
      name: 'accountName',
      displayName: '账户名'
    },
    {
      type: PropertyType.string,
      name: 'accountType',
      displayName: '账户类型',
      nullable: true
    },
    {
      type: PropertyType.number,
      name: 'balance',
      displayName: '余额',
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
export class TransactionAccount extends GraphEntityBase {
  accountName!: string;
  accountType?: string;
  balance?: number;
}

describe('有权有向图 - 资金流向网络', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterWaSqlite;
  let accountRepo: SqliteGraphRepository<typeof TransactionAccount>;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'directed_weighted_' + Math.random().toString(36).substring(7),
      entities: [TransactionAccount],
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

    accountRepo = adapter.getRepository(TransactionAccount);
  });

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  describe('有向图特性', () => {
    it('资金流向是单向的（A 转账给 B ≠ B 转账给 A）', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'personal' });
      const bob = new TransactionAccount({ accountName: 'Bob', accountType: 'personal' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await accountRepo.addEdge(alice, bob, 1000); // Alice 转账 1000 给 Bob

      // Alice 的转出记录（out）
      const outgoing = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });
      expect(outgoing).toHaveLength(1);
      expect(outgoing[0].node.accountName).toBe('Bob');
      expect(outgoing[0].edge.weight).toBe(1000);

      // Alice 的转入记录（in）
      const incoming = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'in',
        level: 1
      });
      expect(incoming).toHaveLength(0); // Alice 没有收款

      // Bob 的转入记录（in）
      const bobIncoming = await accountRepo.findNeighbors({
        entityId: bob.id,
        direction: 'in',
        level: 1
      });
      expect(bobIncoming).toHaveLength(1);
      expect(bobIncoming[0].node.accountName).toBe('Alice');
      expect(bobIncoming[0].edge.weight).toBe(1000);
    });

    it('双向转账需要两条边', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'personal' });
      const bob = new TransactionAccount({ accountName: 'Bob', accountType: 'personal' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await accountRepo.addEdge(alice, bob, 1000); // Alice -> Bob: 1000
      await accountRepo.addEdge(bob, alice, 500); // Bob -> Alice: 500

      // Alice 的转出
      const aliceOut = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });
      expect(aliceOut).toHaveLength(1);
      expect(aliceOut[0].edge.weight).toBe(1000);

      // Alice 的转入
      const aliceIn = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'in',
        level: 1
      });
      expect(aliceIn).toHaveLength(1);
      expect(aliceIn[0].edge.weight).toBe(500);
    });
  });

  describe('加权图特性', () => {
    it('权重表示转账金额', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'personal' });
      const bob = new TransactionAccount({ accountName: 'Bob', accountType: 'personal' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await accountRepo.addEdge(alice, bob, 5000);

      const neighbors = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors[0].edge.weight).toBe(5000);
    });

    it('权重可以是小数（精确金额）', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'personal' });
      const bob = new TransactionAccount({ accountName: 'Bob', accountType: 'personal' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await accountRepo.addEdge(alice, bob, 1234.56);

      const neighbors = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors[0].edge.weight).toBe(1234.56);
    });

    it('可以按金额范围过滤交易', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'personal' });
      const bob = new TransactionAccount({ accountName: 'Bob', accountType: 'personal' });
      const charlie = new TransactionAccount({ accountName: 'Charlie', accountType: 'business' });
      const david = new TransactionAccount({ accountName: 'David', accountType: 'business' });
      await rxdb.entityManager.saveMany([alice, bob, charlie, david]);

      await accountRepo.addEdge(alice, bob, 100); // 小额
      await accountRepo.addEdge(alice, charlie, 5000); // 中等
      await accountRepo.addEdge(alice, david, 50000); // 大额

      // 查询大额交易（>= 10000）
      const largeTransactions = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1,
        edgeWhere: {
          weight: { min: 10000 }
        }
      });

      expect(largeTransactions).toHaveLength(1);
      expect(largeTransactions[0].node.accountName).toBe('David');
      expect(largeTransactions[0].edge.weight).toBe(50000);
    });
  });

  describe('资金流向场景', () => {
    it('统计转出总金额', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', balance: 100000 });
      const bob = new TransactionAccount({ accountName: 'Bob' });
      const charlie = new TransactionAccount({ accountName: 'Charlie' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await accountRepo.addEdge(alice, bob, 3000);
      await accountRepo.addEdge(alice, charlie, 7000);

      const outgoing = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      const totalOut = outgoing.reduce((sum, n) => sum + (n.edge.weight || 0), 0);
      expect(totalOut).toBe(10000);
    });

    it('统计转入总金额', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice' });
      const bob = new TransactionAccount({ accountName: 'Bob' });
      const charlie = new TransactionAccount({ accountName: 'Charlie' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      await accountRepo.addEdge(bob, alice, 2000);
      await accountRepo.addEdge(charlie, alice, 5000);

      const incoming = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'in',
        level: 1
      });

      const totalIn = incoming.reduce((sum, n) => sum + (n.edge.weight || 0), 0);
      expect(totalIn).toBe(7000);
    });

    it('追踪资金流向链路', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'personal' });
      const bob = new TransactionAccount({ accountName: 'Bob', accountType: 'personal' });
      const charlie = new TransactionAccount({ accountName: 'Charlie', accountType: 'business' });
      const offshore = new TransactionAccount({ accountName: 'Offshore', accountType: 'offshore' });
      await rxdb.entityManager.saveMany([alice, bob, charlie, offshore]);

      // 资金流向链：Alice -> Bob -> Charlie -> Offshore
      await accountRepo.addEdge(alice, bob, 10000);
      await accountRepo.addEdge(bob, charlie, 8000);
      await accountRepo.addEdge(charlie, offshore, 6000);

      // 追踪 Alice 的资金最终流向
      const paths = await accountRepo.findPaths({
        fromId: alice.id,
        toId: offshore.id,
        maxDepth: 5,
        direction: 'out'
      });

      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0].nodes).toHaveLength(4);
      expect(paths[0].nodes.map(n => n.accountName)).toEqual(['Alice', 'Bob', 'Charlie', 'Offshore']);
    });

    it('识别大额异常交易', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'personal' });
      const bob = new TransactionAccount({ accountName: 'Bob', accountType: 'personal' });
      const charlie = new TransactionAccount({ accountName: 'Charlie', accountType: 'personal' });
      const suspicious = new TransactionAccount({ accountName: 'Suspicious', accountType: 'unknown' });
      await rxdb.entityManager.saveMany([alice, bob, charlie, suspicious]);

      await accountRepo.addEdge(alice, bob, 500);
      await accountRepo.addEdge(alice, charlie, 1000);
      await accountRepo.addEdge(alice, suspicious, 100000); // 异常大额

      // 查询超过 50000 的交易
      const abnormal = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1,
        edgeWhere: {
          weight: { min: 50000 }
        }
      });

      expect(abnormal).toHaveLength(1);
      expect(abnormal[0].node.accountName).toBe('Suspicious');
    });

    it('分析资金集中度（入度权重）', async () => {
      const hub = new TransactionAccount({ accountName: 'Hub', accountType: 'business' });
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'personal' });
      const bob = new TransactionAccount({ accountName: 'Bob', accountType: 'personal' });
      const charlie = new TransactionAccount({ accountName: 'Charlie', accountType: 'personal' });
      await rxdb.entityManager.saveMany([hub, alice, bob, charlie]);

      // 多个账户向 Hub 转账
      await accountRepo.addEdge(alice, hub, 10000);
      await accountRepo.addEdge(bob, hub, 20000);
      await accountRepo.addEdge(charlie, hub, 15000);

      const incoming = await accountRepo.findNeighbors({
        entityId: hub.id,
        direction: 'in',
        level: 1
      });

      expect(incoming).toHaveLength(3);
      const totalInflow = incoming.reduce((sum, n) => sum + (n.edge.weight || 0), 0);
      expect(totalInflow).toBe(45000); // Hub 是资金汇集点
    });

    it('查找循环交易（洗钱检测）', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'personal' });
      const bob = new TransactionAccount({ accountName: 'Bob', accountType: 'business' });
      const charlie = new TransactionAccount({ accountName: 'Charlie', accountType: 'offshore' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      // 形成循环：Alice -> Bob -> Charlie -> Alice
      await accountRepo.addEdge(alice, bob, 10000);
      await accountRepo.addEdge(bob, charlie, 9000);
      await accountRepo.addEdge(charlie, alice, 8000);

      // 检查是否存在从 Alice 出发又回到 Alice 的路径
      const paths = await accountRepo.findPaths({
        fromId: alice.id,
        toId: alice.id,
        maxDepth: 5,
        direction: 'out'
      });

      expect(paths.length).toBeGreaterThan(0); // 检测到循环
    });

    it('按账户类型过滤交易对手', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'personal' });
      const bob = new TransactionAccount({ accountName: 'Bob', accountType: 'personal' });
      const company = new TransactionAccount({ accountName: 'Company', accountType: 'business' });
      await rxdb.entityManager.saveMany([alice, bob, company]);

      await accountRepo.addEdge(alice, bob, 1000);
      await accountRepo.addEdge(alice, company, 50000);

      // 只查询转给企业账户的交易
      const business = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1,
        where: {
          combinator: 'and',
          rules: [{ field: 'accountType', operator: '=', value: 'business' }]
        }
      });

      expect(business).toHaveLength(1);
      expect(business[0].node.accountName).toBe('Company');
      expect(business[0].edge.weight).toBe(50000);
    });

    it('计算二度转账关系总金额', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'personal' });
      const bob = new TransactionAccount({ accountName: 'Bob', accountType: 'personal' });
      const charlie = new TransactionAccount({ accountName: 'Charlie', accountType: 'personal' });
      await rxdb.entityManager.saveMany([alice, bob, charlie]);

      // Alice -> Bob -> Charlie
      await accountRepo.addEdge(alice, bob, 10000);
      await accountRepo.addEdge(bob, charlie, 8000);

      const secondDegree = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 2
      });

      // 统计 Alice 间接影响的资金流动
      const directCount = secondDegree.filter(n => n.level === 1).length;
      const indirectCount = secondDegree.filter(n => n.level === 2).length;

      expect(directCount).toBeGreaterThanOrEqual(1);
      expect(indirectCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('边界情况', () => {
    it('权重为 0 应该有效（免费转账/测试交易）', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'personal' });
      const bob = new TransactionAccount({ accountName: 'Bob', accountType: 'personal' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await accountRepo.addEdge(alice, bob, 0);

      const neighbors = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors[0].edge.weight).toBe(0);
    });

    it('负权重场景（当前实现允许）', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'personal' });
      const bob = new TransactionAccount({ accountName: 'Bob', accountType: 'personal' });
      await rxdb.entityManager.saveMany([alice, bob]);

      // 当前实现允许负权重（可用于退款/债务）
      await accountRepo.addEdge(alice, bob, -1000);

      const neighbors = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors[0].edge.weight).toBe(-1000);
    });

    it('自环边可写入，但起点不作为自己的邻居返回', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'personal' });
      await rxdb.entityManager.save(alice);

      // 允许写入自环边（可用于内部转账），但 findNeighbors 承诺不返回起始节点
      await accountRepo.addEdge(alice, alice, 1000);

      const edgeResult = await adapter.query(
        `SELECT weight FROM "public$Transaction_edges" WHERE sourceId = ? AND targetId = ?`,
        [alice.id, alice.id]
      );
      expect(edgeResult.results[0].rows).toHaveLength(1);
      expect(edgeResult.results[0].rows[0][0]).toBe(1000);

      const neighbors = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });
      expect(neighbors).toHaveLength(0);
    });

    it('删除交易记录（撤销转账）', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'personal' });
      const bob = new TransactionAccount({ accountName: 'Bob', accountType: 'personal' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await accountRepo.addEdge(alice, bob, 5000);

      let outgoing = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });
      expect(outgoing).toHaveLength(1);

      await accountRepo.removeEdge(alice, bob);

      outgoing = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });
      expect(outgoing).toHaveLength(0);
    });

    it('极大金额应该有效', async () => {
      const alice = new TransactionAccount({ accountName: 'Alice', accountType: 'business' });
      const bob = new TransactionAccount({ accountName: 'Bob', accountType: 'business' });
      await rxdb.entityManager.saveMany([alice, bob]);

      await accountRepo.addEdge(alice, bob, 1e9); // 10亿

      const neighbors = await accountRepo.findNeighbors({
        entityId: alice.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors[0].edge.weight).toBe(1e9);
    });
  });
});
