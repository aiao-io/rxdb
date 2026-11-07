import type { GatewayError } from '../../../gateway/core/types';

/**
 * dashboard `AiApiService` 期望的错误体
 *
 * 字段命名与 `apps/dashboard/src/app/shared/services/ai-api.service.ts` 中
 * `AiApiError` 类型保持一致：`type` 与 `GatewayError.type` 的取值完全相同。
 */
export interface AiApiError {
  type: GatewayError['type'];
  message: string;
  status: number;
}

/**
 * GatewayError → project-compat `AiApiError` 序列化
 *
 * 与 OpenAI / Anthropic 风格不同：
 * - 不包裹 `{ error: {...} }` 一层
 * - `type` 取值与内核分类一一对齐（validation/unauthorized/rate-limit/timeout/network/server）
 *
 * Reference: spec.md FR-005
 */
export function mapGatewayErrorToAiApi(err: GatewayError): AiApiError {
  return {
    type: err.type,
    message: err.message,
    status: err.httpStatus
  };
}
