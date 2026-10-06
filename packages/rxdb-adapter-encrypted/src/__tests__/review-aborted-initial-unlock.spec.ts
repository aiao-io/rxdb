import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { EncryptedConfigurationError } from '../errors.js';
import type { KeyringRow, KeyringStorageBinding } from '../keyring-storage.js';
import { createKeyring } from '../keyring.js';

const KEY_A = new Uint8Array(32).fill(17);
const KEY_B = new Uint8Array(32).fill(29);

/** 实际 SQLite singleton 持久层与 WebCrypto，只控制 keyProvider 的交付时序。 */
const setup = () => {
  const database = new DatabaseSync(':memory:');
  database.exec('CREATE TABLE keyring (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const storage: KeyringStorageBinding = {
    async readSingleton() {
      const row = database.prepare('SELECT value FROM keyring WHERE id = ?').get('singleton');
      return row ? (JSON.parse(String(row['value'])) as KeyringRow) : null;
    },
    async writeSingleton(row) {
      if (database.prepare('SELECT id FROM keyring WHERE id = ?').get('singleton')) {
        throw new EncryptedConfigurationError({ code: 'keyring_singleton_conflict', message: 'singleton 已存在' });
      }
      database.prepare('INSERT INTO keyring (id, value) VALUES (?, ?)').run('singleton', JSON.stringify(row));
    }
  };
  const ring = createKeyring({ namespace: 'review-cancel-init', storage });
  const close = () => {
    ring.lock();
    database.close();
  };
  return { ring, storage, close };
};

const blockedProvider = () => {
  const ready = Promise.withResolvers<void>();
  const key = Promise.withResolvers<Uint8Array>();
  return {
    entered: ready.promise,
    release: () => key.resolve(KEY_A),
    provider: () => {
      ready.resolve();
      return key.promise;
    }
  };
};

describe('评审复验：首次解锁取消不能把废弃密钥变成数据库的持久凭据', () => {
  it('lock 发生在 provider 尚未返回时，取消的解锁不能初始化 singleton', async () => {
    const ctx = setup();
    const gate = blockedProvider();
    const pending = ctx.ring.unlock({ keyProvider: gate.provider, idleTimeoutMs: 0 });
    const result = pending.then(
      () => ({ code: 'resolved' }),
      (error: { code?: string }) => error
    );
    try {
      await gate.entered;
      expect(await ctx.storage.readSingleton()).toBeNull();
      ctx.ring.lock();
      gate.release();
      expect((await result).code).toBe('unlock_aborted_by_lock');
      expect(ctx.ring.isLocked).toBe(true);
      const persisted = await ctx.storage.readSingleton();
      console.info(
        'REVIEW_ENCRYPTED',
        JSON.stringify({ scenario: 'cancel-before-provider', locked: ctx.ring.isLocked, initialized: !!persisted })
      );
      expect(persisted).toBeNull();
    } finally {
      gate.release();
      await result;
      ctx.close();
    }
  });

  it('取消 A 后开始首次解锁 B，B 不应被废弃 A 的 verifier 拒绝', async () => {
    const ctx = setup();
    const gate = blockedProvider();
    const first = ctx.ring.unlock({ keyProvider: gate.provider, idleTimeoutMs: 0 }).then(
      () => ({ code: 'resolved' }),
      (error: { code?: string }) => error
    );
    try {
      await gate.entered;
      ctx.ring.lock();
      const second = ctx.ring.unlock({ keyBytes: KEY_B, idleTimeoutMs: 0 });
      const outcome = second.then(
        () => ({ code: 'resolved' }),
        (error: { code?: string }) => error
      );
      gate.release();
      expect((await first).code).toBe('unlock_aborted_by_lock');
      const result = await outcome;
      console.info(
        'REVIEW_ENCRYPTED',
        JSON.stringify({ scenario: 'cancel-A-then-B', code: result.code, locked: ctx.ring.isLocked })
      );
      expect(result.code).toBe('resolved');
      expect(ctx.ring.isLocked).toBe(false);
    } finally {
      gate.release();
      await first;
      ctx.close();
    }
  });

  it('对照：A 正常初始化后锁定，必须只接受 A，不允许 B 覆盖已有凭据', async () => {
    const ctx = setup();
    try {
      await ctx.ring.unlock({ keyBytes: KEY_A, idleTimeoutMs: 0 });
      const original = await ctx.storage.readSingleton();
      ctx.ring.lock();
      await expect(ctx.ring.unlock({ keyBytes: KEY_B, idleTimeoutMs: 0 })).rejects.toMatchObject({
        code: 'verifier_mismatch'
      });
      expect(await ctx.storage.readSingleton()).toEqual(original);
      await ctx.ring.unlock({ keyBytes: KEY_A, idleTimeoutMs: 0 });
      expect(ctx.ring.isLocked).toBe(false);
    } finally {
      ctx.close();
    }
  });
});
