/**
 * @fileoverview BOM 仓储门面
 *
 * 十进制值合同的**入口规范化**只发生在这里：`qty` 等十进制字段写前规范成规范串
 * （接受指数写法、前导零、尾随零），存储层不替调用方规范化。违约（CHECK / 排他 /
 * BOM 触发器消息）归一为类型化错误类再上抛。
 */

import { Repository } from '@aiao/rxdb';
import type { EntityType, RxDB } from '@aiao/rxdb';
import { normalizeDecimalString } from './decimal.utils.js';
import { attachUnionOnlyMark } from './resolve/cycle-analysis.js';
import { BomCycleError, normalizeBomError } from './types.js';

/** 需要入口规范化的十进制字段（US-511 按十进制值合同扩列）。 */
const DECIMAL_FIELDS = [
  'qty',
  'baseQty',
  'assemblyScrap',
  'componentScrap',
  'componentScrapFixed',
  'lotsizeFrom',
  'lotsizeTo',
  'uomConversion'
] as const;

/** 把实体上的十进制字段规范成规范串（原地赋值，不做数值运算）。 */
const normalizeDecimalFields = (entity: Record<string, unknown>): void => {
  for (const field of DECIMAL_FIELDS) {
    if (field in entity && entity[field] !== undefined && entity[field] !== null) {
      entity[field] = normalizeDecimalString(entity[field], field);
    }
  }
};

/**
 * 把底层适配器错误归一为 BOM 错误类；不是 BOM 违约时原样上抛。
 * 环错误附加 `unionOnly` 标记（US-509 AC#9：并集环与真环的区分只服务于产品判断）。
 */
const rethrowBomError = async (rxdb: RxDB, cause: unknown, attempted?: Record<string, unknown>): Promise<never> => {
  const normalized = normalizeBomError(cause) ?? cause;
  if (normalized instanceof BomCycleError) {
    const interval = attempted ?
      {
        from: attempted['effectiveFrom'] instanceof Date ? (attempted['effectiveFrom'] as Date).getTime() : null,
        to: attempted['effectiveTo'] instanceof Date ? (attempted['effectiveTo'] as Date).getTime() : null
      }
    : undefined;
    throw await attachUnionOnlyMark(rxdb, normalized, interval);
  }
  throw normalized;
};

export class BomRepository<T extends EntityType = EntityType> extends Repository<T> {
  override async create(entity: InstanceType<T>): Promise<InstanceType<T>> {
    normalizeDecimalFields(entity as unknown as Record<string, unknown>);
    try {
      return await super.create(entity);
    } catch (error) {
      return await rethrowBomError(this.rxdb, error, entity as unknown as Record<string, unknown>);
    }
  }

  override async update(entity: InstanceType<T>, patch: Partial<InstanceType<T>>): Promise<InstanceType<T>> {
    // 规范化只在插件入口：patch 里的十进制字段同样经规范串入存储
    for (const [field, value] of Object.entries(patch)) {
      if ((DECIMAL_FIELDS as readonly string[]).includes(field) && value !== undefined && value !== null) {
        (patch as Record<string, unknown>)[field] = normalizeDecimalString(value, field);
      }
    }
    try {
      return await super.update(entity, patch);
    } catch (error) {
      return await rethrowBomError(this.rxdb, error, entity as unknown as Record<string, unknown>);
    }
  }
}
