import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomEcn, BomItem, BomLine, BomLineOccurrence } from '../entities.js';
import { ecnImpact } from '../resolve/ecn.js';
import { whereUsed } from '../resolve/expansion.js';
import { loadHistory, type HistoryHeaderInput } from '../resolve/history-loader.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter } from './test-utils.js';

const since = new Date('2026-01-01T00:00:00Z');
const context = { bomType: 'ebom' as const, orgId: 'impact-boundaries', asOfDate: new Date('2099-01-01T00:00:00Z') };

const makeItem = async (adapter: BomTestAdapter) => {
  const item = adapter.rxdb.entityManager.instantiate(BomItem, { itemNo: crypto.randomUUID(), stockUom: 'kg' });
  await item.save();
  return item;
};

const addChange = async (adapter: BomTestAdapter, headerId: string, child: BomItem) => {
  const ecn = adapter.rxdb.entityManager.instantiate(BomEcn, {
    ecnNo: crypto.randomUUID(),
    effectiveDate: context.asOfDate
  });
  await ecn.save();
  const line = adapter.rxdb.entityManager.instantiate(BomLine, { headerId, lineNo: 100, ecnInId: ecn.id });
  await line.save();
  const occurrence = adapter.rxdb.entityManager.instantiate(BomLineOccurrence, {
    lineId: line.id,
    childItemId: child.id,
    qty: '1',
    uom: 'kg',
    effectiveFrom: context.asOfDate,
    ecnInId: ecn.id
  });
  await occurrence.save();
  ecn.state = 'released';
  await ecn.save();
  return ecn;
};

const seedRevisions = async (
  adapter: BomTestAdapter,
  options: { bothUseC?: boolean; duplicateNewPath?: boolean; ambiguousOld?: boolean } = {}
) => {
  const [oldTop, newTop, liveTop, b, c, raw, changed] = await Promise.all(
    Array.from({ length: 7 }, () => makeItem(adapter))
  );
  const items = [oldTop, newTop, liveTop, b, b, c, raw, changed];
  const revisions = items.map(() => crypto.randomUUID());
  const headerIds = Array.from({ length: 6 }, () => crypto.randomUUID());
  const header = (index: number, child: BomItem, childRevisionId?: string): HistoryHeaderInput => ({
    id: headerIds[index],
    revisionIndex: index,
    bomType: context.bomType,
    orgId: context.orgId,
    baseUom: 'kg',
    lines: [
      {
        lineNo: 10,
        occurrences: [{ childItemId: child.id, childRevisionId, qty: '1', uom: 'kg', effectiveFrom: since }]
      }
    ]
  });
  const old = header(0, b, revisions[3]);
  if (options.ambiguousOld) {
    old.lines[0].occurrences[0].unitTo = 100;
    old.lines[0].occurrences.push({ childItemId: raw.id, qty: '1', effectiveFrom: since, unitFrom: 101 });
  }
  const newer = header(1, b, revisions[4]);
  if (options.duplicateNewPath) newer.lines.push({ ...newer.lines[0], lineNo: 20 });
  await loadHistory(adapter, {
    batchNo: crypto.randomUUID(),
    revisions: items.map((item, index) => ({
      id: revisions[index],
      itemId: item.id,
      revisionNo: index === 4 ? 'B' : 'A',
      effectiveFrom: index === 4 ? new Date('2026-02-01T00:00:00Z') : since
    })),
    headers: [old, newer, header(2, b), header(3, options.bothUseC ? c : raw), header(4, c), header(5, raw)]
  });
  return { oldTop, newTop, liveTop, b, c, changed, headerIds };
};

const topIds = (result: Awaited<ReturnType<typeof ecnImpact>>) => result.topItems.map(top => top.itemId).sort();

