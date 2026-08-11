import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncQueueExecutor } from '../../async/AsyncQueueExecutor.js';

describe('AsyncQueueExecutor', () => {
  let executor: AsyncQueueExecutor;

  beforeEach(() => {
    executor = new AsyncQueueExecutor(2);
  });

  describe('构造函数', () => {
    it('应该创建一个具有指定最大并发数的执行器', () => {
      const status = executor.getStatus();
      expect(status.maxConcurrent).toBe(2);
      expect(status.running).toBe(0);
      expect(status.queued).toBe(0);
    });

    it('应该使用默认值 3 作为最大并发数', () => {
      const defaultExecutor = new AsyncQueueExecutor();
      expect(defaultExecutor.getStatus().maxConcurrent).toBe(3);
    });
  });

  describe('addTask', () => {
    it('应该执行单个任务并返回结果', async () => {
      const task = vi.fn(() => Promise.resolve('success'));
      const result = await executor.addTask(task);

      expect(result).toBe('success');
      expect(task).toHaveBeenCalledOnce();
    });

    it('应该按顺序执行任务', async () => {
      const executionOrder: number[] = [];

      const task1 = () =>
        new Promise<void>(resolve => {
          setTimeout(() => {
            executionOrder.push(1);
            resolve();
          }, 100);
        });

      const task2 = () =>
        new Promise<void>(resolve => {
          setTimeout(() => {
            executionOrder.push(2);
            resolve();
          }, 0);
        });

      const task3 = () =>
        new Promise<void>(resolve => {
          setTimeout(() => {
            executionOrder.push(3);
            resolve();
          }, 10);
        });

      await Promise.all([executor.addTask(task1), executor.addTask(task2), executor.addTask(task3)]);

      // 任务 1 和 2 先开始（并发数为 2），任务 3 等待
      // 任务 2 最先完成，然后任务 3 开始，最后任务 1 完成
      expect(executionOrder).toEqual([2, 3, 1]);
    });

    it('应该处理任务中的错误', async () => {
      const error = new Error('Task failed');
      const task = () => Promise.reject(error);

      await expect(executor.addTask(task)).rejects.toThrow('Task failed');
    });

    it('应该在错误后继续执行其他任务', async () => {
      const task1 = () => Promise.reject(new Error('Failed'));
      const task2 = vi.fn(() => Promise.resolve('success'));

      await expect(executor.addTask(task1)).rejects.toThrow('Failed');
      const result = await executor.addTask(task2);

      expect(result).toBe('success');
      expect(task2).toHaveBeenCalledOnce();
    });
  });

  describe('并发控制', () => {
    it('应该限制并发执行的任务数量', async () => {
      let runningCount = 0;
      let maxRunning = 0;

      const createTask = (delay: number) => () => {
        return new Promise<void>(resolve => {
          runningCount++;
          maxRunning = Math.max(maxRunning, runningCount);

          setTimeout(() => {
            runningCount--;
            resolve();
          }, delay);
        });
      };

      await Promise.all([
        executor.addTask(createTask(50)),
        executor.addTask(createTask(50)),
        executor.addTask(createTask(50)),
        executor.addTask(createTask(50))
      ]);

      expect(maxRunning).toBe(2); // 最大并发数为 2
    });

    it('应该在任务完成后自动执行队列中的下一个任务', async () => {
      const executionLog: string[] = [];
      const createTask = (id: string, delay: number) => () => {
        executionLog.push(`start-${id}`);
        return new Promise<void>(resolve => {
          setTimeout(() => {
            executionLog.push(`end-${id}`);
            resolve();
          }, delay);
        });
      };

      const promises = [
        executor.addTask(createTask('1', 100)),
        executor.addTask(createTask('2', 50)),
        executor.addTask(createTask('3', 1))
      ];

      await Promise.all(promises);

      // 任务 1 和 2 先开始，任务 2 先结束后任务 3 开始
      expect(executionLog).toEqual(['start-1', 'start-2', 'end-2', 'start-3', 'end-3', 'end-1']);
    });
  });

  describe('getStatus', () => {
    it('应该返回正确的执行器状态', async () => {
      const longTask = () => new Promise(resolve => setTimeout(resolve, 100));

      executor.addTask(longTask);
      executor.addTask(longTask);
      executor.addTask(longTask);

      // 等待一小段时间让任务开始执行
      await new Promise(resolve => setTimeout(resolve, 10));

      const status = executor.getStatus();
      expect(status.running).toBe(2); // 2 个任务正在运行
      expect(status.queued).toBe(1); // 1 个任务在队列中
      expect(status.maxConcurrent).toBe(2);
    });
  });

  describe('setMaxConcurrent', () => {
    it('应该动态修改最大并发数', () => {
      executor.setMaxConcurrent(5);
      expect(executor.getStatus().maxConcurrent).toBe(5);
    });

    it('增加并发数时应该立即执行更多任务', async () => {
      let runningCount = 0;
      let maxRunning = 0;

      const createTask = () => () => {
        return new Promise<void>(resolve => {
          runningCount++;
          maxRunning = Math.max(maxRunning, runningCount);

          setTimeout(() => {
            runningCount--;
            resolve();
          }, 100);
        });
      };

      // 添加 5 个任务
      executor.addTask(createTask());
      executor.addTask(createTask());
      executor.addTask(createTask());
      executor.addTask(createTask());
      const lastTask = executor.addTask(createTask());

      // 等待一下让前 2 个任务开始
      await new Promise(resolve => setTimeout(resolve, 10));

      // 增加并发数到 5
      executor.setMaxConcurrent(5);

      await lastTask;

      expect(maxRunning).toBeGreaterThan(2);
    });
  });

  describe('clearQueue', () => {
    it('应该清空队列并拒绝所有等待的任务', async () => {
      const longTask = () => new Promise(resolve => setTimeout(resolve, 100));
      const quickTask = () => Promise.resolve('quick');

      // 填满执行器
      executor.addTask(longTask);
      executor.addTask(longTask);

      // 添加队列中的任务
      const queuedTask1 = executor.addTask(quickTask);
      const queuedTask2 = executor.addTask(quickTask);

      executor.clearQueue();

      await expect(queuedTask1).rejects.toThrow('Task cancelled: queue cleared');
      await expect(queuedTask2).rejects.toThrow('Task cancelled: queue cleared');

      expect(executor.getStatus().queued).toBe(0);
    });

    it('不应该影响正在执行的任务', async () => {
      const runningTask = vi.fn(() => new Promise(resolve => setTimeout(() => resolve('done'), 50)));
      const queuedTask = () => Promise.resolve('queued');

      const runningPromise = executor.addTask(runningTask);
      executor.addTask(runningTask);
      const queuedPromise = executor.addTask(queuedTask);

      executor.clearQueue();

      await expect(queuedPromise).rejects.toThrow('Task cancelled: queue cleared');

      const result = await runningPromise;
      expect(result).toBe('done');
      expect(runningTask).toHaveBeenCalled();
    });
  });

  describe('waitForAll', () => {
    it('应该等待所有任务完成', async () => {
      const completed: number[] = [];

      const createTask = (id: number, delay: number) => () => {
        return new Promise<void>(resolve => {
          setTimeout(() => {
            completed.push(id);
            resolve();
          }, delay);
        });
      };

      executor.addTask(createTask(1, 50));
      executor.addTask(createTask(2, 100));
      executor.addTask(createTask(3, 30));

      await executor.waitForAll();

      expect(completed).toHaveLength(3);
      expect(completed).toContain(1);
      expect(completed).toContain(2);
      expect(completed).toContain(3);
    });

    it('当没有任务时应该立即完成', async () => {
      const startTime = Date.now();
      await executor.waitForAll();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
    });
  });

  describe('getRunningCount 和 getQueuedCount', () => {
    it('应该返回正确的运行和队列计数', async () => {
      const longTask = () => new Promise(resolve => setTimeout(resolve, 100));

      executor.addTask(longTask);
      executor.addTask(longTask);
      executor.addTask(longTask);
      executor.addTask(longTask);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(executor.getRunningCount()).toBe(2);
      expect(executor.getQueuedCount()).toBe(2);
    });
  });
});

