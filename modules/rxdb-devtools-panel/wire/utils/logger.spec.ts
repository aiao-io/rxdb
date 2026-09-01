import { beforeEach, describe, expect, it } from 'vitest';
import { configureLogger, shouldLog } from './logger';

describe('shouldLog', () => {
  it('keeps every level in development', () => {
    expect(['debug', 'info', 'warn', 'error'].every(level => shouldLog(level as 'debug', true))).toBe(true);
  });

  it('silences debug and info in production', () => {
    expect(shouldLog('debug', false)).toBe(false);
    expect(shouldLog('info', false)).toBe(false);
    expect(shouldLog('warn', false)).toBe(true);
    expect(shouldLog('error', false)).toBe(true);
  });
});

describe('configureLogger', () => {
  beforeEach(() => configureLogger(false));

  it('applies production semantics when the host never configures anything', () => {
    expect(shouldLog('debug')).toBe(false);
    expect(shouldLog('info')).toBe(false);
    expect(shouldLog('warn')).toBe(true);
    expect(shouldLog('error')).toBe(true);
  });

  it('switches to development semantics once the host configures it', () => {
    configureLogger(true);
    expect(['debug', 'info', 'warn', 'error'].every(level => shouldLog(level as 'debug'))).toBe(true);
  });
});
