/** 会话层的错误类型；不认识文件、清单这些上层概念。 */

/** 把任意拒绝原因规整成 Error，供首个失败原因的保留与转发使用。 */
export const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/**
 * 会话结束的原因。
 *
 * - `closed`：本端主动关闭
 * - `peer_closed`：对端发来 bye，原因见 {@link P2PSessionClosedError.peerReason}
 * - `peer_lost`：hello 或心跳超时
 * - `unauthorized`：对端凭据未通过认证
 * - `incompatible`：会话协议版本不一致
 * - `protocol_violation`：对端违反协议（畸形帧、超限、乱序 hello、重复请求号）
 * - `duplicate`：同一对端已有一条会话，本条在去重时被关闭
 * - `transport_failed`：底层收发失败
 */
export type P2PSessionCloseCode =
  | 'closed'
  | 'peer_closed'
  | 'peer_lost'
  | 'unauthorized'
  | 'incompatible'
  | 'protocol_violation'
  | 'duplicate'
  | 'transport_failed';

/** 会话已结束；`code` 说明原因，跨 realm 也能识别。 */
export class P2PSessionClosedError extends Error {
  /** 结束原因。 */
  readonly code: P2PSessionCloseCode;
  /** 对端在 bye 帧里给出的原因；只有 `peer_closed` 才有。 */
  readonly peerReason: string | undefined;

  /**
   * @param code - 结束原因
   * @param message - 可诊断的说明
   * @param options - `cause` 为底层原因；`peerReason` 为对端 bye 帧里的原因
   */
  constructor(
    code: P2PSessionCloseCode,
    message: string,
    options?: { readonly cause?: unknown; readonly peerReason?: string }
  ) {
    super(message, options);
    this.name = 'P2PSessionClosedError';
    this.code = code;
    this.peerReason = options?.peerReason;
  }
}

/**
 * 对端拒绝了一次请求。
 *
 * @remarks
 * 协议处理函数抛出它时，会话以其 `code` 应答；会话自己用到的 code 有 `unsupported`（协议未协商）
 * 与 `internal`（处理函数抛了别的错误）。其余 code 由各协议约定，例如 files 协议的 `not_holder`。
 */
export class P2PRequestError extends Error {
  /** 稳定的拒绝原因，跨 realm 也能识别。 */
  readonly code: string;

  /**
   * @param code - 拒绝原因
   * @param message - 可诊断的说明（发给对端时截断到协议上限）
   * @param options - `cause` 为底层原因
   */
  constructor(code: string, message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = 'P2PRequestError';
    this.code = code;
  }
}
