/**
 * @fileoverview 历史装载通道（US-508 AC#13/#14/#18）
 *
 * 种子与 ERP 迁入的历史结构写的是**已经发生过的**发布，禁止追溯生效一刀切会把它们拦下。
 * `loadHistory(batch)` 一次事务：建开启态 `bom_history_batch` → 写 draft 修订/头（盖批次号）
 * → 发布转移（发布触发器只对指向开启态批次的行跳过追溯检查，其余校验照常）→ 关闭批次。
 * 批次号由调用方给定（确定性，AC#18）；批次表只追加（触发器兜底，AC#14）。
 */

import type { BomEntityFactory, BomLocalAdapter } from './bom-adapter.js';
import type { EntityType } from '@aiao/rxdb';
import { BomHeader, BomHistoryBatch, BomItemRevision, BomLine, BomLineDesignator, BomLineOccurrence } from '../entities.js';
import { normalizeDecimalString } from '../decimal.utils.js';
import { BomType } from './resolution.js';

/** 一条历史修订输入。 */
export interface HistoryRevisionInput {
  itemId: string;
  revisionNo: string;
  effectiveFrom: Date;
  defaultPhantom?: boolean;
  /** 确定性装载的显式 id（US-525 种子）；缺省走 uuid 默认值。 */
  id?: string;
  /** 固定审计时间戳（US-525 AC#1）；缺省走系统时钟。 */
  createdAt?: Date;
  updatedAt?: Date;
}

/** 一条历史位号输入（确定性装载可带显式 id）。 */
export interface HistoryDesignatorInput {
  designator: string;
  id?: string;
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
  designatorManaged?: boolean;
  /** 位号清单（US-507 阶段 C：随发生项 draft 装载，发布转移校验位号数 = qty）。 */
  designators?: HistoryDesignatorInput[];
  /** 确定性装载的显式 id（US-525 种子）。 */
  id?: string;
  /** 固定审计时间戳（US-525 AC#1）；缺省走系统时钟。 */
  createdAt?: Date;
  updatedAt?: Date;
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
  /** 确定性装载的显式 id（US-525 种子）。 */
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
  lines: { lineNo: number; occurrences: HistoryOccurrenceInput[]; id?: string; createdAt?: Date; updatedAt?: Date }[];
}

