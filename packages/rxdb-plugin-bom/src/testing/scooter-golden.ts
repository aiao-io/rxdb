/**
 * @fileoverview SC-100 的手写 golden 表（US-525 阶段 A）
 *
 * **全部手写，不调用被测 kernel 生成**（共享输入、不共享预期）：数量单测、demo 与
 * playwright 都只拿它比较。每个数字按七步公式同一精度、同一顺序手算；阶段结构预留
 * （本步只有阶段 A 的层），不受新层影响的路径各阶段值逐位相同。
 */

import type { UUID } from '@aiao/rxdb';
import { deterministicId } from './scooter-dataset.js';

/** 一步中间量（手写）。 */
export interface GoldenStepValue {
  value: string;
  uom: string;
}

/** 一条需求行的 golden（含七步中间值）。 */
export interface GoldenRequirement {
  /** 路径 = 行发生项业务键序列（确定性 id 可派生，与 explodeBom 的 path 同构）。 */
  pathKey: string[];
  itemKey: string;
  qty: string;
  uom: string;
  steps: {
    planned: GoldenStepValue;
    assemblyScrapped: GoldenStepValue;
    gross: GoldenStepValue;
    componentScrapped: GoldenStepValue;
    converted: GoldenStepValue;
  };
}

/** 一条穿透记录的 golden。 */
export interface GoldenPenetration {
  pathKey: string[];
  itemKey: string;
  source: 'override' | 'revision';
  converted: GoldenStepValue;
  childPlanned: GoldenStepValue;
}

/** SC-100 阶段 A 的 golden（评估日 2026-09-22、计划量 1 pcs）。 */
export const SCOOTER_GOLDEN: {
  context: { bomType: 'ebom'; orgId: 'org-x'; asOfDate: string };
  plannedQty: GoldenStepValue;
  rootKey: string;
  requirements: GoldenRequirement[];
  penetrations: GoldenPenetration[];
} = {
  context: { bomType: 'ebom', orgId: 'org-x', asOfDate: '2026-09-22' },
  plannedQty: { value: '1', uom: 'pcs' },
  rootKey: 'SC-100',
  requirements: [
    // SC-100 头（P=1、P'=1；G = qty × 1 / 1）
    golden(['occurrence:SC-100:A:0'], 'FRAME', '1'),
    golden(['occurrence:SC-100:A:1'], 'PCBA', '1'),
    // WH-01 穿透（D 版 phantom）：不产出需求行，见 penetrations
    golden(['occurrence:SC-100:A:3'], 'BATT', '1'),
    golden(['occurrence:SC-100:A:4'], 'M3', '8'),
    // PCBA 头（P=1、P'=1）：MCU 组件损耗 2% 良率制 → G' = 1 ÷ 0.98
    {
      pathKey: ['occurrence:SC-100:A:1', 'occurrence:PCBA:A:0'],
      itemKey: 'MCU',
      qty: '2',
      uom: 'pcs',
      steps: {
        planned: { value: '1', uom: 'pcs' },
        assemblyScrapped: { value: '1', uom: 'pcs' },
        gross: { value: '1', uom: 'pcs' },
        // 50/49 的 34 位有效数字（half-even）
        componentScrapped: { value: '1.020408163265306122448979591836735', uom: 'pcs' },
        converted: { value: '1.020408163265306122448979591836735', uom: 'pcs' }
      }
    },
    // 同一 10kΩ 电阻三条逻辑行（三组位号）
    golden(['occurrence:SC-100:A:1', 'occurrence:PCBA:A:1'], 'R10K', '2'),
    golden(['occurrence:SC-100:A:1', 'occurrence:PCBA:A:2'], 'R10K', '3'),
    golden(['occurrence:SC-100:A:1', 'occurrence:PCBA:A:3'], 'R10K', '1'),
    // 电池组头（P=1、P'=1）：BMS 定量行
    golden(['occurrence:SC-100:A:3', 'occurrence:BATT:A:0'], 'CELL', '10'),
    golden(['occurrence:SC-100:A:3', 'occurrence:BATT:A:1'], 'BMS', '1'),
    // WH-01 头（P = 1 m、P' = 1 m；导线 1.2 m 库存小数位 2 不舍入）
    {
      pathKey: ['occurrence:SC-100:A:2', 'occurrence:WH-01:D:0'],
      itemKey: 'WIRE',
      qty: '1.2',
      uom: 'm',
      steps: {
        planned: { value: '1', uom: 'm' },
        assemblyScrapped: { value: '1', uom: 'm' },
        gross: { value: '1.2', uom: 'm' },
        componentScrapped: { value: '1.2', uom: 'm' },
        converted: { value: '1.2', uom: 'm' }
      }
    },
    golden(['occurrence:SC-100:A:2', 'occurrence:WH-01:D:1'], 'TERMINAL', '2', 'm'),
    golden(['occurrence:SC-100:A:2', 'occurrence:WH-01:D:2'], 'SHRINK', '1', 'm'),
    golden(['occurrence:SC-100:A:2', 'occurrence:WH-01:D:3'], 'M3', '4', 'm')
  ],
  penetrations: [
    {
      pathKey: ['occurrence:SC-100:A:2'],
      itemKey: 'WH-01',
      source: 'revision',
      // D = 1 pcs（WH-01 库存单位）→ 物料级换算 1 m = 1 pcs → P = 1 m
      converted: { value: '1', uom: 'pcs' },
      childPlanned: { value: '1', uom: 'm' }
    }
  ]
};

