import { describe, expect, it, vi } from 'vitest';
import { PgliteKeyringStorage } from '../../keyring/pglite-keyring-storage.js';
import type { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';

describe('PgliteKeyringStorage residual', () => {
  it('maps empty/nullish rows to null and only maps unique violations as singleton conflicts', async () => {
    const uniqueViolation = new Error('unique violation');
    Reflect.set(uniqueViolation, 'code', '23505');
    const internalQuery = vi.fn().mockResolvedValueOnce({ rows: undefined, fields: [], affectedRows: 0 });
    const writeQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], fields: [], affectedRows: 0 })
      .mockRejectedValueOnce(uniqueViolation);

    const adapter = { internalQuery, writeQuery } as unknown as RxDBAdapterPGlite;
    const storage = new PgliteKeyringStorage(adapter);

    await expect(storage.readSingleton()).resolves.toBeNull();

    await expect(
      storage.writeSingleton({
        id: 'singleton',
        createdAt: 1,
        kdf: 'argon2id',
        salt: 's',
        kid: 'k',
        verifier: 'v'
      } as never)
    ).rejects.toMatchObject({ code: 'keyring_singleton_conflict', cause: uniqueViolation });

    expect(internalQuery).toHaveBeenCalledOnce();
    expect(writeQuery).toHaveBeenCalledTimes(2);
  });

  it('preserves non-unique write failures', async () => {
    const connectionFailure = new Error('connection lost');
    Reflect.set(connectionFailure, 'code', '08006');
    const writeQuery = vi.fn().mockResolvedValueOnce({ rows: [], fields: [], affectedRows: 0 });
    writeQuery.mockRejectedValueOnce(connectionFailure);
    const storage = new PgliteKeyringStorage({ writeQuery } as unknown as RxDBAdapterPGlite);

    await expect(
      storage.writeSingleton({
        id: 'singleton',
        createdAt: 1,
        kdf: 'argon2id',
        salt: 's',
        kid: 'k',
        verifier: 'v'
      } as never)
    ).rejects.toBe(connectionFailure);
  });
});
