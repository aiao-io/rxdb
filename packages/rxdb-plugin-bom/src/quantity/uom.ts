/**
 * @fileoverview 单位换算（US-511 阶段 A）
 *
 * 换算链：行 UoM → 子件库存 UoM → 子 BOM 头基准 UoM（穿透前归一）。
 * 同量纲用 metric 前缀标准系数（`g`/`kg`/`t`、`mm`/`cm`/`m`/`km`、`ml`/`l`）；
 * 跨量纲只经行级 / 物料级显式换算率（声明「1 目标单位含多少源单位」，行级覆盖物料级）；
 * 缺换算率或量纲不兼容即拒绝，**不默认 1**（US-511 AC#10）——判据是有没有声明，不是单位名本身。
 */

import { BomQuantityError } from '../types.js';
import { decimalDiv, decimalFromCanonical, decimalIsZero, decimalMul, decimalToCanonical } from './decimal.js';

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
 * 换算是否要经显式换算率（与 {@link convertUom} 同判据）：同单位、同为时间单位、同词根标准系数都不需要；
 * 一方时间一方非时间是量纲不兼容（convertUom 直接拒绝），也不消耗换算率。
 *
 * @param from - 源单位
 * @param to - 目标单位
 */
export const uomNeedsRate = (from: string, to: string): boolean => {
  if (from === to || TIME_UNITS[from] !== undefined || TIME_UNITS[to] !== undefined) return false;
  const fromUnit = METRIC_UNITS[from];
  const toUnit = METRIC_UNITS[to];
  return !(fromUnit && toUnit && fromUnit.root === toUnit.root);
};

/** 一行发生项两跳换算各自可用的换算率（见 {@link splitHopRates}）。 */
export interface HopConversionRates {
  /** 第一跳：行 UoM → 子件库存 UoM。 */
  toStock: UomConversionRates;
  /** 第二跳：子件库存 UoM → 子头基准 UoM（穿透 / 下传 / 成本计价）。 */
  fromStock: UomConversionRates;
}

/**
 * 把一行的行级 / 物料级换算率分配到两跳：每个声明的率只服务一跳跨量纲换算。
 *
 * @remarks
 * 一个率只描述一对单位的关系，跨跳复用必错一跳（行 m → 库存 kg → 子头 件 时 1 kg = 2 m 不可能同时是
 * 1 件 = 2 kg）。第一跳跨量纲时消耗行级率（缺则物料级率），第二跳只剩未被消耗的物料级率、没有即拒绝；
 * 第一跳无需换算率时，行级率覆盖第二跳的物料级率（US-511 AC#9：行级 1 盒 = 4 件覆盖物料级 1 盒 = 10 件）。
 *
 * @param lineUom - 行 UoM
 * @param stockUom - 子件库存 UoM
 * @param lineRate - 行级换算率
 * @param itemRate - 物料级换算率
 */
export const splitHopRates = (
  lineUom: string,
  stockUom: string,
  lineRate: string | null,
  itemRate: string | null
): HopConversionRates => {
  if (!uomNeedsRate(lineUom, stockUom)) return { toStock: {}, fromStock: { lineRate, itemRate } };
  return { toStock: { lineRate, itemRate }, fromStock: lineRate === null ? {} : { itemRate } };
};

/**
 * 本次换算实际使用的率（manifest 记录口径）：无需显式率的换算记 null，不记声明了但没用上的率。
 *
 * @param from - 源单位
 * @param to - 目标单位
 * @param rates - 该跳可用的换算率
 */
export const appliedUomRate = (from: string, to: string, rates: UomConversionRates): string | null =>
  uomNeedsRate(from, to) ? (rates.lineRate ?? rates.itemRate ?? null) : null;

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
    const converted = decimalDiv(decimalMul(source, { coeff: BigInt(fromSeconds), exp: 0 }), {
      coeff: BigInt(toSeconds),
      exp: 0
    });
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
  const divisor = decimalFromCanonical(rate);
  // 0 是写入期合法的规范串，但「1 目标单位含 0 源单位」不构成换算：按数量违约拒绝，不让 kernel 的除零错误裸抛
  if (decimalIsZero(divisor)) {
    const level = rates.lineRate === null || rates.lineRate === undefined ? '物料级' : '行级';
    throw new BomQuantityError(`从 ${from} 换算到 ${to} 的${level}换算率为 0（1 ${to} 含 0 ${from} 不构成换算）`);
  }
  return decimalToCanonical(decimalDiv(decimalFromCanonical(value), divisor));
};
