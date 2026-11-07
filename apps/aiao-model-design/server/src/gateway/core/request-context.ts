import { randomUUID } from 'node:crypto';
import { createDefaultTimeoutSignal } from './timeout-policy';
import type { AuthChannel, EntryStyle, Modality, RequestContext } from './types';

export interface CreateRequestContextOptions {
  entry: EntryStyle;
  modality: Modality;
  clientSignal: AbortSignal;
  userId?: string | null;
  authChannel?: AuthChannel | null;
  /** 测试覆盖用，绕过默认按模态选 timeout signal */
  timeoutSignal?: AbortSignal;
}

/**
 * 创建请求级上下文对象（FR-040 trace id 单一来源）
 *
 * - `traceId` 用 `crypto.randomUUID()` 生成；同一请求在响应 header / 日志 / 流内事件三处必须一致
 * - `timeoutSignal` 按模态选 default（chat 用 first-byte 30s；asr/tts 用 total）
 * - `combinedSignal` = `AbortSignal.any([clientSignal, timeoutSignal])`，下游 fetch / provider 应消费它
 */
export function createRequestContext(opts: CreateRequestContextOptions): RequestContext {
  const timeoutSignal = opts.timeoutSignal ?? createDefaultTimeoutSignal(opts.modality);
  const combinedSignal = AbortSignal.any([opts.clientSignal, timeoutSignal]);
  return {
    traceId: randomUUID(),
    entry: opts.entry,
    modality: opts.modality,
    userId: opts.userId ?? null,
    authChannel: opts.authChannel ?? null,
    requestedAt: Date.now(),
    clientSignal: opts.clientSignal,
    timeoutSignal,
    combinedSignal,
    retentionFiles: []
  };
}
