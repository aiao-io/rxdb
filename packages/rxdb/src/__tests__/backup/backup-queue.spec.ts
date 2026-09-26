/**
 * @fileoverview US-217 备份排队：只有排队段受超时与取消控制，放弃后轮到时跳过任务。
 */

import { AsyncQueueExecutor } from '@aiao/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRxDBBackupError } from '../../backup/backup-error.js';
import { runRxDBBackupWhenQueued } from '../../backup/backup-queue.js';

const gate = (): { promise: Promise<void>; open: () => void } => {
  let open!: () => void;
  const promise = new Promise<void>(resolve => (open = resolve));
  return { promise, open };
};

describe('runRxDBBackupWhenQueued', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('队列空闲时直接执行并返回结果', async () => {
    const queue = new AsyncQueueExecutor(1);
    await expect(
      runRxDBBackupWhenQueued(queue, async () => 7, { timeoutMs: 1000, label: 'Test backup' })
    ).resolves.toBe(7);
  });

  it('任务自身的失败原样抛出', async () => {
    const queue = new AsyncQueueExecutor(1);
    const failure = new Error('boom');
    await expect(
      runRxDBBackupWhenQueued(queue, () => Promise.reject(failure), { timeoutMs: 1000, label: 'Test backup' })
    ).rejects.toBe(failure);
  });

  it('排队超时报 lock_timeout，轮到时跳过任务', async () => {
    vi.useFakeTimers();
    const queue = new AsyncQueueExecutor(1);
    const blocker = gate();
    void queue.addTask(() => blocker.promise);
    const task = vi.fn(async () => 1);
    const pending = runRxDBBackupWhenQueued(queue, task, { timeoutMs: 50, label: 'Test backup' });
    const settled = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(50);
    const error = await settled;
    expect(isRxDBBackupError(error, 'lock_timeout')).toBe(true);
    expect((error as { details: unknown }).details).toEqual({ field: 'lockTimeoutMs', expected: 50 });
    expect((error as Error).message).toContain('Test backup');
    blocker.open();
    await queue.waitForAll();
    expect(task).not.toHaveBeenCalled();
  });

  it('排队中取消报 aborted 并带上原因，轮到时跳过任务', async () => {
    const queue = new AsyncQueueExecutor(1);
    const blocker = gate();
    void queue.addTask(() => blocker.promise);
    const task = vi.fn(async () => 1);
    const controller = new AbortController();
    const pending = runRxDBBackupWhenQueued(queue, task, {
      signal: controller.signal,
      timeoutMs: 10_000,
      label: 'Test backup'
    });
    const reason = new Error('user');
    controller.abort(reason);
    const error = await pending.catch((caught: unknown) => caught);
    expect(isRxDBBackupError(error, 'aborted')).toBe(true);
    expect((error as Error).cause).toBe(reason);
    blocker.open();
    await queue.waitForAll();
    expect(task).not.toHaveBeenCalled();
  });

  it('已取消的信号在入队前就报 aborted', async () => {
    const queue = new AsyncQueueExecutor(1);
    const task = vi.fn(async () => 1);
    const error = await runRxDBBackupWhenQueued(queue, task, {
      signal: AbortSignal.abort(),
      timeoutMs: 1000,
      label: 'Test backup'
    }).catch((caught: unknown) => caught);
    expect(isRxDBBackupError(error, 'aborted')).toBe(true);
    await queue.waitForAll();
    expect(task).not.toHaveBeenCalled();
  });

  it('任务开始后超时与取消都不再生效', async () => {
    vi.useFakeTimers();
    const queue = new AsyncQueueExecutor(1);
    const running = gate();
    const controller = new AbortController();
    const pending = runRxDBBackupWhenQueued(
      queue,
      async () => {
        await running.promise;
        return 'done';
      },
      { signal: controller.signal, timeoutMs: 10, label: 'Test backup' }
    );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);
    running.open();
    await expect(pending).resolves.toBe('done');
  });
});
