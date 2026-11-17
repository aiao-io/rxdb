import type { DesktopRestoreRequest } from './desktop-restore.worker';

/** 一个任务一个 Worker；关闭、失败和超时均终止子 Worker，外层日志负责恢复清理。 */
export function runRestoreWorker(worker: Worker, request: DesktopRestoreRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error?: unknown): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error('Restore timed out. Your current desktop data is unchanged.')),
      120_000
    );
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      const reply = event.data as { ok?: unknown; message?: unknown } | null;
      if (reply?.ok === true) finish();
      else
        finish(
          new Error(
            typeof reply?.message === 'string' ? reply.message : 'The restore worker returned an invalid result.'
          )
        );
    });
    worker.addEventListener('error', event => {
      event.preventDefault();
      finish(new Error(event.message || 'The restore worker failed.'));
    });
    worker.addEventListener('messageerror', () => finish(new Error('The restore worker could not read its message.')));
    try {
      worker.postMessage(request);
    } catch (error) {
      finish(error);
    }
  });
}
