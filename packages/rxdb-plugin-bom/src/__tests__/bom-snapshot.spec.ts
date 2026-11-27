/**
 * @fileoverview 一致快照回归测试（US-508 AC#15）
 *
 * 一次解析的全部读取在同一个读事务里完成，看到的是同一份已提交数据：另一连接在解析期间
 * 依次提交的写入要么整体可见、要么整体不可见，不出现混合时点。wa-sqlite 的 IDBBatchAtomicVFS
 * 按库名共享，两个 adapter 连同一 dbName 即两个连接；PGlite 的 memory store 按实例独立、
 * 单连接串行队列，事务内交错提交在构造上不可能，本套件只在 wa-sqlite 上验证。
 *
 * 写入时刻经包装适配器确定性地注入在解析的第一次读取之后（不靠调度碰运气）；数据让任何跨过提交点的
 * 读取都可检出：父修订的选择被「补装过去生效的修订 B」改变、修订 A 的头被「发布」改变，第一次读取
 * 看见修订 A 而后续读取看见 A 头已发布，只能组合出「修订 A + A 头的发生项」——写入前（A、无已发布头）
 * 与写入后（B 与 B 头的发生项）都没有这个组合。
 *
 * 数量展开（US-511 落地后的「改单位换算率」段）同理：物料级换算率随每层的发生项查询读出，同一子件经
 * 根层与子层两条路径出现即被读两次；根层用旧率、子层用新率的需求量与换算记录不属于任一一致时点。
 */

import type { TransactionExecutor, TransactionFun } from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomHeader, BomItem, BomLine, BomLineOccurrence } from '../entities.js';
import { explodeBom, type ExplosionResult } from '../quantity/explosion.js';
import type { BomLocalAdapter } from '../resolve/bom-adapter.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { loadHistory } from '../resolve/history-loader.js';
import type { ResolutionResult } from '../resolve/resolution.js';
import { resolveBom } from '../resolve/resolver.js';
import { BomTestAdapter, buildQuantityFixture, createBomTestAdapter, disposeBomTestAdapter } from './test-utils.js';

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const context = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: day('2021-01-01') };

/** 注入后给另一连接的提交窗口：未被读锁挡住的写入在此期间必然提交完毕。 */
const COMMIT_WINDOW_MS = 500;

/** 结果里能区分时点的部分：选中的父修订、头与发生项（manifest 同源）。 */
const summary = (
  result: ResolutionResult
): { parentRevisionId: string; headerIds: string[]; occurrenceIds: string[] } => ({
  parentRevisionId: result.manifest.parentRevisionId,
  headerIds: result.manifest.headerIds,
  occurrenceIds: result.manifest.occurrenceIds
});

/** 数量展开里能区分时点的部分：各需求行（路径、子件、需求量、单位）与 manifest 记录的换算。 */
const explosionSummary = (result: ExplosionResult): { requirements: string[][]; conversions: (string | null)[][] } => ({
  requirements: result.requirementLines.map(line => [line.path.join('>'), line.itemId, line.qty, line.uom]),
  conversions: result.manifest.conversions.map(entry => [entry.from, entry.to, entry.rate])
});

/**
 * 包装适配器：第一次读取返回后开始另一连接的写入并给它一个提交窗口；之后每次开新事务前再给一次窗口。
 * 解析在一个读事务里时，写入被读锁挡在事务外（窗口白等）；拆成多段读取时，写入落在两段之间。
 */
