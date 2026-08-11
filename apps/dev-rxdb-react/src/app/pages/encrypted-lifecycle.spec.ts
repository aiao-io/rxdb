import { Observable } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { bindEncryptionFacade, EncryptionFacadeState } from './encrypted-lifecycle';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createFacade(unsubscribe: () => void): EncryptionFacadeState {
  return {
    isLocked: true,
    isInitialized: () => Promise.resolve(true),
    lockChange$: new Observable(() => unsubscribe)
  };
}

describe('bindEncryptionFacade', () => {
  it('does not subscribe when disposed before the facade resolves', async () => {
    const facade = deferred<EncryptionFacadeState>();
    const unsubscribe = vi.fn();
    const cleanup = bindEncryptionFacade(facade.promise, {
      onReady: vi.fn(),
      onInitialized: vi.fn(),
      onLockChange: vi.fn(),
      onError: vi.fn()
    });

    cleanup();
    facade.resolve(createFacade(unsubscribe));
    await facade.promise;
    await Promise.resolve();

    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('unsubscribes when disposed after the subscription is established', async () => {
    const unsubscribe = vi.fn();
    const facade = createFacade(unsubscribe);
    const cleanup = bindEncryptionFacade(Promise.resolve(facade), {
      onReady: vi.fn(),
      onInitialized: vi.fn(),
      onLockChange: vi.fn(),
      onError: vi.fn()
    });

    await Promise.resolve();
    cleanup();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
