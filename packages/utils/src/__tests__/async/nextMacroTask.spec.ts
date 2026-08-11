import { describe, expect, it } from 'vitest';
import { nextMacroTask } from '../../async/nextMacroTask.js';
import { nextMicroTask } from '../../async/nextMicroTask.js';

describe('scheduler', () => {
  it('nextMacroTask', async () => {
    const calls: string[] = [];

    // 创建一个微任务标记
    const dummyThen = Promise.resolve().then(() => {
      calls.push('microtask');
    });

    const macroTaskFn = () => {
      calls.push('macroTask');
    };

    const syncFn = () => {
      calls.push('sync');
    };

    // 注册宏任务
    nextMacroTask(macroTaskFn);
    // 同步执行函数
    syncFn();

    // 初始状态应该只有同步函数被调用
    expect(calls.length).toBe(1);
    expect(calls[0]).toBe('sync');

    // 等待微任务执行
    await dummyThen;

    // 微任务执行后，宏任务还未执行
    expect(calls.length).toBe(2);
    expect(calls[1]).toBe('microtask');

    // 创建一个新的 Promise 来等待下一轮事件循环（宏任务执行）
    await new Promise(resolve => setTimeout(resolve, 0));

    // 宏任务应该已经执行
    expect(calls.length).toBe(3);
    expect(calls[2]).toBe('macroTask');
  });

  it('should execute multiple macro tasks in order', async () => {
    const calls: string[] = [];

    nextMacroTask(() => calls.push('task1'));
    nextMacroTask(() => calls.push('task2'));
    nextMacroTask(() => calls.push('task3'));

    // 等待所有宏任务执行
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(calls).toEqual(['task1', 'task2', 'task3']);
  });

  it('should execute macro task after micro task', async () => {
    const calls: string[] = [];

    nextMacroTask(() => calls.push('macro'));
    nextMicroTask(() => calls.push('micro'));

    // 等待微任务执行
    await Promise.resolve();
    expect(calls).toEqual(['micro']);

    // 等待宏任务执行
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(calls).toEqual(['micro', 'macro']);
  });
});
