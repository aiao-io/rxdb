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
  operationSeq?: number;
  flowDirection?: 'consume' | 'by_product' | 'scrap_out';
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
  /** 替代组（US-512，B 层）：成员按 occurrence 序号引用本头的行。 */
  substituteGroups?: {
    code: string;
    strategy: 'priority' | 'proportional' | 'manual';
    allowMix?: boolean;
    members: { occurrenceIndex: number; role: 'primary' | 'substitute'; probability?: string | null; priority?: number | null; equivQty?: string | null }[];
  }[];
  /** 工艺路线（US-524/520，B 层）：工序列表 + 行的投料工序与分摊。 */
  routing?: {
    workCenterCode: string;
    operations: { seq: number; scrap?: string; convention?: 'additive' | 'yield' }[];
    allocations: { occurrenceIndex: number; operationSeq?: number | null; splits: { operationSeq: number; ratio: string }[] }[];
  };
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

/**
 * SC-100 数据集阶段 B 层（US-525 AC#7~#9）：只追加该阶段 schema 已存在的实体，
 * 不改写下层行——外壳下料头（consume/by_product/scrap_out）、10kΩ 替代组（新装配头）、
 * 工艺路线 10→20→30（20 损耗 3%）与投料分摊 6:4。
 */
export const SCOOTER_DATASET_B: {
  items: ScooterItemSpec[];
  headers: ScooterHeaderSpec[];
} = {
  items: [
    { key: 'HOUSING' },
    { key: 'SHEET' },
    { key: 'OFFCUT' },
    { key: 'TRIM' },
    { key: 'R10K-ALT1' },
    { key: 'R10K-ALT2' },
    { key: 'P-MATERIAL', uomDecimals: 1 },
    { key: 'COVER-ASSY' },
    { key: 'PROCESS-01' }
  ],
  headers: [
    {
      // US-525 AC#8：外壳下料头——consume 板材 + by_product 余料 + scrap_out 边角料
      itemKey: 'HOUSING',
      occurrences: [
        { childKey: 'SHEET', qty: '2', flowDirection: 'consume' },
        { childKey: 'OFFCUT', qty: '0.3', flowDirection: 'by_product' },
        { childKey: 'TRIM', qty: '0.1', flowDirection: 'scrap_out' }
      ]
    },
    {
      // US-525 AC#7：10kΩ 替代组（proportional 0.5/0.3/0.2，equiv 1/2/0.5）
      itemKey: 'COVER-ASSY',
      occurrences: [
        { childKey: 'R10K', qty: '100' },
        { childKey: 'R10K-ALT1', qty: '0' },
        { childKey: 'R10K-ALT2', qty: '0' }
      ],
      substituteGroups: [
        {
          code: 'G-R10K',
          strategy: 'proportional',
          members: [
            { occurrenceIndex: 0, role: 'primary', probability: '0.5' },
            { occurrenceIndex: 1, role: 'substitute', probability: '0.3', equivQty: '2' },
            { occurrenceIndex: 2, role: 'substitute', probability: '0.2', equivQty: '0.5' }
          ]
        }
      ]
    },
    {
      // US-525 AC#9：路线 10→20→30（20 损耗 3% 加成制）；行 G'=100 分摊到 10/30 比例 6:4
      itemKey: 'PROCESS-01',
      baseQty: '100',
      occurrences: [{ childKey: 'P-MATERIAL', qty: '100' }],
      routing: {
        workCenterCode: 'WC-P1',
        operations: [
          { seq: 10 },
          { seq: 20, scrap: '0.03', convention: 'additive' },
          { seq: 30 }
        ],
        allocations: [
          {
            occurrenceIndex: 0,
            splits: [
              { operationSeq: 10, ratio: '0.6' },
              { operationSeq: 30, ratio: '0.4' }
            ]
          }
        ]
      }
    }
  ]
};

/** 种子里的业务键 → 物料 id 映射（demo 与测试按业务键引用）。 */
export type ScooterItemIds = Record<string, string>;