/** 一次历史装载的输入：批次号由调用方给定，同一输入装载两遍批次号逐字相同（AC#18）。 */
export interface HistoryBatchInput {
  batchNo: string;
  revisions: HistoryRevisionInput[];
  headers: HistoryHeaderInput[];
  /** 确定性装载的显式批次行 id 与固定审计时间戳（US-525 种子）；缺省走默认值。 */
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * 把一批历史结构经审计通道写入并发布。
 *
 * @param adapter - 本地适配器（全部写入在一个事务里）
 * @param batch - 批次输入
 */
export const loadHistory = async (adapter: BomLocalAdapter, batch: HistoryBatchInput): Promise<void> => {
  await adapter.transaction(async executor => {
    // 多实例下 new Entity() 无法判目标库：经 entityManager.instantiate 构造（缺省时退化 new）
    const factory: BomEntityFactory | undefined = adapter.rxdb?.entityManager;
    const construct = <T extends EntityType>(EntityType: T, initData?: Partial<InstanceType<T>>): InstanceType<T> =>
      factory ?
        factory.instantiate(EntityType, initData)
      : new (EntityType as unknown as new () => InstanceType<T>)();
    // 1. 开启态批次行（发布触发器据此跳过追溯检查）
    const batchEntity = construct(BomHistoryBatch);
    if (batch.id) (batchEntity as unknown as { id: string }).id = batch.id;
    if (batch.createdAt) (batchEntity as unknown as { createdAt: Date }).createdAt = batch.createdAt;
    if (batch.updatedAt) (batchEntity as unknown as { updatedAt: Date }).updatedAt = batch.updatedAt;
    batchEntity.batchNo = batch.batchNo;
    await executor.getRepository(BomHistoryBatch).create(batchEntity);

    // 2. 修订：draft 插入（盖批次号）→ 发布转移（触发器看到开启态批次，跳过追溯检查）
    const revisionIds: string[] = [];
    for (const input of batch.revisions) {
      const revision = construct(BomItemRevision);
      if (input.id) (revision as unknown as { id: string }).id = input.id;
      if (input.createdAt) (revision as unknown as { createdAt: Date }).createdAt = input.createdAt;
      if (input.updatedAt) (revision as unknown as { updatedAt: Date }).updatedAt = input.updatedAt;
      revision.itemId = input.itemId;
      revision.revisionNo = input.revisionNo;
      revision.effectiveFrom = input.effectiveFrom;
      revision.defaultPhantom = input.defaultPhantom ?? false;
      revision.historyBatchNo = batch.batchNo;
      await executor.getRepository(BomItemRevision).create(revision);
      // 确定性装载：patch 显式带固定审计时间戳（否则 update 刷系统时钟，US-525 AC#1）
      const publishPatch: Record<string, unknown> = { state: 'released' };
      if (input.updatedAt) publishPatch['updatedAt'] = input.updatedAt;
      await executor.getRepository(BomItemRevision).update(revision, publishPatch as Partial<BomItemRevision>);
      revisionIds.push(revision.id);
    }

    // 3. 头与行：draft 写入（成员写入协议只约束已发布头）→ 发布头
    for (const headerInput of batch.headers) {
      const header = construct(BomHeader);
      if (headerInput.id) (header as unknown as { id: string }).id = headerInput.id;
      if (headerInput.createdAt) (header as unknown as { createdAt: Date }).createdAt = headerInput.createdAt;
      if (headerInput.updatedAt) (header as unknown as { updatedAt: Date }).updatedAt = headerInput.updatedAt;
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
        const line = construct(BomLine);
        if (lineInput.id) (line as unknown as { id: string }).id = lineInput.id;
        if (lineInput.createdAt) (line as unknown as { createdAt: Date }).createdAt = lineInput.createdAt;
        if (lineInput.updatedAt) (line as unknown as { updatedAt: Date }).updatedAt = lineInput.updatedAt;
        line.headerId = header.id;
        line.lineNo = lineInput.lineNo;
        await executor.getRepository(BomLine).create(line);
        for (const occurrenceInput of lineInput.occurrences) {
          const occurrence = construct(BomLineOccurrence);
          if (occurrenceInput.id) (occurrence as unknown as { id: string }).id = occurrenceInput.id;
          if (occurrenceInput.createdAt) (occurrence as unknown as { createdAt: Date }).createdAt = occurrenceInput.createdAt;
          if (occurrenceInput.updatedAt) (occurrence as unknown as { updatedAt: Date }).updatedAt = occurrenceInput.updatedAt;
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
          occurrence.designatorManaged = occurrenceInput.designatorManaged ?? false;
          await executor.getRepository(BomLineOccurrence).create(occurrence);
          for (const designator of occurrenceInput.designators ?? []) {
            const designatorEntity = construct(BomLineDesignator);
            if (designator.id) (designatorEntity as unknown as { id: string }).id = designator.id;
            if (occurrenceInput.createdAt) (designatorEntity as unknown as { createdAt: Date }).createdAt = occurrenceInput.createdAt;
            if (occurrenceInput.updatedAt) (designatorEntity as unknown as { updatedAt: Date }).updatedAt = occurrenceInput.updatedAt;
            designatorEntity.occurrenceId = occurrence.id;
            designatorEntity.designator = designator.designator;
            await executor.getRepository(BomLineDesignator).create(designatorEntity);
          }
        }
      }
      const headerPatch: Record<string, unknown> = { state: 'released' };
      if (headerInput.updatedAt) headerPatch['updatedAt'] = headerInput.updatedAt;
      await executor.getRepository(BomHeader).update(header, headerPatch as Partial<BomHeader>);
    }

    // 4. 关闭批次（open → closed 是批次表唯一允许的转移）
    await executor.getRepository(BomHistoryBatch).update(batchEntity, { state: 'closed' });
  }, false);
};
