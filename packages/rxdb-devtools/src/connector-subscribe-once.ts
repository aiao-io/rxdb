/** 最小退订句柄。 */
export interface Subscription {
  unsubscribe(): void;
}

/** 可订阅一次的数据源。 */
export interface Subscribable<T> {
  subscribe(callback: (data: T) => void): Subscription;
}

/** {@link subscribeOnce} 选项。 */
export interface SubscribeOnceOptions {
  timeoutMs?: number;
  register?: (handle: Subscription) => void;
  unregister?: (handle: Subscription) => void;
}

/**
 * 订阅一次：首个 next / error / timeout 后立刻退订。
 *
 * @remarks
 * `subscribe()` 可能同步抛错。timer 在它之前就建好了，不接住的话：定时器泄漏，
 * 且调用方要等满超时才收到一条误导性的 "timed out" —— 真实原因被上层 catch 吞掉。
 * 走 `error()` 统一收口：它会 `settle()`（清 timer）并把真实 cause 报出去（RDT-019）。
 */
export function subscribeOnce<T>(
  observable: Subscribable<T>,
  callback: (value: T) => void,
  errorCallback: (error: unknown) => void,
  options: SubscribeOnceOptions = {}
): void {
  let subscription: Subscription | null = null;
  let unsubscribeAfterSubscribe = false;
  let handled = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const settle = (): void => {
    handled = true;
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    options.unregister?.(handle);
  };

  const handle: Subscription = {
    unsubscribe(): void {
      if (handled) return;
      settle();
      subscription?.unsubscribe();
    }
  };

  const next = (value: T): void => {
    if (handled) return;
    settle();
    callback(value);

    if (subscription) {
      subscription.unsubscribe();
      return;
    }
    unsubscribeAfterSubscribe = true;
  };

  const error = (cause: unknown): void => {
    if (handled) return;
    settle();
    errorCallback(cause);
    subscription?.unsubscribe();
  };

  if (options.timeoutMs !== undefined) {
    timeoutId = setTimeout(() => {
      if (handled) return;
      settle();
      subscription?.unsubscribe();
      errorCallback(new Error(`query timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);
  }

  try {
    if (typeof (observable as { pipe?: unknown }).pipe === 'function') {
      subscription = (
        observable as unknown as { subscribe(observer: { next: typeof next; error: typeof error }): Subscription }
      ).subscribe({
        next,
        error
      });
    } else {
      subscription = observable.subscribe(next);
    }
  } catch (cause) {
    error(cause);
    return;
  }
  if (unsubscribeAfterSubscribe) {
    subscription.unsubscribe();
    return;
  }
  if (!handled) options.register?.(handle);
}