/**
 * SC-100 数据集阶段 C 层（US-525 AC#11/#12）：ECN 时间轴——`ECN-2026-014`（released，
 * 2026-10-01）改 3 张 BOM（SC-100 / PCBA / BATT）的 5 行（新增 SEAT、截止 FRAME、
 * R10K 改量 2→3、MCU→MCU-V2 与 BMS→BMS-V2 两处改版）；`ECN-2026-005`（released，
 * 2026-01-15）改 C 层自己的 `ECN-DEMO` 头——已生效的种子 ECN，供「拒绝取消」演示
 * （未生效 ECN 会随真实日期过期，不放进种子，由用例现场新建）。
 */
export const SCOOTER_DATASET_C: {
  items: ScooterItemSpec[];
  ecns: { ecnNo: string; state: 'released'; effectiveDate: string; reason: string; id: string }[];
  headers: ScooterHeaderSpec[];
  overlays: {
    headerKey: string;
    cutoffs: { occurrenceIndex: number; ecnId: string }[];
    lines?: {
      lineNo: number;
      ecnId: string;
      occurrences: { childKey: string; qty: string; ecnId: string; componentScrap?: string; componentScrapConvention?: 'additive' | 'yield' }[];
    }[];
    occurrenceAdds?: {
      occurrenceIndex: number;
      ecnId: string;
      occurrences: { childKey: string; qty: string; componentScrap?: string; componentScrapConvention?: 'additive' | 'yield' }[];
    }[];
  }[];
} = {
  items: [
    { key: 'SEAT' },
    { key: 'MCU-V2' },
    { key: 'BMS-V2' },
    { key: 'ECN-DEMO' },
    { key: 'DEMO-PART' }
  ],
  ecns: [
    {
      ecnNo: 'ECN-2026-014',
      state: 'released',
      effectiveDate: '2026-10-01',
      reason: 'US-525 阶段 C：新增座椅、取消车架、电阻改量、MCU/BMS 换版',
      id: deterministicId('ecn:ECN-2026-014')
    },
    {
      ecnNo: 'ECN-2026-005',
      state: 'released',
      effectiveDate: '2026-01-15',
      reason: 'US-525 AC#12：已生效的种子 ECN（取消拒绝演示面）',
      id: deterministicId('ecn:ECN-2026-005')
    }
  ],
  // C 层自己的头：ECN-DEMO 挂 ECN-2026-005 的两段行（同逻辑行时间序列）
  headers: [
    {
      itemKey: 'ECN-DEMO',
      occurrences: [
        { childKey: 'DEMO-PART', qty: '1', effectiveFrom: '2026-01-01', effectiveTo: '2026-01-15' },
        { childKey: 'DEMO-PART', qty: '2', effectiveFrom: '2026-01-15' }
      ]
    }
  ],
  // 改下层已发布头：截止标记与追加行（经 loadHistory 的 headerOverlays，open 批次内执行）
  overlays: [
    {
      headerKey: 'SC-100',
      cutoffs: [{ occurrenceIndex: 0, ecnId: deterministicId('ecn:ECN-2026-014') }],
      lines: [
        {
          lineNo: 60,
          ecnId: deterministicId('ecn:ECN-2026-014'),
          occurrences: [{ childKey: 'SEAT', qty: '1', ecnId: deterministicId('ecn:ECN-2026-014') }]
        }
      ]
    },
    {
      headerKey: 'PCBA',
      cutoffs: [
        { occurrenceIndex: 0, ecnId: deterministicId('ecn:ECN-2026-014') },
        { occurrenceIndex: 1, ecnId: deterministicId('ecn:ECN-2026-014') }
      ],
      occurrenceAdds: [
        { occurrenceIndex: 0, ecnId: deterministicId('ecn:ECN-2026-014'), occurrences: [{ childKey: 'MCU-V2', qty: '1', componentScrap: '0.02', componentScrapConvention: 'yield' }] },
        { occurrenceIndex: 1, ecnId: deterministicId('ecn:ECN-2026-014'), occurrences: [{ childKey: 'R10K', qty: '3' }] }
      ]
    },
    {
      headerKey: 'BATT',
      cutoffs: [{ occurrenceIndex: 1, ecnId: deterministicId('ecn:ECN-2026-014') }],
      occurrenceAdds: [
        { occurrenceIndex: 1, ecnId: deterministicId('ecn:ECN-2026-014'), occurrences: [{ childKey: 'BMS-V2', qty: '1' }] }
      ]
    }
  ]
};

