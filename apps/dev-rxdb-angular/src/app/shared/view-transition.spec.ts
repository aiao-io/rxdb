import { describe, expect, it, vi } from 'vitest';
import { runViewTransition, ViewTransitionStarter } from './view-transition';

describe('runViewTransition', () => {
  it('waits for the update callback and transition completion', async () => {
    let finishTransition: () => void = () => undefined;
    const finished = new Promise<void>(resolve => {
      finishTransition = resolve;
    });
    const callback = vi.fn().mockResolvedValue(undefined);
    const startTransition: ViewTransitionStarter = update => {
      const updateCallbackDone = Promise.resolve().then(update);
      return { updateCallbackDone, finished };
    };

    let completed = false;
    const result = runViewTransition(callback, startTransition).then(() => {
      completed = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(callback).toHaveBeenCalledOnce();
    expect(completed).toBe(false);

    finishTransition();
    await result;
    expect(completed).toBe(true);
  });

  it('propagates update callback failures', async () => {
    const failure = new Error('save failed');
    const startTransition: ViewTransitionStarter = update => ({
      updateCallbackDone: Promise.resolve().then(update),
      finished: Promise.resolve()
    });

    await expect(runViewTransition(() => Promise.reject(failure), startTransition)).rejects.toBe(failure);
  });
});
