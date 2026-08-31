/**
 * FTS 字段描述符。
 *
 * 与 `@aiao/rxdb-adapter-sqlite-core/fts5` 的 `FtsField` 形状完全一致，
 * 便于上层（如 `@aiao/rxdb-plugin-search`）以同一份 schema 元数据驱动两套后端。
 *
 * @public
 */
/**
 * 数组列的**物理**存储形态。
 *
 * 适配器对 `PropertyType.stringArray` 生成的是原生 `text[]`
 * （见 `rxDBColumnTypeToPGliteType`），因此默认值就是 `'text[]'`。
 * 只有调用方自己把列建成 JSONB 时才需要显式指定 `'jsonb'`（PGL-007）。
 *
 * @public
 */
export type FtsArrayKind = 'text[]' | 'jsonb';

/**
 * 数组列的默认物理形态，与适配器的建表映射保持一致。
 *
 * @public
 */
export const DEFAULT_FTS_ARRAY_KIND: FtsArrayKind = 'text[]';

export interface FtsField {
  /** 字段列名（必须与原表列名一致） */
  readonly name: string;
  /**
   * 是否为 `StringArrayProperty`：
   * - `true`  → 数组列，trigger 按 {@link FtsField.arrayKind} 展开成空格分隔文本
   * - `false` → 普通 `TEXT` 列，trigger 直接读 `NEW.<field>`
   */
  readonly isArray: boolean;
  /**
   * 数组列的物理形态，仅在 `isArray === true` 时有意义。
   *
   * 默认 {@link DEFAULT_FTS_ARRAY_KIND}（`'text[]'`）—— 与适配器
   * 对 `PropertyType.stringArray` 的建表映射一致。此前无条件按 JSONB 生成
   * `jsonb_array_elements_text(NEW.<col>)`，在适配器**自己建的表**上是 42883（PGL-007）。
   */
  readonly arrayKind?: FtsArrayKind;
}

/**
 * FTS 表的物理列名（tsvector 类型）。固定加在原表上，避免与业务列冲突。
 *
 * @public
 */
export const FTS_COLUMN = '_fts';

/**
 * FTS 默认 PostgreSQL `regconfig`，决定 tokenizer / stopwords / stemmer。
 *
 * `simple` 不做 stemming，对多语言混合内容最安全；如需中文/英文专门处理，
 * 在调用方覆盖（`buildCreateFtsTableSql(..., { regconfig: 'english' })`）。
 *
 * @public
 */
export const DEFAULT_FTS_REGCONFIG = 'simple';

/**
 * FTS DDL 生成选项。
 *
 * @public
 */
export interface FtsOptions {
  /**
   * PostgreSQL `regconfig`（决定 `to_tsvector` 的语言行为）。
   * 默认 {@link DEFAULT_FTS_REGCONFIG}。
   */
  readonly regconfig?: string;
  /**
   * 目标表所在的 schema（= 实体的 `namespace`）。
   *
   * @remarks
   * 适配器把实体建成 `"<namespace>"."<table>"`（见 `getTableNameByMetadata`），
   * 因此 namespace 不是 `public` 时**必须**传：省略则表引用不带限定，由 `search_path`
   * 解析——轻则 42P01「表不存在」，重则把 DDL 打到 public 里另一张同名表上。
   *
   * 省略是合法的，语义就是「按 `search_path` 解析」，适用于调用方自建、且确实在
   * 默认搜索路径上的表。
   */
  readonly schema?: string;
}
