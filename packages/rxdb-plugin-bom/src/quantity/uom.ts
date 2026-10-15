/**
 * @fileoverview 单位换算（US-511 阶段 A）
 *
 * 换算链：行 UoM → 子件库存 UoM → 子 BOM 头基准 UoM（穿透前归一）。
 * 同量纲用 metric 前缀标准系数（`g`/`kg`/`t`、`mm`/`cm`/`m`/`km`、`ml`/`l`）；
 * 跨量纲只经行级 / 物料级显式换算率（声明「1 目标单位含多少源单位」，行级覆盖物料级）；
 * 缺换算率或量纲不兼容即拒绝，**不默认 1**（US-511 AC#10）——判据是有没有声明，不是单位名本身。
 */

import { BomQuantityError } from '../types.js';
import { decimalDiv, decimalFromCanonical, decimalMul, decimalToCanonical } from './decimal.js';

/**
 * 时间单位表（US-514 AC#19）：60 进制不走 10 幂词根表，按秒数折算；
 * 工时（time_uom）与费率计费单位（rate_uom）同为时间量纲才可换算，否则拒绝不默认 1。
 */
const TIME_UNITS: Readonly<Record<string, number>> = {
  s: 1,
  min: 60,
  h: 3600
};

/** 常用单位表：词根 + 相对于词根基数的 10 幂指数（scale）。 */
const METRIC_UNITS: Readonly<Record<string, { root: string; scale: number }>> = {
  mg: { root: 'g', scale: -3 },
  g: { root: 'g', scale: 0 },
  kg: { root: 'g', scale: 3 },
  t: { root: 'g', scale: 6 },
  mm: { root: 'm', scale: -3 },
  cm: { root: 'm', scale: -2 },
  m: { root: 'm', scale: 0 },
  km: { root: 'm', scale: 3 },
  ml: { root: 'l', scale: -3 },
  l: { root: 'l', scale: 0 },
  pcs: { root: 'pcs', scale: 0 }
};

/** 换算率来源：行级（优先）→ 物料级；均缺失且跨量纲时拒绝。 */
export interface UomConversionRates {
  /** 行级换算率（1 目标单位含多少源单位，规范串）。 */
  lineRate?: string | null;
  /** 物料级换算率（同口径）。 */
  itemRate?: string | null;
}

/**
 * 把规范十进制串从 `from` 单位换算到 `to` 单位。
 *
 * @param value - 规范十进制串
 * @param from - 源单位
 * @param to - 目标单位
 * @param rates - 跨量纲的显式换算率（行级覆盖物料级）
 * @returns 换算后的规范十进制串（34 位有效数字、half-even）
 *
 * @throws {@link BomQuantityError} 跨量纲且两级都没声明换算率
 */
export const convertUom = (value: string, from: string, to: string, rates: UomConversionRates = {}): string => {
  if (from === to) return value;
  // 时间量纲：双方同属时间单位按秒数折算；一方时间一方非时间即量纲不兼容，拒绝不默认 1
  const fromSeconds = TIME_UNITS[from];
  const toSeconds = TIME_UNITS[to];
  if (fromSeconds !== undefined && toSeconds !== undefined) {
    const source = decimalFromCanonical(value);
    // value 以 from 单位计：× from 秒数转到秒，÷ to 秒数转到 to 单位
    const converted = decimalDiv(decimalMul(source, { coeff: BigInt(fromSeconds), exp: 0 }), { coeff: BigInt(toSeconds), exp: 0 });
    return decimalToCanonical(converted);
  }
  if (fromSeconds !== undefined || toSeconds !== undefined) {
    throw new BomQuantityError(`时间单位 ${from} 与 ${to} 量纲不兼容：缺换算或计费单位与工时单位不同量纲，不默认 1`);
  }
  const fromUnit = METRIC_UNITS[from];
  const toUnit = METRIC_UNITS[to];
  // 同词根：标准系数（1 kg = 1000 g 之类；BigInt 幂指数须非负，负指数走除法）
  if (fromUnit && toUnit && fromUnit.root === toUnit.root) {
    const scaleDiff = fromUnit.scale - toUnit.scale;
    const source = decimalFromCanonical(value);
    const converted =
      scaleDiff >= 0 ?
        decimalMul(source, { coeff: 10n ** BigInt(scaleDiff), exp: 0 })
      : decimalDiv(source, { coeff: 10n ** BigInt(-scaleDiff), exp: 0 });
    return decimalToCanonical(converted);
  }
  // 跨量纲：显式换算率（行级优先），声明的是「1 目标单位含多少源单位」→ 源值 ÷ 率
  const rate = rates.lineRate ?? rates.itemRate;
  if (!rate) {
    throw new BomQuantityError(`从 ${from} 换算到 ${to} 缺换算率（跨量纲只经行级 / 物料级显式换算率，不默认 1）`);
  }
  return decimalToCanonical(decimalDiv(decimalFromCanonical(value), decimalFromCanonical(rate)));
};
