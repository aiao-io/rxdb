import type { BomTestAdapter } from '../src/__tests__/test-utils.js';
import { BomHeader, BomItem, BomLine, BomLineOccurrence } from '../src/entities.js';
import { loadHistory, type HistoryHeaderInput } from '../src/resolve/history-loader.js';
import { deterministicId } from '../src/testing/scooter-dataset.js';

interface Graph {
  items: string[];
  edges: [string, string][];
}

export { reachDiamonds } from '../src/testing/reach-graph.js';

/** 链按父至子装载，用于验证既有128层判定硬停。 */
export const reachChain = (length: number): Graph => ({
  items: Array.from({ length }, (_, index) => `chain-${index}`),
  edges: Array.from({ length: length - 1 }, (_, index) => [`chain-${index}`, `chain-${index + 1}`])
});

/** 通过真实历史协议装载图，返回稳定标识符。 */
export const seedReachGraph = async (adapter: BomTestAdapter, shape: Graph) => {
  const graph = shape;
  const ids = new Map(graph.items.map(key => [key, deterministicId(`reach-scale:${key}`)]));
  const revisions = new Map(graph.items.map(key => [key, deterministicId(`reach-scale:revision:${key}`)]));
  for (const key of graph.items) {
    await adapter.rxdb.entityManager.instantiate(BomItem, { id: ids.get(key)!, itemNo: `REACH-SCALE-${key}` }).save();
  }
  const headers = new Map<string, HistoryHeaderInput>();
  for (const [index, [parent, child]] of graph.edges.entries()) {
    let header = headers.get(parent);
    if (!header) {
      header = { revisionIndex: graph.items.indexOf(parent), bomType: 'ebom', orgId: 'reach-scale', lines: [] };
      headers.set(parent, header);
    }
    header.lines.push({
      lineNo: header.lines.length + 1,
      occurrences: [
        {
          id: deterministicId(`reach-scale:occurrence:${index}`),
          childItemId: ids.get(child)!,
          qty: '1',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
        }
      ]
    });
  }
  await loadHistory(adapter, {
    batchNo: 'reach-scale-graph',
    revisions: graph.items.map(key => ({
      id: revisions.get(key),
      itemId: ids.get(key)!,
      revisionNo: 'A',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
    })),
    headers: [...headers.values()]
  });
  return { ids, revisions };
};

/**
 * 同一张图挂在草稿头下（修订经历史通道发布）：草稿成员可删、可改端点，用于计时可达维护的删除重检。
 * 头 / 行 / 发生项在一个事务里经适配器仓储写入，存储层触发器（判环与可达维护）照常执行。
 *
 * @returns 物料标识符与按边序排列的发生项标识符
 */
export const seedDraftReachGraph = async (adapter: BomTestAdapter, shape: Graph) => {
  const ids = new Map(shape.items.map(key => [key, deterministicId(`reach-draft:${key}`)]));
  const revisions = new Map(shape.items.map(key => [key, deterministicId(`reach-draft:revision:${key}`)]));
  const occurrences = shape.edges.map((_, index) => deterministicId(`reach-draft:occurrence:${index}`));
  const effectiveFrom = new Date('2026-01-01T00:00:00.000Z');
  for (const key of shape.items) {
    await adapter.rxdb.entityManager.instantiate(BomItem, { id: ids.get(key)!, itemNo: `REACH-DRAFT-${key}` }).save();
  }
  await loadHistory(adapter, {
    batchNo: 'reach-draft-graph',
    revisions: shape.items.map(key => ({
      id: revisions.get(key),
      itemId: ids.get(key)!,
      revisionNo: 'A',
      effectiveFrom
    })),
    headers: []
  });
  const { entityManager } = adapter.rxdb;
  await adapter.transaction(async executor => {
    const headers = new Map<string, BomHeader>();
    const headerOf = async (parent: string): Promise<BomHeader> => {
      const known = headers.get(parent);
      if (known) return known;
      const header = entityManager.instantiate(BomHeader, {
        parentRevisionId: revisions.get(parent)!,
        bomType: 'ebom',
        orgId: 'reach-scale'
      });
      await executor.getRepository(BomHeader).create(header);
      headers.set(parent, header);
      return header;
    };
    for (const [index, [parent, child]] of shape.edges.entries()) {
      const header = await headerOf(parent);
      const line = entityManager.instantiate(BomLine, { headerId: header.id, lineNo: index + 1 });
      await executor.getRepository(BomLine).create(line);
      await executor.getRepository(BomLineOccurrence).create(
        entityManager.instantiate(BomLineOccurrence, {
          id: occurrences[index],
          lineId: line.id,
          childItemId: ids.get(child)!,
          qty: '1',
          effectiveFrom
        })
      );
    }
  }, false);
  return { ids, occurrences };
};

/** 创建独立草稿逻辑行，计时只包含随后发生项的存储判定。 */
export const newReachLine = async (adapter: BomTestAdapter, revisionId: string): Promise<BomLine> => {
  const header = adapter.rxdb.entityManager.instantiate(BomHeader, {
    parentRevisionId: revisionId,
    bomType: 'ebom',
    orgId: 'reach-scale'
  });
  await header.save();
  const line = adapter.rxdb.entityManager.instantiate(BomLine, { headerId: header.id, lineNo: 10 });
  await line.save();
  return line;
};
