/**
 * @fileoverview 实验 ②：直接调用 `tt.getRandomValues`，不经 host 包装，记录平台原始的成功与失败形态。
 */
import type { MiniProgramRandomValuesResult } from '@aiao/rxdb-adapter-miniprogram/runtime';
import type { DouyinApi } from '../douyin-api.js';
import { probe, withTimeout, type Probe } from '../probe.js';

/** adapter 默认池、文档上限、上限 + 1。 */
export const RANDOM_LENGTHS = [65_536, 1_048_576, 1_048_577] as const;

const RANDOM_TIMEOUT_MS = 10_000;

/** 一次成功调用的摘要。 */
export interface RandomSummary {
  readonly byteLength: number;
  /** `randomValues` 的构造器名：文档写 ArrayBuffer，实验核对。 */
  readonly bufferType: string;
  readonly resultKeys: readonly string[];
  readonly allZero: boolean;
  readonly distinctByteValues: number;
}

function summarize(result: MiniProgramRandomValuesResult): RandomSummary {
  const bytes = new Uint8Array(result.randomValues);
  const seen = new Set<number>();
  for (const byte of bytes) seen.add(byte);
  return {
    byteLength: bytes.byteLength,
    bufferType: Object.prototype.toString.call(result.randomValues),
    resultKeys: Object.keys(result),
    allZero: seen.size === 1 && seen.has(0),
    distinctByteValues: seen.size
  };
}

function callRaw(tt: DouyinApi, length: number): Promise<RandomSummary> {
  const getRandomValues = tt.getRandomValues;
  if (typeof getRandomValues !== 'function') return Promise.reject(new Error('tt.getRandomValues 不存在'));
  const call = new Promise<RandomSummary>((resolve, reject) => {
    getRandomValues.call(tt, {
      length,
      // 摘要本身抛错也要落到 reject，否则回调里的异常会被平台吞掉
      success: result => {
        try {
          resolve(summarize(result));
        } catch (error) {
          reject(error);
        }
      },
      fail: reject
    });
  });
  return withTimeout(call, RANDOM_TIMEOUT_MS, `tt.getRandomValues(${length})`);
}

/** 依次按 {@link RANDOM_LENGTHS} 调用，键为长度。 */
export async function runRandomExperiment(tt: DouyinApi): Promise<Record<string, Probe<RandomSummary>>> {
  const results: Record<string, Probe<RandomSummary>> = {};
  for (const length of RANDOM_LENGTHS) results[String(length)] = await probe(() => callRaw(tt, length));
  return results;
}
