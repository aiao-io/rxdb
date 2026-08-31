/**
 * 七个协议端点对应的 RxDB 仓储操作。
 *
 * @remarks
 * 阶段 A 的 A3：把 `recipes-store.ts` 的手写 SQL 换成 `Repository` / `EntityManager`。
 * `where` 的翻译职责回引擎（D6）——引擎的 `resolve_column_name` 会拒绝未知字段、
 * 生成的 SQL 全程参数化，白名单校验不再需要本文件自己写一遍 SQL 方言。
 *
 * wire 上的 `where` 是 JSON，`value` 一律是标量（`updatedAt` 也是 ISO 字符串而非 `Date`），
 * 因此本文件用默认的 {@link RuleGroup}（`EntityData`，允许 `value: unknown`）承载，
 * 只在传给 `repo.find` 的边界把它收窄成 {@link RuleGroup}<ServerRecipe>。
 */

import { firstValueFrom } from 'rxjs';
import { RxDBError } from '@aiao/rxdb';
import type { Repository, RuleGroup } from '@aiao/rxdb';
import { RxdbAdapterPGliteError } from '@aiao/rxdb-adapter-pglite';
import {
  RECIPE_ORDER_BY,
  ServerRecipe,
  buildRecipePageQuery,
  toRecipeMetadataRow,
  toRecipeWireRow
} from '@modules/recipes-domain';
import type { RecipeMetadataRow, RecipeWireRow } from '@modules/recipes-domain';

import { HttpError } from './http-utils.ts';
import type { RowCursor } from './page-token.ts';
import { decodePageToken, encodePageToken, reachedWatermark } from './page-token.ts';
import type { RxdbRecipeStore } from './rxdb-store.ts';

/** token 形态的一页。offset 形态直接返回数组，不走这个类型。 */
export interface TokenPage {
  rows: RecipeMetadataRow[];
  nextPageToken?: string;
}

/** ServerRecipe 的仓储类型。 */
type ServerRecipeRepository = Repository<typeof ServerRecipe>;

/** 引擎 `find` 吃的是类型化 RuleGroup；wire 的 `where` 在边界收窄进来。 */
type TypedWhere = RuleGroup<ServerRecipe>;

/** 无过滤的空 where（引擎的 `find` 要求 `where` 非空）。 */
const EMPTY_WHERE: RuleGroup = { combinator: 'and', rules: [] };

/** 把客户端 `where` 归一成默认 RuleGroup；缺省 / `null` 视为无过滤。 */
const normalizeWhere = (where: unknown): RuleGroup =>
  (where === undefined || where === null ? EMPTY_WHERE : where) as RuleGroup;

/**
 * 把引擎抛出的错误映射成 wire 语义：
 * - PG 唯一约束冲突（重复 id）→ 409；
 * - 查询层错误（未知字段 / 非法算子 / 非法规则）→ 400；
 * - 其余原样上抛（兜底 500）。
 */
const mapEngineError = (error: unknown, fallbackMessage: string): HttpError => {
  if (error instanceof HttpError) return error;
  const code = (error as { code?: unknown }).code;
  const message = error instanceof Error ? error.message : fallbackMessage;
  if (code === '23505') return new HttpError(409, message);
  if (error instanceof RxdbAdapterPGliteError) return new HttpError(400, message);
  return new HttpError(500, message);
};

/**
 * offset 形态的 `fetchMetadata`。
 *
 * @remarks
 * 严格按 `limit` 取，**不得**提前短页：协议把「短页」定义成末页的唯一信号。
 */
export const listMetadataByOffset = async (
  store: RxdbRecipeStore,
  where: unknown,
  limit: number,
  offset: number
): Promise<RecipeMetadataRow[]> => {
  try {
    const filter = normalizeWhere(where);
    const rows = await firstValueFrom(
      store.repo.find({ ...buildRecipePageQuery(filter, limit, offset), where: filter as TypedWhere })
    );
    return rows.map(toRecipeMetadataRow);
  } catch (error) {
    throw mapEngineError(error, 'metadata query failed');
  }
};

