/**
 * @fileoverview 历史装载通道（US-508 AC#13/#14/#18）
 *
 * 种子与 ERP 迁入的历史结构写的是**已经发生过的**发布，禁止追溯生效一刀切会把它们拦下。
 * `loadHistory(batch)` 一次事务：建开启态 `bom_history_batch` → 写 draft 修订/头（盖批次号）
 * → 发布转移（发布触发器只对指向开启态批次的行跳过追溯检查，其余校验照常）→ 关闭批次。
 * 批次号由调用方给定（确定性，AC#18）；批次表只追加（触发器兜底，AC#14）。
 * 头与行发生项写入前经 {@link validateBomWrite}——与仓储门面、整批导入同一套保存期校验
 * （扩展属性、选择条件所属组织、批次集合、序列边界、公式语法），读取在本事务内。
 */

import { getEntityMetadata, type EntityType } from '@aiao/rxdb';
import {
  BomEcn,
  BomHeader,
  BomHistoryBatch,
  BomItemRevision,
  BomLine,
  BomLineDesignator,
  BomLineOccurrence,
  BomLineOperationSplit,
  BomRouting,
  BomRoutingOperation,
  BomSubstituteGroup,
  BomWorkCenter
} from '../entities.js';
import { validateBomWrite, type BomWriteValidationContext } from '../repository.js';
import type { BomEntityFactory, BomLocalAdapter } from './bom-adapter.js';
import { bomSqlDialectFor } from './bom-sql.js';
import { BomType } from './resolution.js';
import { normalizeDecimalColumns } from './write-rules.js';

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

/** 一条历史 ECN 输入（US-515 / US-525 阶段 C 种子）：装载为已发布（或已取消）的历史事实。 */
export interface HistoryEcnInput {
  ecnNo: string;
  state: 'released' | 'cancelled';
  effectiveDate: Date;
  reason?: string | null;
  /** 确定性装载的显式 id（US-525 种子）。 */
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
  /** 委外供料标记（US-521）。 */
  supplyToVendor?: boolean;
  /** 位号清单（US-507 阶段 C：随发生项 draft 装载，发布转移校验位号数 = qty）。 */
  designators?: HistoryDesignatorInput[];
  /** 确定性装载的显式 id（US-525 种子）。 */
  id?: string;
  /** 固定审计时间戳（US-525 AC#1）；缺省走系统时钟。 */
  createdAt?: Date;
  updatedAt?: Date;
  /** 物料流方向（US-513，默认 consume）。 */
  flowDirection?: 'consume' | 'by_product' | 'scrap_out' | 'produce';
  /** 联产品的显式固定成本份额，其他方向留空。 */
  jointCostShare?: string | null;
  /** 投料工序（US-520）。 */
  operationSeq?: number | null;
  /** 替代组成员（US-512）：role / probability / equiv_qty；组装载见 HistoryHeaderInput.substituteGroups。 */
  substituteRole?: 'primary' | 'substitute' | null;
  substitutePriority?: number | null;
  usageProbability?: string | null;
  equivQty?: string | null;
  /** ECN 引入 / 截止（US-515 阶段 C 种子）：区间须与 ECN 生效日一致（派生校验照常）。 */
  ecnInId?: string | null;
  ecnOutId?: string | null;
  /** 序列 / 批次有效性（US-518）：三维有效域 = 日期 × 序列 × 批次。 */
  unitFrom?: number | null;
  unitTo?: number | null;
  lotCodes?: string | null;
  /** 配置选择条件（US-517）：行发生项挂条件 id。 */
  selectionConditionId?: string | null;
  /** 扩展属性（US-519）：JSON 文本。 */
  ext?: string | null;
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
  /** 标准成本批量（US-514）：以头 base_uom 计；卷算必填。 */
  costLotQty?: string | null;
  /** 第一主产物的固定成本份额，旧单产留空。 */
  jointCostShare?: string | null;
  /** 扩展属性（US-519）：JSON 文本，与仓储同按 attr_def 校验（字典声明了头的必填属性时必须给出）。 */
  ext?: string | null;
  /** 确定性装载的显式 id（US-525 种子）。 */
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
  lines: {
    lineNo: number;
    occurrences: HistoryOccurrenceInput[];
    id?: string;
    createdAt?: Date;
    updatedAt?: Date;
    ecnInId?: string | null;
  }[];
  /** 替代组（US-512，B 层种子）：成员按 occurrence 序号引用本头的行。 */
  substituteGroups?: {
    code: string;
    strategy: 'priority' | 'proportional' | 'manual';
    allowMix?: boolean;
    id?: string;
    ecnInId?: string | null;
    members: {
      occurrenceIndex: number;
      role: 'primary' | 'substitute';
      probability?: string | null;
      priority?: number | null;
      equivQty?: string | null;
    }[];
  }[];
  /** 工艺路线（US-524/520，B 层种子）：工序与行的投料工序/分摊。 */
  routing?: {
    id?: string;
    workCenterCode: string;
    workCenterId?: string;
    operations: { seq: number; scrap?: string; convention?: 'additive' | 'yield'; id?: string }[];
    allocations: {
      occurrenceIndex: number;
      operationSeq?: number | null;
      splits: { operationSeq: number; ratio: string; id?: string }[];
    }[];
  };
}

