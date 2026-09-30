import { RxDBError } from '../RxDBError.js';

/**
 * 校验可选的非负安全整数，不赋予缺省值任何领域语义。
 *
 * @param value - 待校验的值
 * @param errorMessage - 校验失败时使用的错误信息
 * @returns 原值，包括 `undefined`
 * @throws {@link RxDBError} 当提供的值不是非负安全整数
 */
export const assertOptionalNonNegativeSafeInteger = (
  value: number | undefined,
  errorMessage: string
): number | undefined => {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RxDBError(errorMessage);
  }
  return value;
};
