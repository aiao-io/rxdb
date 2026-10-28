import type { RxDB } from '@aiao/rxdb';
import { filter, firstValueFrom, ReplaySubject, timeout } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { BomItem, createBomView } from '../index.js';
import { BOM_VIEW_FIXTURE_DATES, loadBomViewFixture, type BomViewFixture } from '../testing/bom-view-fixture.js';
import { deterministicId } from '../testing/scooter-dataset.js';
import type { BomViewHandle, BomViewInput, BomViewSnapshot, BomViewState } from '../view-types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestBackend } from './test-utils.js';

const withFixture = async (
  backend: BomTestBackend,
  run: (db: RxDB, fixture: BomViewFixture) => Promise<void>
): Promise<void> => {
  const adapter = await createBomTestAdapter(backend);
  try {
    await run(adapter.rxdb, await loadBomViewFixture(adapter.rxdb));
  } finally {
    await disposeBomTestAdapter(adapter);
  }
};

const observe = (db: RxDB, input: BomViewInput) => {
  const values: BomViewSnapshot[] = [];
  const changes = new ReplaySubject<BomViewSnapshot>(1);
  const subscription = db.bom.watchView(input).subscribe({
    next(value) {
      values.push(value);
      changes.next(value);
    },
    error: (cause: unknown) => changes.error(cause)
  });
  return {
    values,
    next: (predicate: (snapshot: BomViewSnapshot) => boolean = () => true) =>
      firstValueFrom(
        changes.pipe(
          filter(value => !value.refreshing && predicate(value)),
          timeout(10_000)
        )
      ),
    stop: () => subscription.unsubscribe()
  };
};

const read = async (db: RxDB, input: BomViewInput): Promise<BomViewSnapshot> => {
  const recorded = observe(db, input);
  try {
    return await recorded.next();
  } finally {
    recorded.stop();
  }
};

const quantities = (snapshot: BomViewSnapshot, itemId: string): string[] =>
  snapshot.explosion?.requirementLines.filter(line => line.itemId === itemId).map(line => line.qty) ?? [];

const stateOf = (view: BomViewHandle, predicate: (state: BomViewState) => boolean = () => true) =>
  firstValueFrom(view.state$.pipe(filter(predicate), timeout(10_000)));

const ready = (view: BomViewHandle) => stateOf(view, state => state.phase === 'success' && !state.refreshing);

const showRoot = async (view: BomViewHandle): Promise<BomViewState> => {
  const state = await ready(view);
  if (state.nodes.find(node => node.depth === 0)?.expanded !== true) view.toggle([]);
  return stateOf(view, state => state.nodes.some(node => node.depth === 1));
};

