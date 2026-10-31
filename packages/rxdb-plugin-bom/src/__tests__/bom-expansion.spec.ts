/**
 * @fileoverview 多级展开与 where-used 反查测试（US-510 阶段 A 首轮 AC#1 / AC#2 / AC#7 / AC#10 / AC#11）
 *
 * 双后端（wa-sqlite / pglite）同断言：深度截断带原因、12 整机反查、生效窗口滤除、
 * 菱形 10,000 路径截断（原因：路径数）、截断 / 未裁决结果被消费方守卫拒绝。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomItem, BomItemRevision } from '../entities.js';
import { assertCompleteResolution, expandBom, whereUsed } from '../resolve/expansion.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BomResolutionError, type ResolutionContext, type ResolutionResult } from '../resolve/resolution.js';
import { resolveBom } from '../resolve/resolver.js';
import { BomTruncationError } from '../types.js';
import { BomTestAdapter, createBomTestAdapter, disposeBomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const CONTEXT = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: day('2026-01-01') };

/** 一张要装载的图：物料号列表 + 每张头下的子件边。 */
interface GraphSpec {
  items: string[];
  headers: {
    itemNo: string;
    occurrences: { childItemNo: string; effectiveFrom?: string; effectiveTo?: string | null }[];
  }[];
}

/** 建物料 + 经 loadHistory 一次事务装载已发布修订 / 头 / 行发生项。 */
const buildGraph = async (adapter: BomTestAdapter, spec: GraphSpec): Promise<Map<string, BomItem>> => {
  // itemNo 带唯一索引，同一 describe 共享一个库：给每次建图加随机前缀
  const token = Math.random().toString(36).slice(2, 8);
  const items = new Map<string, BomItem>();
  for (const itemNo of spec.items) {
    const item = new BomItem();
    item.itemNo = `${token}-${itemNo}`;
    await item.save();
    items.set(itemNo, item);
  }
  await loadHistory(adapter, {
    batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
    revisions: spec.items.map(itemNo => ({
      itemId: items.get(itemNo)!.id,
      revisionNo: 'A',
      effectiveFrom: day('2020-01-01')
    })),
    headers: spec.headers.map(header => ({
      revisionIndex: spec.items.indexOf(header.itemNo),
      bomType: 'ebom',
      orgId: 'org-x',
      lines: header.occurrences.map((occurrence, index) => ({
        lineNo: 10 + index,
        occurrences: [
          {
            childItemId: items.get(occurrence.childItemNo)!.id,
            qty: '1',
            effectiveFrom: occurrence.effectiveFrom !== undefined ? day(occurrence.effectiveFrom) : day('2020-01-01'),
            effectiveTo: occurrence.effectiveTo != null ? day(occurrence.effectiveTo) : null
          }
        ]
      }))
    }))
  });
  return items;
};

/** 8 层链：i1 → i2 → … → i8（每张头一条边）。 */
const chainSpec = (length: number): GraphSpec => ({
  items: Array.from({ length }, (_, index) => `i${index + 1}`),
  headers: Array.from({ length: length - 1 }, (_, index) => ({
    itemNo: `i${index + 1}`,
    occurrences: [{ childItemNo: `i${index + 2}` }]
  }))
});

/**
 * `count` 个串联菱形（每菱形 top → 两个中件 → bottom；4×count 条边，1+3×count 个物料）：
 * 根到末端的路径数 = 2^count（count = 20 时为 AC#10 的 1,048,576 条基准）。
 */
const diamondSpec = (count: number): GraphSpec => {
  const items = ['r'];
  for (let k = 1; k <= count; k++) {
    items.push(`b${k}`, `c${k}`, `d${k}`);
  }
  const headers: GraphSpec['headers'] = [{ itemNo: 'r', occurrences: [{ childItemNo: 'b1' }, { childItemNo: 'c1' }] }];
  for (let k = 1; k <= count; k++) {
    headers.push({ itemNo: `b${k}`, occurrences: [{ childItemNo: `d${k}` }] });
    headers.push({ itemNo: `c${k}`, occurrences: [{ childItemNo: `d${k}` }] });
    if (k < count) {
      headers.push({
        itemNo: `d${k}`,
        occurrences: [{ childItemNo: `b${k + 1}` }, { childItemNo: `c${k + 1}` }]
      });
    }
  }
  return { items, headers };
};

