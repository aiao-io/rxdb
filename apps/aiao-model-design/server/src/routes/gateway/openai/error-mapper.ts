import type { GatewayError } from '../../../gateway/core/types';

export interface OpenAiErrorBody {
  message: string;
  type: string;
  code?: string;
  param?: string;
}

/**
 * 内核错误分类 → OpenAI `error.type` 字符串
 *
 * 与 OpenAI SDK 错误反序列化保持一致（`invalid_request_error` / `authentication_error`
 * / `rate_limit_error` / `api_error` 等），便于 openai SDK 用户的 isinstance 逻辑。
 */
const OPENAI_TYPE_BY_GATEWAY: Record<GatewayError['type'], string> = {
  validation: 'invalid_request_error',
  unauthorized: 'authentication_error',
  'rate-limit': 'rate_limit_error',
  timeout: 'api_error',
  network: 'api_error',
  server: 'api_error'
};

/**
 * GatewayError → OpenAI error body 序列化（FR-005）
 *
 * 仅输出 OpenAI 标准 4 字段；provider id / upstream code / cause 不入响应体。
 */
export function mapGatewayErrorToOpenAi(err: GatewayError): OpenAiErrorBody {
  return {
    message: err.message,
    type: OPENAI_TYPE_BY_GATEWAY[err.type],
    code: err.code,
    param: err.param
  };
}