/** 根有备选 1/2、备选 2 引用只有一张头的子装配；返回根、子装配与叶子的物料 id。 */
const loadAlternativeSubtree = async (db: RxDB) => {
  const id = (key: string) => deterministicId(`bom-view-alternative-subtree:${key}`);
  const stamp = new Date(BOM_VIEW_FIXTURE_DATES.baseline);
  const audit = { createdAt: stamp, updatedAt: stamp };
  const keys = ['root', 'sub', 'leaf'] as const;
  for (const key of keys) {
    await db.entityManager
      .instantiate(BomItem, {
        ...audit,
        id: id(`item:${key}`),
        itemNo: `BOM-VIEW-ALT-${key.toUpperCase()}`,
        description: key,
        stockUom: 'pcs',
        uomDecimals: 0,
        uomConversion: null,
        unitPrice: key === 'leaf' ? '1' : null,
        priceUom: 'pcs',
        priceCurrency: 'CNY'
      } as Partial<BomItem>)
      .save();
  }
  const occurrence = (key: string, child: (typeof keys)[number], qty: string) => ({
    ...audit,
    id: id(`occurrence:${key}`),
    childItemId: id(`item:${child}`),
    qty,
    effectiveFrom: stamp
  });
  const header = (
    key: string,
    revisionIndex: number,
    child: (typeof keys)[number],
    qty: string,
    alternativeNo = 1
  ) => ({
    ...audit,
    id: id(`header:${key}`),
    revisionIndex,
    alternativeNo,
    bomType: 'ebom' as const,
    orgId: 'bom-view-org',
    costLotQty: '1',
    lines: [{ ...audit, id: id(`line:${key}`), lineNo: 10, occurrences: [occurrence(key, child, qty)] }]
  });
  await db.bom.loadHistory({
    ...audit,
    batchNo: 'bom-view-alternative-subtree',
    id: id('batch'),
    revisions: keys.map(key => ({
      ...audit,
      id: id(`revision:${key}`),
      itemId: id(`item:${key}`),
      revisionNo: 'A',
      effectiveFrom: stamp
    })),
    headers: [header('root:1', 0, 'leaf', '5'), header('root:2', 0, 'sub', '3', 2), header('sub', 1, 'leaf', '2')]
  });
  return { root: id('item:root'), sub: id('occurrence:root:2'), leaf: id('occurrence:sub') };
};

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`BOM 共享派生视图 [${backend}]`, () => {
    it('AC#6：真实发布 ECN 后，旧结果从未引用的新发生项与数量同时出现', async () => {
      await withFixture(backend, async (db, fixture) => {
        const recorded = observe(db, fixture.input);
        try {
          const before = await recorded.next();
          expect(before.quantityError).toBeNull();
          expect(before.expansion.nodes.some(node => node.occurrenceId === fixture.ids.occurrences.pending)).toBe(
            false
          );
          expect(quantities(before, fixture.ids.items.extra)).toEqual([]);
          await fixture.actions.publishPendingEcn();
          const after = await recorded.next(snapshot => quantities(snapshot, fixture.ids.items.extra).length === 1);
          expect(after.expansion.nodes.some(node => node.occurrenceId === fixture.ids.occurrences.pending)).toBe(true);
          expect(quantities(after, fixture.ids.items.extra)).toEqual(['5']);
          for (const snapshot of recorded.values) {
            expect(snapshot.expansion.nodes.some(node => node.occurrenceId === fixture.ids.occurrences.pending)).toBe(
              quantities(snapshot, fixture.ids.items.extra).length > 0
            );
          }
        } finally {
          recorded.stop();
        }
      });
    });

    it('AC#7：只改变显式日期即得到新生效行，原输入的快照保持原日期', async () => {
      await withFixture(backend, async (db, fixture) => {
        const before = await read(db, fixture.input);
        expect(quantities(before, fixture.ids.items.future)).toEqual([]);
        const future = fixture.inputFor('main', {
          context: { asOfDate: new Date(BOM_VIEW_FIXTURE_DATES.future) }
        });
        const after = await read(db, future);
        expect(quantities(after, fixture.ids.items.future)).toEqual(['7']);
        expect(before.expansion.context.asOfDate.toISOString()).toBe(BOM_VIEW_FIXTURE_DATES.evaluation);
        expect(after.expansion.context.asOfDate.toISOString()).toBe(BOM_VIEW_FIXTURE_DATES.future);
        expect(after.explosion?.manifest.context.asOfDate).toEqual(future.context.asOfDate);
      });
    });

    it('AC#8/#9：发布 imprecise 新修订及 phantom 默认值、改换算率均自动刷新', async () => {
      await withFixture(backend, async (db, fixture) => {
        const recorded = observe(db, fixture.input);
        try {
          const before = await recorded.next();
          expect(quantities(before, fixture.ids.items.assembly)).toEqual(['1', '2']);
          expect(quantities(before, fixture.ids.items.wire)).toEqual(['1', '2']);
          const revisionId = await fixture.actions.publishAssemblyRevision({ phantom: true, qty: '6' });
          const revised = await recorded.next(snapshot =>
            snapshot.expansion.nodes.some(
              node => node.occurrenceId === fixture.ids.occurrences.shared1 && node.revisionId === revisionId
            )
          );
          expect(quantities(revised, fixture.ids.items.assembly)).toEqual([]);
          expect(quantities(revised, fixture.ids.items.wire)).toEqual(['3', '6']);
          expect(
            revised.explosion?.penetrations.filter(line => line.childItemId === fixture.ids.items.assembly)
          ).toHaveLength(2);
          await fixture.actions.setConversion('4');
          const converted = await recorded.next(snapshot => quantities(snapshot, fixture.ids.items.wire)[0] === '1.5');
          expect(quantities(converted, fixture.ids.items.wire)).toEqual(['1.5', '3']);
          expect(
            converted.explosion?.requirementLines
              .filter(line => line.itemId === fixture.ids.items.wire)
              .every(line => line.uom === 'm')
          ).toBe(true);
        } finally {
          recorded.stop();
        }
      });
    });

    it('引用物料的显示信息变化会更新快照，不能只按结构 ID 指纹去重', async () => {
      await withFixture(backend, async (db, fixture) => {
        const recorded = observe(db, fixture.input);
        try {
          await recorded.next();
          await fixture.actions.setDescription('resistor', '新的电阻描述');
          const after = await recorded.next(snapshot =>
            snapshot.items.some(item => item.id === fixture.ids.items.resistor && item.description === '新的电阻描述')
          );
          expect(after.items.find(item => item.id === fixture.ids.items.resistor)?.description).toBe('新的电阻描述');
        } finally {
          recorded.stop();
        }
      });
    });

    it('完整输入身份区分组织、BOM 类型、目标、计划量、预算和公式参数', async () => {
      await withFixture(backend, async (db, fixture) => {
        const [organization, sales, factor2, factor5, planned3, budget, explicitRevision] = await Promise.all([
          read(db, fixture.inputFor('main', { context: { orgId: 'bom-view-other-org' } })),
          read(db, fixture.inputFor('main', { context: { bomType: 'sales' } })),
          read(db, fixture.inputFor('formula', { params: { factor: '2' } })),
          read(db, fixture.inputFor('formula', { params: { factor: '5' } })),
          read(db, fixture.inputFor('formula', { plannedQty: { value: '3', uom: 'pcs' } })),
          read(db, fixture.inputFor('main', { budgets: { depth: 1 } })),
          read(db, fixture.inputFor('formula', { target: { parentRevisionId: fixture.ids.revisions.formula } }))
        ]);
        expect(quantities(organization, fixture.ids.items.red)).toEqual(['31']);
        expect(quantities(sales, fixture.ids.items.blue)).toEqual(['37']);
        expect(quantities(factor2, fixture.ids.items.resistor)).toEqual(['4']);
        expect(quantities(factor5, fixture.ids.items.resistor)).toEqual(['10']);
        expect(quantities(planned3, fixture.ids.items.resistor)).toEqual(['12']);
        expect(budget.expansion.truncated?.reason).toBe('depth');
        expect(budget.expansion.nodes.every(node => node.depth <= 1)).toBe(true);
        expect(explicitRevision.explosion?.manifest.parentRevisionId).toBe(fixture.ids.revisions.formula);
      });
    });

    it('完整上下文身份区分备选、配置、序列、批次与 manual 选择', async () => {
      await withFixture(backend, async (db, fixture) => {
        const [alternative1, alternative2, red, blue, unit136, unit137, lot1, lot2, primary, substitute] =
          await Promise.all([
            read(db, fixture.inputFor('alternative', { context: { alternativeNo: 1 } })),
            read(db, fixture.inputFor('alternative', { context: { alternativeNo: 2 } })),
            read(db, fixture.inputFor('config', { context: { configSelection: { COLOR: ['red'] } } })),
            read(db, fixture.inputFor('config', { context: { configSelection: { COLOR: ['blue'] } } })),
            read(db, fixture.inputFor('unit', { context: { unit: 136 } })),
            read(db, fixture.inputFor('unit', { context: { unit: 137 } })),
            read(db, fixture.inputFor('lot', { context: { lot: 'B1' } })),
            read(db, fixture.inputFor('lot', { context: { lot: 'B2' } })),
            read(
              db,
              fixture.inputFor('manual', {
                context: {
                  substituteSelections: { 'BOM-VIEW-MANUAL': { memberKey: fixture.ids.items.resistor } }
                }
              })
            ),
            read(
              db,
              fixture.inputFor('manual', {
                context: {
                  substituteSelections: { 'BOM-VIEW-MANUAL': { memberKey: fixture.ids.items.replacement } }
                }
              })
            )
          ]);
        expect(quantities(alternative1, fixture.ids.items.red)).toEqual(['1']);
        expect(quantities(alternative2, fixture.ids.items.blue)).toEqual(['2']);
        expect(quantities(red, fixture.ids.items.red)).toEqual(['23']);
        expect(quantities(red, fixture.ids.items.blue)).toEqual([]);
        expect(quantities(blue, fixture.ids.items.blue)).toEqual(['29']);
        expect(quantities(unit136, fixture.ids.items.red)).toEqual(['11']);
        expect(quantities(unit137, fixture.ids.items.blue)).toEqual(['13']);
        expect(quantities(lot1, fixture.ids.items.red)).toEqual(['17']);
        expect(quantities(lot2, fixture.ids.items.blue)).toEqual(['19']);
        expect(quantities(primary, fixture.ids.items.resistor)).toEqual(['4']);
        expect(quantities(substitute, fixture.ids.items.replacement)).toEqual(['4']);
      });
    });

    it('子装配只有一张头、根指定 alternativeNo=2 时子树照常可见', async () => {
      await withFixture(backend, async (db, fixture) => {
        const ids = await loadAlternativeSubtree(db);
        const view = createBomView(
          db,
          fixture.inputFor('main', { target: { parentItemId: ids.root }, context: { alternativeNo: 2 } })
        );
        try {
          await showRoot(view);
          view.toggle([ids.sub]);
          const state = await stateOf(view, value => value.nodes.some(node => node.depth === 2));
          expect(state.unresolved).toEqual([]);
          expect(state.nodes.map(node => node.path)).toEqual([[], [ids.sub], [ids.sub, ids.leaf]]);
          expect(state.nodes.map(node => node.quantity?.value)).toEqual(['1', '3', '6']);
          const explosion = await view.calculate();
          expect(new Map(explosion.requirementLines.map(line => [JSON.stringify(line.path), line.qty]))).toEqual(
            new Map([
              [JSON.stringify([ids.sub]), '3'],
              [JSON.stringify([ids.sub, ids.leaf]), '6']
            ])
          );
        } finally {
          view.destroy();
        }
      });
    });

    it('AC#5/#10：三重边不合并，共享子装配按完整路径独立惰性展开', async () => {
      await withFixture(backend, async (db, fixture) => {
        const view = createBomView(db, fixture.input);
        try {
          const initial = await showRoot(view);
          expect(
            initial.nodes.filter(node => node.depth === 1 && node.itemId === fixture.ids.items.resistor)
          ).toHaveLength(3);
          expect(initial.nodes.some(node => node.depth > 1)).toBe(false);
          const firstPath = [fixture.ids.occurrences.shared1];
          const secondPath = [fixture.ids.occurrences.shared2];
          view.toggle(firstPath);
          const first = await stateOf(view, state => state.nodes.some(node => node.depth === 2));
          expect(first.nodes.filter(node => node.depth === 2).map(node => node.path)).toEqual([
            [...firstPath, fixture.ids.occurrences.assemblyWire]
          ]);
          expect(first.nodes.find(node => node.occurrenceId === fixture.ids.occurrences.shared2)?.expanded).toBe(false);
          view.toggle(secondPath);
          const both = await stateOf(view, state => state.nodes.filter(node => node.depth === 2).length === 2);
          expect(new Set(both.nodes.map(node => node.key)).size).toBe(both.nodes.length);
          expect(both.nodes.filter(node => node.depth === 2).map(node => node.quantity?.value)).toEqual(['1', '2']);
          view.toggle(firstPath);
          const secondOnly = await stateOf(view, state => state.nodes.filter(node => node.depth === 2).length === 1);
          expect(secondOnly.nodes.find(node => node.depth === 2)?.path).toEqual([
            ...secondPath,
            fixture.ids.occurrences.assemblyWire
          ]);
        } finally {
          view.destroy();
        }
      });
    });

    it('同目标只改参数保留展开状态，换目标按默认展开新根', async () => {
      await withFixture(backend, async (db, fixture) => {
        const view = createBomView(db, fixture.input);
        try {
          await showRoot(view);
          const shared = fixture.ids.occurrences.shared1;
          view.toggle([shared]);
          await stateOf(view, state => state.nodes.some(node => node.depth === 2));
          view.setInput(fixture.inputFor('main', { plannedQty: { value: '2', uom: 'pcs' } }));
          const retained = await stateOf(
            view,
            state => state.phase === 'success' && !state.refreshing && state.nodes.some(node => node.depth === 2)
          );
          expect(retained.nodes.find(node => node.occurrenceId === shared)?.expanded).toBe(true);
          view.toggle([]);
          await stateOf(view, state => state.nodes.length === 1);
          view.setInput(fixture.inputFor('formula'));
          const switched = await stateOf(
            view,
            state =>
              state.phase === 'success' && !state.refreshing && state.nodes[0]?.itemId === fixture.ids.items.formula
          );
          expect(switched.nodes[0].expanded).toBe(true);
          expect(switched.nodes.some(node => node.depth === 1)).toBe(true);
        } finally {
          view.destroy();
        }
      });
    });

    it('AC#2：ECN 替换发生项只改变受影响路径，其余 key 和展开状态稳定', async () => {
      await withFixture(backend, async (db, fixture) => {
        const view = createBomView(db, fixture.input);
        try {
          const before = await showRoot(view);
          const stable = before.nodes
            .filter(node => node.occurrenceId !== fixture.ids.occurrences.repeat1)
            .map(node => [node.key, node.path] as const);
          view.toggle([fixture.ids.occurrences.shared1]);
          await fixture.actions.publishQuantityEcn();
          const after = await stateOf(
            view,
            state =>
              !state.refreshing &&
              state.nodes.some(
                node =>
                  node.occurrenceId === fixture.ids.occurrences.quantityReplacement && node.quantity?.value === '9'
              )
          );
          expect(after.nodes.some(node => node.occurrenceId === fixture.ids.occurrences.repeat1)).toBe(false);
          for (const [key, path] of stable) expect(after.nodes.find(node => node.key === key)?.path).toEqual(path);
          expect(after.nodes.find(node => node.occurrenceId === fixture.ids.occurrences.shared1)?.expanded).toBe(true);
          expect(
            after.nodes.some(node => node.path.length === 2 && node.path[0] === fixture.ids.occurrences.shared1)
          ).toBe(true);
        } finally {
          view.destroy();
        }
      });
    });

    it.each(['alternative', 'manual', 'unit', 'lot'] as const)(
      'AC#12：%s 候选全部可见，完整数量、成本与导出明确拒绝',
      async root => {
        await withFixture(backend, async (db, fixture) => {
          const input = fixture.inputFor(root);
          const view = createBomView(db, input);
          try {
            const state = await ready(view);
            expect(state.unresolved).toHaveLength(1);
            expect(state.unresolved[0].kind).toBe(root);
            expect(state.unresolved[0].candidates).toHaveLength(2);
            if (root !== 'alternative') {
              const expected =
                root === 'manual' ? ['BOM-VIEW-RESISTOR', 'BOM-VIEW-REPLACEMENT'] : ['BOM-VIEW-RED', 'BOM-VIEW-BLUE'];
              expect(state.unresolved[0].candidates.map(candidate => candidate.label).sort()).toEqual(expected.sort());
            }
            expect(state.nodes.filter(node => node.depth > 0).every(node => node.quantity === null)).toBe(true);
            await expect(view.calculate()).rejects.toThrow(/未|候选|裁决|manual/);
            await expect(
              db.bom.rollupCost(
                {
                  ...input.context,
                  currency: 'CNY',
                  rateDate: input.context.asOfDate
                },
                input.target
              )
            ).rejects.toThrow(/未|候选|裁决|manual|多个/);
            await expect(db.bom.exportBom(input.context, input.target)).rejects.toThrow(/未|候选|裁决|manual|多个/);
            if (root === 'manual') {
              const partial = await db.bom.explodeBom(input.context, input.target, { plannedQty: input.plannedQty });
              expect(partial.unresolved[0].candidates).toHaveLength(2);
              expect(partial.requirementLines).toEqual([]);
            }
          } finally {
            view.destroy();
          }
        });
      }
    );

    it('没有命中配置行时是真实空态，未解析候选不伪装为空态', async () => {
      await withFixture(backend, async (db, fixture) => {
        const view = createBomView(db, fixture.inputFor('config', { context: { configSelection: { COLOR: [] } } }));
        try {
          const state = await stateOf(view, value => value.phase !== 'idle' && value.phase !== 'loading');
          expect(state.phase).toBe('empty');
          expect(state.nodes).toEqual([]);
          expect(state.unresolved).toEqual([]);
        } finally {
          view.destroy();
        }
      });
    });

    it('AC#4：预算截断原因保持可见，不能把部分结果交给完整数量入口', async () => {
      await withFixture(backend, async (db, fixture) => {
        const input = fixture.inputFor('main', { budgets: { depth: 1 } });
        const view = createBomView(db, input);
        try {
          const state = await ready(view);
          expect(state.truncated?.reason).toBe('depth');
          await expect(view.calculate()).rejects.toThrow(/截断|depth|完整/);
          await expect(
            db.bom.exportBom(input.context, input.target, {
              plannedQty: input.plannedQty,
              budgets: input.budgets
            })
          ).rejects.toThrow(/截断|depth|完整/);
          const partial = await db.bom.explodeBom(input.context, input.target, {
            plannedQty: input.plannedQty,
            budgets: input.budgets
          });
          expect(partial.truncated?.reason).toBe('depth');
          expect(partial.requirementLines.length).toBeGreaterThan(0);
        } finally {
          view.destroy();
        }
      });
    });
  });
}