/** 一次历史装载的输入：批次号由调用方给定，同一输入装载两遍批次号逐字相同（AC#18）。 */
export interface HistoryBatchInput {
  batchNo: string;
  revisions: HistoryRevisionInput[];
  /** ECN 变更单（US-515 阶段 C 种子）：draft 装载 + 发布转移，盖批次号跳过追溯检查。 */
  ecns?: HistoryEcnInput[];
  /** 既有已发布头的行操作（US-515 阶段 C 种子改下层头）：批次开放期间执行，ECN 须已在本批装载。 */
  headerOverlays?: {
    headerId: string;
    /** 头字段补丁（US-514 阶段 D 种子补 cost_lot_qty / routing_id；open 批次期间放行）。 */
    headerPatch?: { costLotQty?: string | null; routingId?: string | null };
    /** 截止标记：行发生项 → 截止它的 ECN（effective_to 由 ECN 生效日派生）。 */
    cutoffs?: { occurrenceId: string; ecnId: string }[];
    /** 追加行（挂 ECN；矩阵在 open 批次下放行 released 历史 ECN）。 */
    lines?: {
      lineNo: number;
      ecnInId?: string | null;
      occurrences: HistoryOccurrenceInput[];
      id?: string;
      createdAt?: Date;
      updatedAt?: Date;
    }[];
    /** 既有逻辑行上追加发生项（改量 / 改版 = 截止 + 同逻辑行引入）。 */
    occurrenceAdds?: { lineId: string; occurrences: HistoryOccurrenceInput[] }[];
  }[];
  headers: HistoryHeaderInput[];
  /** 确定性装载的显式批次行 id 与固定审计时间戳（US-525 种子）；缺省走默认值。 */
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** 实体构造：多实例下经 entityManager.instantiate（缺省时退化 new）。 */
type Construct = <T extends EntityType>(EntityType: T, initData?: Partial<InstanceType<T>>) => InstanceType<T>;

/** 与仓储同一入口口径：十进制列规范化并按存储层域校验（原地回写）。 */
const normalizeDecimals = <T extends object>(entity: T): T => {
  const record = entity as unknown as Record<string, unknown>;
  Object.assign(record, normalizeDecimalColumns(record));
  return entity;
};

/**
 * 历史发生项输入 → 实体：未给的列取存储默认值；十进制列与仓储同一入口口径规范化并判域
 * （保存期校验只判不回写，规范串在这里落到实体上）。
 */
const occurrenceEntity = (construct: Construct, lineId: string, input: HistoryOccurrenceInput): BomLineOccurrence => {
  const occurrence = construct(BomLineOccurrence);
  const writable = occurrence as unknown as { id: string; createdAt: Date; updatedAt: Date };
  if (input.id) writable.id = input.id;
  if (input.createdAt) writable.createdAt = input.createdAt;
  if (input.updatedAt) writable.updatedAt = input.updatedAt;
  Object.assign(occurrence, {
    lineId,
    childItemId: input.childItemId,
    childRevisionId: input.childRevisionId ?? null,
    qty: input.qty ?? null,
    qtyFormula: input.qtyFormula ?? null,
    formulaGrammarVersion: input.formulaGrammarVersion ?? null,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
    uom: input.uom ?? 'pcs',
    isFixedQty: input.isFixedQty ?? false,
    tierGroupNo: input.tierGroupNo ?? null,
    lotsizeFrom: input.lotsizeFrom ?? null,
    lotsizeTo: input.lotsizeTo ?? null,
    componentScrap: input.componentScrap ?? '0',
    componentScrapConvention: input.componentScrapConvention ?? 'additive',
    componentScrapFixed: input.componentScrapFixed ?? '0',
    uomConversion: input.uomConversion ?? null,
    phantomOverride: input.phantomOverride ?? null,
    designatorManaged: input.designatorManaged ?? false,
    supplyToVendor: input.supplyToVendor ?? false,
    flowDirection: input.flowDirection ?? 'consume',
    jointCostShare: input.jointCostShare ?? null,
    operationSeq: input.operationSeq ?? null,
    unitFrom: input.unitFrom ?? null,
    unitTo: input.unitTo ?? null,
    lotCodes: input.lotCodes ?? null,
    selectionConditionId: input.selectionConditionId ?? null,
    ext: input.ext ?? null,
    substituteRole: input.substituteRole ?? null,
    substitutePriority: input.substitutePriority ?? null,
    usageProbability: input.usageProbability ?? null,
    equivQty: input.equivQty ?? null,
    ecnInId: input.ecnInId ?? null,
    ecnOutId: input.ecnOutId ?? null
  } satisfies Partial<BomLineOccurrence>);
  return normalizeDecimals(occurrence);
};

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
    const construct: Construct = (EntityType, initData) =>
      factory ?
        factory.instantiate(EntityType, initData)
      : new (EntityType as unknown as new () => InstanceType<typeof EntityType>)();
    // 本批不写字典：attr_def 按作用域只读一次
    const validation: BomWriteValidationContext = {
      query: executor.query.bind(executor),
      dialect: bomSqlDialectFor(adapter.name),
      rxdb: adapter.rxdb,
      attrDefs: new Map()
    };
    const createValidated = async <T extends EntityType>(EntityType: T, entity: InstanceType<T>): Promise<void> => {
      const record = entity as unknown as Record<string, unknown>;
      await validateBomWrite(validation, getEntityMetadata(EntityType).name, record, 'create');
      await executor.getRepository(EntityType).create(entity);
    };
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

