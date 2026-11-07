/** 可被宿主和子应用识别的错误类别。 */
export type WujieErrorCode =
  | 'INVALID_OPTIONS'
  | 'INVALID_PAYLOAD'
  | 'FORBIDDEN_ORIGIN'
  | 'DUPLICATE_INSTANCE'
  | 'INVALID_STATE'
  | 'UNSUPPORTED'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'DESTROYED'
  | 'LOAD_ERROR'
  | 'APP_ERROR'
  | 'NAVIGATION'
  | 'UNKNOWN_METHOD'
  | 'HANDLER_ERROR';

/** 带稳定错误码的桌面运行错误。 */
export class WujieError extends Error {
  /** 创建带分类信息的错误。 */
  constructor(
    /** 稳定错误码，不依赖错误文本匹配。 */
    readonly code: WujieErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'WujieError';
  }
}

export function checkName(value: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw new WujieError('INVALID_OPTIONS', '名称必须为 1～128 个字符');
  }
}

export function checkTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 120_000) {
    throw new WujieError('INVALID_OPTIONS', '超时必须大于 0 且不超过 120000 毫秒');
  }
  return value;
}

export function aborted(): WujieError {
  return new WujieError('ABORTED', '操作已取消');
}

export function destroyed(): WujieError {
  return new WujieError('DESTROYED', '实例或连接已销毁');
}
