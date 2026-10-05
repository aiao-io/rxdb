import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeError, logFailure, logStep } from '../debug-log';

function errorWith(message: string, stack: string, cause?: unknown): Error {
  const error = new Error(message);
  error.stack = stack;
  if (cause !== undefined) Object.defineProperty(error, 'cause', { value: cause });
  return error;
}

describe('describeError', () => {
  it('带出 stack，并沿 cause 链逐层展开', () => {
    const root = errorWith('磁盘满', 'Error: 磁盘满\n    at write');
    const error = errorWith('连接失败', 'RxDBError: 连接失败\n    at connect', root);

    expect(describeError(error)).toBe(
      ['RxDBError: 连接失败\n    at connect', 'Caused by: Error: 磁盘满\n    at write'].join('\n')
    );
  });

  it('stack 为空时退成「名字: 消息」；非 Error 的值原样转字符串', () => {
    const error = errorWith('没有栈', '', { errMsg: 'fail' });

    expect(describeError(error)).toBe('Error: 没有栈\nCaused by: [object Object]');
    expect(describeError('裸字符串')).toBe('裸字符串');
  });

  it('cause 成环时只展开一次', () => {
    const error = errorWith('环', 'Error: 环');
    Object.defineProperty(error, 'cause', { value: error });

    expect(describeError(error)).toBe('Error: 环');
  });
});

describe('控制台输出', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logStep 用 info 打带前缀的步骤名', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logStep('加载 RxDB');

    expect(info).toHaveBeenCalledWith('[dev-rxdb-miniprogram] 加载 RxDB');
  });

  it('logFailure 用 error 打展开后的文本，并附上原始错误对象', () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = errorWith('坏了', 'Error: 坏了\n    at here');

    logFailure('初始化', error);

    expect(errorLog).toHaveBeenCalledWith('[dev-rxdb-miniprogram] 初始化失败\nError: 坏了\n    at here', error);
  });
});
