import type { Modality } from '../../config';

export type { Modality };

/**
 * 网关三套对外入口风格
 *
 * 决定 stream / error 序列化器的选择（FR-005 / FR-007）
 */
export type EntryStyle = 'openai-v1' | 'anthropic-v1' | 'project-compat';

/**
 * Supabase JWT 鉴权通道（FR-054 三 token 通道）
 *
 * 优先级：cookie > authorization > x-api-key
 */
export type AuthChannel = 'cookie' | 'authorization' | 'x-api-key';

/**
 * 内核统一错误分类（FR-005）
 *
 * 入口序列化器按 entry 风格映射到三套响应体。
 */
export type ErrorType = 'validation' | 'unauthorized' | 'rate-limit' | 'timeout' | 'network' | 'server';

/**
 * 鉴权中间件产物（FR-054）
 *
 * 写入 RequestContext.userId / authChannel；不入响应体。
 */
export interface AuthIdentity {
  userId: string;
  channel: AuthChannel;
  rawJwt: string;
  expiresAt: number;
}

/**
 * 每请求 1 个的上下文对象（请求生命周期）
 *
 * - `traceId` 通过 `x-trace-id` header 透出（FR-040），三处必须一致：响应 header / 错误日志 / 流内事件
 * - `combinedSignal` = `AbortSignal.any([clientSignal, timeoutSignal])`
 * - 请求结束（成功 / 失败 / abort）后所有 signal 应已被消费，内存不留引用
 */
export interface RequestContext {
  traceId: string;
  entry: EntryStyle;
  modality: Modality;
  userId: string | null;
  authChannel: AuthChannel | null;
  requestedAt: number;
  clientSignal: AbortSignal;
  timeoutSignal: AbortSignal;
  combinedSignal: AbortSignal;
  retentionFiles: string[];
}

/**
 * 内核错误对象（FR-005）
 *
 * 入口序列化器按 entry 风格映射到三套响应体：
 * - openai-v1 → `{ error: { message, type, code, param } }`
 * - anthropic-v1 → `{ type: 'error', error: { type, message } }`
 * - project-compat → `{ type, message, status }`（AiApiError）
 *
 * `providerId` / `upstreamCode` / `cause` 仅落服务端日志，不入响应体。
 */
export interface GatewayError {
  type: ErrorType;
  message: string;
  httpStatus: number;
  code?: string;
  param?: string;
  providerId?: string;
  upstreamCode?: string;
  cause?: Error;
}
