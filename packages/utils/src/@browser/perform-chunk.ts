/**
 * `requestIdleCallback` 自带 fallback：
 * Safari/Webkit < 18.4 不暴露此 API，降级到 setTimeout 模拟空闲调度。
 *
 * 用于保持 performChunk 跨浏览器（chromium / firefox / webkit）一致行为。
 */
const scheduleIdle = (cb: (idle: { timeRemaining: () => number; didTimeout: boolean }) => void): number => {
  if (typeof requestIdleCallback === 'function') {
    // timeout 兜底：主线程持续繁忙（如 CI 并行 worker 抢占）时，
    // 浏览器可能长时间不判定为 idle，导致回调无限期延迟；显式 timeout 保证最坏情况下的响应上限。
    return requestIdleCallback(cb, { timeout: 100 });
  }
  const start = Date.now();
  return setTimeout(
    () => cb({ didTimeout: false, timeRemaining: () => Math.max(0, 50 - (Date.now() - start)) }),
    0
  ) as unknown as number;
};

/** {@link performChunk} 的控制句柄。 */
export interface PerformChunkHandle {
  /** 停止后续分片；已消费的项不会回滚。 */
  cancel(): void;
  /** 全部消费完成后 resolve；`consumer` 抛错时 reject，取消时也 resolve。 */
  done: Promise<void>;
}

/**
 * 分片执行任务
 * 只能在浏览器环境中执行
 * 把一个大任务分片执行，每次执行一小部分任务，然后让出主线程，等待下一次执行
 *
 * @template T - 数组元素类型
 * @param array - 要执行的数据组
 * @param consumer - 消费者函数
 * @returns 取消句柄与完成 Promise
 * @example
 * performChunk([1, 2, 3, 4, 5], (item, index) => {
 *   console.log(`Processing item ${item} at index ${index}`);
 * });
 *
 * @remarks
 * UTL-003 修复了三件事：
 *
 * 1. **零预算空转**：原循环条件是 `idle.timeRemaining() > 0 && i < array.length`，
 *    全文没有读过 `didTimeout`。浏览器在 `{ timeout: 100 }` 到期时会以
 *    `didTimeout: true` + `timeRemaining() === 0` 回调 —— 那正是「主线程一直很忙、
 *    必须强制推进」的信号，而原实现在这一帧**一项都不消费**就重排下一帧。
 *    主线程持续繁忙时它会一直空转（实测：4 帧调度、0 项消费）。
 *    文件顶部的注释还写着「显式 timeout 保证最坏情况下的响应上限」——
 *    **实现与自己的注释相反**。改成 do-while：每帧**至少消费一项**。
 * 2. **错误无通道**：`consumer` 抛出的错误会直接逃逸到 idle callback，
 *    变成一条无人接管的全局错误，且剩余分片仍会继续排。现在错误进 `done`，并停止调度。
 * 3. **无法取消**：长任务一旦启动就跑到底。现在返回 `cancel()`。
 *
 * 返回值是**新增**的，原有 `performChunk(...)` 的调用点无需改动。
 */
export function performChunk<T>(array: T[], consumer: (data: T, index: number) => void): PerformChunkHandle {
  let cancelled = false;
  let settle: () => void = () => undefined;
  let fail: (error: unknown) => void = () => undefined;
  const done = new Promise<void>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  if (array.length === 0) {
    settle();
    return { cancel: () => undefined, done };
  }

  let i = 0;
  function _run() {
    if (cancelled) return settle();
    if (i >= array.length) return settle();
    scheduleIdle(idle => {
      if (cancelled) return settle();
      try {
        // do-while：**先消费再看预算**。零预算或 didTimeout 的那一帧也保证推进一项，
        // 否则繁忙主线程下会无限空转（见 @remarks 第 1 条）。
        do {
          consumer(array[i], i);
          i++;
        } while (!cancelled && idle.timeRemaining() > 0 && i < array.length);
      } catch (error) {
        fail(error);
        return;
      }
      _run();
    });
  }
  _run();

  return {
    cancel: () => {
      cancelled = true;
    },
    done
  };
}
