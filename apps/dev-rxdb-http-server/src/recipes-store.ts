/**
 * `recipes` 资源的七个协议操作对应的 SQL。
 *
 * @remarks
 * 每个导出函数对应 `http-protocol.md` 的一节。这里**没有**抽象出 Store 接口——
 * 故事的 Out of Scope 写明了：为「将来可能换 PostgreSQL」预留一层间接，
 * 只会让读者多翻一次文件才看到真正执行的那条 SQL。方言集中在
 * `rule-group-to-sql.ts`，换库时重写那一个文件即可。
 */

import type { DatabaseSync } from 'node:sqlite';

import { RECIPE_COLUMNS, RECIPE_WRITABLE_COLUMNS } from './config.ts';
import type { RecipeMetadataRow, RecipeRow } from './db.ts';
import { HttpError, newRowId, nowIso } from './http-utils.ts';
import type { RowCursor } from './page-token.ts';
import { decodePageToken, encodePageToken, reachedWatermark } from './page-token.ts';
import type { SqlParam } from './rule-group-to-sql.ts';
import { compileRuleGroup } from './rule-group-to-sql.ts';

/** 所有列表查询共用的排序。`id` 兜底保证同 `updatedAt` 的行有确定顺序（协议「跨页排序稳定」）。 */
const ORDER_BY = 'ORDER BY updatedAt, id';

/** token 形态的一页。offset 形态直接返回数组，不走这个类型。 */
export interface TokenPage {
  rows: RecipeMetadataRow[];
  nextPageToken?: string;
}

const asMetadataRows = (rows: unknown[]): RecipeMetadataRow[] => rows as RecipeMetadataRow[];

const asRecipeRows = (rows: unknown[]): RecipeRow[] => rows as RecipeRow[];

/**
 * offset 形态的 `fetchMetadata`。
 *
 * @remarks
 * 严格按 `limit` 取：**不得**因为任何服务端理由提前返回短页。协议把「短页」
 * 定义成末页的唯一信号，提前短页 = 客户端静默丢掉后半段结果。
 */
export const listMetadataByOffset = (
  db: DatabaseSync,
  where: unknown,
  limit: number,
  offset: number
): RecipeMetadataRow[] => {
  const filter = compileRuleGroup(where, RECIPE_COLUMNS);
  const sql = `SELECT id, updatedAt FROM recipes WHERE ${filter.sql} ${ORDER_BY} LIMIT ? OFFSET ?`;
  return asMetadataRows(db.prepare(sql).all(...filter.params, limit, offset));
};

/** 取当前过滤集合内的最大坐标，作为一次 token 翻页的读取水位线。 */
const readWatermark = (db: DatabaseSync, filterSql: string, params: SqlParam[]): RowCursor | undefined => {
  const sql = `SELECT updatedAt, id FROM recipes WHERE ${filterSql} ORDER BY updatedAt DESC, id DESC LIMIT 1`;
  const row = db.prepare(sql).get(...params) as RowCursor | undefined;
  return row;
};

/**
 * token 形态的 `fetchMetadata`（AC#15）。
 *
 * @remarks
 * 首页现取水位线并写进 token，后续每页都带着它回来，于是整次翻页锁定在同一份快照上：
 *
 * - `(updatedAt, id) > (afterUpdatedAt, afterId)` —— keyset 游标，前面插行不会整体移位；
 * - `(updatedAt, id) <= (watermarkUpdatedAt, watermarkId)` —— 上界，翻页途中新写入的行被挡在快照外。
 *
 * 末页判定用「末行 == 水位线」而不是「短页」：正好整除时最后一整页也是满的，
 * 靠短页判定就得再发一次空页，而协议明确说连续空页会让客户端抛错。
 */
