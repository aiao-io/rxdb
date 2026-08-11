import { describe, expect, it, vi } from 'vitest';
import { logError } from '../../tools/log.js';

describe('logError', () => {
  it('should true', () => {
    const f1 = vi.fn();
    const f2 = vi.fn();

    Object.defineProperty(window, 'console', {
      writable: true,
      value: {
        table: f1,
        log: f2
      }
    });

    logError([1, 2, 3]);
    expect(f1).toHaveBeenCalledTimes(1);
  });

  it('should true', () => {
    const f1 = vi.fn();
    const f2 = vi.fn();

    Object.defineProperty(window, 'console', {
      writable: true,
      value: {
        table: f1,
        log: f2
      }
    });

    logError({ a: 1, b: 2 }, 'd', 'adf');
    expect(f1).toHaveBeenCalledTimes(1);
  });

  it('should fallback to console.log if table not present', () => {
    const f2 = vi.fn();
    Object.defineProperty(window, 'console', {
      writable: true,
      value: {
        log: f2
      }
    });
    logError({ a: 1 });
    expect(f2).toHaveBeenCalled();
  });

  it('should handle err as null/undefined/number/string/boolean/symbol', () => {
    const f1 = vi.fn();
    Object.defineProperty(window, 'console', {
      writable: true,
      value: {
        table: f1,
        log: f1
      }
    });
    logError(null);
    logError(undefined);
    logError(123);
    logError('error');
    logError(true);
    logError(Symbol('s'));
    expect(f1).toHaveBeenCalledTimes(6);
  });

  it('should handle err as object with no properties', () => {
    const f1 = vi.fn();
    Object.defineProperty(window, 'console', {
      writable: true,
      value: {
        table: f1,
        log: f1
      }
    });
    logError(Object.create(null));
    expect(f1).toHaveBeenCalled();
  });

  it('should handle empty args', () => {
    const f1 = vi.fn();
    Object.defineProperty(window, 'console', {
      writable: true,
      value: {
        table: f1,
        log: f1
      }
    });
    logError({ a: 1 });
    expect(f1).toHaveBeenCalled();
  });

  it('should handle multiple args', () => {
    const f1 = vi.fn();
    const f2 = vi.fn();
    Object.defineProperty(window, 'console', {
      writable: true,
      value: {
        table: f1,
        log: f2
      }
    });
    logError({ a: 1 }, 'foo', 123, false);
    expect(f2).toHaveBeenCalledTimes(3);
    expect(f1).toHaveBeenCalled();
  });
});