    // 2.5 ECN：draft 装载（盖批次号）→ 发布转移（发布触发器看到开启态批次跳过追溯检查与投影校验）
    for (const input of batch.ecns ?? []) {
      const ecn = construct(BomEcn);
      if (input.id) (ecn as unknown as { id: string }).id = input.id;
      if (input.createdAt) (ecn as unknown as { createdAt: Date }).createdAt = input.createdAt;
      if (input.updatedAt) (ecn as unknown as { updatedAt: Date }).updatedAt = input.updatedAt;
      ecn.ecnNo = input.ecnNo;
      ecn.effectiveDate = input.effectiveDate;
      ecn.reason = input.reason ?? null;
      ecn.historyBatchNo = batch.batchNo;
      await executor.getRepository(BomEcn).create(ecn);
      const patch: Record<string, unknown> = { state: input.state };
      if (input.updatedAt) patch['updatedAt'] = input.updatedAt;
      await executor.getRepository(BomEcn).update(ecn, patch as Partial<BomEcn>);
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
      header.costLotQty = headerInput.costLotQty ?? null;
      header.jointCostShare = headerInput.jointCostShare ?? null;
      header.ext = headerInput.ext ?? null;
      await createValidated(BomHeader, normalizeDecimals(header));
      const lines: { line: BomLine; occurrence: BomLineOccurrence }[] = [];
      for (const lineInput of headerInput.lines) {
        const line = construct(BomLine);
        if (lineInput.id) (line as unknown as { id: string }).id = lineInput.id;
        if (lineInput.createdAt) (line as unknown as { createdAt: Date }).createdAt = lineInput.createdAt;
        if (lineInput.updatedAt) (line as unknown as { updatedAt: Date }).updatedAt = lineInput.updatedAt;
        line.headerId = header.id;
        line.lineNo = lineInput.lineNo;
        line.ecnInId = lineInput.ecnInId ?? null;
        await executor.getRepository(BomLine).create(line);
        for (const occurrenceInput of lineInput.occurrences) {
          const occurrence = occurrenceEntity(construct, line.id, occurrenceInput);
          await createValidated(BomLineOccurrence, occurrence);
          lines.push({ line, occurrence });
          for (const designator of occurrenceInput.designators ?? []) {
            const designatorEntity = construct(BomLineDesignator);
            if (designator.id) (designatorEntity as unknown as { id: string }).id = designator.id;
            if (occurrenceInput.createdAt)
              (designatorEntity as unknown as { createdAt: Date }).createdAt = occurrenceInput.createdAt;
            if (occurrenceInput.updatedAt)
              (designatorEntity as unknown as { updatedAt: Date }).updatedAt = occurrenceInput.updatedAt;
            designatorEntity.occurrenceId = occurrence.id;
            designatorEntity.designator = designator.designator;
            await executor.getRepository(BomLineDesignator).create(designatorEntity);
          }
        }
      }
      // B 层：替代组（成员引用本头行发生项，需在头发布前建）
      for (const groupInput of headerInput.substituteGroups ?? []) {
        const group = construct(BomSubstituteGroup);
        if (groupInput.id) (group as unknown as { id: string }).id = groupInput.id;
        group.headerId = header.id;
        group.code = groupInput.code;
        group.strategy = groupInput.strategy;
        group.allowMix = groupInput.allowMix ?? true;
        group.ecnInId = groupInput.ecnInId ?? null;
        await executor.getRepository(BomSubstituteGroup).create(group);
        for (const member of groupInput.members) {
          const target = lines[member.occurrenceIndex];
          if (!target) throw new Error(`替代组成员引用不存在行的序号 ${member.occurrenceIndex}`);
          await executor.getRepository(BomLineOccurrence).update(
            target.occurrence,
            normalizeDecimals({
              substituteGroupId: group.id,
              substituteRole: member.role,
              substitutePriority: member.priority ?? null,
              usageProbability: member.probability ?? null,
              equivQty: member.equivQty ?? null
            }) as Partial<BomLineOccurrence>
          );
        }
      }
      // B 层：工艺路线 + 工序 + 投料分摊（头挂 routingId）
      if (headerInput.routing) {
        const center = construct(BomWorkCenter);
        if (headerInput.routing.workCenterId)
          (center as unknown as { id: string }).id = headerInput.routing.workCenterId;
        center.code = headerInput.routing.workCenterCode;
        center.orgId = headerInput.orgId;
        await executor.getRepository(BomWorkCenter).create(center);
        const routing = construct(BomRouting);
        if (headerInput.routing.id) (routing as unknown as { id: string }).id = headerInput.routing.id;
        routing.parentRevisionId = revisionIds[headerInput.revisionIndex];
        routing.bomType = headerInput.bomType;
        routing.orgId = headerInput.orgId;
        routing.validFrom = new Date('2020-01-01T00:00:00.000Z');
        await executor.getRepository(BomRouting).create(routing);
        for (const op of headerInput.routing.operations) {
          const operation = construct(BomRoutingOperation);
          if (op.id) (operation as unknown as { id: string }).id = op.id;
          operation.routingId = routing.id;
          operation.operationSeq = op.seq;
          operation.workCenterId = center.id;
          operation.operationScrap = op.scrap ?? '0';
          operation.scrapConvention = op.convention ?? 'additive';
          await executor.getRepository(BomRoutingOperation).create(normalizeDecimals(operation));
        }
        for (const allocation of headerInput.routing.allocations) {
          const target = lines[allocation.occurrenceIndex];
          if (!target) throw new Error(`投料分摊引用不存在行的序号 ${allocation.occurrenceIndex}`);
          if (allocation.operationSeq != null) {
            await executor.getRepository(BomLineOccurrence).update(target.occurrence, {
              operationSeq: allocation.operationSeq
            } as Partial<BomLineOccurrence>);
          }
          for (const splitInput of allocation.splits) {
            const splitEntity = construct(BomLineOperationSplit);
            if (splitInput.id) (splitEntity as unknown as { id: string }).id = splitInput.id;
            splitEntity.occurrenceId = target.occurrence.id;
            splitEntity.operationSeq = splitInput.operationSeq;
            splitEntity.ratio = splitInput.ratio;
            await executor.getRepository(BomLineOperationSplit).create(normalizeDecimals(splitEntity));
          }
        }
        await executor.getRepository(BomHeader).update(header, { routingId: routing.id } as Partial<BomHeader>);
      }
      const headerPatch: Record<string, unknown> = { state: 'released' };
      if (headerInput.updatedAt) headerPatch['updatedAt'] = headerInput.updatedAt;
      await executor.getRepository(BomHeader).update(header, headerPatch as Partial<BomHeader>);
    }