export const listMetadataByToken = (db: DatabaseSync, where: unknown, limit: number, pageToken: unknown): TokenPage => {
  const filter = compileRuleGroup(where, RECIPE_COLUMNS);
  const cursor = pageToken === undefined || pageToken === null ? undefined : decodePageToken(pageToken);
  const watermark = cursor?.watermark ?? readWatermark(db, filter.sql, filter.params);

  // 空集合：没有水位线可言，回一页空数组且不带 token（末页）。
  if (watermark === undefined) return { rows: [] };

  const bounds: SqlParam[] = cursor === undefined ? [] : [cursor.after.updatedAt, cursor.after.id];
  const lowerBound = cursor === undefined ? '' : 'AND (updatedAt, id) > (?, ?)';
  const sql = `SELECT id, updatedAt FROM recipes
    WHERE ${filter.sql} ${lowerBound} AND (updatedAt, id) <= (?, ?)
    ${ORDER_BY} LIMIT ?`;
  const rows = asMetadataRows(
    db.prepare(sql).all(...filter.params, ...bounds, watermark.updatedAt, watermark.id, limit)
  );

  const lastRow = rows.at(-1);
  if (lastRow === undefined || reachedWatermark(lastRow, watermark)) return { rows };
  return { rows, nextPageToken: encodePageToken({ after: lastRow, watermark }) };
};

/**
 * `findByIds`。
 *
 * @remarks
 * 缺失的 id 就是缺失——返回比请求少的行，**不**补空对象、**不**回 500。
 * 协议专门为这条留了一段 note：QueryCache 靠「远端没回这一行」判定孤儿。
 */
export const findByIds = (db: DatabaseSync, ids: unknown): RecipeRow[] => {
  const list = readIdList(ids);
  if (list.length === 0) return [];

  const placeholders = list.map(() => '?').join(', ');
  const sql = `SELECT ${RECIPE_COLUMNS.join(', ')} FROM recipes WHERE id IN (${placeholders}) ${ORDER_BY}`;
  return asRecipeRows(db.prepare(sql).all(...list));
};

/** 按 id 回读一整行。`create` / `update` 的回执一律走这里——回执必须来自库，不是入参。 */
const readRow = (db: DatabaseSync, id: string): RecipeRow | undefined => {
  const sql = `SELECT ${RECIPE_COLUMNS.join(', ')} FROM recipes WHERE id = ?`;
  return db.prepare(sql).get(id) as RecipeRow | undefined;
};

/**
 * 取新行的 id：客户端给了就用它的，没给才现造一个。
 *
 * @remarks
 * 「采纳」而不是「回显」——给的 id 会真的落库，回执再从库里读出来。
 * 两者的差别就是本地缓存里那条行远端认不认识。
 */
const readNewRowId = (body: Record<string, unknown>): string => {
  const supplied = body['id'];
  if (supplied === undefined || supplied === null) return newRowId();
  return readString(supplied, 'id');
};

/**
 * `create`。
 *
 * @remarks
 * `id` **采纳**客户端给的那个，缺省才走 `crypto.randomUUID()`；`createdAt` / `updatedAt`
 * 一律取服务端当前时刻，**不看**入参。两者归属不同：时间戳是新鲜度依据，客户端的钟
 * 不可信；`id` 只是身份，而离线新建时只有客户端造得出来——那一刻行已经进了本地缓存、
 * 被 UI 引用、也记在出站队列里。后端另造一个，本地那份就成了远端从不认识的孤儿行。
 *
 * 写完立刻回读整行返回，回执与库里那份必然一致。
 *
 * 新建行的 `createdAt === updatedAt`：它还没被改过，这是诚实的取值，
 * 也让「`update` 只动 `updatedAt`」这件事在回执上一眼可见。
 *
 * @throws HttpError 409，若 `id` 已存在。静默覆盖会抹掉另一条行，而客户端不会知道
 *   自己覆盖了谁；重放侧则要靠这个状态码看见冲突。
 */
