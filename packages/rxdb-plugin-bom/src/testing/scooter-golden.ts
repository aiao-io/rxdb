/**
 * @fileoverview SC-100 的手写 golden 表（US-525 阶段 A）
 *
 * **全部手写，不调用被测 kernel 生成**（共享输入、不共享预期）：数量单测、demo 与
 * playwright 都只拿它比较。每个数字按七步公式同一精度、同一顺序手算；阶段结构预留
 * （本步只有阶段 A 的层），不受新层影响的路径各阶段值逐位相同。
 */

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

/** 业务键 → 确定性发生项 id（对账时把 explodeBom 的 id 路径映射回业务键）。 */
export const goldenOccurrenceId = (pathKey: string): string => deterministicId(pathKey);

/** 业务键 → 确定性物料 id。 */
export const goldenItemId = (itemKey: string): string => deterministicId(`item:${itemKey}`);