/**
 * 装载 SC-100 种子 C 层（在 {@link loadScooterDataset} 之后调用）：C 层新物料 →
 * 一个历史批次内装载 ECN（盖批次号跳过追溯检查与投影校验）+ ECN-DEMO 头 +
 * 对 A/B 层已发布头的截止标记与追加行（open 批次放行 released 历史 ECN）。
 *
 * @param adapter - 本地适配器（C 层写入经 loadHistory 审计通道）
 * @param itemIds - A/B 层装载返回的业务键 → 物料 id 映射
 */
export const loadScooterDatasetC = async (
  adapter: BomLocalAdapter,
  itemIds: ScooterItemIds
): Promise<void> => {
  // C 层新物料追加
  for (const spec of SCOOTER_DATASET_C.items) {
    if (itemIds[spec.key]) continue;
    const item = new BomItem();
    const writable = item as unknown as { id: string; createdAt: Date; updatedAt: Date };
    writable.id = deterministicId(`item:${spec.key}`);
    item.itemNo = spec.key;
    item.stockUom = spec.stockUom ?? 'pcs';
    item.uomDecimals = spec.uomDecimals ?? 0;
    item.uomConversion = spec.uomConversion ?? null;
    writable.createdAt = new Date(SCOOTER_SEED_TIMESTAMP);
    writable.updatedAt = new Date(SCOOTER_SEED_TIMESTAMP);
    await item.save();
    itemIds[spec.key] = item.id;
  }
  // ECN-DEMO 头的两段发生项（挂 ECN-2026-005）在头装载时按行输入带 ecnInId/ecnOutId
  const ecn005 = SCOOTER_DATASET_C.ecns[1];
  await loadHistory(adapter, {
    batchNo: 'scooter-seed-c',
    id: deterministicId('batch:scooter-seed-c'),
    createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
    updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
    revisions: SCOOTER_DATASET_C.headers.map(header => ({
      id: deterministicId(`revision:${header.itemKey}:${header.revisionNo ?? 'A'}`),
      itemId: itemIds[header.itemKey]!,
      revisionNo: header.revisionNo ?? 'A',
      effectiveFrom: new Date(`${header.effectiveFrom ?? '2026-01-01'}T00:00:00.000Z`),
      defaultPhantom: header.defaultPhantom ?? false,
      createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
      updatedAt: new Date(SCOOTER_SEED_TIMESTAMP)
    })),
    ecns: SCOOTER_DATASET_C.ecns.map(ecn => ({
      id: ecn.id,
      ecnNo: ecn.ecnNo,
      state: ecn.state,
      effectiveDate: new Date(`${ecn.effectiveDate}T00:00:00.000Z`),
      reason: ecn.reason,
      createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
      updatedAt: new Date(SCOOTER_SEED_TIMESTAMP)
    })),
    headers: SCOOTER_DATASET_C.headers.map((header, headerIndex) => ({
      revisionIndex: headerIndex,
      bomType: 'ebom',
      orgId: 'org-x',
      id: deterministicId(`header:${header.itemKey}:${header.revisionNo ?? 'A'}`),
      createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
      updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
      // 同一逻辑行的两段发生项（AC#6 时间序列形态）：一个 line 输入 + 两个 occurrence
      lines: [
        {
          id: deterministicId(`line:${header.itemKey}:${header.revisionNo ?? 'A'}:0`),
          createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
          updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
          lineNo: 10,
          occurrences: header.occurrences.map((occurrence, occurrenceIndex) => ({
            id: deterministicId(`occurrence:${header.itemKey}:${header.revisionNo ?? 'A'}:${occurrenceIndex}`),
            createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
            updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
            childItemId: itemIds[occurrence.childKey]!,
            qty: occurrence.qty ?? '1',
            uom: 'pcs',
            effectiveFrom: new Date(`${occurrence.effectiveFrom ?? '2026-01-01'}T00:00:00.000Z`),
            effectiveTo: occurrence.effectiveTo !== undefined ? new Date(`${occurrence.effectiveTo}T00:00:00.000Z`) : null,
            // 第一段被 ECN-2026-005 截止、第二段由其引入
            ecnOutId: occurrenceIndex === 0 ? ecn005.id : null,
            ecnInId: occurrenceIndex === 1 ? ecn005.id : null
          }))
        }
      ]
    })),
    headerOverlays: SCOOTER_DATASET_C.overlays.map(overlay => ({
      headerId: deterministicId(`header:${overlay.headerKey}:A`),
      cutoffs: overlay.cutoffs.map(cutoff => ({
        occurrenceId: deterministicId(`occurrence:${overlay.headerKey}:A:${cutoff.occurrenceIndex}`),
        ecnId: cutoff.ecnId
      })),
      lines: (overlay.lines ?? []).map(lineInput => ({
        id: deterministicId(`line:${overlay.headerKey}:A:c${lineInput.lineNo}`),
        createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
        updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
        lineNo: lineInput.lineNo,
        ecnInId: lineInput.ecnId,
        occurrences: lineInput.occurrences.map((occurrence, occurrenceIndex) => ({
          id: deterministicId(`occurrence:${overlay.headerKey}:A:c${lineInput.lineNo}:${occurrenceIndex}`),
          createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
          updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
          childItemId: itemIds[occurrence.childKey]!,
          qty: occurrence.qty,
          uom: 'pcs',
          effectiveFrom: new Date('2026-10-01T00:00:00.000Z'),
          ecnInId: occurrence.ecnId
        }))
      })),
      occurrenceAdds: (overlay.occurrenceAdds ?? []).map(add => ({
        lineId: deterministicId(`line:${overlay.headerKey}:A:${add.occurrenceIndex}`),
        occurrences: add.occurrences.map((occurrence, occurrenceIndex) => ({
          id: deterministicId(`occurrence:${overlay.headerKey}:A:c${add.occurrenceIndex}:${occurrenceIndex}`),
          createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
          updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
          childItemId: itemIds[occurrence.childKey]!,
          qty: occurrence.qty,
          uom: 'pcs',
          effectiveFrom: new Date('2026-10-01T00:00:00.000Z'),
          ecnInId: add.ecnId,
          componentScrap: occurrence.componentScrap,
          componentScrapConvention: occurrence.componentScrapConvention
        }))
      }))
    }))
  });
};
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
  const headers = [...SCOOTER_DATASET.headers, ...SCOOTER_DATASET_B.headers];
  // B 层物料追加
  for (const spec of SCOOTER_DATASET_B.items) {
    if (items.has(spec.key)) continue;
    const item = new BomItem();
    const writable = item as unknown as { id: string; createdAt: Date; updatedAt: Date };
    writable.id = deterministicId(`item:${spec.key}`);
    item.itemNo = spec.key;
    item.stockUom = spec.stockUom ?? 'pcs';
    item.uomDecimals = spec.uomDecimals ?? 0;
    item.uomConversion = spec.uomConversion ?? null;
    writable.createdAt = new Date(SCOOTER_SEED_TIMESTAMP);
    writable.updatedAt = new Date(SCOOTER_SEED_TIMESTAMP);
    await item.save();
    items.set(spec.key, item);
  }
  await loadHistory(adapter, {
    batchNo: SCOOTER_SEED_BATCH_NO,
    id: deterministicId('batch:scooter-seed-a'),
    createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
    updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
    revisions: (() => {
      // 父件修订 + 全部子件修订（去重）：子件经 imprecise 解析需要已发布修订
      const parentKeys = headers.map(header => ({ key: header.itemKey, revisionNo: header.revisionNo ?? 'A', effectiveFrom: header.effectiveFrom ?? '2026-01-01', defaultPhantom: header.defaultPhantom ?? false }));
      const childKeys = [...new Set(headers.flatMap(header => header.occurrences.map(occurrence => occurrence.childKey)))]
        .filter(key => !parentKeys.some(parent => parent.key === key));
      const all = [
        ...parentKeys,
        ...childKeys.map(key => ({ key, revisionNo: 'A' as string, effectiveFrom: '2026-01-01', defaultPhantom: false }))
      ];
      return all.map(spec => ({
        id: deterministicId(`revision:${spec.key}:${spec.revisionNo}`),
        itemId: items.get(spec.key)!.id,
        revisionNo: spec.revisionNo,
        effectiveFrom: new Date(`${spec.effectiveFrom}T00:00:00.000Z`),
        defaultPhantom: spec.defaultPhantom,
        createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
        updatedAt: new Date(SCOOTER_SEED_TIMESTAMP)
      }));
    })(),
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
            flowDirection: occurrence.flowDirection ?? 'consume',
            operationSeq: occurrence.operationSeq ?? null,
            effectiveFrom: occurrence.effectiveFrom !== undefined ? new Date(`${occurrence.effectiveFrom}T00:00:00.000Z`) : new Date('2026-01-01T00:00:00.000Z'),
            effectiveTo: occurrence.effectiveTo !== undefined ? new Date(`${occurrence.effectiveTo}T00:00:00.000Z`) : null
          }
        ]
      })),
      substituteGroups: (header.substituteGroups ?? []).map(group => ({
        id: deterministicId(`substitute-group:${header.itemKey}:${header.revisionNo ?? 'A'}:${group.code}`),
        code: group.code,
        strategy: group.strategy,
        allowMix: group.allowMix,
        members: group.members
      })),
      routing: header.routing !== undefined ?
        {
          id: deterministicId(`routing:${header.itemKey}:${header.revisionNo ?? 'A'}`),
          workCenterCode: header.routing.workCenterCode,
          workCenterId: deterministicId(`work-center:${header.itemKey}:${header.revisionNo ?? 'A'}`),
          operations: header.routing.operations.map((operation, operationIndex) => ({
            id: deterministicId(`routing-op:${header.itemKey}:${header.revisionNo ?? 'A'}:${operationIndex}`),
            seq: operation.seq,
            scrap: operation.scrap,
            convention: operation.convention
          })),
          allocations: header.routing.allocations.map(allocation => ({
            occurrenceIndex: allocation.occurrenceIndex,
            operationSeq: allocation.operationSeq,
            splits: allocation.splits.map((split, splitIndex) => ({
              id: deterministicId(`routing-split:${header.itemKey}:${header.revisionNo ?? 'A'}:${allocation.occurrenceIndex}:${splitIndex}`),
              operationSeq: split.operationSeq,
              ratio: split.ratio
            }))
          }))
        }
      : undefined
    }))
  });
  return Object.fromEntries([...items.entries()].map(([key, item]) => [key, item.id]));
};