describe('边界条件', () => {
  it.each([0, ''] as const)('应该对 id=%j 的任务去重', async id => {
    const localExecutor = new AsyncQueueExecutor(2);
    let release!: (value: string) => void;
    const task = vi.fn(
      () =>
        new Promise<string>(resolve => {
          release = resolve;
        })
    );

    const first = localExecutor.addTask(task, id);
    const second = localExecutor.addTask(task, id);

    expect(second).toBe(first);
    expect(task).toHaveBeenCalledOnce();
    release('done');
    await expect(first).resolves.toBe('done');
  });

  it('应该拒绝非正整数并发数', () => {
    expect(() => new AsyncQueueExecutor(0)).toThrow(RangeError);
    expect(() => new AsyncQueueExecutor(-1)).toThrow(RangeError);
    expect(() => new AsyncQueueExecutor(1.5)).toThrow(RangeError);
    expect(() => new AsyncQueueExecutor().setMaxConcurrent(-1)).toThrow(RangeError);
  });

  it('清空等待队列后仍应复用运行中任务的 id', async () => {
    const single = new AsyncQueueExecutor(1);
    let release!: (value: string) => void;
    const runningTask = vi.fn(
      () =>
        new Promise<string>(resolve => {
          release = resolve;
        })
    );
    const running = single.addTask(runningTask, 'running');
    const queuedTask = single.addTask(() => 'queued', 'queued');
    const queuedExpectation = expect(queuedTask).rejects.toThrow('Task cancelled: queue cleared');

    await Promise.resolve();
    single.clearQueue();
    const duplicate = single.addTask(runningTask, 'running');

    await queuedExpectation;
    expect(duplicate).toBe(running);
    expect(runningTask).toHaveBeenCalledOnce();
    release('done');
    await expect(running).resolves.toBe('done');
  });
});
