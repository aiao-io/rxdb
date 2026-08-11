import { SearchError } from '../types.js';

/**
 * @packageDocumentation
 * 搜索选项的运行时校验。
 *
 * @remarks
 * `SearchOptions` / `SearchPluginOptions` 上的数值字段都是裸 `number?`，TS 挡不住运行时值 ——
 * 它们常来自 URL 参数、用户配置或已漂移的调用方。`pageSize: -5` 会直接拼进 SQL 的 `LIMIT`，
 * `NaN` 让整条查询静默返回空集，`1.5` 的行为则取决于后端。这类值必须在入口挡掉而不是往下传（SRCH-006）。
 */

/**
 * 断言为正安全整数（用于 `pageSize` / `snippetLength` —— 取 0 无意义）。
 *
 * @param name - 选项名，用于错误信息
 * @param value - 待校验值；`undefined` 表示未设置，直接放行
 * @throws {@link SearchError} 当值不是 ≥ 1 的安全整数时
 */
export const assertPositiveSafeInt = (name: string, value: number | undefined): void => {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new SearchError(`${name} 必须是不小于 1 的安全整数，收到 ${String(value)}`);
  }
};

/**
 * 断言为非负安全整数（用于 `debounce` —— `0` 是合法值，表示关闭防抖）。
 *
 * @param name - 选项名，用于错误信息
 * @param value - 待校验值；`undefined` 表示未设置，直接放行
 * @throws {@link SearchError} 当值不是 ≥ 0 的安全整数时
 */
export const assertNonNegativeSafeInt = (name: string, value: number | undefined): void => {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SearchError(`${name} 必须是非负安全整数，收到 ${String(value)}`);
  }
};

/**
 * 校验一组搜索选项里的全部数值字段。
 *
 * @param source - 出错信息里标明来源（如 `SearchOptions` / `rxDBPluginSearch options`）
 * @param options - 待校验的选项对象
 */
export const assertSearchNumericOptions = (
  source: string,
  options: { debounce?: number; pageSize?: number; snippetLength?: number } | undefined
): void => {
  if (!options) return;
  assertNonNegativeSafeInt(`${source}.debounce`, options.debounce);
  assertPositiveSafeInt(`${source}.pageSize`, options.pageSize);
  assertPositiveSafeInt(`${source}.snippetLength`, options.snippetLength);
};
