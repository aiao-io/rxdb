import { describe, expect, it } from 'vitest';

import { withTemporaryValue } from '../../encrypted/temporary-value.js';

describe('withTemporaryValue', () => {
  it('restores the original value after the verification resolves', async () => {
    let value = 'original';
    const writes: string[] = [];

    const result = await withTemporaryValue(
      async () => value,
      async next => {
        value = next;
        writes.push(next);
      },
      'tampered',
      async () => {
        expect(value).toBe('tampered');
        return 'verified';
      }
    );

    expect(result).toBe('verified');
    expect(value).toBe('original');
    expect(writes).toEqual(['tampered', 'original']);
  });

  it('restores the original value after the verification rejects', async () => {
    let value = 'original';
    const writes: string[] = [];

    await expect(
      withTemporaryValue(
        async () => value,
        async next => {
          value = next;
          writes.push(next);
        },
        'tampered',
        async () => {
          expect(value).toBe('tampered');
          throw new Error('verification failed');
        }
      )
    ).rejects.toThrow('verification failed');

    expect(value).toBe('original');
    expect(writes).toEqual(['tampered', 'original']);
  });

  // RXT-021：篡改写入本身「先落库、再 reject」时（响应解析失败 / 连接中断），
  // 若 write 在 try 之外，restore 永远不会执行，篡改值会留在库里污染后续用例。
  it('restores the original value when the tampering write rejects after mutating', async () => {
    let value = 'original';
    const writes: string[] = [];

    await expect(
      withTemporaryValue(
        async () => value,
        async next => {
          value = next;
          writes.push(next);
          if (next === 'tampered') throw new Error('connection lost after write');
        },
        'tampered',
        async () => 'verified'
      )
    ).rejects.toThrow('connection lost after write');

    expect(value).toBe('original');
    expect(writes).toEqual(['tampered', 'original']);
  });

  // RXT-022：restore 失败会覆盖 verify 失败，真正的加密 error code 消失。
  // 两个原因都必须保留，否则「断言 auth_failure」的用例失败时只能看到 restore 的错。
  it('preserves both causes when verification and restoration fail together', async () => {
    const verifyError = Object.assign(new Error('verification failed'), { code: 'auth_failure' });
    const restoreError = new Error('restore failed');

    const rejection = await withTemporaryValue(
      async () => 'original',
      async next => {
        if (next === 'original') throw restoreError;
      },
      'tampered',
      async () => {
        throw verifyError;
      }
    ).then(
      () => undefined,
      (error: unknown) => error
    );

    expect(rejection).toBeInstanceOf(AggregateError);
    expect((rejection as AggregateError).errors).toEqual([verifyError, restoreError]);
    expect((rejection as AggregateError).cause).toBe(verifyError);
  });

  it('rejects with the restoration error alone when only restoration fails', async () => {
    const restoreError = new Error('restore failed');

    await expect(
      withTemporaryValue(
        async () => 'original',
        async next => {
          if (next === 'original') throw restoreError;
        },
        'tampered',
        async () => 'verified'
      )
    ).rejects.toBe(restoreError);
  });
});
