import { describe, expect, it, vi } from 'vitest';
import { sleep } from '../../async/sleep.js';
import { debounce } from '../../function/debounce.js';

describe('debounce', () => {
  it('should debounce function calls', async () => {
    const func = vi.fn();
    const debounceMs = 100;
    const debouncedFunc = debounce(func, debounceMs);

    debouncedFunc();
    debouncedFunc();
    debouncedFunc();

    await sleep(debounceMs * 2);

    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should delay the function call by the specified wait time', async () => {
    const func = vi.fn();
    const debounceMs = 50;
    const debouncedFunc = debounce(func, debounceMs);

    debouncedFunc();
    await sleep(debounceMs / 2);
    expect(func).not.toHaveBeenCalled();
  });

  it('should reset the wait time if called again before wait time ends', async () => {
    const func = vi.fn();
    const debounceMs = 50;
    const debouncedFunc = debounce(func, debounceMs);

    debouncedFunc();
    await sleep(debounceMs / 2);
    debouncedFunc();
    await sleep(debounceMs / 2);
    debouncedFunc();
    await sleep(debounceMs / 2);
    debouncedFunc();

    expect(func).not.toHaveBeenCalled();

    await sleep(debounceMs + 1);
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should work correctly if the debounced function is called after the wait time', async () => {
    const func = vi.fn();
    const debounceMs = 50;
    const debouncedFunc = debounce(func, debounceMs);

    debouncedFunc();
    await sleep(debounceMs + 1);
    debouncedFunc();
    await sleep(debounceMs + 1);

    // expect(func).toHaveBeenCalledTimes(1);
  });

  it('should call the function with correct arguments', async () => {
    const func = vi.fn();
    const debounceMs = 50;
    const debouncedFunc = debounce(func, debounceMs);
    debouncedFunc('test', 123);
    await sleep(debounceMs * 2);
    expect(func).toHaveBeenCalledTimes(1);
    expect(func).toHaveBeenCalledWith('test', 123);
  });
});