export const createRecipe = (db: DatabaseSync, input: unknown): RecipeRow => {
  const body = readObject(input, 'create');
  const now = nowIso();
  const row: RecipeRow = {
    id: readNewRowId(body),
    title: readString(body['title'] ?? '', 'title'),
    status: readString(body['status'] ?? 'draft', 'status'),
    price: readNumber(body['price'] ?? 0, 'price'),
    tag: readNullableString(body['tag'] ?? null, 'tag'),
    createdAt: now,
    updatedAt: now
  };

  if (readRow(db, row.id) !== undefined) throw new HttpError(409, `Recipe '${row.id}' already exists`);

  db.prepare(
    `INSERT INTO recipes (id, title, status, price, tag, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(row.id, row.title, row.status, row.price, row.tag, row.createdAt, row.updatedAt);

  const persisted = readRow(db, row.id);
  if (persisted === undefined) throw new HttpError(500, 'Row disappeared right after insert');
  return persisted;
};

/**
 * `update`。
 *
 * @remarks
 * 只改请求体里出现过的列；`id` / `createdAt` / `updatedAt` 即使出现在请求体里也一律忽略
 * （它们不在 {@link RECIPE_WRITABLE_COLUMNS} 里）。`updatedAt` 由服务端重新定型——
 * 它是新鲜度依据，让客户端来写就没有意义了；`createdAt` 则从此不再变动。
 */
export const updateRecipe = (db: DatabaseSync, id: string, patch: unknown): RecipeRow => {
  const body = readObject(patch, 'update');
  if (readRow(db, id) === undefined) throw new HttpError(404, `Recipe '${id}' not found`);

  const assignments: string[] = [];
  const params: SqlParam[] = [];
  for (const column of RECIPE_WRITABLE_COLUMNS) {
    if (!Object.hasOwn(body, column)) continue;
    assignments.push(`${column} = ?`);
    params.push(readWritableValue(column, body[column]));
  }

  assignments.push('updatedAt = ?');
  params.push(nowIso());
  db.prepare(`UPDATE recipes SET ${assignments.join(', ')} WHERE id = ?`).run(...params, id);

  const persisted = readRow(db, id);
  if (persisted === undefined) throw new HttpError(500, 'Row disappeared right after update');
  return persisted;
};

/** `delete`。响应体客户端会丢弃，这里仍回条数——curl 手测时能看见结果。 */
export const deleteRecipes = (db: DatabaseSync, ids: unknown): number => {
  const list = readIdList(ids);
  if (list.length === 0) return 0;

  const placeholders = list.map(() => '?').join(', ');
  const result = db.prepare(`DELETE FROM recipes WHERE id IN (${placeholders})`).run(...list);
  return Number(result.changes);
};

/**
 * 清空整张表，**保留表结构**。供 `__control/clear` 用。
 *
 * @remarks
 * 与 `resetDatabase()`（`seed.ts`）的区别不是快慢，是**留下什么**：
 * 后者删库文件重建，为的是 AC#6 的「跑两遍逐字节相同」；这里必须让表活着，
 * `HEAD :entity` 才继续回 200——客户端于是看到「这张表存在，只是一行都不匹配」，
 * 而不是「这个实体在远端根本没有」。QueryCache 的孤儿清理要的正是前一种。
 *
 * @returns 删掉的行数。已经空了就是 0，重复调用不报错。
 */
export const deleteAllRecipes = (db: DatabaseSync): number => Number(db.prepare(`DELETE FROM recipes`).run().changes);

/** 表是否存在，供 `HEAD :entity` 用。 */
export const recipesTableExists = (db: DatabaseSync): boolean => {
  const sql = `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recipes'`;
  return db.prepare(sql).get() !== undefined;
};

const readObject = (value: unknown, operation: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, `Request body for '${operation}' must be a JSON object`);
  }
  return value as Record<string, unknown>;
};

const readIdList = (value: unknown): string[] => {
  const ids = readObject(value, 'ids')['ids'];
  if (!Array.isArray(ids)) throw new HttpError(400, `Request body must contain an 'ids' array`);
  if (ids.some(id => typeof id !== 'string')) throw new HttpError(400, `Every entry in 'ids' must be a string`);
  return ids as string[];
};

const readString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value === '')
    throw new HttpError(400, `Field '${field}' must be a non-empty string`);
  return value;
};

const readNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpError(400, `Field '${field}' must be a finite number`);
  }
  return value;
};

const readNullableString = (value: unknown, field: string): string | null => {
  if (value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, `Field '${field}' must be a string or null`);
  return value;
};

const readWritableValue = (column: (typeof RECIPE_WRITABLE_COLUMNS)[number], value: unknown): SqlParam => {
  if (column === 'price') return readNumber(value, column);
  if (column === 'tag') return readNullableString(value, column);
  return readString(value, column);
};
