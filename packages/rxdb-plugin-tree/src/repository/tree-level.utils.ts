import { RxDBError } from '@aiao/rxdb';

/**
 * 校验 {@link FindTreeOptions.level}，返回可安全拼进 SQL 的整数。
 *
 * @param level - 调用方传入的层级；`undefined` 表示未提供
 * @returns 非负整数；未提供时返回 `undefined`，表示**不限深度**
 * @throws {@link RxDBError} 当 `level` 不是非负整数
 *
 * @remarks
 * `level` 是树查询里唯一被**直接字符串插值**进 SQL 的选项（各适配器都不参数化它，
 * 因为它出现在递归 CTE 的比较式里）。因此校验必须在唯一一处收口，
 * 且失败即抛错 —— 不裁剪、不兜默认值：把 `'1; DROP TABLE x --'` 悄悄改成 `0`
 * 只会把注入变成一次静默的错误查询。
 *
 * **不设上界**：不传 `level` 的默认语义就是不限深度（整棵子树 / 整条祖先链），
 * 给显式值设天花板只会让「要 500 层」反而比「什么都不传」拿得少。递归 CTE 的
 * 失控保护由各 SQL 适配器自己的内部常量负责，不是用户可配项。
 *
 * @example
 * ```typescript
 * assertTreeLevel(undefined); // undefined（不限深度）
 * assertTreeLevel(0);         // 0（仅当前节点）
 * assertTreeLevel(3);         // 3
 * assertTreeLevel(-1);        // 抛 RxDBError
 * ```
 */
export const assertTreeLevel = (level: number | undefined): number | undefined => {
  if (level === undefined) return undefined;
  if (!Number.isSafeInteger(level) || level < 0) {
    throw new RxDBError(`tree query 'level' must be a non-negative integer, received: ${String(level)}`);
  }
  return level;
};
