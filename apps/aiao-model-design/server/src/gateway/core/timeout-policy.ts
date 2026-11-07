import { TimeoutError } from './errors';
import type { Modality } from './types';

/**
 * 模态分层超时阈值（FR-008，单位 ms）
 *
 * - chat.firstByteMs：流首条 SSE 事件到达前的最长等待
 * - chat.idleMs：流开启后连续无新事件的最长间隔
 * - asr.totalMs / tts.totalMs：非流式请求整体上限
 */
export const TIMEOUTS = {
  chat: { firstByteMs: 30_000, idleMs: 60_000 },
  asr: { totalMs: 120_000 },
  tts: { totalMs: 60_000 }
} as const;

const scheduleTimeoutAbort = (ms: number, kind: 'first-byte' | 'total'): AbortSignal => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    if (!ctrl.signal.aborted) ctrl.abort(new TimeoutError(kind));
  }, ms);
  timer.unref?.();
  return ctrl.signal;
};

/**
 * Chat 模态首字节超时 signal
 *
 * 用法：上游 stream 首条事件到达时 caller 不再依赖此 signal（让它自然过期或忽略），
 * 30s 内未到首事件即 abort，stream handler 抛 TimeoutError('first-byte')。
 */
export function createFirstByteSignal(_modality: 'chat'): AbortSignal {
  return scheduleTimeoutAbort(TIMEOUTS.chat.firstByteMs, 'first-byte');
}

/**
 * Chat 模态流空闲 watchdog
 *
 * - `signal` 在 60s 无 `reset()` 调用 → abort（reason = TimeoutError('idle')）
 * - 每收到一个 stream event 调 `reset()` 重置计时器
 * - stream 结束时调 `cleanup()` 避免 timer 泄漏
 */
export function createIdleSignal(_modality: 'chat'): {
  signal: AbortSignal;
  reset: () => void;
  cleanup: () => void;
} {
  const ctrl = new AbortController();
  const idleMs = TIMEOUTS.chat.idleMs;
  const fire = (): void => {
    if (!ctrl.signal.aborted) ctrl.abort(new TimeoutError('idle'));
  };
  let timer = setTimeout(fire, idleMs);
  const reset = (): void => {
    clearTimeout(timer);
    timer = setTimeout(fire, idleMs);
  };
  const cleanup = (): void => {
    clearTimeout(timer);
  };
  return { signal: ctrl.signal, reset, cleanup };
}

/**
 * ASR / TTS 整体超时 signal
 */
export function createTotalSignal(modality: 'asr' | 'tts'): AbortSignal {
  const total = modality === 'asr' ? TIMEOUTS.asr.totalMs : TIMEOUTS.tts.totalMs;
  return scheduleTimeoutAbort(total, 'total');
}

/**
 * 按模态生成默认 timeoutSignal（供 createRequestContext 初始化使用）
 *
 * - chat → first-byte 30s（stream 开启后由 handler 切到 idle watchdog）
 * - asr → total 120s
 * - tts → total 60s
 */
export function createDefaultTimeoutSignal(modality: Modality): AbortSignal {
  if (modality === 'chat') return createFirstByteSignal('chat');
  return createTotalSignal(modality);
}
