/**
 * @fileoverview BOM 仓储门面
 *
 * 十进制值合同的**入口规范化**只发生在这里：`qty` 等十进制字段写前规范成规范串
 * （接受指数写法、前导零、尾随零），存储层不替调用方规范化。违约（CHECK / 排他 /
 * BOM 触发器消息）归一为类型化错误类再上抛。
 */

import type { EntityType, RxDB } from '@aiao/rxdb';
import { Repository } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { normalizeDecimalString } from './decimal.utils.js';
import { BomAttrDef, BomLineOccurrence } from './entities.js';
import { attachUnionOnlyMark } from './resolve/cycle-analysis.js';
import { validateExtWrite, type ExtAttrDefShape, type ExtWriteMode } from './resolve/ext-attr.js';
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

/** 实体类型 → ext 作用域（US-519 写入期按 attr_def 校验的入口）。 */
const EXT_APPLIES_TO: Record<string, 'item' | 'bom_header' | 'bom_line_occurrence'> = {
  BomItem: 'item',
  BomHeader: 'bom_header',
  BomLineOccurrence: 'bom_line_occurrence'
};

/** 读取 appliesTo 的 attr_def 声明并校验 ext（缺声明 = 无约束）。 */
const validateExtByDefs = async (
  rxdb: RxDB,
  appliesTo: 'item' | 'bom_header' | 'bom_line_occurrence',
  ext: Record<string, unknown>,
  mode: ExtWriteMode
): Promise<void> => {
  void rxdb;
  const defs = await firstValueFrom(
    BomAttrDef.find({
      where: { combinator: 'and', rules: [{ field: 'appliesTo', operator: '=', value: appliesTo }] }
    })
  ).catch(() => [] as BomAttrDef[]);
  if (defs.length === 0) return;
  const shapes: ExtAttrDefShape[] = defs.map(def => ({
    code: def.code,
    dataType: def.dataType,
    required: def.required,
    enumValues: def.enumValues === null ? null : (JSON.parse(def.enumValues) as string[]),
    appliesTo: def.appliesTo
  }));
  validateExtWrite(shapes, appliesTo, ext, mode);
};

const rethrowBomError = async (rxdb: RxDB, cause: unknown, attempted?: Record<string, unknown>): Promise<never> => {
  const normalized = normalizeBomError(cause) ?? cause;
  if (normalized instanceof BomCycleError) {
    const interval =
      attempted ?
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
    const appliesTo = EXT_APPLIES_TO[entity.constructor.name];
    const ext = (entity as unknown as Record<string, unknown>)['ext'];
    if (appliesTo !== undefined && ext !== undefined && ext !== null) {
      await validateExtByDefs(this.rxdb, appliesTo, JSON.parse(String(ext)) as Record<string, unknown>, 'create');
    }
    try {
      return await super.create(entity);
    } catch (error) {
      return await rethrowBomError(this.rxdb, error, entity as unknown as Record<string, unknown>);
    }
  }

  override async remove(entity: InstanceType<T>): Promise<InstanceType<T>> {
    // 位号应用层级联：PGlite 0.5.8 的 DEFERRABLE FK CASCADE 不生效（探针：FK confdeltype 'c'
    // 但删父行后子行仍在），行级触发器内 DML 同样不触发——两后端一致走应用层先删位号
    if ((entity as unknown as Record<string, unknown>) instanceof BomLineOccurrence) {
      const table =
        this.rxdb.localAdapterSync?.name === 'pglite' ? '"bom"."bom_line_designator"' : '"bom$bom_line_designator"';
      await this.rawQuery(`DELETE FROM ${table} WHERE "occurrenceId" = '${entity.id}'`);
    }
    try {
      return await super.remove(entity);
    } catch (error) {
      return await rethrowBomError(this.rxdb, error);
    }
  }

  override async update(entity: InstanceType<T>, patch: Partial<InstanceType<T>>): Promise<InstanceType<T>> {
    // 扩展属性（US-519）：触碰 ext 即按 attr_def 完整校验（局部更新的其余列不强制必填）
    const appliesTo = EXT_APPLIES_TO[entity.constructor.name];
    const patchRecord = patch as unknown as Record<string, unknown>;
    if (appliesTo !== undefined && patchRecord['ext'] !== undefined && patchRecord['ext'] !== null) {
      await validateExtByDefs(this.rxdb, appliesTo, JSON.parse(String(patchRecord['ext'])) as Record<string, unknown>, 'update-complete');
    }
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
