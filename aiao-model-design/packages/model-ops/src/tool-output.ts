import type { ModelOp } from './types';

/**
 * 建模工具的输出。
 *
 * 成功时 `ops` 交给浏览器写进 AI 分支，`summary` 交给模型阅读；失败时草稿不变，`errors` 逐条说明原因。
 * 只读工具（查看、校验）成功时 `ops` 为空数组。
 */
export type ModelToolOutput = { ok: true; ops: ModelOp[]; summary: string } | { ok: false; errors: string[] };

/** 判断一个工具输出是否带有需要写入的操作。 */
export function hasModelOps(output: unknown): output is { ok: true; ops: ModelOp[]; summary: string } {
  if (typeof output !== 'object' || output === null) return false;
  const value = output as Record<string, unknown>;
  return value['ok'] === true && Array.isArray(value['ops']) && value['ops'].length > 0;
}
