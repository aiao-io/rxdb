/**
 * FTS5 字段描述符
 *
 * @public
 */
export interface FtsField {
  /** 字段列名（同时作为 FTS5 列名） */
  readonly name: string;
  /**
   * 是否为 `StringArrayProperty`：
   * - `true`  → 原表存为 JSON 数组文本，trigger 用 `json_each + group_concat` 子查询展开
   * - `false` → 普通 `TEXT` 列，trigger 直接读 `NEW.<field>` / `OLD.<field>`
   */
  readonly isArray: boolean;
}
