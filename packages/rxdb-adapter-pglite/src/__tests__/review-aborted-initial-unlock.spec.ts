import type { RxDB } from '@aiao/rxdb';
import type { Keyring } from '@aiao/rxdb-adapter-encrypted';
import { EncryptedUser, type EncryptedTestAdapter } from '@aiao/rxdb-test/encrypted';
import { describe, expect, it } from 'vitest';
import { pgliteFactory } from './encrypted-test-fixture.js';

type NativeAdapter = EncryptedTestAdapter & {
  encryption: Pick<Keyring, 'unlock' | 'lock' | 'isLocked'>;
};
const KEY_A = new Uint8Array(32).fill(17);
const KEY_B = new Uint8Array(32).fill(29);
const create = async (): Promise<NativeAdapter> =>
  (await pgliteFactory.createAdapter({ entities: [EncryptedUser] })) as NativeAdapter;
const close = async (adapter: NativeAdapter) => {
  adapter.encryption.lock();
  await (adapter.rxdb as unknown as RxDB).destroy();
};
const initialized = async (adapter: NativeAdapter) => {
  const result = await adapter.query('SELECT count(*) AS count FROM rxdb_db_keyring');
  return Number(result.results[0]?.rows[0]?.[0]) > 0;
};
const providerGate = () => {
  const started = Promise.withResolvers<void>();
  const reply = Promise.withResolvers<Uint8Array>();
  return {
    entered: started.promise,
    release: () => reply.resolve(KEY_A),
    provider: () => {
      started.resolve();
      return reply.promise;
    }
  };
};

describe('原 PGlite /Chromium adapter 的首次加密解锁取消提交边界', () => {
  it('provider 被取消后不能把废弃凭据写入实际 keyring 表', async () => {
    const adapter = await create();
    const gate = providerGate();
    const pending = adapter.encryption.unlock({ keyProvider: gate.provider, idleTimeoutMs: 0 }).then(
      () => ({ code: 'resolved' }),
      (error: { code?: string }) => error
    );
    try {
      await gate.entered;
      expect(await initialized(adapter)).toBe(false);
      adapter.encryption.lock();
      gate.release();
      expect((await pending).code).toBe('unlock_aborted_by_lock');
      const persisted = await initialized(adapter);
      console.info(
        'REVIEW_ENCRYPTED',
        JSON.stringify({
          backend: 'PGlite /Chromium',
          scenario: 'cancel-init',
          locked: adapter.encryption.isLocked,
          initialized: persisted
        })
      );
      expect(persisted).toBe(false);
    } finally {
      gate.release();
      await pending;
      await close(adapter);
    }
  });

  it('取消 A 后的新 B 解锁不能被废弃 A 的 verifier 拦截', async () => {
    const adapter = await create();
    const gate = providerGate();
    const first = adapter.encryption.unlock({ keyProvider: gate.provider, idleTimeoutMs: 0 }).then(
      () => ({ code: 'resolved' }),
      (error: { code?: string }) => error
    );
    try {
      await gate.entered;
      adapter.encryption.lock();
      const second = adapter.encryption.unlock({ keyBytes: KEY_B, idleTimeoutMs: 0 }).then(
        () => ({ code: 'resolved' }),
        (error: { code?: string }) => error
      );
      gate.release();
      expect((await first).code).toBe('unlock_aborted_by_lock');
      const outcome = await second;
      console.info(
        'REVIEW_ENCRYPTED',
        JSON.stringify({
          backend: 'PGlite /Chromium',
          scenario: 'cancel-A-then-B',
          code: outcome.code,
          locked: adapter.encryption.isLocked
        })
      );
      expect(outcome.code).toBe('resolved');
      expect(adapter.encryption.isLocked).toBe(false);
    } finally {
      gate.release();
      await first;
      await close(adapter);
    }
  });

  it('对照：正常已建 A 的 verifier 必须保留，B 拒绝而 A 可重开', async () => {
    const adapter = await create();
    try {
      await adapter.encryption.unlock({ keyBytes: KEY_A, idleTimeoutMs: 0 });
      adapter.encryption.lock();
      await expect(adapter.encryption.unlock({ keyBytes: KEY_B, idleTimeoutMs: 0 })).rejects.toMatchObject({
        code: 'verifier_mismatch'
      });
      await adapter.encryption.unlock({ keyBytes: KEY_A, idleTimeoutMs: 0 });
      expect(adapter.encryption.isLocked).toBe(false);
    } finally {
      await close(adapter);
    }
  });
});
