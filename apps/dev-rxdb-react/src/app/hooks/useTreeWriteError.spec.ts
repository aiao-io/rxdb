import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTreeWriteError } from './useTreeWriteError';

describe('useTreeWriteError', () => {
  it('写入成功：返回值原样带回，错误状态保持为空', async () => {
    const { result } = renderHook(() => useTreeWriteError());

    let outcome: Awaited<ReturnType<typeof result.current.runWrite<number>>> | undefined;
    await act(async () => {
      outcome = await result.current.runWrite('新建', () => Promise.resolve(7));
    });

    expect(outcome).toEqual({ ok: true, value: 7 });
    expect(result.current.writeError).toBeNull();
  });

  it('写入失败：不抛出，错误文案按「<操作>失败：<消息>」写入状态', async () => {
    const { result } = renderHook(() => useTreeWriteError());

    let outcome: Awaited<ReturnType<typeof result.current.runWrite<void>>> | undefined;
    await act(async () => {
      outcome = await result.current.runWrite('批量添加', () => Promise.reject(new Error('磁盘已满')));
    });

    expect(outcome).toEqual({ ok: false });
    expect(result.current.writeError).toBe('批量添加失败：磁盘已满');
  });

  it('新一次写入开始时清掉上一次的错误；clearWriteError 手动清除', async () => {
    const { result } = renderHook(() => useTreeWriteError());
    await act(async () => {
      await result.current.runWrite('删除', () => Promise.reject(new Error('第一次')));
    });
    expect(result.current.writeError).toBe('删除失败：第一次');

    await act(async () => {
      await result.current.runWrite('删除', () => Promise.resolve());
    });
    expect(result.current.writeError).toBeNull();

    await act(async () => {
      await result.current.runWrite('重命名', () => Promise.reject(new Error('第二次')));
    });
    act(() => result.current.clearWriteError());
    expect(result.current.writeError).toBeNull();
  });
});
