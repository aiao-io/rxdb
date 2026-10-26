/**
 * @packageDocumentation
 * metadata 的 wire 边界：校验并**规范化** `updatedAt`（US-212 AC#14）。
 *
 * @remarks
 * core 的 `diffMetadata` 经 `isRemoteNewer` 把两侧 `updatedAt` 解析成时间点再比较，而本地侧恒是
 * `toISOString()` 的形态。所以偏移量与缺毫秒本身不再改变新鲜度结论，但「是合法 ISO 8601」
 * 仍不够：缺时区标识的串按本机时区解析，同一份响应在不同机器上指向不同时刻，
 * 且**全程没有异常**——查询照常返回，错的只是新鲜度判断。
 *
 * 这一层还负责让 metadata 通道**绕开实体解码**：只透出 `id` 与 `updatedAt` 两个字段，
 * 都保持 `string`。一旦 `updatedAt` 变成 `Date`，就违背了 `QueryCacheEntityMetadata` 的契约。
 *
 * 同一道 `updatedAt` 门禁也挡在整行进本地缓存的两个入口：`create` / `update` 回执与 `findByIds` 行
 * （{@link canonicalizeRowUpdatedAt}）。
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
 * @param subject - 出错时指认是哪一行，例如 `row "a"`
 * @throws HttpInvalidMetadataError 不是字符串、不是带时区的 ISO 8601、或不是真实存在的时刻
 */
const canonicalizeUpdatedAt = (entityName: string, subject: string, updatedAt: unknown): string => {
  if (typeof updatedAt !== 'string') {
    throw new HttpInvalidMetadataError(
      entityName,
      `${subject} has updatedAt of type ${typeof updatedAt}, expected an ISO 8601 string`
    );
  }
  if (!ISO_8601_WITH_ZONE.test(updatedAt)) {
    throw new HttpInvalidMetadataError(
      entityName,
      `${subject} has updatedAt "${updatedAt}", expected ISO 8601 with an explicit time zone`
    );
  }
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpInvalidMetadataError(
      entityName,
      `${subject} has updatedAt "${updatedAt}", which is not a real instant`
    );
  }
  return parsed.toISOString();
};

/**
 * 校验并规范化一整行（`create` / `update` 回执、`findByIds` 行）上的 `updatedAt`。
 *
 * @remarks
 * 这些行由 core 原样写进本地缓存，`updatedAt` 随即成为本地侧的新鲜度基准，所以与 metadata 同一条契约：
 * 带时区才收，收下就归一成 `toISOString()` 同形。放行无时区串，本地存下的就是按本机时区解析的时刻，
 * 下一轮与远端 metadata 比较的结论随机器时区漂移，全程不报错。
 *
 * 不带 `updatedAt` 的行与非对象行原样返回：必填与形状各有出口契约判，这里只管越过 wire 的那个串。
 *
 * @param entityName - 实体名，进错误信息
 * @param source - 行的来源（如 `create receipt`、`findByIds`），进错误信息
 * @param row - handler `parse` 出来的行
 * @returns `updatedAt` 已归一的新对象；无需处理时返回原值，入参不被改写
 * @throws HttpInvalidMetadataError `updatedAt` 不是字符串、不是带时区的 ISO 8601、或不是真实存在的时刻
 */
export const canonicalizeRowUpdatedAt = (entityName: string, source: string, row: unknown): unknown => {
  if (!isRecord(row) || row['updatedAt'] === undefined) return row;
  const subject = `${source} row ${JSON.stringify(row['id'])}`;
  return { ...row, updatedAt: canonicalizeUpdatedAt(entityName, subject, row['updatedAt']) };
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
 * **不得直接透传远端的串**，哪怕它合法：合法与规范是两件事，时区偏移、缺毫秒、
 * `+00:00` 代替 `Z`、多于 3 位小数秒都合法，但 wire 形式统一为与 `toISOString()` 同形。
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
    return { id, updatedAt: canonicalizeUpdatedAt(entityName, `row "${id}"`, row['updatedAt']) };
  });
};
