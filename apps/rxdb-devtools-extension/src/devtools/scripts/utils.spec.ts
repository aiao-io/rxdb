import { afterEach, describe, expect, it, vi } from 'vitest';
import { RXDB_DEVTOOLS_MESSAGE, type DevToolsMessage } from '../../shared/types';
import {
  INSPECTED_WINDOW_SCRIPT_RESULT,
  createScriptRequestId,
  executeInInspectedWindow,
  serializeFunctionWithResult
} from './utils';

function message(type: DevToolsMessage['type'], payload: unknown): DevToolsMessage {
  return {
    direction: 'page-to-devtools',
    payload,
    sequence: 0,
    source: RXDB_DEVTOOLS_MESSAGE,
    timestamp: 0,
    type
  };
}

describe('createScriptRequestId', () => {
  it('produces unique ids carrying the given prefix', () => {
    const a = createScriptRequestId('clear');
    const b = createScriptRequestId('clear');
    expect(a.startsWith('clear-')).toBe(true);
    expect(a).not.toBe(b);
  });

  it('defaults the prefix to "script"', () => {
    expect(createScriptRequestId().startsWith('script-')).toBe(true);
  });
});

describe('serializeFunctionWithResult', () => {
  it('embeds the function body and stays syntactically valid', () => {
    async function sample() {
      return 42;
    }

    const code = serializeFunctionWithResult(sample as unknown as (...args: unknown[]) => unknown, 'req-1', ['demo']);

    expect(code).toContain('req-1');
    expect(code).toContain('return 42');
    expect(code).toContain('...[');
    expect(code).toContain('demo');
    expect(() => new Function(`return ${code};`)).not.toThrow();
  });
});

describe('executeInInspectedWindow', () => {
  afterEach(() => vi.useRealTimers());

  it('accepts only the matching request result and unsubscribes', async () => {
    let listener: ((value: DevToolsMessage) => void) | null = null;
    const unsubscribe = vi.fn();
    const port = {
      subscribe: vi.fn((callback: (value: DevToolsMessage) => void) => {
        listener = callback;
        return unsubscribe;
      })
    };
    const inspectedWindow = {
      eval: vi.fn((_code: string, callback: (result: unknown) => void) => {
        callback({ requestId: 'req-1', started: true });
      })
    };

    const resultPromise = executeInInspectedWindow<number>(port, inspectedWindow, 'code', 'req-1');
    const emit = listener as unknown as (value: DevToolsMessage) => void;
    emit(message('EVENT', null));
    emit(message(INSPECTED_WINDOW_SCRIPT_RESULT, { requestId: 'other', result: 1, success: true }));
    emit(message(INSPECTED_WINDOW_SCRIPT_RESULT, { requestId: 'req-1', result: 42, success: true }));

    await expect(resultPromise).resolves.toBe(42);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('rejects a matching script error', async () => {
    let listener: ((value: DevToolsMessage) => void) | null = null;
    const port = {
      subscribe(callback: (value: DevToolsMessage) => void) {
        listener = callback;
        return vi.fn();
      }
    };
    const inspectedWindow = {
      eval(_code: string, callback: (result: unknown) => void) {
        callback({ requestId: 'req-1', started: true });
      }
    };

    const resultPromise = executeInInspectedWindow(port, inspectedWindow, 'code', 'req-1');
    const emit = listener as unknown as (value: DevToolsMessage) => void;
    emit(message(INSPECTED_WINDOW_SCRIPT_RESULT, { error: 'boom', requestId: 'req-1', success: false }));

    await expect(resultPromise).rejects.toThrow('boom');
  });

  it('rejects eval exceptions and invalid startup results', async () => {
    const port = { subscribe: () => vi.fn() };
    const exceptionWindow = {
      eval(_code: string, callback: (result: unknown, exception?: { value?: string }) => void) {
        callback(undefined, { value: 'syntax failed' });
      }
    };
    const invalidWindow = {
      eval(_code: string, callback: (result: unknown) => void) {
        callback({ requestId: 'wrong', started: true });
      }
    };

    await expect(executeInInspectedWindow(port, exceptionWindow, 'code', 'req-1')).rejects.toThrow('syntax failed');
    await expect(executeInInspectedWindow(port, invalidWindow, 'code', 'req-1')).rejects.toThrow('页面脚本未成功启动');
  });

  it('rejects and unsubscribes after timeout', async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    const port = { subscribe: () => unsubscribe };
    const inspectedWindow = {
      eval(_code: string, callback: (result: unknown) => void) {
        callback({ requestId: 'req-1', started: true });
      }
    };

    const resultPromise = executeInInspectedWindow(port, inspectedWindow, 'code', 'req-1', 10);
    const rejection = expect(resultPromise).rejects.toThrow('等待页面脚本执行结果超时');
    await vi.advanceTimersByTimeAsync(10);

    await rejection;
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
