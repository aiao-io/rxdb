/**
 * @fileoverview 历史装载通道（US-508 AC#13/#14/#18）
 *
 * 种子与 ERP 迁入的历史结构写的是**已经发生过的**发布，禁止追溯生效一刀切会把它们拦下。
 * `loadHistory(batch)` 一次事务：建开启态 `bom_history_batch` → 写 draft 修订/头（盖批次号）
 * → 发布转移（发布触发器只对指向开启态批次的行跳过追溯检查，其余校验照常）→ 关闭批次。
 * 批次号由调用方给定（确定性，AC#18）；批次表只追加（触发器兜底，AC#14）。
 */

import type { BomLocalAdapter } from './bom-adapter.js';
import { BomHeader, BomHistoryBatch, BomItemRevision, BomLine, BomLineOccurrence } from '../entities.js';
import { normalizeDecimalString } from '../decimal.utils.js';
import { BomType } from './resolution.js';

/** 一条历史修订输入。 */
export interface HistoryRevisionInput {
  itemId: string;
  revisionNo: string;
  effectiveFrom: Date;
  defaultPhantom?: boolean;
}

/** 一条历史行发生项输入（子件须为已存在的物料）。 */
export interface HistoryOccurrenceInput {
  childItemId: string;
  childRevisionId?: string | null;
  /** 规范十进制串（US-511 阶段 A 后可为公式行：省略 qty 时必给 qtyFormula）。 */
  qty?: string | null;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  uom?: string;
  qtyFormula?: string | null;
  formulaGrammarVersion?: string | null;
  isFixedQty?: boolean;
  tierGroupNo?: string | null;
  lotsizeFrom?: string | null;
  lotsizeTo?: string | null;
  componentScrap?: string;
  componentScrapConvention?: 'additive' | 'yield';
  componentScrapFixed?: string;
  uomConversion?: string | null;
  phantomOverride?: boolean | null;
}

/** 一张历史头的输入：挂本批修订（按 `revisionIndex` 引用），含逻辑行与发生项。 */
export interface HistoryHeaderInput {
  revisionIndex: number;
  bomType: BomType;
  orgId: string;
  alternativeNo?: number;
  baseUom?: string;
  baseQty?: string;
  assemblyScrap?: string;
  assemblyScrapConvention?: 'additive' | 'yield';
  lines: { lineNo: number; occurrences: HistoryOccurrenceInput[] }[];
}

/** 一次历史装载的输入：批次号由调用方给定，同一输入装载两遍批次号逐字相同（AC#18）。 */
export interface HistoryBatchInput {
  batchNo: string;
  revisions: HistoryRevisionInput[];
  headers: HistoryHeaderInput[];
}

/**
 * 把一批历史结构经审计通道写入并发布。
 *
 * @param adapter - 本地适配器（全部写入在一个事务里）
 * @param batch - 批次输入
 */
export const loadHistory = async (adapter: BomLocalAdapter, batch: HistoryBatchInput): Promise<void> => {
  await adapter.transaction(async executor => {
    // 1. 开启态批次行（发布触发器据此跳过追溯检查）
    const batchEntity = new BomHistoryBatch();
    batchEntity.batchNo = batch.batchNo;
    await executor.getRepository(BomHistoryBatch).create(batchEntity);

    // 2. 修订：draft 插入（盖批次号）→ 发布转移（触发器看到开启态批次，跳过追溯检查）
    const revisionIds: string[] = [];
    for (const input of batch.revisions) {
      const revision = new BomItemRevision();
      revision.itemId = input.itemId;
      revision.revisionNo = input.revisionNo;
      revision.effectiveFrom = input.effectiveFrom;
      revision.defaultPhantom = input.defaultPhantom ?? false;
      revision.historyBatchNo = batch.batchNo;
      await executor.getRepository(BomItemRevision).create(revision);
      await executor.getRepository(BomItemRevision).update(revision, { state: 'released' });
      revisionIds.push(revision.id);
    }

    // 3. 头与行：draft 写入（成员写入协议只约束已发布头）→ 发布头
    for (const headerInput of batch.headers) {
      const header = new BomHeader();
      header.parentRevisionId = revisionIds[headerInput.revisionIndex];
      header.bomType = headerInput.bomType;
      header.orgId = headerInput.orgId;
      header.alternativeNo = headerInput.alternativeNo ?? 1;
      header.historyBatchNo = batch.batchNo;
      header.baseUom = headerInput.baseUom ?? 'pcs';
      header.baseQty = headerInput.baseQty ?? '1';
      header.assemblyScrap = headerInput.assemblyScrap ?? '0';
      header.assemblyScrapConvention = headerInput.assemblyScrapConvention ?? 'additive';
      await executor.getRepository(BomHeader).create(header);
      for (const lineInput of headerInput.lines) {
        const line = new BomLine();
        line.headerId = header.id;
        line.lineNo = lineInput.lineNo;
        await executor.getRepository(BomLine).create(line);
        for (const occurrenceInput of lineInput.occurrences) {
          const occurrence = new BomLineOccurrence();
          occurrence.lineId = line.id;
          occurrence.childItemId = occurrenceInput.childItemId;
          occurrence.childRevisionId = occurrenceInput.childRevisionId ?? null;
          occurrence.qty = occurrenceInput.qty != null ? normalizeDecimalString(occurrenceInput.qty, 'qty') : null;
          occurrence.qtyFormula = occurrenceInput.qtyFormula ?? null;
          occurrence.formulaGrammarVersion = occurrenceInput.formulaGrammarVersion ?? null;
          occurrence.effectiveFrom = occurrenceInput.effectiveFrom;
          occurrence.effectiveTo = occurrenceInput.effectiveTo ?? null;
          occurrence.uom = occurrenceInput.uom ?? 'pcs';
          occurrence.isFixedQty = occurrenceInput.isFixedQty ?? false;
          occurrence.tierGroupNo = occurrenceInput.tierGroupNo ?? null;
          occurrence.lotsizeFrom = occurrenceInput.lotsizeFrom ?? null;
          occurrence.lotsizeTo = occurrenceInput.lotsizeTo ?? null;
          occurrence.componentScrap = normalizeDecimalString(occurrenceInput.componentScrap ?? '0', 'componentScrap');
          occurrence.componentScrapConvention = occurrenceInput.componentScrapConvention ?? 'additive';
          occurrence.componentScrapFixed = normalizeDecimalString(occurrenceInput.componentScrapFixed ?? '0', 'componentScrapFixed');
          occurrence.uomConversion = occurrenceInput.uomConversion ?? null;
          occurrence.phantomOverride = occurrenceInput.phantomOverride ?? null;
          await executor.getRepository(BomLineOccurrence).create(occurrence);
        }
      }
      await executor.getRepository(BomHeader).update(header, { state: 'released' });
    }

    // 4. 关闭批次（open → closed 是批次表唯一允许的转移）
    await executor.getRepository(BomHistoryBatch).update(batchEntity, { state: 'closed' });
  }, false);
};
