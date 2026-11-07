import type { GatewayError } from '../../../gateway/core/types';

export interface AnthropicErrorBody {
  type: string;
  message: string;
}

/**
 * 内核错误分类 → Anthropic `error.type` 字符串
 *
 * 与官方 @anthropic-ai/sdk 的错误反序列化保持一致：
 * - `invalid_request_error` / `authentication_error` / `permission_error`
 * - `rate_limit_error` / `api_error` / `overloaded_error` / `not_found_error`
 */
const ANTHROPIC_TYPE_BY_GATEWAY: Record<GatewayError['type'], string> = {
  validation: 'invalid_request_error',
  unauthorized: 'authentication_error',
  'rate-limit': 'rate_limit_error',
  timeout: 'api_error',
  network: 'api_error',
  server: 'api_error'
};

/**
 * GatewayError → Anthropic error body 序列化（FR-005）
 *
 * Anthropic 顶层包裹 `{ type: 'error', error: { type, message } }`
 * 由调用方完成；此函数只返回内层 `error` 对象。
 */
export function mapGatewayErrorToAnthropic(err: GatewayError): AnthropicErrorBody {
  return {
    type: ANTHROPIC_TYPE_BY_GATEWAY[err.type],
    message: err.message
  };
}
