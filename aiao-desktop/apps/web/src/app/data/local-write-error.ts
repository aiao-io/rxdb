/** 将本地写入异常映射为可操作的反馈，不向界面透传 SQL 或内部结构。 */
export function localWriteFailureMessage(error: unknown): string {
  const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (/QuotaExceededError|SQLITE_FULL|(?:disk|storage) (?:is )?full/i.test(reason))
    return 'Browser storage is full. Free some space, then retry.';
  return 'Local storage could not complete this change. Try again.';
}
