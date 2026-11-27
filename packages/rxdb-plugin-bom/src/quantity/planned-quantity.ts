import { normalizeDecimalString } from '../decimal.utils.js';

/** 在计算边界规范化非负计划量，不改变其计量单位。 */
export const normalizePlannedQuantity = (
  quantity: { value: string; uom: string },
  field = 'plannedQty'
): { value: string; uom: string } => ({ value: normalizeDecimalString(quantity.value, field), uom: quantity.uom });
