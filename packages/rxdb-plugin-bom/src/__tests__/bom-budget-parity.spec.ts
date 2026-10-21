/**
 * @fileoverview 预算口径：下钻 / 数量展开 / 反查（US-510 AC#1 / #10 的预算结算；US-511 数量展开复用）
 *
 * 三处共用一份结算，顺序「取消 → 深度 → 返回路径数 → 展开数」：展开数只数生成的非根节点（根不是一次展开），
 * 返回路径数数结果里的全部节点——下钻含根、反查没有根节点，数量展开的路径节点是需求行与虚拟件穿透、另加根。
 * 断言两件事：各入口恰好放行预算内的节点，没放完即标 truncated（不静默超预算）；遍历节点集相同的结构上，
 * 下钻与数量展开同一预算下在同一处截断、原因相同。双后端同断言。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomItem } from '../entities.js';
import { explodeBom, type ExplosionResult } from '../quantity/explosion.js';
import { expandBom, whereUsed, type ExpansionBudgets, type ExpansionResult } from '../resolve/expansion.js';
import {
  buildQuantityFixture,
  createBomTestAdapter,
  disposeBomTestAdapter,
  type BomTestAdapter,
  type BomTestBackend
} from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const CONTEXT = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: new Date('2026-01-01T00:00:00.000Z') };

const makeItem = async (itemNo: string): Promise<BomItem> => {
  const item = new BomItem();
  item.itemNo = `budget-parity-${itemNo}-${crypto.randomUUID()}`;
  item.stockUom = 'pcs';
  item.uomDecimals = 0;
  await item.save();
  return item;
};

/** 展开的非根节点路径（爆炸不为根产出路径记录）。 */
const expansionPaths = (result: ExpansionResult): string[] =>
  result.nodes
    .filter(node => node.depth > 0)
    .map(node => node.path.join('>'))
    .sort();

/** 爆炸遍历生成的路径节点：需求行与虚拟件穿透。 */
const explosionPaths = (result: ExplosionResult): string[] =>
  [...result.requirementLines.map(line => line.path), ...result.penetrations.map(record => record.path)]
    .map(path => path.join('>'))
    .sort();

