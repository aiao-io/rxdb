import { quoteLiteral } from '../pglite.utils.js';

/**
 * JSON 路径访问器的结果类型。
 *
 * - `'text'` —— `->>` / `#>>`，结果是 `text`，比较按**字典序**（`'10' > '9'` 为 false）
 * - `'jsonb'` —— `->` / `#>`，结果是 `jsonb`，数值按**数值**比较
 */
export type JsonAccessorKind = 'text' | 'jsonb';

/**
 * 生成 JSON 嵌套路径的取值表达式。
 *
 * 查询路径与 join 路径**共用这一个实现**：两边各写一份是这类缺陷的常见来源
 * —— 此前 `query_sql.get_field_sql` 与 `join_sql.format_json_field` 各有一份，
 * 都无条件返回 text，数值比较因此按字典序（PGL-006）。
 *
 * @param columnSql - 已转义的列表达式（可带表别名前缀）
 * @param path - JSON 路径分段，**调用方须先校验安全性**
 * @param kind - 期望的结果类型
 * @returns 取值表达式；`path` 为空时原样返回 `columnSql`
 */
export const jsonAccessor = (columnSql: string, path: readonly string[], kind: JsonAccessorKind): string => {
  if (path.length === 0) return columnSql;
  if (path.length === 1) {
    return `${columnSql} ${kind === 'jsonb' ? '->' : '->>'} ${quoteLiteral(path[0])}`;
  }
  return `${columnSql} ${kind === 'jsonb' ? '#>' : '#>>'} ${quoteLiteral(`{${path.join(',')}}`)}`;
};

/**
 * 该值是否应当按 jsonb 比较。
 *
 * 只看**比较值的 JS 类型**，不看列里存了什么 —— 这是刻意的：
 * `::numeric` 之类的强制转换会在遇到非数字字符串时抛 22P02（运行期炸），
 * 而 jsonb 比较对异构数据是安全的（jsonb 有全序，数字之间按数值比）。
 */
export const wantsJsonbComparison = (value: unknown): boolean =>
  typeof value === 'number' || typeof value === 'boolean';

/**
 * join 解析出的字段表达式。
 *
 * 同时携带两种形态，因为「用哪一种」取决于**比较值的类型**，
 * 而那要到 `build_rule_pg` 里才知道；只存 text 的话，join 路径上的
 * 数值比较就没有 jsonb 形态可用（PGL-006）。
 *
 * `jsonb` 仅对 JSON 嵌套路径存在；普通列没有这种形态。
 */
export interface FieldAlias {
  readonly text: string;
  readonly jsonb?: string;
}
