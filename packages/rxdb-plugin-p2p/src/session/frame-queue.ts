/** 适配器与会话共用的等待队列原语；不从包入口导出。 */
import { MAX_FRAME_SIZE, MAX_QUEUED_FRAMES } from './limits.js';

/** 接收队列里尚未取走的字节上限，挡住只发不读的对端。 */
const MAX_QUEUED_BYTES = MAX_QUEUED_FRAMES * MAX_FRAME_SIZE;

/** 一个待兑现的等待者。 */
export interface Deferred<T> {
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
}

/** 把可取消的等待者排进队列：取消时从队列摘掉并拒绝；兑现或拒绝时摘掉取消监听。 */
export const enqueueAbortable = <T>(queue: Array<Deferred<T>>, deferred: Deferred<T>, signal?: AbortSignal): void => {
  const abort = (): void => {
    const index = queue.indexOf(waiter);
    if (index >= 0) queue.splice(index, 1);
    deferred.reject(signal?.reason);
  };
  const waiter: Deferred<T> = {
    resolve: value => {
      signal?.removeEventListener('abort', abort);
      deferred.resolve(value);
    },
    reject: error => {
      signal?.removeEventListener('abort', abort);
      deferred.reject(error);
    }
  };
  queue.push(waiter);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
};

/** 等某个事件的一组等待者；事件到来时全部放行，失败时全部拒绝。 */
export class EventGate {
  readonly #waiters: Array<Deferred<void>> = [];

  wait(): Promise<void> {
    return new Promise<void>((resolve, reject) => this.#waiters.push({ resolve, reject }));
  }

  open(): void {
    for (const waiter of this.#waiters.splice(0)) waiter.resolve();
  }

  fail(error: Error): void {
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error);
  }
}

/** 两个适配器共用的收件箱：先进先出、等待可取消、首个失败原因保留到底。 */
export class FrameInbox {
  readonly #queue: Uint8Array[] = [];
  readonly #waiters: Array<Deferred<Uint8Array>> = [];
  readonly #onOverflow: (error: Error) => void;
  #queuedBytes = 0;
  #failure: Error | undefined;

  get failure(): Error | undefined {
    return this.#failure;
  }

  constructor(onOverflow: (error: Error) => void) {
    this.#onOverflow = onOverflow;
  }

  push(frame: Uint8Array): void {
    if (this.#failure) return;
    const waiter = this.#waiters.shift();
    if (waiter) return waiter.resolve(frame);
    this.#queuedBytes += frame.byteLength;
    if (this.#queuedBytes > MAX_QUEUED_BYTES) return this.#onOverflow(new RangeError('P2P receive queue overflow'));
    this.#queue.push(frame);
  }

  fail(error: Error): void {
    this.#failure ??= error;
    this.#queue.length = 0;
    this.#queuedBytes = 0;
    for (const waiter of this.#waiters.splice(0)) waiter.reject(this.#failure);
  }

  receive(signal?: AbortSignal): Promise<Uint8Array> {
    const frame = this.#queue.shift();
    if (frame) {
      this.#queuedBytes -= frame.byteLength;
      return Promise.resolve(frame);
    }
    if (this.#failure) return Promise.reject(this.#failure);
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<Uint8Array>((resolve, reject) => enqueueAbortable(this.#waiters, { resolve, reject }, signal));
  }
}
