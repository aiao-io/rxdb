import { describe, expect, it, vi } from 'vitest';
import { ResourceScheduler } from './resource-scheduler.js';

function work() {
  let finish: () => void = () => undefined;
  const run = vi.fn(
    (signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        finish = resolve;
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      })
  );
  return { run, finish: () => finish() };
}
const turn = () => new Promise<void>(resolve => queueMicrotask(resolve));

describe('DESKTOP-US-307 前台优先资源调度', () => {
  it('后台并发至多二；同一指纹只执行一次，所有调用共享结果', async () => {
    const scheduler = new ResourceScheduler();
    const jobs = [work(), work(), work()];
    const first = scheduler.enqueue('one', 'background', jobs[0].run);
    const duplicate = scheduler.enqueue('one', 'background', jobs[0].run);
    const second = scheduler.enqueue('two', 'background', jobs[1].run);
    const third = scheduler.enqueue('three', 'background', jobs[2].run);
    expect(jobs.map(job => job.run.mock.calls.length)).toEqual([1, 1, 0]);
    expect(new Set(scheduler.keys())).toEqual(new Set(['one', 'two', 'three']));
    jobs[0].finish();
    await Promise.all([first, duplicate]);
    await turn();
    expect(jobs[2].run).toHaveBeenCalledTimes(1);
    jobs[1].finish();
    jobs[2].finish();
    await Promise.all([second, third]);
    expect(scheduler.keys()).toEqual([]);
  });
  it('前台立即抢占纯后台任务，后台随后重排继续', async () => {
    const scheduler = new ResourceScheduler();
    const background = [work(), work()];
    const foreground = work();
    const pending = background.map((job, index) => scheduler.enqueue(`background-${index}`, 'background', job.run));
    const urgent = scheduler.enqueue('foreground', 'foreground', foreground.run);
    await turn();
    await turn();
    expect(foreground.run).toHaveBeenCalledTimes(1);
    expect(background.some(job => job.run.mock.calls[0][0].aborted)).toBe(true);
    foreground.finish();
    await urgent;
    await turn();
    for (const job of background) job.finish();
    await Promise.all(pending);
    expect(background.reduce((sum, job) => sum + job.run.mock.calls.length, 0)).toBe(3);
  });
  it('同版本前台加入时提升现有任务，取消后台调用不影响前台', async () => {
    const scheduler = new ResourceScheduler();
    const job = work();
    const abort = new AbortController();
    const background = scheduler.enqueue('one', 'background', job.run, abort.signal);
    const rejected = expect(background).rejects.toThrow('CANCELLED');
    const foreground = scheduler.enqueue('one', 'foreground', job.run);
    abort.abort();
    await rejected;
    expect(job.run).toHaveBeenCalledTimes(1);
    expect(job.run.mock.calls[0][0].aborted).toBe(false);
    job.finish();
    await foreground;
    expect(scheduler.keys()).toEqual([]);
  });
  it('取消排队和最后一个运行请求后均移除任务；失败允许重试', async () => {
    const scheduler = new ResourceScheduler(1);
    const running = work();
    const queued = work();
    const controller = new AbortController();
    const one = scheduler.enqueue('one', 'background', running.run, controller.signal);
    const two = scheduler.enqueue('two', 'background', queued.run, controller.signal);
    const rejected = Promise.all([expect(one).rejects.toThrow('CANCELLED'), expect(two).rejects.toThrow('CANCELLED')]);
    controller.abort();
    await rejected;
    await turn();
    expect(queued.run).not.toHaveBeenCalled();
    expect(scheduler.keys()).toEqual([]);
    await expect(
      scheduler.enqueue('one', 'foreground', async () => {
        throw new Error('OFFLINE');
      })
    ).rejects.toThrow('OFFLINE');
    await expect(scheduler.enqueue('one', 'foreground', async () => undefined)).resolves.toBeUndefined();
  });
});
