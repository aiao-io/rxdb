type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Returns whether a log level should be emitted for the current build mode. */
export function shouldLog(level: LogLevel, isDevelopment = import.meta.env.DEV): boolean {
  return isDevelopment || level === 'warn' || level === 'error';
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