/**
 * SC-100 数据集阶段 D 层（US-525 AC#13~#15）：EBOM↔MBOM 拆分映射（钣金 SHEET-ASSY：
 * EBOM 一张头拆成 MBOM 的板材 + 2 个工序件）；成本输入齐全——全部外购叶子价格 1 元、
 * 副产 OFFCUT 抵减价 1、HOUSING 挂路线（工序 10：run 0.5 h/件、费率 2/h、制费 0.4/h）、
 * 全部头 `cost_lot_qty = 1`；MCU 下补 MCU-DIE → DIE-PART 两层（整机 5 层）；
 * `COST-DEMO` 头挂无价的 `COST-MISSING`（AC#15 的缺失演示面）。
 */
export const SCOOTER_DATASET_D: {
  items: ScooterItemSpec[];
  headers: ScooterHeaderSpec[];
  pricePatches: { itemKey: string; unitPrice: string; priceUom?: string }[];
  creditPatches: { itemKey: string; creditPrice: string }[];
  routingPatches: { headerKey: string; workCenterCode: string; operations: { seq: number; runTime: string; setupTime?: string; fixedTime?: string }[]; rate: string; rateUom: string; overheadRate: string }[];
} = {
  items: [
    { key: 'SHEET-ASSY' },
    { key: 'SHEET-ASSY-M' },
    { key: 'WIP-BEND' },
    { key: 'WIP-CUT' },
    { key: 'MCU-DIE' },
    { key: 'DIE-PART' },
    { key: 'COST-DEMO' },
    { key: 'COST-MISSING' }
  ],
  headers: [
    // SHEET-ASSY 的 MBOM 头（EBOM 头在下层——SHEET-ASSY 是新物料，两层头都在这建）
    {
      itemKey: 'SHEET-ASSY',
      occurrences: [{ childKey: 'SHEET', qty: '1' }]
    },
    {
      itemKey: 'SHEET-ASSY-M',
      occurrences: [
        { childKey: 'SHEET', qty: '1' },
        { childKey: 'WIP-BEND', qty: '1' },
        { childKey: 'WIP-CUT', qty: '1' }
      ]
    },
    // MCU-V2 与 MCU-DIE 的新头（整机 5 层）
    {
      itemKey: 'MCU-V2',
      occurrences: [{ childKey: 'MCU-DIE', qty: '1' }]
    },
    {
      itemKey: 'MCU-DIE',
      occurrences: [{ childKey: 'DIE-PART', qty: '1' }]
    },
    // 成本缺失演示头
    {
      itemKey: 'COST-DEMO',
      occurrences: [{ childKey: 'COST-MISSING', qty: '1' }]
    }
  ],
  pricePatches: [
    { itemKey: 'FRAME', unitPrice: '1' },
    { itemKey: 'SEAT', unitPrice: '1' },
    { itemKey: 'MCU', unitPrice: '1' },
    { itemKey: 'MCU-V2', unitPrice: '1' },
    { itemKey: 'MCU-DIE', unitPrice: '1' },
    { itemKey: 'DIE-PART', unitPrice: '1' },
    { itemKey: 'R10K', unitPrice: '1' },
    { itemKey: 'R10K-ALT1', unitPrice: '1' },
    { itemKey: 'R10K-ALT2', unitPrice: '1' },
    { itemKey: 'WIRE', unitPrice: '1', priceUom: 'm' },
    { itemKey: 'TERMINAL', unitPrice: '1' },
    { itemKey: 'SHRINK', unitPrice: '1' },
    { itemKey: 'M3', unitPrice: '1' },
    { itemKey: 'CELL', unitPrice: '1' },
    { itemKey: 'BMS', unitPrice: '1' },
    { itemKey: 'BMS-V2', unitPrice: '1' },
    { itemKey: 'SHEET', unitPrice: '1' },
    { itemKey: 'OFFCUT', unitPrice: '1' },
    { itemKey: 'TRIM', unitPrice: '1' },
    { itemKey: 'P-MATERIAL', unitPrice: '1' },
    { itemKey: 'DEMO-PART', unitPrice: '1' }
  ],
  creditPatches: [{ itemKey: 'OFFCUT', creditPrice: '1' }],
  routingPatches: [
    {
      headerKey: 'HOUSING',
      workCenterCode: 'WC-D',
      operations: [{ seq: 10, runTime: '0.5' }],
      rate: '2',
      rateUom: 'h',
      overheadRate: '0.4'
    }
  ]
};

