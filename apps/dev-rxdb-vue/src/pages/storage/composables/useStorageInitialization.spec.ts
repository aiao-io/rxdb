import { describe, expect, it, vi } from 'vitest';
import { useStorageInitialization } from './useStorageInitialization';

describe('useStorageInitialization', () => {
  it('reaches an explicit unavailable state without opening storage', async () => {
    const open = vi.fn();
    const initialization = useStorageInitialization({
      checkAvailability: async () => false,
      open
    });

    expect(initialization.status.value).toBe('checking');

    await initialization.start('/documents');

    expect(initialization.status.value).toBe('unavailable');
    expect(initialization.isReady.value).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('becomes ready only after the requested path is open', async () => {
    let finishOpen: (() => void) | undefined;
    const open = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finishOpen = resolve;
        })
    );
    const initialization = useStorageInitialization({
      checkAvailability: async () => true,
      open
    });

    const started = initialization.start('/documents');
    await Promise.resolve();

    expect(initialization.status.value).toBe('checking');
    expect(open).toHaveBeenCalledWith('/documents');

    finishOpen?.();
    await started;

    expect(initialization.status.value).toBe('ready');
    expect(initialization.isReady.value).toBe(true);
  });

  it('exposes initialization errors as a terminal state', async () => {
    const failure = new Error('cannot open storage');
    const initialization = useStorageInitialization({
      checkAvailability: async () => true,
      open: async () => {
        throw failure;
      }
    });

    await initialization.start('/');

    expect(initialization.status.value).toBe('error');
    expect(initialization.error.value).toBe(failure);
  });
});