for (const backend of BACKENDS) {
  describe(`预算口径：下钻 / 数量展开 / 反查 [${backend}]`, () => {
    let adapter: BomTestAdapter;
    let root: BomItem;
    let usedChild: BomItem;

    /** 同一显式预算下各跑一遍展开与数量展开。 */
    const both = async (budgets: ExpansionBudgets): Promise<[ExpansionResult, ExplosionResult]> => [
      await expandBom(adapter, CONTEXT, { parentItemId: root.id }, { budgets }),
      await explodeBom(adapter, CONTEXT, { parentItemId: root.id }, { plannedQty: { value: '1', uom: 'pcs' }, budgets })
    ];

    /** 两边的截断原因与路径集合逐项一致（断言对象带预算值，失败时点名哪一档）；返回共同的截断原因。 */
    const expectSameCut = async (budgets: ExpansionBudgets): Promise<string | null> => {
      const [expansion, explosion] = await both(budgets);
      const reason = expansion.truncated?.reason ?? null;
      expect({ budgets, reason: explosion.truncated?.reason ?? null }).toEqual({ budgets, reason });
      expect({ budgets, paths: explosionPaths(explosion) }).toEqual({ budgets, paths: expansionPaths(expansion) });
      return reason;
    };

    /** 反查在给定预算下的摘要：预算、返回节点的路径（BFS 序）与截断原因。 */
    const usageCut = async (budgets: ExpansionBudgets) => {
      const result = await whereUsed(adapter, CONTEXT, { childItemId: usedChild.id }, { budgets });
      return {
        budgets,
        paths: result.nodes.map(node => node.path.join('>')),
        reason: result.truncated?.reason ?? null
      };
    };

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
      root = await makeItem('root');
      const [leaf, assembly, phantom] = [await makeItem('leaf'), await makeItem('assembly'), await makeItem('phantom')];
      const [b, c, d, e] = [await makeItem('b'), await makeItem('c'), await makeItem('d'), await makeItem('e')];
      // R → 叶子 / 子装配 / 虚拟件；子装配 → b、c（需求行），虚拟件 → d、e（穿透后的需求行）
      await buildQuantityFixture(adapter, [
        { item: root, occurrences: [{ child: leaf }, { child: assembly }, { child: phantom }] },
        { item: assembly, occurrences: [{ child: b }, { child: c }] },
        { item: phantom, defaultPhantom: true, occurrences: [{ child: d }, { child: e }] }
      ]);
      // 反查结构：被查子件经 M1 / M2 / M3 各使用一次，M1 再被整机 T 使用（全量 4 个使用方节点）
      usedChild = await makeItem('used');
      const [m1, m2, m3, top] = [
        await makeItem('m1'),
        await makeItem('m2'),
        await makeItem('m3'),
        await makeItem('top')
      ];
      await buildQuantityFixture(adapter, [
        { item: m1, occurrences: [{ child: usedChild }] },
        { item: m2, occurrences: [{ child: usedChild }] },
        { item: m3, occurrences: [{ child: usedChild }] },
        { item: top, occurrences: [{ child: m1 }] }
      ]);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    it('构造前提：默认预算下两边都完整，路径集合相同（7 个非根节点：6 条需求行含子装配 + 1 次穿透）', async () => {
      const [expansion, explosion] = await both({});
      expect(expansion.truncated).toBeNull();
      expect(explosion.truncated).toBeNull();
      expect(expansion.nodes).toHaveLength(8);
      expect(explosion.requirementLines).toHaveLength(6);
      expect(explosion.penetrations).toHaveLength(1);
      expect(explosionPaths(explosion)).toEqual(expansionPaths(expansion));
    });

    it('返回路径数含根：每档 paths 两边截断原因相同、产出的路径集合相同', async () => {
      for (let paths = 1; paths <= 9; paths += 1) await expectSameCut({ paths });
    });

    it('展开数与深度：每档两边截断原因相同、产出的路径集合相同', async () => {
      for (let expansions = 0; expansions <= 8; expansions += 1) await expectSameCut({ expansions });
      for (let depth = 0; depth <= 3; depth += 1) await expectSameCut({ depth });
    });

    it('多项预算在同一节点触顶时两边按同一顺序结算：深度先于返回路径数，返回路径数先于展开数', async () => {
      expect(await expectSameCut({ depth: 1, paths: 4 })).toBe('depth');
      expect(await expectSameCut({ paths: 3, expansions: 2 })).toBe('paths');
      expect(await expectSameCut({ paths: 5, expansions: 3 })).toBe('expansions');
    });

    it('下钻与数量展开：恰好放行预算内的节点，没放完即标 truncated；根总在下钻结果里', async () => {
      const [full] = await both({});
      const generated = full.nodes.length - 1;
      for (let expansions = 0; expansions <= generated + 1; expansions += 1) {
        const [expansion, explosion] = await both({ expansions });
        const kept = Math.min(expansions, generated);
        const reason = expansions < generated ? 'expansions' : null;
        expect({
          expansions,
          expand: [expansion.nodes.length - 1, expansion.truncated?.reason ?? null],
          explode: [explosionPaths(explosion).length, explosion.truncated?.reason ?? null]
        }).toEqual({ expansions, expand: [kept, reason], explode: [kept, reason] });
      }
      for (let paths = 0; paths <= full.nodes.length + 1; paths += 1) {
        const [expansion, explosion] = await both({ paths });
        // 根不是一次展开、总在下钻结果里：paths = 0 也只返回根，并标 truncated
        const returned = Math.max(Math.min(paths, full.nodes.length), 1);
        const reason = paths < full.nodes.length ? 'paths' : null;
        expect({
          paths,
          expand: [expansion.nodes.length, expansion.truncated?.reason ?? null],
          explode: [explosionPaths(explosion).length, explosion.truncated?.reason ?? null]
        }).toEqual({ paths, expand: [returned, reason], explode: [returned - 1, reason] });
      }
    });

    it('反查没有根节点：各档 expansions / paths 恰好放行预算个使用方节点（BFS 前缀），没放完即标 truncated', async () => {
      const full = await usageCut({});
      expect(full.reason).toBeNull();
      expect(full.paths).toHaveLength(4);
      for (let limit = 0; limit <= full.paths.length + 1; limit += 1) {
        for (const [budgets, reason] of [
          [{ expansions: limit }, 'expansions'],
          [{ paths: limit }, 'paths']
        ] as const) {
          expect(await usageCut(budgets)).toEqual({
            budgets,
            paths: full.paths.slice(0, limit),
            reason: limit < full.paths.length ? reason : null
          });
        }
      }
    });

    it('反查的深度按距被查子件的边数结算；多项预算在同一节点触顶时先报返回路径数，展开数先满即报展开数', async () => {
      const full = await whereUsed(adapter, CONTEXT, { childItemId: usedChild.id });
      expect(full.nodes.map(node => node.depth)).toEqual([1, 1, 1, 2]);
      for (let depth = 0; depth <= 3; depth += 1) {
        const kept = full.nodes.filter(node => node.depth <= depth).map(node => node.path.join('>'));
        expect(await usageCut({ depth })).toEqual({
          budgets: { depth },
          paths: kept,
          reason: kept.length < full.nodes.length ? 'depth' : null
        });
      }
      expect(await usageCut({ paths: 2, expansions: 2 })).toMatchObject({ reason: 'paths' });
      expect(await usageCut({ paths: 3, expansions: 2 })).toEqual({
        budgets: { paths: 3, expansions: 2 },
        paths: full.nodes.slice(0, 2).map(node => node.path.join('>')),
        reason: 'expansions'
      });
    });
  });
}
