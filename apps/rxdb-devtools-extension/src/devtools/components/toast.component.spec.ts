import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from './toast.component';

describe('ToastService', () => {
  afterEach(() => vi.useRealTimers());

  it('removes a toast when its timer expires', async () => {
    vi.useFakeTimers();
    const service = new ToastService();
    service.show('saved', 'success', 10);

    expect(service.toasts()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(service.toasts()).toHaveLength(0);
  });

  it('clears timers on manual dismiss and destroy', () => {
    vi.useFakeTimers();
    const service = new ToastService();
    service.show('first', 'info', 10);
    service.dismiss(0);
    service.show('second', 'info', 10);
    service.ngOnDestroy();

    expect(vi.getTimerCount()).toBe(0);
    expect(service.toasts().map(toast => toast.message)).toEqual(['second']);
  });
});
