import type { BomTestAdapter } from '../src/__tests__/test-utils.js';
import { BomHeader, BomItem, BomLine } from '../src/entities.js';
import { loadHistory, type HistoryHeaderInput } from '../src/resolve/history-loader.js';
import { deterministicId } from '../src/testing/scooter-dataset.js';

interface Graph {
  items: string[];
  edges: [string, string][];
}

/** n串菱形只有3n+1个物料与4n条边（默认20串：61物料/80边），路径数2^n另由预算控制。 */
export const reachDiamonds = (layers = 20): Graph => {
  const items = ['root'];
  const edges: Graph['edges'] = [];
  let top = 'root';
  for (let index = 0; index < layers; index += 1) {
    const left = `left-${index}`;
    const right = `right-${index}`;
    const bottom = `bottom-${index}`;
    items.push(left, right, bottom);
    edges.push([top, left], [top, right], [left, bottom], [right, bottom]);
    top = bottom;
  }
  return { items, edges };
};

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
