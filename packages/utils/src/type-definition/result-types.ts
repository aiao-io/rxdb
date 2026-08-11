import { XOR } from 'ts-xor';

/** 成功结果。 */
export interface SuccessResult<T = unknown> {
  data: T;
}

/** 错误结果。 */
export interface ErrorResult<ErrorDataType = unknown> {
  error: ErrorDataType;
}

/** 成功数据与错误数据互斥的结果类型。 */
export type Result<T = unknown, ErrorDataType = unknown> = XOR<SuccessResult<T>, ErrorResult<ErrorDataType>>;
