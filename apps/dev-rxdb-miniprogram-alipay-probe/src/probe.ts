/**
 * @fileoverview 单次探测的结果与计时。
 *
 * 实验的每一步都包成 {@link Probe}：成功记值，失败记原始错误的完整描述，绝不重试也不兜底。
 * 计时用 `Date.now()`：`performance.now` 在引导前可能不存在。
 */
import { describeError, type DescribedError } from './describe-error.js';

/** 一次探测的结果。 */
export type Probe<T> =
  | { readonly ok: true; readonly ms: number; readonly value: T }
  | { readonly ok: false; readonly ms: number; readonly error: DescribedError };

/** 整步没跑，并写明原因。 */
export interface Skipped {
  readonly skipped: string;
  /** 因为抛错才没跑完时的原始错误。 */
  readonly error?: DescribedError;
}

/** 执行一次探测；同步抛错与异步 reject 都记成失败。 */
export async function probe<T>(task: () => T | Promise<T>): Promise<Probe<T>> {
  const startedAt = Date.now();
  try {
    const value = await task();
    return { ok: true, ms: Date.now() - startedAt, value };
  } catch (error) {
    return { ok: false, ms: Date.now() - startedAt, error: describeError(error) };
  }
}

/** 平台回调风格 API 的超时：回调永远不来也要能出报告。 */
export function withTimeout<T>(task: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超过 ${ms}ms 没有回调`)), ms);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}
