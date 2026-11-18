import { describe, expect, it, vi } from 'vitest';

import { runRestoreWorker } from './desktop-restore-client';

const request = { generation: 'abcdef123456', baseHref: '/' };

function fakeWorker() {
  const listeners = new Map<string, (event: MessageEvent | ErrorEvent) => void>();
  const worker = {
    addEventListener: (type: string, listener: (event: MessageEvent | ErrorEvent) => void) => {
      listeners.set(type, listener);
    },
    postMessage: vi.fn(),
    terminate: vi.fn()
  };
  return { worker: worker as unknown as Worker, listeners, terminate: worker.terminate };
}

describe('恢复 Worker 生命周期', () => {
  it('只在成功答复后完成，所有终态释放 Worker', async () => {
    const { worker, listeners, terminate } = fakeWorker();
    const task = runRestoreWorker(worker, request);
    expect(worker.postMessage).toHaveBeenCalledWith(request);
    listeners.get('message')?.({ data: { ok: true } } as MessageEvent);
    await task;
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('恢复异常、启动错误和非法答复都拒绝，不能误报完成', async () => {
    for (const type of ['failure', 'error', 'invalid', 'postMessage']) {
      const { worker, listeners, terminate } = fakeWorker();
      if (type === 'postMessage')
        vi.mocked(worker.postMessage).mockImplementation(() => {
          throw new Error('clone failed');
        });
      const task = runRestoreWorker(worker, request);
      if (type === 'error')
        listeners.get('error')?.({ message: 'Worker failed', preventDefault: vi.fn() } as unknown as ErrorEvent);
      if (type === 'failure') listeners.get('message')?.({ data: { ok: false, message: 'quota' } } as MessageEvent);
      if (type === 'invalid') listeners.get('message')?.({ data: {} } as MessageEvent);
      await expect(task).rejects.toThrow();
      expect(terminate).toHaveBeenCalledOnce();
    }
  });

  it('没有答复时中止并保留外层恢复日志', async () => {
    vi.useFakeTimers();
    try {
      const { worker, terminate } = fakeWorker();
      const failure = expect(runRestoreWorker(worker, request)).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(120_000);
      await failure;
      expect(terminate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
