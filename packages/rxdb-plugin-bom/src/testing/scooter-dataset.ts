/**
 * @fileoverview 电动滑板车 SC-100 确定性种子（US-525 阶段 A）
 *
 * demo 与 vitest 用例共用同一份数据：一台整机覆盖阶段 A 的硬形状——PCBA 下同一 10kΩ
 * 电阻分属三条逻辑行（三组位号、qty 各不同，AC#2）；线束 WH-01 的 D 版 `default_phantom`
 * 且头以 1 m 为基准（AC#4）；M3 螺钉经整机直连与虚拟线束两条路径被使用（AC#6）；
 * 装配 / 组件损耗与定量行让算式面板的七步都有值。
 *
 * **确定性**（AC#1）：每个 id 由业务键确定性派生（FNV-1a 两段拼 uuid v4 形状）、
 * `createdAt` / `updatedAt` 取固定基准、日期是字面值、`loadHistory` 批次号是常量——
 * 两遍装载读出的行逐字节相同，与宿主当日无关。
 */

import { BomItem } from '../entities.js';
import { loadHistory } from '../resolve/history-loader.js';
import type { BomLocalAdapter } from '../resolve/bom-adapter.js';

/** 种子批次号（常量：确定性装载的归属，US-525 AC#1）。 */
export const SCOOTER_SEED_BATCH_NO = 'scooter-seed-a';

/** 固定审计时间戳基准（不读系统时钟）。 */
export const SCOOTER_SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

/** FNV-1a 32 位哈希（与 check-sql.ts 的约束名指纹同算法）。 */
const fnv1a32 = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/** 由业务键确定性派生 uuid（v4 形状，两段 FNV-1a 哈希）。 */
export const deterministicId = (seed: string): string => {
  const first = fnv1a32(`${seed}:first`).toString(16).padStart(8, '0');
  const second = (fnv1a32(`${seed}:second`) & 0xffff).toString(16).padStart(4, '0');
  const third = (0x4000 | (fnv1a32(`${seed}:third`) & 0x0fff)).toString(16).padStart(4, '0');
  const fourth = (0x8000 | (fnv1a32(`${seed}:fourth`) & 0x3fff)).toString(16).padStart(4, '0');
  const fifth = fnv1a32(`${seed}:fifth`).toString(16).padStart(12, '0');
  return `${first}-${second}-${third}-${fourth}-${fifth}`;
};

/** 物料规格。 */
export interface ScooterItemSpec {
  key: string;
  stockUom?: string;
  uomDecimals?: number;
  uomConversion?: string | null;
}

/** 位号规格（确定性 id 可选）。 */
export interface ScooterDesignatorSpec {
  designator: string;
  id?: string;
}

/** 行发生项规格。 */
export interface ScooterOccurrenceSpec {
  childKey: string;
  qty?: string | null;
  qtyFormula?: string | null;
  isFixedQty?: boolean;
  uom?: string;
  componentScrap?: string;
  componentScrapConvention?: 'additive' | 'yield';
  componentScrapFixed?: string;
  uomConversion?: string | null;
  phantomOverride?: boolean | null;
  designatorManaged?: boolean;
  designators?: ScooterDesignatorSpec[];
  effectiveFrom?: string;
  effectiveTo?: string | null;
}

/** 头规格（挂物料修订）。 */
export interface ScooterHeaderSpec {
  itemKey: string;
  revisionNo?: string;
  defaultPhantom?: boolean;
  effectiveFrom?: string;
  baseUom?: string;
  baseQty?: string;
  assemblyScrap?: string;
  assemblyScrapConvention?: 'additive' | 'yield';
  occurrences: ScooterOccurrenceSpec[];
}

