import { describe, expect, it } from 'vitest';
import { shouldLog } from './logger';

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