/** 组装一条无损耗需求行的 golden（qty 常量行、无损耗；plannedUom = 父头基准单位）。 */
function golden(pathKey: string[], itemKey: string, qty: string, plannedUom = 'pcs'): GoldenRequirement {
  return {
    pathKey,
    itemKey,
    qty,
    uom: 'pcs',
    steps: {
      planned: { value: '1', uom: plannedUom },
      assemblyScrapped: { value: '1', uom: plannedUom },
      gross: { value: qty, uom: 'pcs' },
      componentScrapped: { value: qty, uom: 'pcs' },
      converted: { value: qty, uom: 'pcs' }
    }
  };
}

/**
 * 阶段 B 层 golden（US-525 AC#7~#9）：A 层路径值逐位不变（加层不扰动旧结构），
 * B 层新路径给出新值——手写，不由被测 kernel 生成。
 */
export const SCOOTER_GOLDEN_B: {
  requirements: {
    rootKey: string;
    plannedQty: GoldenStepValue;
    lines: GoldenRequirement[];
    outputs: { itemKey: string; qty: string }[];
  }[];
} = {
  requirements: [
    {
      // US-525 AC#8：外壳下料——consume 2、by_product 0.3、scrap_out 0.1
      rootKey: 'HOUSING',
      plannedQty: { value: '1', uom: 'pcs' },
      lines: [golden(['occurrence:HOUSING:A:0'], 'SHEET', '2')],
      outputs: [
        { itemKey: 'OFFCUT', qty: '0.3' },
        { itemKey: 'TRIM', qty: '0.1' }
      ]
    },
    {
      // US-525 AC#7：10kΩ 替代组 proportional 0.5/0.3/0.2（equiv 1/2/0.5）
      // primary 行 qty 100、计划量 1 → primary 需求 100 → R10K 50、ALT1 60、ALT2 10
      rootKey: 'COVER-ASSY',
      plannedQty: { value: '1', uom: 'pcs' },
      lines: [
        golden(['occurrence:COVER-ASSY:A:0'], 'R10K', '50'),
        golden(['occurrence:COVER-ASSY:A:1'], 'R10K-ALT1', '60'),
        golden(['occurrence:COVER-ASSY:A:2'], 'R10K-ALT2', '10')
      ],
      outputs: []
    },
    {
      // US-525 AC#9：路线 10→20→30（20 损耗 3%）；G'=100 分摊 10/30 比例 6:4
      // 60×1.03=61.8 + 40 = 101.8（P-MATERIAL 库存小数位 1，不取整）
      rootKey: 'PROCESS-01',
      plannedQty: { value: '100', uom: 'pcs' },
      lines: [golden(['occurrence:PROCESS-01:A:0'], 'P-MATERIAL', '101.8')],
      outputs: []
    }
  ]
};

/** 业务键 → 确定性发生项 id（对账时把 explodeBom 的 id 路径映射回业务键）。 */
export const goldenOccurrenceId = (pathKey: string): string => deterministicId(pathKey);

/** 业务键 → 确定性物料 id。 */
export const goldenItemId = (itemKey: string): UUID => deterministicId(`item:${itemKey}`);

/**
 * SC-100 阶段 C 的 golden（US-525 AC#10/#11）：受影响路径按评估日两段手写值——
 * `before`（2026-09-22，ECN-2026-014 生效前，与 A/B 层逐位一致）与 `after`
 * （2026-10-15，生效后）；不受影响路径沿用 A/B 层值（逐位不变是本层的断言）。
 * MCU 行的 2% 良率制损耗在换版后保留（行属性不变）：G' = 1 ÷ 0.98。
 */
export const SCOOTER_GOLDEN_C: {
  /** 受影响需求行：itemKey → 两段的各路径 qty 列表（NULL = 该段不存在此物料的需求行）。 */
  requirements: { itemKey: string; before: string[] | null; after: string[] | null }[];
} = {
  requirements: [
    // SC-100 的 FRAME 行被截止删除
    { itemKey: 'FRAME', before: ['1'], after: null },
    // SC-100 新增 SEAT 行
    { itemKey: 'SEAT', before: null, after: ['1'] },
    // PCBA 的 MCU 行换版 MCU-V2（损耗 2% 良率制保留；需求行 qty 按 0 位小数向上取整 = 2）
    { itemKey: 'MCU', before: ['2'], after: null },
    { itemKey: 'MCU-V2', before: null, after: ['2'] },
    // PCBA 的 R10K 三行首行改量 2→3：2/3/1 → 3/3/1
    { itemKey: 'R10K', before: ['2', '3', '1'], after: ['3', '3', '1'] },
    // BATT 的 BMS 行换版 BMS-V2
    { itemKey: 'BMS', before: ['1'], after: null },
    { itemKey: 'BMS-V2', before: null, after: ['1'] }
  ]
};

