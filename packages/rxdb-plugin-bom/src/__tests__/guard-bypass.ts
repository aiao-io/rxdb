/**
 * @fileoverview 绕过存储层守卫的直写（只供测试构造守卫上线前写入的存量行）
 *
 * 守卫上线后经正常写入造不出违约行，引擎侧对存量违约值的防线只能这样覆盖：PG 暂停表上全部用户触发器、
 * 直写后恢复；SQLite 没有停用开关，删掉表上全部触发器、直写后按原文与原序重建。
 */

import type { BomTestAdapter } from './test-utils.js';

/**
 * 暂停一张 BOM 表的全部触发器执行一条直连写入，再原样恢复。
 *
 * @param adapter - 测试适配器（wa-sqlite / pglite）
 * @param tableName - BOM 表名（不带命名空间，如 `item`）
 * @param sql - 直连写入语句（表引用由调用方按后端给出）
 */
export const writeBypassingGuards = async (adapter: BomTestAdapter, tableName: string, sql: string): Promise<void> => {
  if (adapter.name !== 'wa-sqlite') {
    await adapter.rawQuery(`ALTER TABLE "bom"."${tableName}" DISABLE TRIGGER USER`);
    try {
      await adapter.rawQuery(sql);
    } finally {
      await adapter.rawQuery(`ALTER TABLE "bom"."${tableName}" ENABLE TRIGGER USER`);
    }
    return;
  }
  const { rows: triggers } = await adapter.rawQuery(
    `SELECT "name", "sql" FROM "sqlite_master" WHERE "type" = 'trigger' AND "tbl_name" = 'bom$${tableName}' ORDER BY "rowid"`
  );
  for (const [name] of triggers) await adapter.rawQuery(`DROP TRIGGER "${String(name)}"`);
  try {
    await adapter.rawQuery(sql);
  } finally {
    for (const [, definition] of triggers) await adapter.rawQuery(String(definition));
  }
};
