/**
 * @fileoverview 可手动推进的虚拟时钟，供 conformance driver 与本包单测使用。
 *
 * @module @aiao/rxdb-devtools/testing/fake-clock
 */

import type { DevToolsCancelTimer, DevToolsClock } from '../v2/clock.js';

interface ScheduledTimer {
  readonly id: number;
  readonly dueAt: number;
  readonly handler: () => void;
}

/** 可手动推进的时钟。 */
export interface DevToolsFakeClock extends DevToolsClock {
  /**
   * 把虚拟时间向前推进 `ms` 毫秒，并按到期顺序触发全部到期回调。
   *
   * @remarks
   * 推进过程中**新登记**且落在本次窗口内的定时器同样会被触发——真实时间就是这么走的，
   * 少了这条，「超时回调里再起一个短定时器」这类实现会在测试里假绿。
   *
   * @param ms - 前进的毫秒数，必须是非负 safe integer。
   */
  advance(ms: number): void;

  /** 当前仍在等待的定时器数量；用于断言「终态后资源已释放」。 */
  pendingTimers(): number;
}

/** 先比到期时刻，再比登记顺序（id 升序）——同刻定时器必须按登记先后触发。 */
function isEarlier(candidate: ScheduledTimer, incumbent: ScheduledTimer): boolean {
  if (candidate.dueAt !== incumbent.dueAt) return candidate.dueAt < incumbent.dueAt;
  return candidate.id < incumbent.id;
}

/**
 * 创建一个虚拟时钟。
 *
 * @param startAt - 起始时刻，默认 0。
 * @returns 可手动推进的 {@link DevToolsFakeClock}。
 */
export function createFakeClock(startAt = 0): DevToolsFakeClock {
  let currentTime = startAt;
  let nextId = 1;
  let timers: ScheduledTimer[] = [];

  const setTimeoutImpl = (handler: () => void, delayMs: number): DevToolsCancelTimer => {
    if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
      throw new RangeError(`fake clock: delayMs must be a non-negative safe integer, got ${String(delayMs)}`);
    }
    const id = nextId++;
    timers.push({ id, dueAt: currentTime + delayMs, handler });
    return () => {
      timers = timers.filter(timer => timer.id !== id);
    };
  };

  /** 取出下一个在 `deadline` 之前到期的定时器；同刻按登记顺序（id 升序）。 */
  const takeNextDue = (deadline: number): ScheduledTimer | undefined => {
    let candidate: ScheduledTimer | undefined;
    for (const timer of timers) {
      if (timer.dueAt > deadline) continue;
      if (candidate === undefined || isEarlier(timer, candidate)) {
        candidate = timer;
      }
    }
    if (candidate !== undefined) {
      const taken = candidate;
      timers = timers.filter(timer => timer.id !== taken.id);
    }
    return candidate;
  };

  return {
    now: () => currentTime,
    setTimeout: setTimeoutImpl,
    advance(ms: number): void {
      if (!Number.isSafeInteger(ms) || ms < 0) {
        throw new RangeError(`fake clock: advance(ms) must be a non-negative safe integer, got ${String(ms)}`);
      }
      const deadline = currentTime + ms;
      let due = takeNextDue(deadline);
      while (due !== undefined) {
        currentTime = due.dueAt;
        due.handler();
        due = takeNextDue(deadline);
      }
      currentTime = deadline;
    },
    pendingTimers: () => timers.length
  };
}
