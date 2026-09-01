/**
 * 前后端共用的 Recipe 查询与 wire 序列化。
 *
 * @remarks
 * 这是 A9 的落点：两端各至少一条真实查询路径调用这里**同一份**函数——
 * 前端 `app.ts` 的 `useFind(Recipe, ...)` 与后端 `listMetadataByOffset` 都经
 * {@link buildRecipePageQuery} 拼「稳定排序 + 分页」的查询；后端回执经
 * {@link toRecipeWireRow} / {@link toRecipeMetadataRow} 把实体投影成 wire 形状。
 */

/** wire 上的完整行（id / title / status / price / tag / createdAt / updatedAt）。 */
export interface RecipeWireRow {
  id: string;
  title: string;
  status: string;
  price: number;
  tag: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `fetchMetadata` 只回这两列——协议要的就是「只做新鲜度比较」的最小集合。 */
export interface RecipeMetadataRow {
  id: string;
  updatedAt: string;
}

/**
 * 所有列表查询共用的排序。
 *
 * @remarks
 * `id` 兜底保证同 `updatedAt` 的行有确定顺序（协议「跨页排序稳定」）。
 */
export const RECIPE_ORDER_BY = [
  { field: 'updatedAt', sort: 'asc' },
  { field: 'id', sort: 'asc' }
] as const;

/** 能读出 Recipe 行的最小形状（前端 {@link Recipe} 与后端 {@link ServerRecipe} 都满足）。 */
export interface RecipeRowLike {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly price: number;
  readonly tag: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const toIso = (value: Date): string => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());

/** 实体 → wire 完整行（时间戳定型成 ISO 串，`createdBy` / `updatedBy` 不出现）。 */
export const toRecipeWireRow = (row: RecipeRowLike): RecipeWireRow => ({
  id: row.id,
  title: row.title,
  status: row.status,
  price: row.price,
  tag: row.tag,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt)
});

/** 实体 → metadata 行。 */
export const toRecipeMetadataRow = (row: RecipeRowLike): RecipeMetadataRow => ({
  id: row.id,
  updatedAt: toIso(row.updatedAt)
});

/**
 * 构造一页 Recipe 列表查询（where + 稳定排序 + limit + offset）。
 *
 * @remarks
 * 前端 `useFind` 与后端 `repo.find` 都用它拼查询选项，保证两端「怎么列 Recipe」是同一段代码。
 * `where` 是泛型参数，两端各自传自己的 RuleGroup 形状。
 */
export const buildRecipePageQuery = <W>(where: W, limit: number, offset: number) => ({
  where,
  orderBy: RECIPE_ORDER_BY.map(item => ({ ...item })),
  limit,
  offset
});