    // 3.5 既有已发布头的行操作（C 层种子改下层头）：截止标记与追加行都在本批 open 期间
    const ecnEffectiveDates = new Map<string, Date>();
    for (const input of batch.ecns ?? []) {
      if (input.id) ecnEffectiveDates.set(input.id, input.effectiveDate);
    }
    for (const overlay of batch.headerOverlays ?? []) {
      if (overlay.headerPatch) {
        const patch: Record<string, unknown> = {};
        if (overlay.headerPatch.costLotQty !== undefined) patch['costLotQty'] = overlay.headerPatch.costLotQty;
        if (overlay.headerPatch.routingId !== undefined) patch['routingId'] = overlay.headerPatch.routingId;
        if (Object.keys(patch).length > 0) {
          const headerTarget = construct(BomHeader);
          (headerTarget as unknown as { id: string }).id = overlay.headerId;
          await executor.getRepository(BomHeader).update(headerTarget, normalizeDecimals(patch) as Partial<BomHeader>);
        }
      }
      for (const cutoff of overlay.cutoffs ?? []) {
        const effectiveDate = ecnEffectiveDates.get(cutoff.ecnId);
        if (!effectiveDate) throw new Error(`overlay 截止标记引用的 ECN 未在本批装载：${cutoff.ecnId}`);
        const target = construct(BomLineOccurrence);
        (target as unknown as { id: string }).id = cutoff.occurrenceId;
        await executor.getRepository(BomLineOccurrence).update(target, {
          ecnOutId: cutoff.ecnId,
          effectiveTo: effectiveDate
        } as Partial<BomLineOccurrence>);
      }
      const writeOccurrences = async (lineId: string, inputs: HistoryOccurrenceInput[]): Promise<void> => {
        for (const occurrenceInput of inputs) {
          await createValidated(BomLineOccurrence, occurrenceEntity(construct, lineId, occurrenceInput));
        }
      };
      for (const lineInput of overlay.lines ?? []) {
        const line = construct(BomLine);
        if (lineInput.id) (line as unknown as { id: string }).id = lineInput.id;
        if (lineInput.createdAt) (line as unknown as { createdAt: Date }).createdAt = lineInput.createdAt;
        if (lineInput.updatedAt) (line as unknown as { updatedAt: Date }).updatedAt = lineInput.updatedAt;
        line.headerId = overlay.headerId;
        line.lineNo = lineInput.lineNo;
        line.ecnInId = lineInput.ecnInId ?? null;
        await executor.getRepository(BomLine).create(line);
        await writeOccurrences(line.id, lineInput.occurrences);
      }
      for (const add of overlay.occurrenceAdds ?? []) {
        await writeOccurrences(add.lineId, add.occurrences);
      }
    }

    // 4. 关闭批次（open → closed 是批次表唯一允许的转移）
    await executor.getRepository(BomHistoryBatch).update(batchEntity, { state: 'closed' });
  }, false);
};