/** SC-100 数据集（阶段 A 层）：纯数据描述，不含任何随机成分。 */
export const SCOOTER_DATASET: {
  items: ScooterItemSpec[];
  headers: ScooterHeaderSpec[];
} = {
  items: [
    { key: 'SC-100' },
    { key: 'FRAME' },
    { key: 'PCBA' },
    { key: 'MCU' },
    { key: 'R10K' },
    { key: 'WH-01', uomConversion: '1' },
    { key: 'WIRE', stockUom: 'm', uomDecimals: 2 },
    { key: 'TERMINAL' },
    { key: 'SHRINK' },
    { key: 'BATT' },
    { key: 'CELL' },
    { key: 'BMS' },
    { key: 'M3' }
  ],
  headers: [
    {
      itemKey: 'SC-100',
      occurrences: [
        { childKey: 'FRAME', qty: '1' },
        { childKey: 'PCBA', qty: '1' },
        { childKey: 'WH-01', qty: '1' },
        { childKey: 'BATT', qty: '1' },
        { childKey: 'M3', qty: '8' }
      ]
    },
    {
      itemKey: 'PCBA',
      occurrences: [
        { childKey: 'MCU', qty: '1', componentScrap: '0.02', componentScrapConvention: 'yield' },
        // 同一 10kΩ 电阻分属三条逻辑行、三组位号（US-525 AC#2 / US-507 AC#1/#4）
        { childKey: 'R10K', qty: '2', designatorManaged: true, designators: [{ designator: 'R1' }, { designator: 'R2' }] },
        { childKey: 'R10K', qty: '3', designatorManaged: true, designators: [{ designator: 'R3' }, { designator: 'R4' }, { designator: 'R5' }] },
        { childKey: 'R10K', qty: '1', designatorManaged: true, designators: [{ designator: 'R6' }] }
      ]
    },
    {
      itemKey: 'WH-01',
      revisionNo: 'C',
      effectiveFrom: '2026-01-01',
      occurrences: []
    },
    {
      itemKey: 'WH-01',
      revisionNo: 'D',
      defaultPhantom: true,
      effectiveFrom: '2026-06-01',
      baseUom: 'm',
      baseQty: '1',
      occurrences: [
        { childKey: 'WIRE', qty: '1.2', uom: 'm' },
        { childKey: 'TERMINAL', qty: '2' },
        { childKey: 'SHRINK', qty: '1' },
        { childKey: 'M3', qty: '4' }
      ]
    },
    {
      itemKey: 'BATT',
      occurrences: [
        { childKey: 'CELL', qty: '10' },
        { childKey: 'BMS', qty: '1', isFixedQty: true }
      ]
    }
  ]
};

/** 种子里的业务键 → 物料 id 映射（demo 与测试按业务键引用）。 */
export type ScooterItemIds = Record<string, string>;

/**
 * 装载 SC-100 种子（确定性：清库后两遍装载逐字节相同，AC#1）。
 *
 * @param adapter - 本地适配器（全部写入经 loadHistory 审计通道；批次号是常量，
 *   对已装载过的库重复调用会撞批次唯一约束——先 reset）
 * @returns 业务键 → 物料 id 的映射
 */
