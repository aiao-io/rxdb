/** 集成应用在窗口里显示失败原因所需的信息。 */
export interface FailingApp {
  readonly name: string;
  /** 入口的主机名，例如 `vscode.aiao.io`。 */
  readonly host: string;
  readonly readyTimeout: number;
}

/** 窗口自己显示的 Orbit 失败：启动与运行中的失败，以及关窗口带来的取消与销毁。 */
const WINDOW_FAILURES = new Set([
  'LOAD_ERROR',
  'TIMEOUT',
  'APP_ERROR',
  'NAVIGATION',
  'INCOMPATIBLE_PROTOCOL',
  'ABORTED',
  'DESTROYED'
]);

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** 窗口已经显示（或因关闭而不需要显示）的失败，运行内核不必再上报。 */
export function isWindowFailure(error: unknown): boolean {
  return WINDOW_FAILURES.has(codeOf(error) ?? '');
}

/** 失败窗口里那一句原因，按 Orbit 的稳定错误码区分，不匹配错误文本。 */
export function failureReason(error: unknown, app: FailingApp): string {
  const message = error instanceof Error ? error.message : String(error);
  switch (codeOf(error)) {
    case 'LOAD_ERROR':
      return `${app.host} didn’t connect. It may be offline, blocked by the browser, or not set up for Aiao Desktop.`;
    case 'TIMEOUT':
      return `${app.name} didn’t finish starting within ${Math.round(app.readyTimeout / 1000)} seconds.`;
    case 'APP_ERROR':
      return `${app.name} reported: ${message}`;
    case 'NAVIGATION':
      return `${app.name} left its page or closed its connection.`;
    case 'INCOMPATIBLE_PROTOCOL': {
      const { requested, supported } = error as { requested?: number; supported?: number };
      return `${app.name} needs a newer Aiao Desktop: it uses app protocol v${requested}, but this desktop supports up to v${supported}.`;
    }
    default:
      return `${app.name} couldn’t start: ${message}`;
  }
}
