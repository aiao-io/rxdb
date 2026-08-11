import { describe, expect, it } from 'vitest';

import { PathLockManager } from '../path-lock.js';

type TestLockCallback = (lock: Lock | null) => unknown | PromiseLike<unknown>;
type TestLockRequest = {
  mode: LockMode;
  callback: TestLockCallback;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

/** 只实现本包用到的 shared/exclusive 排队语义，避免 Node 测试依赖浏览器全局对象。 */
class TestWebLocks {
  readonly #queues = new Map<string, TestLockRequest[]>();
  readonly #active = new Map<string, { shared: number; exclusive: boolean }>();

  request(
    name: string,
    optionsOrCallback: LockOptions | TestLockCallback,
    callback?: TestLockCallback
  ): Promise<unknown> {
    const options = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback;
    const granted = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
    if (!granted) return Promise.reject(new Error('Lock callback is required'));

    return new Promise((resolve, reject) => {
      const queue = this.#queues.get(name) ?? [];
      queue.push({
        mode: options?.mode ?? 'exclusive',
        callback: granted,
        resolve,
        reject
      });
      this.#queues.set(name, queue);
      this.drain(name);
    });
  }

  private drain(name: string): void {
    const queue = this.#queues.get(name);
    if (!queue?.length) return;
    const active = this.#active.get(name) ?? { shared: 0, exclusive: false };
    this.#active.set(name, active);
    if (active.exclusive) return;

    if (active.shared > 0) {
      while (queue[0]?.mode === 'shared') this.start(name, queue.shift()!, active);
      return;
    }

    const first = queue.shift()!;
    this.start(name, first, active);
    while (first.mode === 'shared' && queue[0]?.mode === 'shared') {
      this.start(name, queue.shift()!, active);
    }
  }

  private start(name: string, request: TestLockRequest, active: { shared: number; exclusive: boolean }): void {
    if (request.mode === 'shared') active.shared += 1;
    else active.exclusive = true;

    void Promise.resolve()
      .then(() => request.callback(null))
      .then(request.resolve, request.reject)
      .finally(() => {
        if (request.mode === 'shared') active.shared -= 1;
        else active.exclusive = false;
        this.drain(name);
      });
  }
}

const createCrossContextLocks = (scope: string, webLocks: TestWebLocks): PathLockManager =>
  new PathLockManager(scope, webLocks as unknown as Pick<LockManager, 'request'>);

/** 造一个可外部释放的任务，用于精确编排交错顺序。 */
const deferredTask = (log: string[], label: string) => {
  let release!: () => void;
  const released = new Promise<void>(resolve => {
    release = resolve;
  });
  const run = async (): Promise<string> => {
    log.push(`${label}:start`);
    await released;
    log.push(`${label}:end`);
    return label;
  };
  return { release, run };
};

describe('PathLockManager', () => {
  it('serializes operations that share a path', async () => {
    const locks = new PathLockManager();
    const log: string[] = [];
    const first = deferredTask(log, 'first');
    const second = deferredTask(log, 'second');

    const firstPromise = locks.withPaths(['a.txt'], first.run);
    const secondPromise = locks.withPaths(['a.txt'], second.run);

    await new Promise(resolve => setTimeout(resolve, 0));
    // 第二个即使已经排队，也不得在第一个 settle 前进入临界区
    expect(log).toEqual(['first:start']);

    first.release();
    second.release();
    await Promise.all([firstPromise, secondPromise]);

    expect(log).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('runs operations on disjoint paths concurrently', async () => {
    const locks = new PathLockManager();
    const log: string[] = [];
    const left = deferredTask(log, 'left');
    const right = deferredTask(log, 'right');

    const leftPromise = locks.withPaths(['a.txt'], left.run);
    const rightPromise = locks.withPaths(['b.txt'], right.run);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(log).toEqual(['left:start', 'right:start']);

    left.release();
    right.release();
    await Promise.all([leftPromise, rightPromise]);
  });

  // rename 同时持有 source 与 target：任一路径被别人占用都必须等待。
  it('waits for every requested path before entering', async () => {
    const locks = new PathLockManager();
    const log: string[] = [];
    const holder = deferredTask(log, 'holder');
    const both = deferredTask(log, 'both');

    const holderPromise = locks.withPaths(['b.txt'], holder.run);
    const bothPromise = locks.withPaths(['a.txt', 'b.txt'], both.run);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(log).toEqual(['holder:start']);

    holder.release();
    both.release();
    await Promise.all([holderPromise, bothPromise]);
    expect(log).toEqual(['holder:start', 'holder:end', 'both:start', 'both:end']);
  });

  // 无死锁：两个操作请求的公共路径顺序一致（内部排序），交叉请求不会成环。
  it('does not deadlock on crossed multi-path requests', async () => {
    const locks = new PathLockManager();
    const order: string[] = [];

    await Promise.all([
      locks.withPaths(['a.txt', 'b.txt'], async () => {
        order.push('ab');
      }),
      locks.withPaths(['b.txt', 'a.txt'], async () => {
        order.push('ba');
      })
    ]);

    expect(order).toHaveLength(2);
  });

  it('does not let a failed operation reject the queued successor', async () => {
    const locks = new PathLockManager();
    const failure = new Error('boom');

    const failed = locks.withPaths(['a.txt'], () => Promise.reject(failure));
    const next = locks.withPaths(['a.txt'], () => Promise.resolve('ok'));

    await expect(failed).rejects.toBe(failure);
    await expect(next).resolves.toBe('ok');
  });

  it('excludes path operations while an exclusive operation runs', async () => {
    const locks = new PathLockManager();
    const log: string[] = [];
    const pathOp = deferredTask(log, 'path');
    const exclusive = deferredTask(log, 'exclusive');

    const pathPromise = locks.withPaths(['a.txt'], pathOp.run);
    const exclusivePromise = locks.withExclusive(exclusive.run);
    // 独占之后才登记的路径操作必须排在独占后面
    const laterLog: string[] = [];
    const later = locks.withPaths(['z.txt'], async () => {
      laterLog.push('later');
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    // 独占要等已登记的路径操作排空，后来者则被闸门挡住
    expect(log).toEqual(['path:start']);
    expect(laterLog).toEqual([]);

    pathOp.release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(log).toEqual(['path:start', 'path:end', 'exclusive:start']);
    expect(laterLog).toEqual([]);

    exclusive.release();
    await Promise.all([pathPromise, exclusivePromise, later]);
    expect(laterLog).toEqual(['later']);
  });

  it('releases the exclusive gate even when the operation throws', async () => {
    const locks = new PathLockManager();
    const failure = new Error('exclusive boom');

    await expect(locks.withExclusive(() => Promise.reject(failure))).rejects.toBe(failure);
    await expect(locks.withPaths(['a.txt'], () => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  // 队列排空后表项被清掉，因此一个「全新路径」和一个「刚用过的路径」行为完全一致：
  // 后者不应残留一个已 settle 的尾指针而多等一轮。
  it('reuses a drained path without carrying over its previous tail', async () => {
    const locks = new PathLockManager();

    await locks.withPaths(['a.txt'], () => Promise.resolve('first'));
    await new Promise(resolve => setTimeout(resolve, 0));

    const log: string[] = [];
    await Promise.all([
      locks.withPaths(['a.txt'], async () => {
        log.push('reused');
      }),
      locks.withPaths(['fresh.txt'], async () => {
        log.push('fresh');
      })
    ]);

    expect(log.sort()).toEqual(['fresh', 'reused']);
  });

  it('serializes the same path across manager instances through Web Locks', async () => {
    const webLocks = new TestWebLocks();
    const firstManager = createCrossContextLocks('storage:test', webLocks);
    const secondManager = createCrossContextLocks('storage:test', webLocks);
    const log: string[] = [];
    const first = deferredTask(log, 'first');
    const second = deferredTask(log, 'second');

    const firstPromise = firstManager.withPaths(['shared.txt'], first.run);
    const secondPromise = secondManager.withPaths(['shared.txt'], second.run);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(log).toEqual(['first:start']);

    first.release();
    second.release();
    await Promise.all([firstPromise, secondPromise]);
    expect(log).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('keeps disjoint paths concurrent across manager instances', async () => {
    const webLocks = new TestWebLocks();
    const firstManager = createCrossContextLocks('storage:test', webLocks);
    const secondManager = createCrossContextLocks('storage:test', webLocks);
    const log: string[] = [];
    const first = deferredTask(log, 'first');
    const second = deferredTask(log, 'second');

    const firstPromise = firstManager.withPaths(['first.txt'], first.run);
    const secondPromise = secondManager.withPaths(['second.txt'], second.run);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(log).toEqual(['first:start', 'second:start']);

    first.release();
    second.release();
    await Promise.all([firstPromise, secondPromise]);
  });

  it('uses the Web Locks gate to exclude every other manager during directory operations', async () => {
    const webLocks = new TestWebLocks();
    const pathManager = createCrossContextLocks('storage:test', webLocks);
    const exclusiveManager = createCrossContextLocks('storage:test', webLocks);
    const laterManager = createCrossContextLocks('storage:test', webLocks);
    const log: string[] = [];
    const path = deferredTask(log, 'path');
    const exclusive = deferredTask(log, 'exclusive');

    const pathPromise = pathManager.withPaths(['active.txt'], path.run);
    const exclusivePromise = exclusiveManager.withExclusive(exclusive.run);
    const laterPromise = laterManager.withPaths(['later.txt'], async () => {
      log.push('later');
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(log).toEqual(['path:start']);

    path.release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(log).toEqual(['path:start', 'path:end', 'exclusive:start']);

    exclusive.release();
    await Promise.all([pathPromise, exclusivePromise, laterPromise]);
    expect(log).toEqual(['path:start', 'path:end', 'exclusive:start', 'exclusive:end', 'later']);
  });
});
