import { AsyncQueueExecutor } from '@aiao/utils';
import { describe, expect, it } from 'vitest';
import { runRxDBBackupWhenQueued } from '../../backup/backup-queue.js';

const options = { timeoutMs: 50, label: 'review backup' };

describe('评审：备份队列任务失败边界', () => {
  it('同步抛错应拒绝外层 Promise，不能永久挂起', async () => {
    const queue = new AsyncQueueExecutor(1);
    const failure = new Error('synchronous backup failure');
    const pending = runRxDBBackupWhenQueued(
      queue,
      () => {
        throw failure;
      },
      options
    );
    const outcome = await Promise.race([
      pending.then(
        value => ({ kind: 'resolved', value }),
        (error: unknown) => ({ kind: 'rejected', error })
      ),
      new Promise<{ kind: 'unsettled' }>(resolve => setTimeout(() => resolve({ kind: 'unsettled' }), 100))
    ]);
    expect(outcome).toEqual({ kind: 'rejected', error: failure });
  });

  it('对照：Promise 拒绝可以传播', async () => {
    const failure = new Error('async backup failure');
    await expect(
      runRxDBBackupWhenQueued(new AsyncQueueExecutor(1), () => Promise.reject(failure), options)
    ).rejects.toBe(failure);
  });

  it('对照：正常 Promise 结果可以传播', async () => {
    await expect(runRxDBBackupWhenQueued(new AsyncQueueExecutor(1), () => Promise.resolve(7), options)).resolves.toBe(
      7
    );
  });
});
