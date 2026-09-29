/**
 * host 查询应答到 PGlite `Results` 的还原，普通会话与恢复校验共用。
 *
 * @module pglite/desktop-pglite-results
 */

import type { DesktopPgliteQueryResult } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import type { Results } from '@electric-sql/pglite';

/**
 * 把 host 的应答还原成 PGlite 的 `Results`。
 *
 * @remarks
 * `rows` 里的值已经是 PG 的原生 JS 表示（bigint / `Uint8Array` / `Date` / 普通对象），
 * 结构化克隆逐值搬过来，这里不做任何再解析——多一层转换就多一处能悄悄丢精度的地方。
 *
 * @param result - 已通过协议校验的查询结果
 * @returns 与浏览器路径同形状的结果
 */
export const toDesktopPGliteResults = <T>(result: DesktopPgliteQueryResult): Results<T> => ({
  rows: result.rows as unknown as T[],
  fields: result.fields.map(field => ({ name: field.name, dataTypeID: field.dataTypeID })),
  affectedRows: result.affectedRows
});