export const loadScooterDataset = async (adapter: BomLocalAdapter): Promise<ScooterItemIds> => {
  const items = new Map<string, BomItem>();
  for (const spec of SCOOTER_DATASET.items) {
    if (items.has(spec.key)) continue;
    // 多实例下 new Entity() 无法判目标库：经 entityManager.instantiate 构造（缺省时退化 new）
    const factory = adapter.rxdb?.entityManager;
    const item = factory ?
      factory.instantiate(BomItem, {
        id: deterministicId(`item:${spec.key}`),
        itemNo: spec.key,
        stockUom: spec.stockUom ?? 'pcs',
        uomDecimals: spec.uomDecimals ?? 0,
        uomConversion: spec.uomConversion ?? null,
        // 审计时间戳取固定基准（构造期传入覆盖默认值）
        createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
        updatedAt: new Date(SCOOTER_SEED_TIMESTAMP)
      } as Partial<BomItem>)
    : new BomItem();
    if (!factory) {
      const writable = item as unknown as { id: string; createdAt: Date; updatedAt: Date };
      writable.id = deterministicId(`item:${spec.key}`);
      item.itemNo = spec.key;
      item.stockUom = spec.stockUom ?? 'pcs';
      item.uomDecimals = spec.uomDecimals ?? 0;
      item.uomConversion = spec.uomConversion ?? null;
      writable.createdAt = new Date(SCOOTER_SEED_TIMESTAMP);
      writable.updatedAt = new Date(SCOOTER_SEED_TIMESTAMP);
    }
    await item.save();
    items.set(spec.key, item);
  }
  // 修订与头同批装载：每个头规格对应一个修订（同一物料可有多个修订，如 WH-01 的 C/D 版）
  const headers = SCOOTER_DATASET.headers;
  await loadHistory(adapter, {
    batchNo: SCOOTER_SEED_BATCH_NO,
    id: deterministicId('batch:scooter-seed-a'),
    createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
    updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
    revisions: headers.map(header => ({
      id: deterministicId(`revision:${header.itemKey}:${header.revisionNo ?? 'A'}`),
      itemId: items.get(header.itemKey)!.id,
      revisionNo: header.revisionNo ?? 'A',
      effectiveFrom: new Date(`${header.effectiveFrom ?? '2026-01-01'}T00:00:00.000Z`),
      defaultPhantom: header.defaultPhantom ?? false,
      createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
      updatedAt: new Date(SCOOTER_SEED_TIMESTAMP)
    })),
    headers: headers.map((header, headerIndex) => ({
      revisionIndex: headerIndex,
      bomType: 'ebom',
      orgId: 'org-x',
      id: deterministicId(`header:${header.itemKey}:${header.revisionNo ?? 'A'}`),
      createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
      updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
      baseUom: header.baseUom,
      baseQty: header.baseQty,
      assemblyScrap: header.assemblyScrap,
      assemblyScrapConvention: header.assemblyScrapConvention,
      lines: header.occurrences.map((occurrence, occurrenceIndex) => ({
        id: deterministicId(`line:${header.itemKey}:${header.revisionNo ?? 'A'}:${occurrenceIndex}`),
        createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
        updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
        lineNo: 10 + occurrenceIndex * 10,
        occurrences: [
          {
            id: deterministicId(`occurrence:${header.itemKey}:${header.revisionNo ?? 'A'}:${occurrenceIndex}`),
            createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
            updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
            childItemId: items.get(occurrence.childKey)!.id,
            qty: occurrence.qtyFormula ? null : occurrence.qty ?? '1',
            qtyFormula: occurrence.qtyFormula ?? null,
            formulaGrammarVersion: occurrence.qtyFormula ? '1' : null,
            isFixedQty: occurrence.isFixedQty ?? false,
            uom: occurrence.uom ?? 'pcs',
            componentScrap: occurrence.componentScrap ?? '0',
            componentScrapConvention: occurrence.componentScrapConvention ?? 'additive',
            componentScrapFixed: occurrence.componentScrapFixed ?? '0',
            uomConversion: occurrence.uomConversion ?? null,
            phantomOverride: occurrence.phantomOverride ?? null,
            designatorManaged: occurrence.designatorManaged ?? false,
            designators: (occurrence.designators ?? []).map((designator, designatorIndex) => ({
              id: deterministicId(`designator:${header.itemKey}:${header.revisionNo ?? 'A'}:${occurrenceIndex}:${designatorIndex}`),
              designator: designator.designator
            })),
            effectiveFrom: occurrence.effectiveFrom !== undefined ? new Date(`${occurrence.effectiveFrom}T00:00:00.000Z`) : new Date('2026-01-01T00:00:00.000Z'),
            effectiveTo: occurrence.effectiveTo !== undefined ? new Date(`${occurrence.effectiveTo}T00:00:00.000Z`) : null
          }
        ]
      }))
    }))
  });
  return Object.fromEntries([...items.entries()].map(([key, item]) => [key, item.id]));
};
