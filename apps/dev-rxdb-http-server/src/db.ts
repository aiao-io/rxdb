/**
 * `node:sqlite` 连接与 `recipes` 表。
 *
 * @remarks
 * 零第三方依赖：Node 26 内置 `node:sqlite`，仓库已有先例
 * （`packages/rxdb-adapter-electron/src/sqlite-script.ts` 是 Electron 主进程侧的同款宿主）。
 *
 * 刻意**不开 WAL**：WAL 会额外生成 `-wal` / `-shm` 两个文件，
 * 而 AC#6 要求「`reset` 两遍产物逐字节相同」，多出来的旁路文件让这条断言无从下手。
 * demo 是单进程单连接，WAL 的并发收益在这里等于零。
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** `recipes` 表的一行，字段名与 `http-protocol.md` 的示例逐字一致。 */
export interface RecipeRow {
  id: string;
  title: string;
  status: string;
  price: number;
  tag: string | null;
  updatedAt: string;
}

/** `fetchMetadata` 只回这两列——协议要的就是「只做新鲜度比较」的最小集合。 */
export interface RecipeMetadataRow {
  id: string;
  updatedAt: string;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS recipes (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  status    TEXT NOT NULL,
  price     REAL NOT NULL,
  tag       TEXT,
  updatedAt TEXT NOT NULL
)`;

/**
 * `(updatedAt, id)` 复合索引。
 *
 * @remarks
 * 与所有列表查询的 `ORDER BY updatedAt, id` 同序。协议要求「跨页排序稳定」，
 * 而只按 `updatedAt` 排序时同秒的行顺序未定义——种子数据每行差一小时看不出来，
 * 一旦用户连着新建几行就会在翻页里重复 / 遗漏。`id` 是主键，作为最后一级排序键天然唯一。
 */
const CREATE_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_recipes_order ON recipes (updatedAt, id)`;

/** 建表 + 建索引。幂等，可重复调用。 */
export const createSchema = (db: DatabaseSync): void => {
  db.exec(CREATE_TABLE_SQL);
  db.exec(CREATE_INDEX_SQL);
};

/** 打开（必要时创建）库文件并保证表结构就绪。 */
export const openDatabase = (databasePath: string): DatabaseSync => {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON');
  createSchema(db);
  return db;
};

/**
 * 删掉库文件本身，而不是 `DELETE FROM`。
 *
 * @remarks
 * AC#6 的「两遍逐字节相同」只有删文件才成立：`DELETE FROM` 留下已分配的页与空闲页链，
 * 同样 250 行写进去，文件大小与页布局都会和全新建的那份不同。
 * 顺带清掉 `-wal` / `-shm`：即便当前不开 WAL，本地手工试过 WAL 的库也不该留残片。
 */
export const deleteDatabaseFile = (databasePath: string): void => {
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${databasePath}${suffix}`;
    if (existsSync(target)) rmSync(target);
  }
};