/** 取当前过滤集合内的最大坐标，作为一次 token 翻页的读取水位线。 */
const readWatermark = async (repo: ServerRecipeRepository, where: RuleGroup): Promise<RowCursor | undefined> => {
  const rows = await firstValueFrom(
    repo.find({
      where: where as TypedWhere,
      orderBy: [
        { field: 'updatedAt', sort: 'desc' },
        { field: 'id', sort: 'desc' }
      ],
      limit: 1
    })
  );
  const last = rows[0];
  return last === undefined ? undefined : toRecipeMetadataRow(last);
};

/** keyset 下界：`(updatedAt, id) > (after.updatedAt, after.id)`。 */
const keysetLowerBound = (after: RowCursor): RuleGroup => ({
  combinator: 'or',
  rules: [
    { field: 'updatedAt', operator: '>', value: after.updatedAt },
    {
      combinator: 'and',
      rules: [
        { field: 'updatedAt', operator: '=', value: after.updatedAt },
        { field: 'id', operator: '>', value: after.id }
      ]
    }
  ]
});

/** 快照上界：`(updatedAt, id) <= (watermark.updatedAt, watermark.id)`。 */
const keysetUpperBound = (watermark: RowCursor): RuleGroup => ({
  combinator: 'or',
  rules: [
    { field: 'updatedAt', operator: '<', value: watermark.updatedAt },
    {
      combinator: 'and',
      rules: [
        { field: 'updatedAt', operator: '=', value: watermark.updatedAt },
        { field: 'id', operator: '<=', value: watermark.id }
      ]
    }
  ]
});

/** 把客户端 where 与若干 keyset 边界 AND 起来；空组直接省掉。 */
const combineWhere = (where: RuleGroup, bounds: RuleGroup[]): RuleGroup => {
  const groups = [where, ...bounds].filter(group => group.rules.length > 0);
  if (groups.length === 0) return EMPTY_WHERE;
  if (groups.length === 1) return groups[0];
  return { combinator: 'and', rules: groups };
};

/**
 * token 形态的 `fetchMetadata`（AC#15）。
 *
 * @remarks
 * keyset 游标 + 读取水位线语义原样保留（D5）：`(updatedAt, id)` 严格大于上页末行、
 * 不超过首页水位线，翻页途中新写入的行被挡在快照外；末页用「末行 == 水位线」判定，
 * 而不是短页判定（整除时最后一整页也是满的）。
 */
export const listMetadataByToken = async (
  store: RxdbRecipeStore,
  where: unknown,
  limit: number,
  pageToken: unknown
): Promise<TokenPage> => {
  try {
    const filter = normalizeWhere(where);
    const cursor = pageToken === undefined || pageToken === null ? undefined : decodePageToken(pageToken);
    const watermark = cursor?.watermark ?? (await readWatermark(store.repo, filter));

    // 空集合：没有水位线可言，回一页空数组且不带 token（末页）。
    if (watermark === undefined) return { rows: [] };

    const bounds = cursor === undefined ? [keysetUpperBound(watermark)] : [keysetLowerBound(cursor.after), keysetUpperBound(watermark)];
    const combined = combineWhere(filter, bounds);

    const rows = await firstValueFrom(
      store.repo.find({ where: combined as TypedWhere, orderBy: [...RECIPE_ORDER_BY], limit })
    );
    const metadataRows = rows.map(toRecipeMetadataRow);

    const lastRow = metadataRows.at(-1);
    if (lastRow === undefined || reachedWatermark(lastRow, watermark)) return { rows: metadataRows };
    return { rows: metadataRows, nextPageToken: encodePageToken({ after: lastRow, watermark }) };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && error.name === 'PageTokenError') throw error;
    throw mapEngineError(error, 'token metadata query failed');
  }
};

/**
 * `findByIds`。
 *
 * @remarks
 * 缺失的 id 就是缺失——返回比请求少的行，不补空对象、不回 500。
 */
