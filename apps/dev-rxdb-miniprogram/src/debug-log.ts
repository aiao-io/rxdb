/**
 * @fileoverview demo 的控制台调试输出。
 *
 * 真机（尤其支付宝「真机调试」）上页面只显示一行错误消息，看不出卡在哪一步、底层原因是什么。
 * 这里把引导的每一步打到控制台，失败时打出完整 stack 与 cause 链，开发者工具的控制台即可定位。
 */

const TAG = '[dev-rxdb-miniprogram]';

function describeOne(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.stack ? error.stack : `${error.name}: ${error.message}`;
}

/**
 * 把错误展开成多行文本：先是自身的 stack，再沿 `cause` 逐层附上 `Caused by: …`，成环时只展开一次。
 *
 * @param error - 任意抛出值
 * @returns 可直接打到控制台的文本
 */
export function describeError(error: unknown): string {
  const seen = new Set<unknown>();
  const lines: string[] = [];
  let current: unknown = error;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    lines.push(lines.length === 0 ? describeOne(current) : `Caused by: ${describeOne(current)}`);
    current = current instanceof Error ? (current as { cause?: unknown }).cause : undefined;
  }
  return lines.join('\n');
}

/**
 * 打一条引导步骤，失败时最后一条就是出错的那一步。
 *
 * @param step - 步骤名
 */
export function logStep(step: string): void {
  console.info(`${TAG} ${step}`);
}

/**
 * 打一次失败：展开后的文本便于整段复制，原始错误对象便于在控制台里展开查看。
 *
 * @param context - 失败的操作名，如「初始化」
 * @param error - 抛出值
 */
export function logFailure(context: string, error: unknown): void {
  console.error(`${TAG} ${context}失败\n${describeError(error)}`, error);
}