const injectAfterFirstRead = (
  adapter: BomTestAdapter,
  write: () => Promise<void>
): { target: BomLocalAdapter; written: () => Promise<void> } => {
  let pending: Promise<void> | undefined;
  const commitWindow = (): Promise<unknown> =>
    Promise.race([pending, new Promise(resolve => setTimeout(resolve, COMMIT_WINDOW_MS))]);
  const injected = (executor: TransactionExecutor): TransactionExecutor =>
    new Proxy(executor, {
      get: (target, key) => {
        if (key === 'query') {
          return async (sql: string, params?: readonly unknown[]) => {
            const result = await target.query(sql, params);
            if (pending === undefined) {
              pending = write();
              await commitWindow();
            }
            return result;
          };
        }
        const value: unknown = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  return {
    target: {
      name: adapter.name,
      rxdb: adapter.rxdb,
      transaction: async <T extends TransactionFun>(
        fun: T,
        transactionLog?: boolean
      ): Promise<Awaited<ReturnType<T>>> => {
        if (pending !== undefined) await commitWindow();
        return adapter.transaction((executor => fun(injected(executor))) as T, transactionLog);
      }
    },
    written: () => pending ?? Promise.reject(new Error('解析没有发出读取，写入未注入'))
  };
};

describe('一致快照（US-508 AC#15）', () => {
  let adapterA: BomTestAdapter;
  let adapterB: BomTestAdapter;
  let parentItemId = '';
  let laterChildId = '';
  let revisionA = '';
  let headerA = '';
  let occurrenceA = '';
  const revisionB = crypto.randomUUID();
  const occurrenceB = crypto.randomUUID();

  beforeAll(async () => {
    const dbName = `bom-snapshot-${Math.random().toString(36).slice(2, 10)}`;
    adapterA = await createBomTestAdapter('wa-sqlite', undefined, { dbName, persistent: true });
    // 建数据须在第二个连接建立前完成：实体构造在多个已连接实例间是歧义的
    const item = new BomItem();
    item.itemNo = `snap-item-${Math.random().toString(36).slice(2, 6)}`;
    await item.save();
    parentItemId = item.id;
    const child = new BomItem();
    child.itemNo = `snap-child-${Math.random().toString(36).slice(2, 6)}`;
    await child.save();
    const laterChild = new BomItem();
    laterChild.itemNo = `snap-later-${Math.random().toString(36).slice(2, 6)}`;
    await laterChild.save();
    laterChildId = laterChild.id;
    await loadHistory(adapterA, {
      batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
      revisions: [{ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
      headers: []
    });
    revisionA = (await resolveBom(adapterA, context, { parentItemId: item.id })).manifest.parentRevisionId;
    // 修订 A 的 draft 头 + 一行发生项（供 B 发布）
    const header = new BomHeader();
    header.parentRevisionId = revisionA;
    header.bomType = 'ebom';
    header.orgId = 'org-x';
    await header.save();
    headerA = header.id;
    const line = new BomLine();
    line.headerId = header.id;
    line.lineNo = 10;
    await line.save();
    const occurrence = new BomLineOccurrence();
    occurrence.lineId = line.id;
    occurrence.childItemId = child.id;
    occurrence.qty = '1';
    occurrence.effectiveFrom = day('2020-01-01');
    await occurrence.save();
    occurrenceA = occurrence.id;

    // 第二个连接（同库名共享存储）；B 的写入走 rawQuery 与经实例构造门面的历史通道
    adapterB = await createBomTestAdapter('wa-sqlite', undefined, { dbName, persistent: true });
  });

  afterAll(async () => {
    await disposeBomTestAdapter(adapterA).catch(() => undefined);
    await disposeBomTestAdapter(adapterB).catch(() => undefined);
  });

  it('解析期间另一连接依次提交「发布 A 头」「补装过去生效的修订 B」：结果要么全在写入前、要么全在写入后（AC#15）', async () => {
    const target = { parentItemId };
    const before = summary(await resolveBom(adapterA, context, target));
    expect(before).toEqual({ parentRevisionId: revisionA, headerIds: [], occurrenceIds: [] });

    const { target: injected, written } = injectAfterFirstRead(adapterA, async () => {
      await adapterB.rawQuery(`UPDATE "bom$bom_header" SET "state" = 'released' WHERE "id" = '${headerA}'`);
      await loadHistory(adapterB, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ id: revisionB, itemId: parentItemId, revisionNo: 'B', effectiveFrom: day('2020-06-01') }],
        headers: [
          {
            revisionIndex: 0,
            bomType: 'ebom',
            orgId: 'org-x',
            lines: [
              {
                lineNo: 10,
                occurrences: [
                  { id: occurrenceB, childItemId: laterChildId, qty: '1', effectiveFrom: day('2020-06-01') }
                ]
              }
            ]
          }
        ]
      });
    });
    const during = summary(await resolveBom(injected, context, target));
    await written();

    // 事务结束后的新解析必然看到两次写入：补装的修订 B 成为评估日前最新的已发布修订
    const after = summary(await resolveBom(adapterA, context, target));
    expect(after.parentRevisionId).toBe(revisionB);
    expect(after.occurrenceIds).toEqual([occurrenceB]);

    // 跨过提交点的读取只能组合出这一份结果，它不属于任一一致时点——断言因此可检出混合时点
    const mixed = { parentRevisionId: revisionA, headerIds: [headerA], occurrenceIds: [occurrenceA] };
    expect([before, after]).not.toContainEqual(mixed);
    expect([before, after]).toContainEqual(during);
  });
});

describe('数量展开的一致快照：改单位换算率（US-508 AC#15）', () => {
  let adapterA: BomTestAdapter;
  let adapterB: BomTestAdapter;
  let rootItemId = '';
  let partItemId = '';

  beforeAll(async () => {
    const dbName = `bom-snapshot-qty-${Math.random().toString(36).slice(2, 10)}`;
    adapterA = await createBomTestAdapter('wa-sqlite', undefined, { dbName, persistent: true });
    // 建数据须在第二个连接建立前完成（同上）
    const makeItem = async (
      prefix: string,
      stockUom = 'pcs',
      uomConversion: string | null = null
    ): Promise<BomItem> => {
      const item = new BomItem();
      item.itemNo = `${prefix}-${Math.random().toString(36).slice(2, 6)}`;
      item.stockUom = stockUom;
      item.uomDecimals = 3;
      item.uomConversion = uomConversion;
      await item.save();
      return item;
    };
    const root = await makeItem('snap-qty-root');
    const sub = await makeItem('snap-qty-sub');
    // 物料级换算率 1 kg = 2 m：行 UoM m → 库存 kg 跨量纲，只经显式率
    const part = await makeItem('snap-qty-part', 'kg', '2');
    rootItemId = root.id;
    partItemId = part.id;
    // part 经两条路径出现：根层 R → part 与子层 R → sub → part，物料级率随两层的发生项查询各读一次
    await buildQuantityFixture(adapterA, [
      {
        item: root,
        occurrences: [
          { child: part, qty: '10', uom: 'm' },
          { child: sub, qty: '1' }
        ]
      },
      { item: sub, occurrences: [{ child: part, qty: '10', uom: 'm' }] }
    ]);
    adapterB = await createBomTestAdapter('wa-sqlite', undefined, { dbName, persistent: true });
  });

  afterAll(async () => {
    await disposeBomTestAdapter(adapterA).catch(() => undefined);
    await disposeBomTestAdapter(adapterB).catch(() => undefined);
  });

  it('数量展开期间另一连接提交「改物料级换算率」：需求量与 manifest 换算记录要么全在写入前、要么全在写入后', async () => {
    const target = { parentItemId: rootItemId };
    const options = { plannedQty: { value: '1', uom: 'pcs' } };
    const partQty = (summarized: ReturnType<typeof explosionSummary>): string[] =>
      summarized.requirements.filter(line => line[1] === partItemId).map(line => line[2]);
    const before = explosionSummary(await explodeBom(adapterA, context, target, options));
    expect(partQty(before)).toEqual(['5', '5']);
    expect(before.conversions).toEqual([
      ['m', 'kg', '2'],
      ['m', 'kg', '2']
    ]);

    const dialect = bomSqlDialectFor('wa-sqlite');
    const { target: injected, written } = injectAfterFirstRead(adapterA, async () => {
      await adapterB.rawQuery(
        `UPDATE ${dialect.table('item')} SET "uomConversion" = ${dialect.placeholder(0)} WHERE "id" = ${dialect.placeholder(1)}`,
        ['4', partItemId]
      );
    });
    const during = explosionSummary(await explodeBom(injected, context, target, options));
    await written();

    // 事务结束后的新展开必然看到新率：10 m ÷ 4 = 2.5 kg（两条路径同率）
    const after = explosionSummary(await explodeBom(adapterA, context, target, options));
    expect(partQty(after)).toEqual(['2.5', '2.5']);
    expect(after.conversions).toEqual([
      ['m', 'kg', '4'],
      ['m', 'kg', '4']
    ]);

    // 根层读到旧率、子层读到新率只能组合出这一份结果（需求行按 BFS 序：根层 part、sub，子层 part）
    const mixed = {
      requirements: [before.requirements[0], before.requirements[1], after.requirements[2]],
      conversions: [before.conversions[0], after.conversions[1]]
    };
    expect([before, after]).not.toContainEqual(mixed);
    expect([before, after]).toContainEqual(during);
  });
});
