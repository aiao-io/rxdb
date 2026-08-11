import { getEntityMetadata, type EntityMetadata } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import { describe, expect, it } from 'vitest';
import { GraphEntity } from '../@GraphEntity.js';
import { GraphEntityBase } from '../GraphEntityBase.js';
import {
  generate_entity_count_neighbors_sql,
  generate_entity_find_neighbors_sql,
  generate_entity_find_paths_sql
} from '../sqlite/query_graph_sql.js';

/**
 * 无向图的 `addEdge` 已经把一条逻辑边**双向写入**（A→B 与 B→A 两行）。
 * SQL 生成层却从不读 `metadata.features.graph.type`，`direction='both'`（默认值）
 * 仍然把 out 分支和 in 分支 UNION ALL 起来 —— 同一条逻辑边每一跳都被走两次，
 * 中间行数按 2^level 翻倍。8 节点小图在 level=6 时中间行已达 3071 行（实际邻居只有 7 个）。
 */
@GraphEntity({
  name: 'UndirectedCollapseNode',
  namespace: 'public',
  properties: [],
  features: { graph: { type: 'undirected-graph' } }
})
class UndirectedNode extends GraphEntityBase {}

@GraphEntity({
  name: 'DirectedCollapseNode',
  namespace: 'public',
  properties: [],
  features: { graph: { type: 'directed-graph' } }
})
class DirectedNode extends GraphEntityBase {}

const adapter = {} as RxDBAdapterSqliteBase;
const undirected: EntityMetadata = getEntityMetadata(UndirectedNode);
const directed: EntityMetadata = getEntityMetadata(DirectedNode);

const countRecursiveBranches = (sql: string): number =>
  sql.match(/JOIN "[^"]+_edges" e ON e\.(?:sourceId|targetId) = n\.id/g)?.length ?? 0;

describe('无向图方向折叠', () => {
  describe('findNeighbors', () => {
    it('无向图默认 direction 只生成单个遍历分支', () => {
      const { sql } = generate_entity_find_neighbors_sql(adapter, undirected, { entityId: 'a', level: 3 });

      expect(countRecursiveBranches(sql)).toBe(1);
    });

    it('无向图显式传 both / in 同样折叠为单分支', () => {
      const both = generate_entity_find_neighbors_sql(adapter, undirected, {
        entityId: 'a',
        level: 3,
        direction: 'both'
      });
      const inbound = generate_entity_find_neighbors_sql(adapter, undirected, {
        entityId: 'a',
        level: 3,
        direction: 'in'
      });

      expect(countRecursiveBranches(both.sql)).toBe(1);
      expect(countRecursiveBranches(inbound.sql)).toBe(1);
    });

    it('有向图的 both 仍然保留双分支', () => {
      const { sql } = generate_entity_find_neighbors_sql(adapter, directed, {
        entityId: 'a',
        level: 3,
        direction: 'both'
      });

      expect(countRecursiveBranches(sql)).toBe(2);
    });

    it('有向图的 in / out 各自只有单分支', () => {
      const outbound = generate_entity_find_neighbors_sql(adapter, directed, {
        entityId: 'a',
        level: 3,
        direction: 'out'
      });
      const inbound = generate_entity_find_neighbors_sql(adapter, directed, {
        entityId: 'a',
        level: 3,
        direction: 'in'
      });

      expect(countRecursiveBranches(outbound.sql)).toBe(1);
      expect(countRecursiveBranches(inbound.sql)).toBe(1);
    });
  });

  describe('countNeighbors', () => {
    it('无向图折叠为单分支，有向图保留双分支', () => {
      const undirectedSql = generate_entity_count_neighbors_sql(adapter, undirected, { entityId: 'a', level: 3 });
      const directedSql = generate_entity_count_neighbors_sql(adapter, directed, {
        entityId: 'a',
        level: 3,
        direction: 'both'
      });

      expect(countRecursiveBranches(undirectedSql.sql)).toBe(1);
      expect(countRecursiveBranches(directedSql.sql)).toBe(2);
    });
  });

  // findPaths 的 both 不走 UNION ALL，而是用 OR 连接两个方向；无向图边已双向存储，
  // 该 OR 会让同一条逻辑边被匹配两次，SQL 返回 50 行、去重后只剩 5 条。
  describe('findPaths', () => {
    it('无向图折叠为单向 JOIN，有向图保留双向 OR', () => {
      const undirectedSql = generate_entity_find_paths_sql(adapter, undirected, {
        fromId: 'a',
        toId: 'e',
        maxDepth: 4
      });
      const directedSql = generate_entity_find_paths_sql(adapter, directed, {
        fromId: 'a',
        toId: 'e',
        maxDepth: 4,
        direction: 'both'
      });

      expect(undirectedSql.sql).toContain('e.sourceId = p.currentId');
      expect(undirectedSql.sql).not.toContain('OR e.targetId = p.currentId');
      expect(directedSql.sql).toContain('(e.sourceId = p.currentId OR e.targetId = p.currentId)');
    });
  });

  it('折叠后参数不再被重复追加', () => {
    const collapsed = generate_entity_find_neighbors_sql(adapter, undirected, {
      entityId: 'a',
      level: 3,
      direction: 'both'
    });
    const single = generate_entity_find_neighbors_sql(adapter, undirected, {
      entityId: 'a',
      level: 3,
      direction: 'out'
    });

    expect(collapsed.params).toEqual(single.params);
  });
});
