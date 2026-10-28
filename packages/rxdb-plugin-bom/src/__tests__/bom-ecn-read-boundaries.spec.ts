import type { TransactionExecutor, TransactionFun } from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomEcn, BomHeader, BomItem, BomItemRevision, BomLine, BomLineOccurrence } from '../entities.js';
import { explodeBom } from '../quantity/explosion.js';
import type { BomLocalAdapter } from '../resolve/bom-adapter.js';
import { ecnDiff, ecnImpact } from '../resolve/ecn.js';
import { whereUsed } from '../resolve/expansion.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter } from './test-utils.js';

const since = new Date('2098-01-01T00:00:00Z');
const effective = new Date('2099-01-01T00:00:00Z');
const later = new Date('2100-01-01T00:00:00Z');

const makeItem = async (adapter: BomTestAdapter) => {
  const item = adapter.rxdb.entityManager.instantiate(BomItem, {
    itemNo: crypto.randomUUID(),
    stockUom: 'kg',
    uomDecimals: 3
  });
  await item.save();
  return item;
};

const makeRevision = async (adapter: BomTestAdapter, item: BomItem, effectiveFrom = since, revisionNo = 'A') => {
  const revision = adapter.rxdb.entityManager.instantiate(BomItemRevision, {
    itemId: item.id,
    revisionNo,
    effectiveFrom
  });
  await revision.save();
  revision.state = 'released';
  await revision.save();
  return revision;
};

const makeHeader = async (adapter: BomTestAdapter, revisionId: string, orgId: string) => {
  const header = adapter.rxdb.entityManager.instantiate(BomHeader, {
    parentRevisionId: revisionId,
    bomType: 'ebom',
    orgId,
    baseUom: 'kg'
  });
  await header.save();
  return header;
};

const makeOccurrence = async (
  adapter: BomTestAdapter,
  header: BomHeader,
  child: BomItem,
  fields: Partial<BomLineOccurrence> = {}
) => {
  const line = adapter.rxdb.entityManager.instantiate(BomLine, { headerId: header.id, lineNo: 10 });
  await line.save();
  const occurrence = adapter.rxdb.entityManager.instantiate(BomLineOccurrence, {
    lineId: line.id,
    childItemId: child.id,
    qty: '1',
    uom: 'kg',
    effectiveFrom: since,
    ...fields
  });
  await occurrence.save();
  return occurrence;
};

const change = async (
  adapter: BomTestAdapter,
  options: {
    before?: Partial<BomLineOccurrence>;
    after?: Partial<BomLineOccurrence>;
    additionalLines?: number;
  } = {}
) => {
  const [parent, child] = await Promise.all([makeItem(adapter), makeItem(adapter)]);
  const parentRevision = await makeRevision(adapter, parent);
  await makeRevision(adapter, child);
  const header = await makeHeader(adapter, parentRevision.id, crypto.randomUUID());
  const old = await makeOccurrence(adapter, header, child, options.before);
  for (let index = 0; index < (options.additionalLines ?? 0); index += 1) {
    const line = adapter.rxdb.entityManager.instantiate(BomLine, { headerId: header.id, lineNo: 20 + index });
    await line.save();
    const occurrence = adapter.rxdb.entityManager.instantiate(BomLineOccurrence, {
      lineId: line.id,
      childItemId: child.id,
      qty: '1',
      uom: 'kg',
      effectiveFrom: since
    });
    await occurrence.save();
  }
  header.state = 'released';
  await header.save();
  const ecn = adapter.rxdb.entityManager.instantiate(BomEcn, { ecnNo: crypto.randomUUID(), effectiveDate: effective });
  await ecn.save();
  old.ecnOutId = ecn.id;
  old.effectiveTo = effective;
  await old.save();
  const next = adapter.rxdb.entityManager.instantiate(BomLineOccurrence, {
    lineId: old.lineId,
    childItemId: child.id,
    qty: '1',
    uom: 'kg',
    ...options.before,
    effectiveFrom: effective,
    ecnInId: ecn.id,
    ...options.after
  });
  await next.save();
  ecn.state = 'released';
  await ecn.save();
  return {
    header,
    ecn,
    parent,
    old,
    next,
    target: { parentRevisionId: parentRevision.id },
    context: { bomType: 'ebom' as const, orgId: header.orgId, asOfDate: effective }
  };
};

