import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import { rxDBPluginGraph } from '../plugin.js';
import { SqliteGraphRepository } from '../sqlite/SqliteGraphRepository.js';
import { cleanup_db, create_graph_test_adapter } from './test-utils.js';

/**
 * City 实体 - 城市间距离无向加权图
 * 场景：城市交通网络（双向通行，有距离差异）
 */
@GraphEntity({
  name: 'City',
  displayName: '城市',
  properties: [
    {
      type: PropertyType.string,
      name: 'name',
      displayName: '城市名'
    },
    {
      type: PropertyType.string,
      name: 'code',
      displayName: '城市代码'
    },
    {
      type: PropertyType.number,
      name: 'population',
      displayName: '人口',
      nullable: true
    }
  ],
  features: {
    graph: {
      type: 'undirected-graph',
      weight: true
    }
  }
})
export class City extends GraphEntityBase {
  name!: string;
  code!: string;
  population?: number;
}

describe('有权无向图 - 城市距离网络', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterWaSqlite;
  let cityRepo: SqliteGraphRepository<typeof City>;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'undirected_weighted_' + Math.random().toString(36).substring(7),
      entities: [City],
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

    cityRepo = adapter.getRepository(City);
  });

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  describe('无向图特性', () => {
    it('添加带权重的边后双向都可访问且权重相同', async () => {
      const beijing = new City({ name: '北京', code: 'BJ' });
      const shanghai = new City({ name: '上海', code: 'SH' });
      await rxdb.entityManager.saveMany([beijing, shanghai]);

      // 无向图：自动创建双向边
      await cityRepo.addEdge(beijing, shanghai, 1200);

      // 北京 -> 上海
      const fromBeijing = await cityRepo.findNeighbors({
        entityId: beijing.id,
        direction: 'out',
        level: 1
      });
      expect(fromBeijing).toHaveLength(1);
      expect(fromBeijing[0].node.code).toBe('SH');
      expect(fromBeijing[0].edge.weight).toBe(1200);

      // 上海 -> 北京（无向图，距离相同）
      const fromShanghai = await cityRepo.findNeighbors({
        entityId: shanghai.id,
        direction: 'out',
        level: 1
      });
      expect(fromShanghai).toHaveLength(1);
      expect(fromShanghai[0].node.code).toBe('BJ');
      expect(fromShanghai[0].edge.weight).toBe(1200);
    });

    it('删除边后双向都不可访问', async () => {
      const beijing = new City({ name: '北京', code: 'BJ' });
      const tianjin = new City({ name: '天津', code: 'TJ' });
      await rxdb.entityManager.saveMany([beijing, tianjin]);

      await cityRepo.addEdge(beijing, tianjin, 120);
      await cityRepo.removeEdge(beijing, tianjin);

      const neighbors1 = await cityRepo.findNeighbors({
        entityId: beijing.id,
        direction: 'out',
        level: 1
      });
      expect(neighbors1).toHaveLength(0);

      const neighbors2 = await cityRepo.findNeighbors({
        entityId: tianjin.id,
        direction: 'out',
        level: 1
      });
      expect(neighbors2).toHaveLength(0);
    });
  });

  describe('加权图特性', () => {
    it('必须提供 weight 参数', async () => {
      const beijing = new City({ name: '北京', code: 'BJ' });
      const shanghai = new City({ name: '上海', code: 'SH' });
      await rxdb.entityManager.saveMany([beijing, shanghai]);

      await cityRepo.addEdge(beijing, shanghai, 1200);

      const neighbors = await cityRepo.findNeighbors({
        entityId: beijing.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors[0].edge.weight).toBe(1200);
    });

    it('权重可以是小数（精确距离）', async () => {
      const beijing = new City({ name: '北京', code: 'BJ' });
      const tianjin = new City({ name: '天津', code: 'TJ' });
      await rxdb.entityManager.saveMany([beijing, tianjin]);

      await cityRepo.addEdge(beijing, tianjin, 137.5); // 137.5km

      const neighbors = await cityRepo.findNeighbors({
        entityId: beijing.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors[0].edge.weight).toBe(137.5);
    });

    it('可以通过权重范围过滤边', async () => {
      const beijing = new City({ name: '北京', code: 'BJ' });
      const tianjin = new City({ name: '天津', code: 'TJ', population: 1400 });
      const shijiazhuang = new City({ name: '石家庄', code: 'SJZ', population: 1100 });
      const shanghai = new City({ name: '上海', code: 'SH', population: 2500 });
      await rxdb.entityManager.saveMany([beijing, tianjin, shijiazhuang, shanghai]);

      await cityRepo.addEdge(beijing, tianjin, 120); // 近距离
      await cityRepo.addEdge(beijing, shijiazhuang, 280); // 中距离
      await cityRepo.addEdge(beijing, shanghai, 1200); // 长距离

      // 只查询 300km 以内的城市
      const nearCities = await cityRepo.findNeighbors({
        entityId: beijing.id,
        direction: 'out',
        level: 1,
        edgeWhere: {
          weight: { max: 300 }
        }
      });

      expect(nearCities).toHaveLength(2);
      const codes = nearCities.map(c => c.node.code).sort();
      expect(codes).toEqual(['SJZ', 'TJ']);
    });

    it('查询最短距离邻居（按权重排序）', async () => {
      const beijing = new City({ name: '北京', code: 'BJ' });
      const tianjin = new City({ name: '天津', code: 'TJ' });
      const shijiazhuang = new City({ name: '石家庄', code: 'SJZ' });
      await rxdb.entityManager.saveMany([beijing, tianjin, shijiazhuang]);

      await cityRepo.addEdge(beijing, tianjin, 120);
      await cityRepo.addEdge(beijing, shijiazhuang, 280);

      const neighbors = await cityRepo.findNeighbors({
        entityId: beijing.id,
        direction: 'out',
        level: 1
      });

      // 权重从小到大排序
      const weights = neighbors.map(n => n.edge.weight).filter((weight): weight is number => weight !== null);
      expect(weights[0]).toBeLessThan(weights[1]);
    });
  });

  describe('交通网络场景', () => {
    it('查找指定距离范围内的所有城市', async () => {
      const beijing = new City({ name: '北京', code: 'BJ' });
      const tianjin = new City({ name: '天津', code: 'TJ' });
      const baoding = new City({ name: '保定', code: 'BD' });
      const shijiazhuang = new City({ name: '石家庄', code: 'SJZ' });
      await rxdb.entityManager.saveMany([beijing, tianjin, baoding, shijiazhuang]);

      // 建立路网
      await cityRepo.addEdge(beijing, tianjin, 120);
      await cityRepo.addEdge(beijing, baoding, 140);
      await cityRepo.addEdge(baoding, shijiazhuang, 150);

      // 查找 200km 内的城市（1跳）
      const nearCities = await cityRepo.findNeighbors({
        entityId: beijing.id,
        direction: 'out',
        level: 1,
        edgeWhere: {
          weight: { max: 200 }
        }
      });

      expect(nearCities).toHaveLength(2);
      const codes = nearCities.map(c => c.node.code).sort();
      expect(codes).toEqual(['BD', 'TJ']);
    });

    it('计算城市间的最短路径', async () => {
      const beijing = new City({ name: '北京', code: 'BJ' });
      const tianjin = new City({ name: '天津', code: 'TJ' });
      const shijiazhuang = new City({ name: '石家庄', code: 'SJZ' });
      await rxdb.entityManager.saveMany([beijing, tianjin, shijiazhuang]);

      // 两条路径：
      // 1. 北京 --(120km)-- 天津 --(280km)-- 石家庄 = 400km
      // 2. 北京 --(280km)-- 石家庄 = 280km
      await cityRepo.addEdge(beijing, tianjin, 120);
      await cityRepo.addEdge(tianjin, shijiazhuang, 280);
      await cityRepo.addEdge(beijing, shijiazhuang, 280);

      const paths = await cityRepo.findPaths({
        fromId: beijing.id,
        toId: shijiazhuang.id,
        maxDepth: 2
      });

      expect(paths.length).toBeGreaterThan(0);

      // 计算每条路径的总距离
      const pathDistances = paths.map(path => {
        return path.edges.reduce((sum, edge) => sum + (edge.weight || 0), 0);
      });

      // 最短路径应该是 280km
      const shortestDistance = Math.min(...pathDistances);
      expect(shortestDistance).toBe(280);
    });

    it('查找指定人口范围内的邻近城市', async () => {
      const beijing = new City({ name: '北京', code: 'BJ', population: 2100 });
      const tianjin = new City({ name: '天津', code: 'TJ', population: 1400 });
      const langfang = new City({ name: '廊坊', code: 'LF', population: 500 });
      await rxdb.entityManager.saveMany([beijing, tianjin, langfang]);

      await cityRepo.addEdge(beijing, tianjin, 120);
      await cityRepo.addEdge(beijing, langfang, 60);

      // 查找 100 万人口以上的邻近城市
      const bigCities = await cityRepo.findNeighbors({
        entityId: beijing.id,
        direction: 'out',
        level: 1,
        where: {
          combinator: 'and',
          rules: [{ field: 'population', operator: '>=', value: 1000 }]
        }
      });

      expect(bigCities).toHaveLength(1);
      expect(bigCities[0].node.code).toBe('TJ');
    });

    it('统计指定距离内的城市数量', async () => {
      const beijing = new City({ name: '北京', code: 'BJ' });
      const tianjin = new City({ name: '天津', code: 'TJ' });
      const baoding = new City({ name: '保定', code: 'BD' });
      const shanghai = new City({ name: '上海', code: 'SH' });
      await rxdb.entityManager.saveMany([beijing, tianjin, baoding, shanghai]);

      await cityRepo.addEdge(beijing, tianjin, 120);
      await cityRepo.addEdge(beijing, baoding, 140);
      await cityRepo.addEdge(beijing, shanghai, 1200);

      // 统计 200km 内的城市（通过 findNeighbors 实现）
      const nearby = await cityRepo.findNeighbors({
        entityId: beijing.id,
        direction: 'out',
        level: 1,
        edgeWhere: {
          weight: { max: 200 }
        }
      });

      expect(nearby.length).toBe(2);
    });
  });

  describe('边界情况', () => {
    it('权重为 0 应该有效（邻近城市）', async () => {
      const beijing = new City({ name: '北京', code: 'BJ' });
      const tongzhou = new City({ name: '通州', code: 'TZ' });
      await rxdb.entityManager.saveMany([beijing, tongzhou]);

      await cityRepo.addEdge(beijing, tongzhou, 0); // 同城

      const neighbors = await cityRepo.findNeighbors({
        entityId: beijing.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].edge.weight).toBe(0);
    });

    it('负权重场景（当前实现允许）', async () => {
      const beijing = new City({ name: '北京', code: 'BJ' });
      const tianjin = new City({ name: '天津', code: 'TJ' });
      await rxdb.entityManager.saveMany([beijing, tianjin]);

      // 当前实现允许负权重（可用于表示债务等场景）
      await cityRepo.addEdge(beijing, tianjin, -100);

      const neighbors = await cityRepo.findNeighbors({
        entityId: beijing.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors[0].edge.weight).toBe(-100);
    });

    it('极大权重应该有效（国际航线）', async () => {
      const beijing = new City({ name: '北京', code: 'BJ' });
      const newyork = new City({ name: '纽约', code: 'NY' });
      await rxdb.entityManager.saveMany([beijing, newyork]);

      await cityRepo.addEdge(beijing, newyork, 11000); // 11000km

      const neighbors = await cityRepo.findNeighbors({
        entityId: beijing.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors[0].edge.weight).toBe(11000);
    });

    it('更新边权重（修路导致距离变化）', async () => {
      const beijing = new City({ name: '北京', code: 'BJ' });
      const tianjin = new City({ name: '天津', code: 'TJ' });
      await rxdb.entityManager.saveMany([beijing, tianjin]);

      await cityRepo.addEdge(beijing, tianjin, 140); // 老路 140km

      // 修建高速后距离缩短
      await cityRepo.removeEdge(beijing, tianjin);
      await cityRepo.addEdge(beijing, tianjin, 120);

      const neighbors = await cityRepo.findNeighbors({
        entityId: beijing.id,
        direction: 'out',
        level: 1
      });

      expect(neighbors[0].edge.weight).toBe(120);
    });
  });
});