/**
 * 装载 SC-100 种子 D 层（在 C 层之后调用）：新物料 → 新头（SHEET-ASSY 双图 / 成本演示头 /
 * MCU 下钻两层）→ 价格与抵减价（item 直接更新，无写入协议）→ HOUSING 路线与费率 →
 * 头 `cost_lot_qty` 补丁与映射（scope + split，经 loadHistory 的 open 批次通道）。
 */
export const loadScooterDatasetD = async (
  adapter: BomLocalAdapter,
  itemIds: ScooterItemIds
): Promise<void> => {
  // 映射 / 路线 / 费率实体（函数体内的 TDZ：声明提到最前）
  const { BomMap, BomMapScope, BomWorkCenter, BomActivityType, BomActivityRate, BomRouting, BomRoutingOperation } = await import('../entities.js');
  // D 层新物料追加
  for (const spec of SCOOTER_DATASET_D.items) {
    if (itemIds[spec.key]) continue;
    const item = new BomItem();
    const writable = item as unknown as { id: string; createdAt: Date; updatedAt: Date };
    writable.id = deterministicId(`item:${spec.key}`);
    item.itemNo = spec.key;
    item.stockUom = spec.stockUom ?? 'pcs';
    item.uomDecimals = spec.uomDecimals ?? 0;
    item.uomConversion = spec.uomConversion ?? null;
    writable.createdAt = new Date(SCOOTER_SEED_TIMESTAMP);
    writable.updatedAt = new Date(SCOOTER_SEED_TIMESTAMP);
    await item.save();
    itemIds[spec.key] = item.id;
  }
  // 价格与抵减价（item 更新，无写入协议；表名按后端分叉）
  const itemTable = adapter.name === 'pglite' ? '"bom"."item"' : '"bom$item"';
  for (const patch of SCOOTER_DATASET_D.pricePatches) {
    const itemId = itemIds[patch.itemKey];
    if (!itemId) continue;
    const uom = patch.priceUom ?? 'pcs';
    await adapter.rawQuery?.(
      `UPDATE ${itemTable} SET "unitPrice" = '${patch.unitPrice}', "priceUom" = '${uom}', "priceCurrency" = 'CNY' WHERE "id" = '${itemId}'`
    );
  }
  for (const patch of SCOOTER_DATASET_D.creditPatches) {
    const itemId = itemIds[patch.itemKey];
    if (!itemId) continue;
    await adapter.rawQuery?.(
      `UPDATE ${itemTable} SET "creditPrice" = '${patch.creditPrice}' WHERE "id" = '${itemId}'`
    );
  }
  // HOUSING 路线 + 费率 + 制费
  const housingHeaderId = deterministicId('header:HOUSING:A');
  const center = new BomWorkCenter();
  (center as unknown as { id: string }).id = deterministicId('work-center:D');
  center.code = 'WC-D';
  center.orgId = 'org-x';
  center.overheadRate = '0.4';
  center.overheadCurrency = 'CNY';
  await center.save();
  const activity = new BomActivityType();
  (activity as unknown as { id: string }).id = deterministicId('activity:D');
  activity.code = 'RUN';
  activity.workCenterId = center.id;
  await activity.save();
  const rate = new BomActivityRate();
  (rate as unknown as { id: string }).id = deterministicId('rate:D');
  rate.workCenterId = center.id;
  rate.activityTypeId = activity.id;
  rate.validFrom = new Date('2026-01-01T00:00:00.000Z');
  rate.rate = '2';
  rate.currency = 'CNY';
  rate.rateUom = 'h';
  await rate.save();
  const routing = new BomRouting();
  (routing as unknown as { id: string }).id = deterministicId('routing:D');
  routing.parentRevisionId = deterministicId('revision:HOUSING:A');
  routing.bomType = 'ebom';
  routing.orgId = 'org-x';
  routing.validFrom = new Date('2020-01-01T00:00:00.000Z');
  await routing.save();
  const operation = new BomRoutingOperation();
  (operation as unknown as { id: string }).id = deterministicId('routing-op:D:0');
  operation.routingId = routing.id;
  operation.operationSeq = 10;
  operation.workCenterId = center.id;
  operation.runTime = '0.5';
  operation.timeUom = 'h';
  await operation.save();
  // D 层头（SHEET-ASSY 双图 / MCU-V2 / MCU-DIE / COST-DEMO）+ 头字段补丁经 open 批次通道
  await loadHistory(adapter, {
    batchNo: 'scooter-seed-d',
    id: deterministicId('batch:scooter-seed-d'),
    createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
    updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
    // 外壳换版 ECN：随本批 draft 装载 + 发布转移（open 批次放行 released 历史 ECN 的行插入）
    ecns: [
      {
        id: deterministicId('ecn:ECN-2026-016'),
        ecnNo: 'ECN-2026-016',
        state: 'released',
        effectiveDate: new Date('2026-10-05T00:00:00.000Z'),
        reason: 'US-525 阶段 D：整机外壳换版 FRAME → HOUSING',
        createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
        updatedAt: new Date(SCOOTER_SEED_TIMESTAMP)
      }
    ],
    revisions: SCOOTER_DATASET_D.headers.map(header => ({
      id: deterministicId(`revision:${header.itemKey}:${header.revisionNo ?? 'A'}`),
      itemId: itemIds[header.itemKey]!,
      revisionNo: header.revisionNo ?? 'A',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      defaultPhantom: false,
      createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
      updatedAt: new Date(SCOOTER_SEED_TIMESTAMP)
    })),
    headers: SCOOTER_DATASET_D.headers.map((header, headerIndex) => ({
      revisionIndex: headerIndex,
      // SHEET-ASSY-M 是 MBOM 头（EBOM↔MBOM 拆分演示）；其余为 EBOM
      bomType: header.itemKey.endsWith('-M') ? 'mbom' : 'ebom',
      orgId: 'org-x',
      id: deterministicId(`header:${header.itemKey}:${header.revisionNo ?? 'A'}`),
      createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
      updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
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
            childItemId: itemIds[occurrence.childKey]!,
            qty: occurrence.qty ?? '1',
            uom: 'pcs',
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
          }
        ]
      }))
    })),
    headerOverlays: [
      ...(() => {
        const patches: { headerId: string; headerPatch: { costLotQty: string } }[] = [];
        // 全部头 cost_lot_qty = 1（卷算必填）
        for (const headerKey of ['SC-100', 'PCBA', 'WH-01', 'BATT', 'MCU-V2', 'MCU-DIE', 'HOUSING', 'SHEET-ASSY', 'SHEET-ASSY-M', 'COVER-ASSY', 'PROCESS-01', 'ECN-DEMO', 'COST-DEMO']) {
          patches.push({
            headerId: deterministicId(`header:${headerKey}:${headerKey === 'WH-01' ? 'D' : 'A'}`),
            headerPatch: { costLotQty: '1' }
          });
        }
        return patches;
      })(),
      {
        headerId: housingHeaderId,
        headerPatch: { routingId: routing.id }
      },
      {
        // 整机外壳换版：ECN-2026-016 引入 HOUSING（open 批次放行 released 历史 ECN 的行插入）
        headerId: deterministicId('header:SC-100:A'),
        lines: [
          {
            id: deterministicId('line:SC-100:A:5'),
            createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
            updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
            lineNo: 70,
            ecnInId: deterministicId('ecn:ECN-2026-016'),
            occurrences: [
              {
                id: deterministicId('occurrence:SC-100:A:5:0'),
                createdAt: new Date(SCOOTER_SEED_TIMESTAMP),
                updatedAt: new Date(SCOOTER_SEED_TIMESTAMP),
                childItemId: itemIds['HOUSING']!,
                qty: '1',
                uom: 'pcs',
                effectiveFrom: new Date('2026-10-05T00:00:00.000Z'),
                ecnInId: deterministicId('ecn:ECN-2026-016')
              }
            ]
          }
        ]
      }
    ]
  });

  // SHEET-ASSY 双图与映射（同物料两张头 + scope + split 1:3；行 id 按头查得）
  const sheetAssyEbom = deterministicId('header:SHEET-ASSY:A');
  const sheetAssyMbom = deterministicId('header:SHEET-ASSY-M:A');
  const scope = new BomMapScope();
  (scope as unknown as { id: string }).id = deterministicId('map-scope:D');
  scope.orgId = 'org-x';
  scope.ebomRootHeaderId = sheetAssyEbom;
  scope.mbomRootHeaderId = sheetAssyMbom;
  await scope.save();
  const lineTable = adapter.name === 'pglite' ? '"bom"."bom_line"' : '"bom$bom_line"';
  const readLineIds = async (headerId: string): Promise<string[]> => {
    const result = (await adapter.rawQuery?.(
      `SELECT l."id" FROM ${lineTable} l WHERE l."headerId" = '${headerId}' ORDER BY l."lineNo" ASC`
    )) as unknown as { results?: { rows: unknown[][] }[]; rows?: unknown[][] };
    const rows = Array.isArray(result.results) ? result.results[0].rows : (result.rows ?? []);
    return rows.map(row => String(row[0]));
  };
  const ebomLineIds = await readLineIds(sheetAssyEbom);
  const mbomLineIds = await readLineIds(sheetAssyMbom);
  for (const [targetKey, index] of [['SHEET', 0], ['WIP-BEND', 1], ['WIP-CUT', 2]] as const) {
    const mapping = new BomMap();
    (mapping as unknown as { id: string }).id = deterministicId(`map:D:${index}`);
    mapping.scopeId = scope.id;
    mapping.relation = 'split';
    mapping.sourceLineId = ebomLineIds[0];
    mapping.targetLineId = mbomLineIds[index];
    await mapping.save();
    void targetKey;
  }
};
