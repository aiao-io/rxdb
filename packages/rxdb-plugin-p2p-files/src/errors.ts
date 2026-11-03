/**
 * P2P 传输失败。
 *
 * @remarks
 * `retryable` 为 false 的是存储故障或清单自相矛盾：换服务器重下也救不回来，选路层不应回退。
 */
export class P2PTransferError extends Error {
  /** 稳定的错误码，便于跨 realm 识别。 */
  readonly code = 'P2P_TRANSFER_FAILED' as const;
  /** 换来源（其他 peer 或服务器）重试是否可能成功。 */
  readonly retryable: boolean;

  /**
   * @param message - 错误说明
   * @param options - `cause` 为底层原因；`retryable` 默认为 true
   */
  constructor(message: string, options?: { readonly cause?: unknown; readonly retryable?: boolean }) {
    super(message, options);
    this.name = 'P2PTransferError';
    this.retryable = options?.retryable ?? true;
  }
}
