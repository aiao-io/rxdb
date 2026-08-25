/**
 * @packageDocumentation
 * metadata 的 wire 边界：校验并**规范化** `updatedAt`（US-212 AC#14）。
 *
 * @remarks
 * core 的 `diffMetadata` 直接 `remote.updatedAt > localUpdatedAt` 比字符串，而本地侧恒是
 * `toISOString()` 的形态。所以「是合法 ISO 8601」不够——形态不同的两侧比字典序会得出与
 * 时间序相反的结论，且**全程没有异常**：查询照常返回，错的只是新鲜度判断。
 *
 * 这一层还负责让 metadata 通道**绕开实体解码**：只透出 `id` 与 `updatedAt` 两个字段，
 * 都保持 `string`。一旦 `updatedAt` 变成 `Date`，与字符串比较会走 number 提示、
 * 字符串那侧转成 `NaN`，比较恒为 `false` —— 所有行判 fresh，远端更新永远拉不下来。
 */

import type { QueryCacheEntityMetadata } from '@aiao/rxdb';
import { HttpInvalidMetadataError } from './errors.js';

/**
 * 带**明确时区标识**的 ISO 8601 date-time。
 *
 * @remarks
 * 秒与小数秒可缺省（后面会补齐），但时区标识不可缺：`2026-08-23T10:00:00` 在 JS 里
 * 按**本地时区**解析，同一份响应在不同机器上会归一成不同的 UTC 值。那是不确定性，
 * 不是不规范，所以这里拒绝而不是猜。
 *
 * 顺带把 `Date.parse` 的宽松形态挡在外面——`'Aug 23, 2026'` 它照收不误，
 * 但那不是本包与远端约定的 wire 形式。
 */
const ISO_8601_WITH_ZONE = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:\d{2})$/;

/** 判定值是可索引的普通对象（`null` 不算） */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * 把一个 `updatedAt` 归一成 `toISOString()` 同形的串。
 *
 * @throws HttpInvalidMetadataError 不是字符串、不是带时区的 ISO 8601、或不是真实存在的时刻
 */
const canonicalizeUpdatedAt = (entityName: string, id: string, updatedAt: unknown): string => {
  if (typeof updatedAt !== 'string') {
    throw new HttpInvalidMetadataError(
      entityName,
      `row "${id}" has updatedAt of type ${typeof updatedAt}, expected an ISO 8601 string`
    );
  }
  if (!ISO_8601_WITH_ZONE.test(updatedAt)) {
    throw new HttpInvalidMetadataError(
      entityName,
      `row "${id}" has updatedAt "${updatedAt}", expected ISO 8601 with an explicit time zone`
    );
  }
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpInvalidMetadataError(
      entityName,
      `row "${id}" has updatedAt "${updatedAt}", which is not a real instant`
    );
  }
  return parsed.toISOString();
};

/** 取出并校验 `id` */
const readId = (entityName: string, row: Record<string, unknown>): string => {
  const { id } = row;
  if (typeof id !== 'string' || id.length === 0) {
    throw new HttpInvalidMetadataError(entityName, `row has id ${JSON.stringify(id)}, expected a non-empty string`);
  }
  return id;
};

/**
 * 校验并规范化 handler 解析出的 metadata 行。
 *
 * @remarks
 * **不得直接透传远端的串**，哪怕它合法：合法与规范是两件事，而破坏字典序的四种形态
 * （时区偏移、缺毫秒、`+00:00` 代替 `Z`、多于 3 位小数秒）全都合法。
 *
 * @param entityName - 实体名，出错时写进错误便于定位
 * @param rows - handler `parse` 出来的行，尚未校验
 * @returns 只含 `id` 与 `updatedAt` 的规范化 metadata
 * @throws HttpInvalidMetadataError 不是数组、行不是对象、缺字段或 `updatedAt` 不合契约
 */
export const canonicalizeMetadata = (entityName: string, rows: unknown[]): QueryCacheEntityMetadata[] => {
  if (!Array.isArray(rows)) {
    throw new HttpInvalidMetadataError(entityName, `expected an array of metadata rows, received ${typeof rows}`);
  }
  return rows.map(row => {
    if (!isRecord(row)) {
      throw new HttpInvalidMetadataError(entityName, `expected a metadata object, received ${JSON.stringify(row)}`);
    }
    const id = readId(entityName, row);
    return { id, updatedAt: canonicalizeUpdatedAt(entityName, id, row['updatedAt']) };
  });
};
