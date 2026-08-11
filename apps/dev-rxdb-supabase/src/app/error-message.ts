/**
 * 把任意抛出物转成能给用户看的一行文案。
 *
 * @param error - 捕获到的任意值
 * @param fallback - 取不出有效信息时的兜底文案（面向用户，不是技术细节）
 *
 * @remarks
 * P2-9：本 app 原先有 15 处直接把 `String(error)` 拼进用户可见文案。
 * 对 `Error` 它给出 `"Error: xxx"`（带前缀），对**普通对象**给出 `"[object Object]"` ——
 * 而 Supabase / PostgREST 抛的正是 `{ message, code, details }` 这样的普通对象，
 * 也就是说远端同步失败时，用户看到的大概率就是 `[object Object]`。
 *
 * 这不是"fallback 兜底"：`fallback` 只在确实取不到任何可读信息时才用，
 * 且它是文案而非行为 —— 错误本身照常向上抛。
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error.trim() || fallback;
  if (error instanceof Error) return error.message.trim() || fallback;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown };
    if (typeof message === 'string') return message.trim() || fallback;
  }
  return fallback;
}
