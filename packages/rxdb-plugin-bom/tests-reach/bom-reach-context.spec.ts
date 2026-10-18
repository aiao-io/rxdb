import { describe, expect, it } from 'vitest';
import {
  createBomTestAdapter,
  disposeBomTestAdapter,
  type BomTestAdapter,
  type BomTestBackend
} from '../src/__tests__/test-utils.js';
import { BomItem } from '../src/entities.js';
import { rollupCost } from '../src/quantity/cost.js';
import { explodeBom } from '../src/quantity/explosion.js';
import { assertCompleteResolution, expandBom, whereUsed, type ExpansionResult } from '../src/resolve/expansion.js';
import { exportBom } from '../src/resolve/integration.js';
import type { ResolutionContext } from '../src/resolve/resolution.js';
import { resolveBom, type ResolveTarget } from '../src/resolve/resolver.js';
import {
  BOM_VIEW_FIXTURE_DATES,
  loadBomViewFixture,
  type BomViewFixture,
  type BomViewFixtureOccurrence,
  type BomViewFixtureRoot
} from '../src/testing/bom-view-fixture.js';
import { deterministicId } from '../src/testing/scooter-dataset.js';
import { expectReachMatches, readReachPairs, readReachRows } from './reach-test-utils.js';

type ExpectedPath = [itemId: string, path: string[], revisionId: string | null];

interface ContextCase {
  root: BomViewFixtureRoot;
  context: Partial<ResolutionContext>;
  selected: 'red' | 'blue';
  omitted: 'red' | 'blue';
  occurrence: BomViewFixtureOccurrence;
}

const withContextFixture = async (
  backend: BomTestBackend,
  run: (adapter: BomTestAdapter, fixture: BomViewFixture) => Promise<void>
): Promise<void> => {
  const adapter = await createBomTestAdapter(backend);
  try {
    await run(adapter, await loadBomViewFixture(adapter.rxdb));
  } finally {
    await disposeBomTestAdapter(adapter);
  }
};

const pathsOf = (result: ExpansionResult): ExpectedPath[] =>
  result.nodes.map(node => [node.itemId, node.path, node.revisionId]);

const alternativePaths = (fixture: BomViewFixture): ExpectedPath[] => [
  [fixture.ids.items.alternative, [], fixture.ids.revisions.alternative],
  [fixture.ids.items.red, [fixture.ids.occurrences.alternative1], fixture.ids.revisions.red],
  [fixture.ids.items.blue, [fixture.ids.occurrences.alternative2], fixture.ids.revisions.blue]
];

const expectExpansion = async (
  adapter: BomTestAdapter,
  context: ResolutionContext,
  target: ResolveTarget,
  expected: ExpectedPath[]
): Promise<void> => {
  const result = await expandBom(adapter, context, target);
  expect(result.truncated).toBeNull();
  expect(result.unresolved ?? []).toEqual([]);
  expect(pathsOf(result)).toEqual(expected);
  expect(result.nodes.map(node => node.depth)).toEqual(expected.map(([, path]) => path.length));
};

