/**
 * @fileoverview 一致快照回归测试（US-508 AC#15）
 *
 * 一次解析的全部读取在同一个读事务里完成，看到的是同一份已提交数据：另一连接在解析期间
 * 提交的写入要么整体可见、要么整体不可见，不出现混合时点。wa-sqlite 的 MemoryAsyncVFS
 * 按库名共享，两个 adapter 连同一 dbName 即两个连接；PGlite 的 memory store 按实例独立、
 * 单连接串行队列，事务内交错提交在构造上不可能，本套件只在 wa-sqlite 上验证。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomHeader, BomItem, BomLine, BomLineOccurrence } from '../entities.js';
import { loadHistory } from '../resolve/history-loader.js';
import { resolveBom } from '../resolve/resolver.js';
import { BomTestAdapter, createBomTestAdapter, disposeBomTestAdapter } from './test-utils.js';

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const context = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: day('2021-01-01') };

describe('一致快照（US-508 AC#15）', () => {
  let adapterA: BomTestAdapter;
  let adapterB: BomTestAdapter;
  let parentItemId = '';
  let headerId = '';

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
    await loadHistory(adapterA, {
      batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
      revisions: [{ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
      headers: []
    });
    const revisionId = (await resolveBom(adapterA, context, { parentItemId: item.id })).manifest.parentRevisionId;
    // draft 头 + 一行发生项（供 B 发布）
    const header = new BomHeader();
    header.parentRevisionId = revisionId;
    header.bomType = 'ebom';
    header.orgId = 'org-x';
    await header.save();
    headerId = header.id;
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

    // 第二个连接（同库名共享存储）；B 只走 rawQuery，不构造实体
    adapterB = await createBomTestAdapter('wa-sqlite', undefined, { dbName, persistent: true });
  });

  afterAll(async () => {
    await disposeBomTestAdapter(adapterA).catch(() => undefined);
    await disposeBomTestAdapter(adapterB).catch(() => undefined);
  });

  it('解析期间另一连接的发布要么整体可见、要么整体不可见（AC#15）', async () => {
    // 发布前：draft 头不入结果
    const before = await resolveBom(adapterA, context, { parentItemId });
    expect(before.occurrences).toEqual([]);

    // 另一连接提交发布（不 await：A 的事务先占读锁时该写会排在事务外）
    const publishPromise = adapterB.rawQuery(
      `UPDATE "bom$bom_header" SET "state" = 'released' WHERE "id" = '${headerId}'`
    );

    // A 的解析（同一读事务内多次读取）要么全部写入前、要么全部写入后
    const during = await resolveBom(adapterA, context, { parentItemId });
    await publishPromise;

    // 事务结束后的新解析必然看到发布
    const after = await resolveBom(adapterA, context, { parentItemId });
    expect(after.occurrences.length).toBe(1);

    // during 与 before 一致（写入前），或 during 与 after 一致（写入后）——不得出现混合时点
    const duringIds = during.occurrences.map(occurrence => occurrence.occurrenceId).join(',');
    const beforeIds = before.occurrences.map(occurrence => occurrence.occurrenceId).join(',');
    const afterIds = after.occurrences.map(occurrence => occurrence.occurrenceId).join(',');
    expect(duringIds === beforeIds || duringIds === afterIds).toBe(true);
  });
});