const concurrentChange = (adapter: BomTestAdapter, write: () => Promise<void>) => {
  let pending: Promise<void> | undefined;
  const inject = async <T>(read: Promise<T>, commit: boolean): Promise<T> => {
    const result = await read;
    pending ??= write();
    if (commit) await pending;
    return result;
  };
  const executorWithWrite = (executor: TransactionExecutor): TransactionExecutor =>
    new Proxy(executor, {
      get(target, key) {
        if (key === 'query') return (sql: string, params?: unknown[]) => inject(target.query(sql, params), false);
        const value: unknown = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  const target: BomLocalAdapter = {
    name: adapter.name,
    rawQuery: (sql, params) => inject(adapter.rawQuery(sql, params), true),
    transaction: <T extends TransactionFun>(fun: T, transactionLog?: boolean) =>
      adapter.transaction(
        (async (executor: TransactionExecutor) => fun(executorWithWrite(executor))) as T,
        transactionLog
      )
  };
  return {
    target,
    written: () => {
      if (pending === undefined) throw new Error('查询没有发出读取，未触发并发写入');
      return pending;
    }
  };
};

describe.each(['wa-sqlite', 'pglite'] as const)('ECN读取边界 [%s]', backend => {
  let adapter: BomTestAdapter;
  beforeAll(async () => {
    adapter = await createBomTestAdapter(backend);
  });
  afterAll(async () => {
    await disposeBomTestAdapter(adapter);
  });

  it('1kg替换为1g时报告数量差异并返回原始单位', async () => {
    const fixture = await change(adapter, { after: { uom: 'g' } });
    const before = await explodeBom(
      adapter,
      { ...fixture.context, asOfDate: new Date('2098-12-31T00:00:00Z') },
      fixture.target,
      { plannedQty: { value: '1', uom: 'kg' } }
    );
    const after = await explodeBom(adapter, fixture.context, fixture.target, { plannedQty: { value: '1', uom: 'kg' } });
    expect(before.requirementLines[0].qty).toBe('1');
    expect(after.requirementLines[0].qty).toBe('0.001');
    expect((await ecnDiff(adapter, fixture.ecn.id)).headers[0].entries).toEqual([
      expect.objectContaining({
        kind: 'qty_changed',
        before: expect.objectContaining({ uom: 'kg' }),
        after: expect.objectContaining({ uom: 'g' })
      })
    ]);
  });

  it.each([
    { name: '换算率', before: { uom: 'm', uomConversion: '2' }, after: { uomConversion: '3' } },
    { name: '固定数量', before: {}, after: { isFixedQty: true } },
    { name: '组件损耗', before: {}, after: { componentScrap: '0.1' } },
    { name: '损耗口径', before: { componentScrap: '0.1' }, after: { componentScrapConvention: 'yield' as const } },
    { name: '固定损耗', before: {}, after: { componentScrapFixed: '0.5' } },
    { name: '虚拟件覆盖', before: {}, after: { phantomOverride: false } },
    { name: '物料流方向', before: {}, after: { flowDirection: 'by_product' as const } }
  ])('名义数量不变，$name变化仍报告差异', async ({ before, after }) => {
    const fixture = await change(adapter, { before, after });
    expect((await ecnDiff(adapter, fixture.ecn.id)).headers[0].entries).toEqual([
      expect.objectContaining({
        kind: 'qty_changed',
        before: expect.objectContaining(before),
        after: expect.objectContaining(after)
      })
    ]);
  });

  it('超过200条有效发生项时仍完整读取数量语义，仅返回真正变化的逻辑行', async () => {
    const fixture = await change(adapter, { after: { uom: 'g' }, additionalLines: 201 });
    const entries = (await ecnDiff(adapter, fixture.ecn.id)).headers[0].entries;
    expect(entries).toEqual([
      expect.objectContaining({
        lineId: fixture.old.lineId,
        kind: 'qty_changed',
        before: expect.objectContaining({ uom: 'kg' }),
        after: expect.objectContaining({ uom: 'g' })
      })
    ]);
  });

  it('仅替换发生项身份和生效标记、业务字段相同时保持无差异', async () => {
    const fixture = await change(adapter);
    expect(fixture.old.id).not.toBe(fixture.next.id);
    expect((await ecnDiff(adapter, fixture.ecn.id)).headers[0].entries).toEqual([]);
  });

  it('并发改期时，ECN生效日、前后行集和数量字段共享一个快照', async () => {
    const fixture = await change(adapter, { after: { qty: '2' } });
    expect((await ecnDiff(adapter, fixture.ecn.id)).headers[0].entries).toHaveLength(1);
    const concurrent = concurrentChange(adapter, async () => {
      fixture.ecn.effectiveDate = new Date('2099-02-01T00:00:00Z');
      await fixture.ecn.save();
    });
    let result: Awaited<ReturnType<typeof ecnDiff>>;
    try {
      result = await ecnDiff(concurrent.target, fixture.ecn.id);
    } finally {
      await concurrent.written();
    }
    expect(result.effectiveDate).toEqual(effective);
    expect(result.headers[0].entries).toEqual([
      expect.objectContaining({
        kind: 'qty_changed',
        before: expect.objectContaining({ qty: '1' }),
        after: expect.objectContaining({ qty: '2' })
      })
    ]);
    expect((await ecnDiff(adapter, fixture.ecn.id)).effectiveDate).toEqual(new Date('2099-02-01T00:00:00Z'));
  });

  it('未来父修订在生效前不入反查，到生效日才出现', async () => {
    const [parent, child] = await Promise.all([makeItem(adapter), makeItem(adapter)]);
    const parentRevision = await makeRevision(adapter, parent, later);
    await makeRevision(adapter, child);
    const orgId = crypto.randomUUID();
    const header = await makeHeader(adapter, parentRevision.id, orgId);
    await makeOccurrence(adapter, header, child);
    header.state = 'released';
    await header.save();
    const lookup = (asOfDate: Date) =>
      whereUsed(adapter, { bomType: 'ebom', orgId, asOfDate }, { childItemId: child.id });
    expect((await lookup(later)).nodes.map(node => node.revisionId)).toEqual([parentRevision.id]);
    expect((await lookup(effective)).nodes).toEqual([]);
  });

  it('旧父修订已生效时仍列入反查，不只保留最新修订', async () => {
    const [parent, child] = await Promise.all([makeItem(adapter), makeItem(adapter)]);
    const old = await makeRevision(adapter, parent);
    const newer = await makeRevision(adapter, parent, effective, 'B');
    await makeRevision(adapter, child);
    const orgId = crypto.randomUUID();
    for (const revision of [old, newer]) {
      const header = await makeHeader(adapter, revision.id, orgId);
      await makeOccurrence(adapter, header, child);
      header.state = 'released';
      await header.save();
    }
    const result = await whereUsed(adapter, { bomType: 'ebom', orgId, asOfDate: effective }, { childItemId: child.id });
    expect(result.nodes.map(node => node.revisionId).sort()).toEqual([old.id, newer.id].sort());
  });

  it('ECN影响面不被尚未生效的上层修订替换', async () => {
    const fixture = await change(adapter, { after: { qty: '2' } });
    const top = await makeItem(adapter);
    const revision = await makeRevision(adapter, top, later);
    const header = await makeHeader(adapter, revision.id, fixture.context.orgId);
    await makeOccurrence(adapter, header, fixture.parent);
    header.state = 'released';
    await header.save();
    expect((await ecnImpact(adapter, fixture.ecn.id)).topItems.map(item => item.itemId)).toEqual([fixture.parent.id]);
  });
});
