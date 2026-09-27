/**
 * 从任意抛出值里取可读文案：先认小程序的 `errMsg`，再认 `message`，都没有才 `String()`。
 *
 * 单独成模块：`host.ts` 与 `wechat-file-vfs.ts` 都要用，而后者已经依赖前者。
 */
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as { errMsg?: unknown; message?: unknown };
    if (typeof candidate.errMsg === 'string') return candidate.errMsg;
    if (typeof candidate.message === 'string') return candidate.message;
  }
  return String(error);
}