/**
 * SC-100 阶段 D 的 golden（US-525 AC#14）：整机成本卷算（评估日 2026-10-15、币种 CNY、
 * 费率日同日）手写。根层子件贡献合计（子件单位成本 × 需求，含子件全部成本）：
 * SEAT 1 + PCBA（MCU-V2 下钻：DIE-PART 1 ÷ 0.98 = 1.0204…（34 位有效 half-even）+ R10K 7
 * = 8.0204…）+ WH-01（WIRE 1.2 + TERMINAL 2 + SHRINK 1 + M3 4 = 8.2）+ BATT 11
 * + M3 8 + HOUSING（SHEET 2 + 加工 1 + 制费 0.2 − 抵减 0.3 = 2.9）。HOUSING 节点逐项：
 * 材料 SHEET 2；加工 HOUSING 工序 10 run 0.5 h/件 × 费率 2 = 1；制费 0.5 h × 0.4 = 0.2；
 * 副产抵减 OFFCUT 0.3 × 1 = 0.3。全部头 cost_lot_qty = 1。
 */
export const SCOOTER_GOLDEN_D: {
  context: { bomType: 'ebom'; orgId: 'org-x'; asOfDate: string; currency: string; rateDate: string };
  rootKey: string;
  batchQty: { value: string; uom: string };
  batchCost: string;
  unitCost: string;
  materialTotal: string;
  processingTotal: string;
  overhead: string;
  creditTotal: string;
} = {
  context: { bomType: 'ebom', orgId: 'org-x', asOfDate: '2026-10-15', currency: 'CNY', rateDate: '2026-10-15' },
  rootKey: 'SC-100',
  batchQty: { value: '1', uom: 'pcs' },
  // 根层子件贡献：1 + 8.0204… + 8.2 + 11 + 8 + 2.9（34 位有效 half-even）
  batchCost: '39.12040816326530612244897959183674',
  unitCost: '39.12040816326530612244897959183674',
  materialTotal: '39.12040816326530612244897959183674',
  processingTotal: '1',
  overhead: '0.2',
  creditTotal: '0.3'
};

/**
 * SC-100 阶段 E 的 golden（US-525 AC#17~#19）：ECN-2026-017 从 2026-10-16 起
 * 追加序列组件、配置组件与 B-01。四个新增外购叶子均为 1 CNY/pcs；红配置在阶段 D
 * 成本上加 3，蓝配置加 2，序列旧新件等价。独立演示头与整机共用同一份结构。
 */
export const SCOOTER_GOLDEN_E: {
  context: { bomType: 'ebom'; orgId: 'org-x'; asOfDate: string };
  assembly: {
    rootKey: string;
    rootLines: { lineNo: number; itemKey: string }[];
    redUnitCost: string;
    blueUnitCost: string;
    counts: { items: number; occurrences: number; ecns: number; batches: number };
  };
  unitDemo: { rootKey: string; unit136: { items: string[]; qty: string }; unit137: { items: string[]; qty: string } };
  configDemo: {
    rootKey: string;
    selectRed: { items: string[] };
    selectBlue: { items: string[] };
    missingError: RegExp;
    conflictError: RegExp;
  };
} = {
  context: { bomType: 'ebom', orgId: 'org-x', asOfDate: '2026-10-16' },
  assembly: {
    rootKey: 'SC-100',
    rootLines: [
      { lineNo: 80, itemKey: 'UNIT-DEMO' },
      { lineNo: 90, itemKey: 'CONFIG-DEMO' },
      { lineNo: 100, itemKey: 'B-01' }
    ],
    redUnitCost: '42.12040816326530612244897959183674',
    blueUnitCost: '41.12040816326530612244897959183674',
    counts: { items: 40, occurrences: 42, ecns: 4, batches: 4 }
  },
  unitDemo: {
    rootKey: 'UNIT-DEMO',
    // 旧段（unit ≤ 136）与新段（unit ≥ 137）各入选一行；两段不同发生项
    unit136: { items: ['UNIT-PART-OLD'], qty: '1' },
    unit137: { items: ['UNIT-PART-NEW'], qty: '1' }
  },
  configDemo: {
    rootKey: 'CONFIG-DEMO',
    selectRed: { items: ['CONFIG-PART'] },
    selectBlue: { items: [] },
    missingError: /配置不完整/,
    conflictError: /红蓝互斥/
  }
};
