export class DesktopError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(`${code}: ${message}`);
    this.name = 'DesktopError';
  }
}

export function requireCondition(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DesktopError(code, message);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败';
}