const expectUsage = async (
  adapter: BomTestAdapter,
  context: ResolutionContext,
  parentItemId: string,
  childItemId: string,
  expected: string[][]
): Promise<void> => {
  const result = await whereUsed(adapter, context, { childItemId });
  expect(result.truncated).toBeNull();
  expect(result.nodes.filter(node => node.itemId === parentItemId).map(node => node.path)).toEqual(expected);
};

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`BOM 并集可达与上下文路径隔离 [${backend}]`, () => {
    it('日期/草稿头/未发布与未生效ECN均不借并集命中混入上下查询，重边与共享路径顺序保留', async () => {
      await withContextFixture(backend, async (adapter, fixture) => {
        const { items, revisions, occurrences } = fixture.ids;
        const baseline: ExpectedPath[] = [
          [items.main, [], revisions.main],
          [items.resistor, [occurrences.repeat1], revisions.resistor],
          [items.resistor, [occurrences.repeat2], revisions.resistor],
          [items.resistor, [occurrences.repeat3], revisions.resistor],
          [items.assembly, [occurrences.shared1], revisions.assembly],
          [items.assembly, [occurrences.shared2], revisions.assembly],
          [items.phantom, [occurrences.phantom], revisions.phantom],
          [items.wire, [occurrences.shared1, occurrences.assemblyWire], revisions.wire],
          [items.wire, [occurrences.shared2, occurrences.assemblyWire], revisions.wire],
          [items.resistor, [occurrences.phantom, occurrences.phantomResistor], revisions.resistor]
        ];
        const input = fixture.input;
        const reachBefore = await readReachRows(adapter);
        const pairs = await readReachPairs(adapter);
        for (const [parent, child] of [
          [items.main, items.future],
          [items.main, items.extra],
          [items.draft, items.resistor]
        ])
          expect(pairs).toContainEqual(['ebom', 'bom-view-org', parent, child]);
        await expectExpansion(adapter, input.context, input.target, baseline);
        await expectUsage(adapter, input.context, items.main, items.future, []);
        await expectUsage(adapter, input.context, items.main, items.extra, []);
        await expectUsage(adapter, input.context, items.draft, items.resistor, []);
        await expectUsage(adapter, input.context, items.main, items.wire, [
          [occurrences.shared1, occurrences.assemblyWire],
          [occurrences.shared2, occurrences.assemblyWire]
        ]);
        const draft = fixture.inputFor('draft');
        await expectExpansion(adapter, draft.context, draft.target, [[items.draft, [], revisions.draft]]);
        const future = fixture.inputFor('main', { context: { asOfDate: new Date(BOM_VIEW_FIXTURE_DATES.future) } });
        const afterDate: ExpectedPath[] = [
          ...baseline.slice(0, 7),
          [items.future, [occurrences.future], revisions.future],
          ...baseline.slice(7)
        ];
        await expectExpansion(adapter, future.context, future.target, afterDate);
        await expectUsage(adapter, future.context, items.main, items.future, [[occurrences.future]]);
        await fixture.actions.publishPendingEcn();
        const beforeEcn = fixture.inputFor('main', { context: { asOfDate: new Date('2098-12-31T00:00:00.000Z') } });
        await expectExpansion(adapter, beforeEcn.context, beforeEcn.target, baseline);
        await expectUsage(adapter, beforeEcn.context, items.main, items.extra, []);
        const afterEcn: ExpectedPath[] = [
          ...baseline.slice(0, 7),
          [items.extra, [occurrences.pending], revisions.extra],
          ...baseline.slice(7)
        ];
        await expectExpansion(adapter, input.context, input.target, afterEcn);
        await expectUsage(adapter, input.context, items.main, items.extra, [[occurrences.pending]]);
        expect(await readReachRows(adapter)).toEqual(reachBefore);
        await expectReachMatches(adapter);
      });
    }, 60_000);

    it('备选由resolve裁决且expand保留原多头路径，配置/序列/批次上下查询严格过滤并集候选', async () => {
      await withContextFixture(backend, async (adapter, fixture) => {
        const { items, revisions, occurrences } = fixture.ids;
        const cases: ContextCase[] = [
          {
            root: 'config',
            context: { configSelection: { COLOR: ['red'] } },
            selected: 'red',
            omitted: 'blue',
            occurrence: 'red'
          },
          {
            root: 'config',
            context: { configSelection: { COLOR: ['blue'] } },
            selected: 'blue',
            omitted: 'red',
            occurrence: 'blue'
          },
          { root: 'unit', context: { unit: 136 }, selected: 'red', omitted: 'blue', occurrence: 'unitOld' },
          { root: 'unit', context: { unit: 137 }, selected: 'blue', omitted: 'red', occurrence: 'unitNew' },
          { root: 'lot', context: { lot: 'B1' }, selected: 'red', omitted: 'blue', occurrence: 'lot1' },
          { root: 'lot', context: { lot: 'B2' }, selected: 'blue', omitted: 'red', occurrence: 'lot2' }
        ];
        const before = await readReachRows(adapter);
        const pairs = await readReachPairs(adapter);
        for (const alternativeNo of [1, 2]) {
          const input = fixture.inputFor('alternative', { context: { alternativeNo } });
          const selected = alternativeNo === 1 ? 'red' : 'blue';
          const occurrence = alternativeNo === 1 ? occurrences.alternative1 : occurrences.alternative2;
          expect(pairs).toContainEqual(['ebom', 'bom-view-org', items.alternative, items.red]);
          expect(pairs).toContainEqual(['ebom', 'bom-view-org', items.alternative, items.blue]);
          const resolved = await resolveBom(adapter, input.context, input.target);
          expect(resolved.manifest.unresolved).toEqual([]);
          expect(
            resolved.occurrences.map(row => [row.childItemId, row.occurrenceId, row.resolvedChildRevisionId])
          ).toEqual([[items[selected], occurrence, revisions[selected]]]);
          await expectExpansion(adapter, input.context, input.target, alternativePaths(fixture));
          await expectUsage(adapter, input.context, items.alternative, items.red, [[occurrences.alternative1]]);
          await expectUsage(adapter, input.context, items.alternative, items.blue, [[occurrences.alternative2]]);
          const quantity = await explodeBom(adapter, input.context, input.target, { plannedQty: input.plannedQty });
          expect(quantity.requirementLines.map(row => [row.itemId, row.path])).toEqual([
            [items[selected], [occurrence]]
          ]);
        }
        for (const entry of cases) {
          const input = fixture.inputFor(entry.root, { context: entry.context });
          expect(pairs).toContainEqual(['ebom', 'bom-view-org', items[entry.root], items[entry.omitted]]);
          await expectExpansion(adapter, input.context, input.target, [
            [items[entry.root], [], revisions[entry.root]],
            [items[entry.selected], [occurrences[entry.occurrence]], revisions[entry.selected]]
          ]);
          await expectUsage(adapter, input.context, items[entry.root], items[entry.omitted], []);
          await expectUsage(adapter, input.context, items[entry.root], items[entry.selected], [
            [occurrences[entry.occurrence]]
          ]);
        }
        expect(await readReachRows(adapter)).toEqual(before);
      });
    }, 60_000);

    it('并集命中不消除未裁决候选和截断，数量保留标记，成本与导出拒绝不完整消费', async () => {
      await withContextFixture(backend, async (adapter, fixture) => {
        const alternative = fixture.inputFor('alternative');
        const unresolved = await resolveBom(adapter, alternative.context, alternative.target);
        expect(unresolved.occurrences).toEqual([]);
        expect(
          unresolved.manifest.unresolved.map(row => row.candidates.map(candidate => candidate.alternativeNo))
        ).toEqual([[1, 2]]);
        await expectExpansion(adapter, alternative.context, alternative.target, alternativePaths(fixture));
        expect(() => assertCompleteResolution(unresolved)).toThrow(/未裁决|unresolved|备选/);
        await expect(
          explodeBom(adapter, alternative.context, alternative.target, { plannedQty: alternative.plannedQty })
        ).rejects.toThrow(/备选|alternativeNo/);
        await expect(
          rollupCost(
            adapter,
            { ...alternative.context, currency: 'CNY', rateDate: alternative.context.asOfDate },
            alternative.target
          )
        ).rejects.toThrow(/备选|alternative/);
        await expect(exportBom(adapter, alternative.context, alternative.target)).rejects.toThrow(/未解析|未裁决|候选/);
        const unit = fixture.inputFor('unit');
        const quantity = await explodeBom(adapter, unit.context, unit.target, { plannedQty: unit.plannedQty });
        expect(quantity.requirementLines).toEqual([]);
        expect(
          quantity.manifest.unresolved.map(row => row.candidates.map(candidate => candidate.occurrenceId))
        ).toEqual([[fixture.ids.occurrences.unitOld, fixture.ids.occurrences.unitNew].sort()]);
        await expect(
          rollupCost(adapter, { ...unit.context, currency: 'CNY', rateDate: unit.context.asOfDate }, unit.target)
        ).rejects.toThrow(/unit|序列/);
        await expect(exportBom(adapter, unit.context, unit.target)).rejects.toThrow(/未解析|未裁决|候选/);
        const main = fixture.input;
        const truncated = await expandBom(adapter, main.context, main.target, { budgets: { depth: 0 } });
        expect(truncated.truncated).toEqual({ reason: 'depth' });
        expect(() => assertCompleteResolution(truncated)).toThrow(/depth/);
        const partial = await explodeBom(adapter, main.context, main.target, {
          plannedQty: main.plannedQty,
          budgets: { depth: 0 }
        });
        expect(partial.truncated).toEqual({ reason: 'depth' });
        await expect(
          exportBom(adapter, main.context, main.target, { plannedQty: main.plannedQty, budgets: { depth: 0 } })
        ).rejects.toThrow(/截断/);
        await expectReachMatches(adapter);
      });
    }, 60_000);

    it('历史修订和precise锁版沿原路径分别下钻，并集中的未来分支不会提前出现', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const id = (key: string) => deterministicId(`reach-context:${key}`);
        const items = ['root', 'assembly', 'old', 'new'] as const;
        for (const key of items)
          await adapter.rxdb.entityManager.instantiate(BomItem, { id: id(key), itemNo: key }).save();
        const at = (date: string) => new Date(`${date}T00:00:00.000Z`);
        await adapter.rxdb.bom.loadHistory({
          batchNo: 'reach-context-revisions',
          revisions: [
            { id: id('root-A'), itemId: id('root'), revisionNo: 'A', effectiveFrom: at('2026-01-01') },
            { id: id('assembly-D'), itemId: id('assembly'), revisionNo: 'D', effectiveFrom: at('2026-01-01') },
            { id: id('assembly-E'), itemId: id('assembly'), revisionNo: 'E', effectiveFrom: at('2026-06-01') },
            { id: id('old-A'), itemId: id('old'), revisionNo: 'A', effectiveFrom: at('2026-01-01') },
            { id: id('new-A'), itemId: id('new'), revisionNo: 'A', effectiveFrom: at('2026-01-01') }
          ],
          headers: [
            {
              revisionIndex: 0,
              bomType: 'ebom',
              orgId: 'reach-context-org',
              lines: [
                {
                  lineNo: 10,
                  occurrences: [
                    { id: id('imprecise'), childItemId: id('assembly'), qty: '1', effectiveFrom: at('2026-01-01') }
                  ]
                },
                {
                  lineNo: 20,
                  occurrences: [
                    {
                      id: id('precise'),
                      childItemId: id('assembly'),
                      childRevisionId: id('assembly-D'),
                      qty: '1',
                      effectiveFrom: at('2026-01-01')
                    }
                  ]
                }
              ]
            },
            {
              revisionIndex: 1,
              bomType: 'ebom',
              orgId: 'reach-context-org',
              lines: [
                {
                  lineNo: 10,
                  occurrences: [
                    { id: id('old-edge'), childItemId: id('old'), qty: '1', effectiveFrom: at('2026-01-01') }
                  ]
                }
              ]
            },
            {
              revisionIndex: 2,
              bomType: 'ebom',
              orgId: 'reach-context-org',
              lines: [
                {
                  lineNo: 10,
                  occurrences: [
                    { id: id('new-edge'), childItemId: id('new'), qty: '1', effectiveFrom: at('2026-06-01') }
                  ]
                }
              ]
            }
          ]
        });
        const pairs = await readReachPairs(adapter);
        expect(pairs).toContainEqual(['ebom', 'reach-context-org', id('root'), id('new')]);
        const context = { bomType: 'ebom' as const, orgId: 'reach-context-org', asOfDate: at('2026-05-01') };
        const target = { parentItemId: id('root') };
        await expectExpansion(adapter, context, target, [
          [id('root'), [], id('root-A')],
          [id('assembly'), [id('imprecise')], id('assembly-D')],
          [id('assembly'), [id('precise')], id('assembly-D')],
          [id('old'), [id('imprecise'), id('old-edge')], id('old-A')],
          [id('old'), [id('precise'), id('old-edge')], id('old-A')]
        ]);
        await expectUsage(adapter, context, id('root'), id('new'), []);
        await expectExpansion(adapter, { ...context, asOfDate: at('2026-07-01') }, target, [
          [id('root'), [], id('root-A')],
          [id('assembly'), [id('imprecise')], id('assembly-E')],
          [id('assembly'), [id('precise')], id('assembly-D')],
          [id('new'), [id('imprecise'), id('new-edge')], id('new-A')],
          [id('old'), [id('precise'), id('old-edge')], id('old-A')]
        ]);
        expect(await readReachPairs(adapter)).toEqual(pairs);
        await expectReachMatches(adapter);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    }, 60_000);
  });
}
