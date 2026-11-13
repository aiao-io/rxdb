/** 可被宿主和子应用识别的错误类别。 */
export type OrbitErrorCode =
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
  | 'INCOMPATIBLE_PROTOCOL'
  | 'UNKNOWN_METHOD'
  | 'HANDLER_ERROR';

/** 带稳定错误码的桌面运行错误。 */
export class OrbitError extends Error {
  /** 创建带分类信息的错误。 */
  constructor(
    /** 稳定错误码，不依赖错误文本匹配。 */
    readonly code: OrbitErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'OrbitError';
  }
}

/** 应用声明的协议版本高于宿主支持的版本：宿主不缺能力地继续运行，而是明确失败。 */
export class OrbitProtocolError extends OrbitError {
  /** 创建协议不兼容错误；消息含双方版本。 */
  constructor(
    /** 应用声明的协议版本。 */
    readonly requested: number,
    /** 宿主支持的最高协议版本。 */
    readonly supported: number,
    options?: ErrorOptions
  ) {
    super(
      'INCOMPATIBLE_PROTOCOL',
      `应用声明的协议版本 aiao.orbit:${requested} 高于桌面支持的版本 aiao.orbit:${supported}：请升级桌面，或让应用改用不高于 aiao.orbit:${supported} 的版本`,
      options
    );
    this.name = 'OrbitProtocolError';
  }
}

export function checkName(value: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw new OrbitError('INVALID_OPTIONS', '名称必须为 1～128 个字符');
  }
}

export function checkTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 120_000) {
    throw new OrbitError('INVALID_OPTIONS', '超时必须大于 0 且不超过 120000 毫秒');
  }
  return value;
}

export function aborted(): OrbitError {
  return new OrbitError('ABORTED', '操作已取消');
}

export function destroyed(): OrbitError {
  return new OrbitError('DESTROYED', '实例或连接已销毁');
}