export const findByIds = async (store: RxdbRecipeStore, ids: unknown): Promise<RecipeWireRow[]> => {
  const list = readIdList(ids);
  if (list.length === 0) return [];
  try {
    const rows = await firstValueFrom(
      store.repo.find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: 'in', value: list }] },
        orderBy: [...RECIPE_ORDER_BY]
      })
    );
    return rows.map(toRecipeWireRow);
  } catch (error) {
    throw mapEngineError(error, 'by-ids query failed');
  }
};

/**
 * `create`。
 *
 * @remarks
 * `id` 采纳客户端给的（缺省才由引擎 `uuid()` 默认值生成）；时间戳由引擎盖章，不看入参。
 * 回执来自库（`RETURNING *` 落盘后的实体），不是入参回声。已存在 → 409。
 */
export const createRecipe = async (store: RxdbRecipeStore, input: unknown): Promise<RecipeWireRow> => {
  const body = readObject(input, 'create');
  const suppliedId = body['id'];
  const data: Record<string, unknown> = {
    title: readString(body['title'] ?? '', 'title'),
    status: readString(body['status'] ?? 'draft', 'status'),
    price: readNumber(body['price'] ?? 0, 'price'),
    tag: readNullableString(body['tag'] ?? null, 'tag')
  };
  if (suppliedId !== undefined && suppliedId !== null) data['id'] = readString(suppliedId, 'id');

  try {
    const created = await store.rxdb.entityManager.create(store.rxdb.entityManager.instantiate(ServerRecipe, data));
    return toRecipeWireRow(created);
  } catch (error) {
    throw mapEngineError(error, 'create failed');
  }
};

/**
 * `update`。
 *
 * @remarks
 * 只改请求体里出现过的业务列（title/status/price/tag）；`id` / `createdAt` / `updatedAt`
 * 即使出现在请求体也一律忽略。`updatedAt` 由引擎重新定型，`createdAt` 不再变动。
 * 不存在 → 404。
 */
export const updateRecipe = async (store: RxdbRecipeStore, id: string, patch: unknown): Promise<RecipeWireRow> => {
  const body = readObject(patch, 'update');

  let entity: ServerRecipe;
  try {
    entity = await firstValueFrom(
      store.repo.findOneOrFail({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] } })
    );
  } catch (error) {
    if (error instanceof RxDBError && error.message.startsWith('Entity not found')) {
      throw new HttpError(404, `Recipe '${id}' not found`);
    }
    throw mapEngineError(error, 'update lookup failed');
  }

  const writable = readWritablePatch(body);
  Object.assign(entity, writable);

  try {
    const updated = await store.rxdb.entityManager.update(entity);
    return toRecipeWireRow(updated);
  } catch (error) {
    throw mapEngineError(error, 'update failed');
  }
};

/** `delete`。响应体客户端会丢弃，这里仍回条数——curl 手测时能看见结果。 */
export const deleteRecipes = async (store: RxdbRecipeStore, ids: unknown): Promise<number> => {
  const list = readIdList(ids);
  if (list.length === 0) return 0;
  try {
    const rows = await firstValueFrom(
      store.repo.find({ where: { combinator: 'and', rules: [{ field: 'id', operator: 'in', value: list }] } })
    );
    if (rows.length > 0) await store.rxdb.entityManager.removeMany(rows);
    return rows.length;
  } catch (error) {
    throw mapEngineError(error, 'delete failed');
  }
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
  if (typeof value !== 'string' || value === '') throw new HttpError(400, `Field '${field}' must be a non-empty string`);
  return value;
};

const readNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new HttpError(400, `Field '${field}' must be a finite number`);
  return value;
};

const readNullableString = (value: unknown, field: string): string | null => {
  if (value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, `Field '${field}' must be a string or null`);
  return value;
};

/** 只取客户端可改的业务列（title/status/price/tag），`id` / 时间戳一律不收。 */
const readWritablePatch = (body: Record<string, unknown>): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};
  for (const field of ['title', 'status', 'price', 'tag'] as const) {
    if (!Object.hasOwn(body, field)) continue;
    patch[field] =
      field === 'price' ? readNumber(body[field], field)
      : field === 'tag' ? readNullableString(body[field], field)
      : readString(body[field], field);
  }
  return patch;
};
