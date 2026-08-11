import { RxDBError } from '../RxDBError.js';

/**
 * 树查询允许的最大层级深度。
 *
 * @remarks
 * 递归 CTE 没有天然的终止条件，层级上限既是防御失控递归的闸门，
 * 也是 {@link FindTreeOptions.level} 文档里承诺的 `Maximum: 100`。
 */
export const TREE_MAX_LEVEL = 100;

/**
 * 校验 {@link FindTreeOptions.level}，返回可安全拼进 SQL 的整数。
 *
 * @param level - 调用方传入的层级；`undefined` 表示未提供
 * @returns 0 到 {@link TREE_MAX_LEVEL} 之间的整数；未提供时返回契约默认值 `0`（仅当前节点）
 * @throws {@link RxDBError} 当 `level` 不是 0..{@link TREE_MAX_LEVEL} 的整数
 *
 * @remarks
 * `level` 是树查询里唯一被**直接字符串插值**进 SQL 的选项（各适配器都不参数化它，
 * 因为它出现在递归 CTE 的比较式里）。因此校验必须在唯一一处收口，
 * 且失败即抛错 —— 不裁剪、不兜默认值：把 `'1; DROP TABLE x --'` 悄悄改成 `0`
 * 只会把注入变成一次静默的错误查询。
 *
 * 与 `TreeRepository` 的分层关系：Repository 层按 {@link FindTreeOptions.level}
 * 的 `@remarks` 对**数字**做裁剪（`< 0 → 0`、`> 100 → 100`），裁剪之后再走本函数；
 * 非数字裁剪不掉，会在这里被拦下。绕过 Repository 直接调用适配器时没有裁剪层，
 * 越界值同样抛错。
 *
 * @example
 * ```typescript
 * assertTreeLevel(undefined); // 0
 * assertTreeLevel(3);         // 3
 * assertTreeLevel(101);       // 抛 RxDBError
 * ```
 */
export const assertTreeLevel = (level: number | undefined): number => {
  if (level === undefined) return 0;
  if (!Number.isInteger(level) || level < 0 || level > TREE_MAX_LEVEL) {
    throw new RxDBError(
      `tree query 'level' must be an integer between 0 and ${TREE_MAX_LEVEL}, received: ${String(level)}`
    );
  }
  return level;
};