for (const backend of BACKENDS) {
  describe(`展开与反查 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    it('8 层链深度上限 5：层级与路径正确，truncated 原因深度（AC#1）', async () => {
      const items = await buildGraph(adapter, chainSpec(8));
      const result = await expandBom(
        adapter,
        CONTEXT,
        { parentItemId: items.get('i1')!.id },
        { budgets: { depth: 5 } }
      );
      expect(result.truncated).toEqual({ reason: 'depth' });
      // 根 + 深度 1..5 共 6 个节点，最深节点的物料是第 6 个
      expect(result.nodes.length).toBe(6);
      expect(result.nodes[0].occurrenceId).toBeNull();
      expect(result.nodes[0].itemId).toBe(items.get('i1')!.id);
      for (const node of result.nodes) {
        expect(node.path.length).toBe(node.depth);
        expect(node.itemId).toBe(items.get(`i${node.depth + 1}`)!.id);
      }
    });

    it('同一条 8 层链不设预算：完整展开不截断', async () => {
      const items = await buildGraph(adapter, chainSpec(8));
      const result = await expandBom(adapter, CONTEXT, { parentItemId: items.get('i1')!.id });
      expect(result.truncated).toBeNull();
      expect(result.nodes.length).toBe(8);
      expect(result.nodes[7].itemId).toBe(items.get('i8')!.id);
    });

    it('子件被 12 个整机使用：反查返回 12 条各带路径（AC#2）', async () => {
      const items = await buildGraph(adapter, {
        items: ['p', ...Array.from({ length: 12 }, (_, index) => `m${index + 1}`)],
        headers: Array.from({ length: 12 }, (_, index) => ({
          itemNo: `m${index + 1}`,
          occurrences: [{ childItemNo: 'p' }]
        }))
      });
      const result = await whereUsed(adapter, CONTEXT, { childItemId: items.get('p')!.id });
      expect(result.truncated).toBeNull();
      expect(result.nodes.length).toBe(12);
      const machineIds = new Set<string>(Array.from({ length: 12 }, (_, index) => items.get(`m${index + 1}`)!.id));
      for (const node of result.nodes) {
        expect(machineIds.has(node.itemId)).toBe(true);
        expect(node.path.length).toBe(1);
        expect(node.depth).toBe(1);
      }
    });

    it('菱形 2 完整展开：同一子装配经两条路径出现即两个结果节点', async () => {
      const items = await buildGraph(adapter, diamondSpec(2));
      const result = await expandBom(adapter, CONTEXT, { parentItemId: items.get('r')!.id });
      expect(result.truncated).toBeNull();
      // 层节点数：1（根）→ 2 → 2 → 4 → 4；d2 的 4 个节点各有一条不同路径
      expect(result.nodes.length).toBe(13);
      const d2Nodes = result.nodes.filter(node => node.itemId === items.get('d2')!.id);
      expect(d2Nodes.length).toBe(4);
      expect(new Set(d2Nodes.map(node => node.path.join('>'))).size).toBe(4);
    });

    it('窗口滤除：行发生项 [2026-01-01, 2026-10-01) 在 09-30 含该路径、10-01 滤除（AC#7）', async () => {
      const items = await buildGraph(adapter, {
        items: ['M', 'S', 'P'],
        headers: [
          { itemNo: 'M', occurrences: [{ childItemNo: 'S' }] },
          { itemNo: 'S', occurrences: [{ childItemNo: 'P', effectiveFrom: '2026-01-01', effectiveTo: '2026-10-01' }] }
        ]
      });
      const at = (asOf: string) =>
        expandBom(adapter, { ...CONTEXT, asOfDate: day(asOf) }, { parentItemId: items.get('M')!.id });
      const before = await at('2026-09-30');
      expect(before.truncated).toBeNull();
      expect(before.nodes.map(node => node.itemId)).toEqual([
        items.get('M')!.id,
        items.get('S')!.id,
        items.get('P')!.id
      ]);
      const after = await at('2026-10-01');
      expect(after.truncated).toBeNull();
      expect(after.nodes.map(node => node.itemId)).toEqual([items.get('M')!.id, items.get('S')!.id]);
    });

    it('20 个串联菱形（1,048,576 条路径）：返回恰好 10,000 条，truncated 原因路径数（AC#10）', async () => {
      const items = await buildGraph(adapter, diamondSpec(20));
      const result = await expandBom(
        adapter,
        CONTEXT,
        { parentItemId: items.get('r')!.id },
        { budgets: { depth: 50, expansions: 100_000, paths: 10_000 } }
      );
      expect(result.truncated).toEqual({ reason: 'paths' });
      expect(result.nodes.length).toBe(10_000);
    });

    it('未知显式修订、草稿父修订、无修订物料与缺目标分别拒绝并点名', async () => {
      await expect(expandBom(adapter, CONTEXT, { parentRevisionId: crypto.randomUUID() })).rejects.toThrow(
        BomResolutionError
      );
      const item = new BomItem();
      item.itemNo = `draft-parent-${Math.random().toString(36).slice(2, 8)}`;
      await item.save();
      const draftRevision = new BomItemRevision();
      draftRevision.revisionNo = 'A';
      draftRevision.itemId = item.id;
      await draftRevision.save();
      await expect(expandBom(adapter, CONTEXT, { parentRevisionId: draftRevision.id })).rejects.toThrow(
        BomResolutionError
      );
      await expect(expandBom(adapter, CONTEXT, { parentItemId: item.id })).rejects.toThrow(BomResolutionError);
      await expect(expandBom(adapter, CONTEXT, {})).rejects.toThrow(BomResolutionError);
    });

    it('缺 bomType / orgId 拒绝点名（解析上下文校验）', async () => {
      await expect(
        expandBom(adapter, { ...CONTEXT, bomType: undefined } as unknown as ResolutionContext, { parentItemId: 'x' })
      ).rejects.toThrow(BomResolutionError);
      await expect(
        expandBom(adapter, { ...CONTEXT, orgId: '' } as ResolutionContext, { parentItemId: 'x' })
      ).rejects.toThrow(BomResolutionError);
    });

    it('预取消信号与展开数预算触顶：truncated 原因 cancelled / expansions', async () => {
      const items = await buildGraph(adapter, chainSpec(8));
      const aborted = new AbortController();
      aborted.abort();
      const cancelled = await expandBom(
        adapter,
        CONTEXT,
        { parentItemId: items.get('i1')!.id },
        { signal: aborted.signal }
      );
      expect(cancelled.truncated).toEqual({ reason: 'cancelled' });
      const budget = await expandBom(
        adapter,
        CONTEXT,
        { parentItemId: items.get('i1')!.id },
        { budgets: { expansions: 2 } }
      );
      expect(budget.truncated).toEqual({ reason: 'expansions' });
      expect(budget.nodes.length).toBe(3);
    });

    it('imprecise 子件评估日前无已发布修订：按叶子记入，revisionId 为 null', async () => {
      const parent = new BomItem();
      parent.itemNo = `leaf-parent-${Math.random().toString(36).slice(2, 8)}`;
      await parent.save();
      const leaf = new BomItem();
      leaf.itemNo = `leaf-child-${Math.random().toString(36).slice(2, 8)}`;
      await leaf.save();
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: parent.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: [
          {
            revisionIndex: 0,
            bomType: 'ebom',
            orgId: 'org-x',
            lines: [{ lineNo: 10, occurrences: [{ childItemId: leaf.id, qty: '1', effectiveFrom: day('2020-01-01') }] }]
          }
        ]
      });
      const result = await expandBom(adapter, CONTEXT, { parentItemId: parent.id });
      expect(result.truncated).toBeNull();
      expect(result.nodes.length).toBe(2);
      expect(result.nodes[1].itemId).toBe(leaf.id);
      expect(result.nodes[1].revisionId).toBeNull();
    });

    it('whereUsed 深度预算截断与两级路径（路径保持根→节点序）', async () => {
      const items = await buildGraph(adapter, {
        items: ['M', 'S', 'P'],
        headers: [
          { itemNo: 'M', occurrences: [{ childItemNo: 'S' }] },
          { itemNo: 'S', occurrences: [{ childItemNo: 'P' }] }
        ]
      });
      const shallow = await whereUsed(adapter, CONTEXT, { childItemId: items.get('P')!.id }, { budgets: { depth: 1 } });
      expect(shallow.truncated).toEqual({ reason: 'depth' });
      expect(shallow.nodes.length).toBe(1);
      expect(shallow.nodes[0].itemId).toBe(items.get('S')!.id);
      const full = await whereUsed(adapter, CONTEXT, { childItemId: items.get('P')!.id });
      expect(full.truncated).toBeNull();
      expect(full.nodes.length).toBe(2);
      expect(full.nodes[1].itemId).toBe(items.get('M')!.id);
      expect(full.nodes[1].path.length).toBe(2);
      expect(full.nodes[1].path[1]).toBe(full.nodes[0].occurrenceId);
    });

    it('whereUsed 缺 childItemId 拒绝点名', async () => {
      await expect(whereUsed(adapter, CONTEXT, { childItemId: '' })).rejects.toThrow(BomResolutionError);
    });

    it('下钻前沿超过分块大小：逐层分块 IN 仍完整展开', async () => {
      const count = 205;
      const items = await buildGraph(adapter, {
        items: ['root', ...Array.from({ length: count }, (_, index) => `c${index}`)],
        headers: [
          { itemNo: 'root', occurrences: Array.from({ length: count }, (_, index) => ({ childItemNo: `c${index}` })) }
        ]
      });
      const result = await expandBom(adapter, CONTEXT, { parentItemId: items.get('root')!.id });
      expect(result.truncated).toBeNull();
      expect(result.nodes.length).toBe(1 + count);
    });

    it('反查前沿超过分块大小：逐层分块 IN 仍完整', async () => {
      const count = 205;
      const items = await buildGraph(adapter, {
        items: ['part', ...Array.from({ length: count }, (_, index) => `m${index}`)],
        headers: Array.from({ length: count }, (_, index) => ({
          itemNo: `m${index}`,
          occurrences: [{ childItemNo: 'part' }]
        }))
      });
      const result = await whereUsed(adapter, CONTEXT, { childItemId: items.get('part')!.id });
      expect(result.truncated).toBeNull();
      expect(result.nodes.length).toBe(count);
    });

    it('resolveBom 边界：缺目标 / 未知显式修订 / 无修订物料 / 草稿父修订分别拒绝（US-508）', async () => {
      await expect(resolveBom(adapter, CONTEXT, {})).rejects.toThrow(BomResolutionError);
      await expect(resolveBom(adapter, CONTEXT, { parentRevisionId: crypto.randomUUID() })).rejects.toThrow(
        BomResolutionError
      );
      const bare = new BomItem();
      bare.itemNo = `bare-${Math.random().toString(36).slice(2, 8)}`;
      await bare.save();
      await expect(resolveBom(adapter, CONTEXT, { parentItemId: bare.id })).rejects.toThrow(BomResolutionError);
      const draftItem = new BomItem();
      draftItem.itemNo = `draft-res-${Math.random().toString(36).slice(2, 8)}`;
      await draftItem.save();
      const draftRevision = new BomItemRevision();
      draftRevision.revisionNo = 'A';
      draftRevision.itemId = draftItem.id;
      await draftRevision.save();
      await expect(resolveBom(adapter, CONTEXT, { parentRevisionId: draftRevision.id })).rejects.toThrow(
        BomResolutionError
      );
    });
  });
}

describe('assertCompleteResolution（AC#11，纯函数）', () => {
  it('截断结果被拒且错误点名原因', () => {
    const truncated = {
      context: CONTEXT,
      nodes: [],
      truncated: { reason: 'paths' as const }
    };
    expect(() => assertCompleteResolution(truncated)).toThrow(BomTruncationError);
    try {
      assertCompleteResolution(truncated);
    } catch (error) {
      expect(String((error as Error).message)).toContain('paths');
    }
  });

  it('未裁决备选被拒', () => {
    const unresolved: ResolutionResult = {
      manifest: {
        context: CONTEXT,
        parentItemId: 'item-1',
        parentRevisionId: 'rev-1',
        headerIds: [],
        occurrenceIds: [],
        childRevisions: [],
        unresolved: [
          {
            parentItemId: 'item-1',
            parentRevisionId: 'rev-1',
            candidates: [
              { headerId: 'h-1', alternativeNo: 1 },
              { headerId: 'h-2', alternativeNo: 2 }
            ]
          }
        ]
      },
      occurrences: []
    };
    expect(() => assertCompleteResolution(unresolved)).toThrow(BomResolutionError);
  });

  it('完整结果放行', () => {
    const complete = {
      context: CONTEXT,
      nodes: [
        {
          path: [],
          depth: 0,
          itemId: 'item-1',
          revisionId: 'rev-1',
          occurrenceId: null,
          qty: null,
          lineNo: null,
          effectiveFrom: null,
          effectiveTo: null
        }
      ],
      truncated: null
    };
    expect(() => assertCompleteResolution(complete)).not.toThrow();
  });
});
