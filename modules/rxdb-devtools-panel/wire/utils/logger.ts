type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 当前构建模式，由宿主在入口显式配置。默认 `false` 是**生产语义**（只打 warn/error），
 * 不是兜底：旧实现把 `import.meta.env.DEV` 当默认参数求值，依赖 vite 的 define 注入 ——
 * Angular 生产构建没有这层注入，`import.meta.env` 是 undefined，每次打日志都抛 TypeError。
 * vite 宿主传 `import.meta.env.DEV`，Angular 宿主传 `isDevMode()`。
 */
let isDevelopment = false;

/** Configures the build mode of the host application. */
export function configureLogger(development: boolean): void {
  isDevelopment = development;
}

/** Returns whether a log level should be emitted for the current build mode. */
export function shouldLog(level: LogLevel, development = isDevelopment): boolean {
  return development || level === 'warn' || level === 'error';
}

class Logger {
  private readonly prefix = '[RxDB DevTools]';

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (!shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const logMessage = `${this.prefix} [${timestamp}] ${message}`;

    if (data !== undefined) {
      console[level](logMessage, data);
      return;
    }

    console[level](logMessage);
  }
}

export const logger = new Logger();
