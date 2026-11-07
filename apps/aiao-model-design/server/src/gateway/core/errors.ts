/**
 * 上游 HTTP 错误（4xx / 5xx）
 *
 * provider 把上游响应包装成此异常抛出，由 `error-classifier` 统一映射到 GatewayError。
 */
export class UpstreamHttpError extends Error {
  readonly status: number;
  readonly upstreamCode?: string;
  readonly upstreamBody?: unknown;

  constructor(status: number, message: string, opts: { upstreamCode?: string; upstreamBody?: unknown } = {}) {
    super(message);
    this.name = 'UpstreamHttpError';
    this.status = status;
    this.upstreamCode = opts.upstreamCode;
    this.upstreamBody = opts.upstreamBody;
  }
}

/** 网关超时（FR-008 分层超时之一） */
export type TimeoutKind = 'first-byte' | 'idle' | 'total';

/**
 * 网关层超时错误
 *
 * - `first-byte`：chat 流首条事件未在阈值内到达（30s）
 * - `idle`：chat 流空闲超时（60s 无新事件）
 * - `total`：ASR / TTS 单请求整体超时
 */
export class TimeoutError extends Error {
  readonly kind: TimeoutKind;

  constructor(kind: TimeoutKind, message?: string) {
    super(message ?? `Gateway timeout: ${kind}`);
    this.name = 'TimeoutError';
    this.kind = kind;
  }
}

/**
 * 调用方请求体校验错误
 *
 * - FR-031：provider 不支持某 capability（如 voice_reference）抛此错
 * - FR-055：调用方传已知但未实现的字段（如 logprobs / seed）抛此错
 * - 入口层把 `code` 写入响应体的对应字段（OpenAI `error.code` / Anthropic `error.type`）
 */
export class ValidationError extends Error {
  readonly code: string;
  readonly param?: string;

  constructor(message: string, opts: { code: string; param?: string }) {
    super(message);
    this.name = 'ValidationError';
    this.code = opts.code;
    this.param = opts.param;
  }
}

/** 鉴权失败（无 token / token 过期 / 签名不通过） */
export class UnauthorizedError extends Error {
  readonly code: string;

  constructor(message: string, code: string = 'unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
    this.code = code;
  }
}

/** model id 未注册或 provider 已被 skipped（FR-056） */
export class ModelNotFoundError extends Error {
  readonly modelId: string;

  constructor(modelId: string) {
    super(
      `model_not_found: '${modelId}' is not registered or its provider was skipped at startup; call GET /v1/models to discover available models`
    );
    this.name = 'ModelNotFoundError';
    this.modelId = modelId;
  }
}