describe.each(['wa-sqlite', 'pglite'] as const)('ECN影响面路径回归 [%s]', backend => {
  let adapter: BomTestAdapter;
  beforeAll(async () => {
    adapter = await createBomTestAdapter(backend);
  });
  afterAll(async () => {
    await disposeBomTestAdapter(adapter);
  });

  it('C只被B新版使用，锁旧版整机不能拼接到C的变更路径', async () => {
    const fixture = await seedRevisions(adapter);
    const ecn = await addChange(adapter, fixture.headerIds[5], fixture.changed);
    const reverse = await whereUsed(adapter, context, { childItemId: fixture.c.id });
    expect(reverse.nodes.map(node => node.itemId).sort()).toEqual(
      [fixture.b.id, fixture.newTop.id, fixture.liveTop.id].sort()
    );
    const result = await ecnImpact(adapter, ecn.id);
    expect(topIds(result)).toEqual([fixture.newTop.id, fixture.liveTop.id].sort());
    expect(result.topItems.every(top => top.paths.length === 1 && top.paths[0].length === 2)).toBe(true);
  });

  it('直接修改B新版时，起始修订也必须匹配，不能影响锁旧版整机', async () => {
    const fixture = await seedRevisions(adapter);
    const ecn = await addChange(adapter, fixture.headerIds[4], fixture.changed);
    const result = await ecnImpact(adapter, ecn.id);
    expect(topIds(result)).toEqual([fixture.newTop.id, fixture.liveTop.id].sort());
    expect(result.topItems.every(top => top.paths[0].length === 1)).toBe(true);
  });

  it('旧新版都使用C时，旧版合法路径保留，每台整机只返回自身修订路径', async () => {
    const fixture = await seedRevisions(adapter, { bothUseC: true });
    const ecn = await addChange(adapter, fixture.headerIds[5], fixture.changed);
    const result = await ecnImpact(adapter, ecn.id);
    expect(topIds(result)).toEqual([fixture.oldTop.id, fixture.newTop.id, fixture.liveTop.id].sort());
    expect(result.topItems.every(top => top.paths.length === 1)).toBe(true);
  });

  it('同一新版经两个逻辑行使用时保留两条命中路径，不按物料去重', async () => {
    const fixture = await seedRevisions(adapter, { duplicateNewPath: true });
    const ecn = await addChange(adapter, fixture.headerIds[5], fixture.changed);
    const result = await ecnImpact(adapter, ecn.id);
    const paths = result.topItems.find(top => top.itemId === fixture.newTop.id)?.paths ?? [];
    expect(paths).toHaveLength(2);
    expect(new Set(paths.map(path => path.join('/'))).size).toBe(2);
    expect(topIds(result)).toEqual([fixture.newTop.id, fixture.liveTop.id].sort());
  });

  it('不匹配旧修订上的序列歧义不会阻断新版影响面', async () => {
    const fixture = await seedRevisions(adapter, { ambiguousOld: true });
    const ecn = await addChange(adapter, fixture.headerIds[5], fixture.changed);
    expect(topIds(await ecnImpact(adapter, ecn.id))).toEqual([fixture.newTop.id, fixture.liveTop.id].sort());
  });

  it.each(['by_product', 'scrap_out', 'produce'] as const)('%s产出方不是使用方，不能替换真正的顶层B', async flow => {
    const [b, producer, raw, changed] = await Promise.all(Array.from({ length: 4 }, () => makeItem(adapter)));
    const items = [b, producer, raw, changed];
    const revisions = items.map(() => crypto.randomUUID());
    const headerId = crypto.randomUUID();
    await loadHistory(adapter, {
      batchNo: crypto.randomUUID(),
      revisions: items.map((item, index) => ({
        id: revisions[index],
        itemId: item.id,
        revisionNo: 'A',
        effectiveFrom: since
      })),
      headers: [
        {
          id: headerId,
          revisionIndex: 0,
          bomType: context.bomType,
          orgId: context.orgId,
          lines: [{ lineNo: 10, occurrences: [{ childItemId: raw.id, qty: '1', effectiveFrom: since }] }]
        },
        {
          revisionIndex: 1,
          bomType: context.bomType,
          orgId: context.orgId,
          jointCostShare: flow === 'produce' ? '0.6' : null,
          lines: [
            { lineNo: 10, occurrences: [{ childItemId: raw.id, qty: '1', effectiveFrom: since }] },
            {
              lineNo: 20,
              occurrences: [
                {
                  childItemId: b.id,
                  childRevisionId: revisions[0],
                  qty: '1',
                  uom: 'kg',
                  flowDirection: flow,
                  jointCostShare: flow === 'produce' ? '0.4' : null,
                  effectiveFrom: since
                }
              ]
            }
          ]
        }
      ]
    });
    const ecn = await addChange(adapter, headerId, changed);
    expect((await whereUsed(adapter, context, { childItemId: b.id })).nodes).toEqual([]);
    expect(topIds(await ecnImpact(adapter, ecn.id))).toEqual([b.id]);
  });

  it('相关使用方逻辑行未裁决时拒绝影响面，不把丢失的上层路径当作无父件', async () => {
    const fixture = await seedRevisions(adapter, { ambiguousOld: true });
    const ecn = await addChange(adapter, fixture.headerIds[3], fixture.changed);
    await expect(ecnImpact(adapter, ecn.id)).rejects.toMatchObject({
      name: 'BomResolutionError',
      message: expect.stringMatching(/ECN 影响面无法判定.*逻辑行/)
    });
  });
});
