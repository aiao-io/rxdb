import { openSqliteShell, scriptsOf } from '../fixtures/sqlite-shell.mjs';

/** 系统偏好表的物理表名（命名空间加表名）。 */
export const PREFERENCES = 'desktop$system_preference';
export const SCHEMA_KEY = 'schema:desktop';

/**
 * 构建里的 schema 版本：产物脚本里唯一的、形如 `YYYYMMDDNN` 的十位数字字面量（`DESKTOP_SCHEMA_VERSION`）。
 * e2e 不 import web 的源码（D-02），所以从产物里读（应用按需加载后它不一定在主包里，所以扫全部脚本）；
 * 字面量不唯一说明常量的写法变了，直接报错。
 *
 * @param {string} distRoot web 的构建产物目录
 */
export function schemaVersionOf(distRoot) {
  const pattern = /\b20(?:2[4-9]|3\d)(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{2}\b/g;
  const versions = new Set(scriptsOf(distRoot).flatMap(({ source }) => source.match(pattern) ?? []));
  if (versions.size !== 1)
    throw new Error(`主包里应该恰有一个 schema 版本字面量，找到：${[...versions].join('、') || '没有'}`);
  return Number([...versions][0]);
}

const quote = name => `"${name.replaceAll('"', '""')}"`;

/** 对桌面库的常用读写，包着一个 sqlite 夹具（见 sqlite-shell.mjs）。 */
function databaseOf(shell) {
  const rows = (sql, bindings) => shell.rows(sql, bindings);
  const scalar = async (sql, bindings) => (await rows(sql, bindings))[0]?.[0];
  return {
    shell,
    /** 库里全部表名（按名字排序）。 */
    tables: async () =>
      (await rows(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)).map(row => row[0]),
    /** 表里的行数。 */
    count: table => scalar(`SELECT count(*) FROM ${quote(table)}`),
    /** 删表（连同它的触发器与索引）；表不在（被打断的升级还没来得及补建）时什么也不做。 */
    dropTable: table => shell.execute(`DROP TABLE IF EXISTS ${quote(table)}`),
    /** 版本记录解析后的值；没有这一行时为 undefined；无法解析时返回原文本。 */
    async record() {
      const raw = await scalar(`SELECT "value" FROM ${quote(PREFERENCES)} WHERE "key" = ?`, [SCHEMA_KEY]);
      if (raw === undefined) return undefined;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    },
    /** 改版本记录（这一行必须已存在）。传对象写成 JSON，传字符串原样写入（造无法解析的记录）。 */
    setRecord: value =>
      shell.execute(`UPDATE ${quote(PREFERENCES)} SET "value" = ? WHERE "key" = ?`, [
        typeof value === 'string' ? value : JSON.stringify(value),
        SCHEMA_KEY
      ]),
    /** 删版本记录：库回到此前发布的构建建出来的样子。 */
    deleteRecord: () => shell.execute(`DELETE FROM ${quote(PREFERENCES)} WHERE "key" = ?`, [SCHEMA_KEY]),
    /** 全部种子标记：键 → 原始值文本。 */
    async markers() {
      const found = await rows(
        `SELECT "key", "value" FROM ${quote(PREFERENCES)} WHERE "key" LIKE 'seed:%' ORDER BY "key"`
      );
      return Object.fromEntries(found);
    },
    /** 删某个数据域的种子标记。 */
    deleteMarker: domain => shell.execute(`DELETE FROM ${quote(PREFERENCES)} WHERE "key" = ?`, [`seed:${domain}`]),
    /** 系统偏好表的全部行（键与值），用来比较前后是否被写过。 */
    preferences: () => rows(`SELECT "key", "value" FROM ${quote(PREFERENCES)} ORDER BY "key"`)
  };
}

/**
 * 在桌面页面都关着的时候对库做手术：开夹具、跑 `work(db)`、一定关夹具。
 * 桌面页面开着时也能用（OPFS 的库允许多条连接协作），用来模拟「另一个标签页改了库」。
 *
 * @template T
 * @param {{ context: import('playwright').BrowserContext, origin: string, distRoot: string }} session
 * @param {(db: ReturnType<typeof databaseOf>) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function surgery(session, work) {
  const shell = await openSqliteShell(session.context, { origin: session.origin, distRoot: session.distRoot });
  try {
    return await work(databaseOf(shell));
  } finally {
    await shell.close();
  }
}

/**
 * 一次检查多个表时复用一条连接，不为每个表同时启动、关闭一个 OPFS 工作线程。
 *
 * @param {Parameters<typeof surgery>[0]} session 桌面会话
 * @param {readonly string[]} tables 需要计数的物理表名
 * @returns {Promise<number[]>} 与输入顺序一致的行数
 */
export function tableCounts(session, tables) {
  return surgery(session, async db => {
    const counts = [];
    for (const table of tables) counts.push(await db.count(table));
    return counts;
  });
}
