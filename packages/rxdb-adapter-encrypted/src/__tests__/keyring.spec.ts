import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { aesGcmEncrypt, deriveKeyFromPassphrase, generateIV, importKeyFromBytes, randomBytes } from '../crypto.js';
import { buildAAD, encodeEnvelope } from '../envelope.js';
import {
  EncryptedConfigurationError,
  EncryptedDecryptError,
  EncryptedLockedError,
  EncryptedUnlockError
} from '../errors.js';
import type { KeyringRow, KeyringStorageBinding } from '../keyring-storage.js';
import { createKeyring, Keyring, VERIFIER_SENTINEL } from '../keyring.js';

class MemoryKeyringStorage implements KeyringStorageBinding {
  row: KeyringRow | null = null;
  async readSingleton(): Promise<KeyringRow | null> {
    return this.row;
  }
  async writeSingleton(row: KeyringRow): Promise<void> {
    if (this.row != null) {
      throw new EncryptedConfigurationError({
        code: 'keyring_singleton_conflict',
        message: 'singleton already exists'
      });
    }
    this.row = row;
  }
}

const NS = 'test-ns';
const PASSPHRASE = 'correct horse battery staple';

function make(): { storage: MemoryKeyringStorage; ring: Keyring } {
  const storage = new MemoryKeyringStorage();
  const ring = createKeyring({ namespace: NS, storage });
  return { storage, ring };
}

describe('Keyring', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('starts locked with kid === null', () => {
    const { ring } = make();
    expect(ring.isLocked).toBe(true);
    expect(ring.kid).toBeNull();
    expect(ring.namespace).toBe(NS);
  });

  it('lockChange$ emits true on subscribe (locked) (BehaviorSubject)', async () => {
    const { ring } = make();
    const value = await firstValueFrom(ring.lockChange$);
    expect(value).toBe(true);
  });

  it('first unlock mints kid + salt + verifier and persists singleton', async () => {
    const { storage, ring } = make();
    await ring.unlock({ passphrase: PASSPHRASE });
    expect(ring.isLocked).toBe(false);
    expect(ring.kid).toBeTruthy();
    expect(storage.row).not.toBeNull();
    expect(storage.row?.id).toBe('singleton');
    expect(storage.row?.kdf).toBe('pbkdf2-sha256-600000');
    expect(storage.row?.kid).toBe(ring.kid);
    expect(storage.row?.salt.length).toBeGreaterThan(0);
    expect(storage.row?.verifier).toMatch(/^2\|AGCM256\|/);
  });

  it('second unlock with same passphrase succeeds and reuses kid/salt', async () => {
    const { storage, ring } = make();
    await ring.unlock({ passphrase: PASSPHRASE });
    const originalKid = ring.kid;
    const originalRow = { ...(storage.row as KeyringRow) };
    ring.lock();
    expect(ring.isLocked).toBe(true);
    await ring.unlock({ passphrase: PASSPHRASE });
    expect(ring.kid).toBe(originalKid);
    expect(storage.row).toEqual(originalRow);
  });

  it('unlock with wrong passphrase throws EncryptedUnlockError(verifier_mismatch) and stays locked', async () => {
    const { ring } = make();
    await ring.unlock({ passphrase: PASSPHRASE });
    ring.lock();
    await expect(ring.unlock({ passphrase: 'wrong-pass' })).rejects.toBeInstanceOf(EncryptedUnlockError);
    expect(ring.isLocked).toBe(true);
    expect(ring.kid).toBeNull();
  });

  it('locks and forgets the old key when a second passphrase unlock fails', async () => {
    const { ring } = make();
    await ring.unlock({ passphrase: PASSPHRASE });
    const envelope = await ring.encrypt({
      plaintext: new TextEncoder().encode('secret'),
      entityNamespace: 'public',
      tableName: 't',
      columnName: 'c',
      primaryKey: '1'
    });

    await expect(ring.unlock({ passphrase: 'wrong-pass' })).rejects.toBeInstanceOf(EncryptedUnlockError);
    expect(ring.isLocked).toBe(true);
    expect(ring.kid).toBeNull();
    await expect(
      ring.decrypt({ envelope, entityNamespace: 'public', tableName: 't', columnName: 'c', primaryKey: '1' })
    ).rejects.toBeInstanceOf(EncryptedLockedError);
  });

  it('locks and forgets the old key when a second keyBytes unlock fails', async () => {
    const { ring } = make();
    await ring.unlock({ keyBytes: randomBytes(32) });

    await expect(ring.unlock({ keyBytes: randomBytes(32) })).rejects.toBeInstanceOf(EncryptedUnlockError);
    expect(ring.isLocked).toBe(true);
    expect(ring.kid).toBeNull();
  });

  it('locks and forgets the old key when keyProvider rejects', async () => {
    const { ring } = make();
    await ring.unlock({ keyBytes: randomBytes(32) });

    await expect(
      ring.unlock({
        keyProvider: async () => {
          throw new Error('provider down');
        }
      })
    ).rejects.toMatchObject({ code: 'key_provider_failed' });
    expect(ring.isLocked).toBe(true);
    expect(ring.kid).toBeNull();
  });

  it('unlock with empty passphrase throws EncryptedConfigurationError', async () => {
    const { ring } = make();
    await expect(ring.unlock({ passphrase: '' })).rejects.toBeInstanceOf(EncryptedConfigurationError);
    expect(ring.isLocked).toBe(true);
  });

  it('unlock with raw key bytes works and produces a usable kid', async () => {
    const { ring } = make();
    const keyBytes = randomBytes(32);
    await ring.unlock({ keyBytes });
    expect(ring.isLocked).toBe(false);
    expect(ring.kid).toBeTruthy();

    // 加密 + 解密往返。
    const out = await ring.encrypt({
      plaintext: new TextEncoder().encode('hi'),
      entityNamespace: 'public',
      tableName: 't',
      columnName: 'c',
      primaryKey: 'pk1'
    });
    const back = await ring.decrypt({
      envelope: out,
      entityNamespace: 'public',
      tableName: 't',
      columnName: 'c',
      primaryKey: 'pk1'
    });
    expect(new TextDecoder().decode(back)).toBe('hi');
  });

  it('unlock with CryptoKey works', async () => {
    const { ring } = make();
    const key = await importKeyFromBytes(randomBytes(32));
    await ring.unlock({ key });
    expect(ring.isLocked).toBe(false);
  });

  it('unlock with keyProvider works (Uint8Array variant)', async () => {
    const { ring } = make();
    const bytes = randomBytes(32);
    await ring.unlock({ keyProvider: async () => bytes });
    expect(ring.isLocked).toBe(false);
  });

  it('unlock with keyProvider works (CryptoKey variant)', async () => {
    const { ring } = make();
    const key = await importKeyFromBytes(randomBytes(32));
    await ring.unlock({ keyProvider: async () => key });
    expect(ring.isLocked).toBe(false);
  });

  it('unlock with failing keyProvider throws EncryptedUnlockError(key_provider_failed)', async () => {
    const { ring } = make();
    await expect(
      ring.unlock({
        keyProvider: async () => {
          throw new Error('boom');
        }
      })
    ).rejects.toMatchObject({ code: 'key_provider_failed' });
    expect(ring.isLocked).toBe(true);
  });

  it('rejects unsupported kdf in the existing row', async () => {
    const { storage, ring } = make();
    storage.row = {
      id: 'singleton',
      createdAt: Date.now(),
      kdf: 'rot13' as never,
      salt: 'AAAAAAAAAAAAAAAAAAAAAA',
      kid: 'AAAAAAAAAAA',
      verifier: '1|AGCM256|x|x|x|x'
    };
    await expect(ring.unlock({ passphrase: PASSPHRASE })).rejects.toMatchObject({
      code: 'unsupported_kdf'
    });
  });

  it('lock() clears the in-memory key and emits lockChange$ = true', async () => {
    const { ring } = make();
    await ring.unlock({ passphrase: PASSPHRASE });

    const changes: boolean[] = [];
    const sub = ring.lockChange$.subscribe(v => changes.push(v));
    expect(changes).toEqual([false]);
    ring.lock();
    expect(ring.isLocked).toBe(true);
    expect(ring.kid).toBeNull();
    expect(changes).toEqual([false, true]);
    sub.unsubscribe();
  });

  it('lock() is idempotent', async () => {
    const { ring } = make();
    await ring.unlock({ passphrase: PASSPHRASE });
    ring.lock();
    expect(() => ring.lock()).not.toThrow();
  });

  it('encrypt while locked throws EncryptedLockedError', async () => {
    const { ring } = make();
    await expect(
      ring.encrypt({
        plaintext: new Uint8Array([1, 2, 3]),
        entityNamespace: 'public',
        tableName: 't',
        columnName: 'c',
        primaryKey: 'pk'
      })
    ).rejects.toBeInstanceOf(EncryptedLockedError);
  });

  it('decrypt while locked throws EncryptedLockedError', async () => {
    const { ring } = make();
    await expect(
      ring.decrypt({
        envelope: '1|AGCM256|xx|xx|xx|xx',
        entityNamespace: 'public',
        tableName: 't',
        columnName: 'c',
        primaryKey: 'pk'
      })
    ).rejects.toBeInstanceOf(EncryptedLockedError);
  });

  it('encrypt/decrypt round-trip preserves bytes and binds AAD to (table, column, pk, kid, ns)', async () => {
    const { ring } = make();
    await ring.unlock({ passphrase: PASSPHRASE });

    const plain = new TextEncoder().encode('secret-payload-🌶');
    const envelope = await ring.encrypt({
      plaintext: plain,
      entityNamespace: 'public',
      tableName: 'users',
      columnName: 'ssn',
      primaryKey: 'user-1'
    });
    expect(envelope).toMatch(/^2\|AGCM256\|/);
    const back = await ring.decrypt({
      envelope,
      entityNamespace: 'public',
      tableName: 'users',
      columnName: 'ssn',
      primaryKey: 'user-1'
    });
    expect(new TextDecoder().decode(back)).toBe('secret-payload-🌶');

    // 篡改：信封相同但 primaryKey 不同 → auth_failure。
    await expect(
      ring.decrypt({
        envelope,
        entityNamespace: 'public',
        tableName: 'users',
        columnName: 'ssn',
        primaryKey: 'user-2'
      })
    ).rejects.toMatchObject({ code: 'auth_failure' });
  });

  it('decrypt rejects envelope with wrong kid', async () => {
    const { ring } = make();
    await ring.unlock({ passphrase: PASSPHRASE });

    // 使用伪造的 kid 手工构造语法有效的信封。
    const key = await deriveKeyFromPassphrase('p', randomBytes(16));
    const iv = generateIV();
    const aad = buildAAD({
      databaseNamespace: NS,
      entityNamespace: 'public',
      tableName: 't',
      columnName: 'c',
      primaryKey: 'pk',
      kid: 'AAAAAAAAAAA' // 不是当前 kid
    });
    const { ct, tag } = await aesGcmEncrypt({ key, iv, plaintext: new Uint8Array([1]), aad });
    const env = encodeEnvelope({ v: 2, alg: 'AGCM256', kid: 'AAAAAAAAAAA', iv, ct, tag });

    await expect(
      ring.decrypt({ envelope: env, entityNamespace: 'public', tableName: 't', columnName: 'c', primaryKey: 'pk' })
    ).rejects.toMatchObject({ code: 'unknown_kid' });
  });

  it('decrypt rejects malformed envelope', async () => {
    const { ring } = make();
    await ring.unlock({ passphrase: PASSPHRASE });
    await expect(
      ring.decrypt({
        envelope: 'not|enough|segments',
        entityNamespace: 'public',
        tableName: 't',
        columnName: 'c',
        primaryKey: 'pk'
      })
    ).rejects.toBeInstanceOf(EncryptedDecryptError);
  });

  it('verifier sentinel is the documented literal', () => {
    expect(VERIFIER_SENTINEL).toBe('aiao.encrypted.v1.ok');
  });

  it('keyBytes of wrong length raises EncryptedConfigurationError', async () => {
    const { ring } = make();
    await expect(ring.unlock({ keyBytes: new Uint8Array(16) })).rejects.toBeInstanceOf(EncryptedConfigurationError);
  });

  it('CryptoKey with wrong algorithm is rejected', async () => {
    const { ring } = make();
    const hmacKey = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, true, ['sign', 'verify']);
    await expect(ring.unlock({ key: hmacKey as unknown as CryptoKey })).rejects.toBeInstanceOf(
      EncryptedConfigurationError
    );
  });

  it('CryptoKey with insufficient usages is rejected', async () => {
    const { ring } = make();
    const encryptOnly = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    await expect(ring.unlock({ key: encryptOnly })).rejects.toBeInstanceOf(EncryptedConfigurationError);
  });

  it('rejects invalid idleTimeoutMs', async () => {
    const { ring } = make();
    await expect(ring.unlock({ passphrase: PASSPHRASE, idleTimeoutMs: -1 })).rejects.toBeInstanceOf(
      EncryptedConfigurationError
    );
  });

  it('rejects unlock without any recognised key source', async () => {
    const { ring } = make();
    await expect(ring.unlock({} as never)).rejects.toBeInstanceOf(EncryptedConfigurationError);
  });

  it('keyProvider returning a CryptoKey with wrong algorithm rejects', async () => {
    const { ring } = make();
    const hmacKey = (await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, true, [
      'sign',
      'verify'
    ])) as unknown as CryptoKey;
    await expect(ring.unlock({ keyProvider: async () => hmacKey })).rejects.toBeInstanceOf(EncryptedConfigurationError);
  });
});

describe('Keyring idle auto-lock', () => {
  it('auto-locks after idleTimeoutMs of no activity', async () => {
    vi.useFakeTimers();
    try {
      const { ring } = make();
      await ring.unlock({ passphrase: PASSPHRASE, idleTimeoutMs: 1000 });
      expect(ring.isLocked).toBe(false);
      vi.advanceTimersByTime(1500);
      expect(ring.isLocked).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('encrypt() re-arms the idle timer (touch on success)', async () => {
    vi.useFakeTimers();
    try {
      const { ring } = make();
      await ring.unlock({ passphrase: PASSPHRASE, idleTimeoutMs: 1000 });
      vi.advanceTimersByTime(700);
      // 实际加密使用真实 crypto：subtle 不受伪计时器影响。
      await ring.encrypt({
        plaintext: new Uint8Array([1]),
        entityNamespace: 'public',
        tableName: 't',
        columnName: 'c',
        primaryKey: 'pk'
      });
      vi.advanceTimersByTime(700); // 从 unlock 起累计 1400，但距上次 touch 只有 700
      expect(ring.isLocked).toBe(false);
      vi.advanceTimersByTime(500);
      expect(ring.isLocked).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('idleTimeoutMs = 0 disables auto-lock', async () => {
    vi.useFakeTimers();
    try {
      const { ring } = make();
      await ring.unlock({ passphrase: PASSPHRASE, idleTimeoutMs: 0 });
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(60_000_000);
      expect(ring.isLocked).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('touch() re-arms the idle timer without performing a crypto op', async () => {
    vi.useFakeTimers();
    try {
      const { ring } = make();
      await ring.unlock({ passphrase: PASSPHRASE, idleTimeoutMs: 1000 });
      vi.advanceTimersByTime(800);
      ring.touch();
      vi.advanceTimersByTime(700);
      expect(ring.isLocked).toBe(false);
      vi.advanceTimersByTime(500);
      expect(ring.isLocked).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Keyring unlock-options validation', () => {
  // RAE-007：校验只要求「非负有限数」，于是 2^31 这类值被 Node 钳成 1ms
  // （并发 TimeoutOverflowWarning）——「解锁 10ms 后就自动锁了」，与调用方意图完全相反。
  it.each([2_147_483_648, 4_294_967_296, Number.MAX_SAFE_INTEGER])(
    '拒绝超出计时器可靠范围的 idleTimeoutMs：%s',
    async timeout => {
      const { ring } = make();
      await expect(ring.unlock({ passphrase: PASSPHRASE, idleTimeoutMs: timeout })).rejects.toMatchObject({
        code: 'invalid_key'
      });
      expect(ring.isLocked).toBe(true);
    }
  );

  it('接受可靠范围内的最大 idleTimeoutMs', async () => {
    const { ring } = make();
    await expect(ring.unlock({ passphrase: PASSPHRASE, idleTimeoutMs: 2_147_483_647 })).resolves.toBeUndefined();
    expect(ring.isLocked).toBe(false);
  });

  // RAE-008：JS 调用方的 provider 返回 null 时，代码直接进 assertAesGcm256(null)
  // 访问 `.algorithm`，抛的是原生 TypeError —— 没有稳定 code，违背入口宣称的 typed error 契约。
  it.each([
    ['null', null],
    ['普通对象', { algorithm: 'AES-GCM' }],
    ['字符串', 'not-a-key'],
    ['ArrayBuffer（不是 Uint8Array）', new ArrayBuffer(32)]
  ])('把非法 keyProvider 结果转成稳定的 typed error：%s', async (_name, provided) => {
    const { ring } = make();
    const attempt = ring.unlock({ keyProvider: async () => provided as never });

    await expect(attempt).rejects.toBeInstanceOf(EncryptedConfigurationError);
    await expect(attempt).rejects.toMatchObject({ code: 'invalid_key' });
    expect(ring.isLocked).toBe(true);
  });
});

describe('Keyring unlock-options exclusivity', () => {
  it('rejects when both passphrase and keyBytes are supplied', async () => {
    const { ring } = make();
    await expect(ring.unlock({ passphrase: PASSPHRASE, keyBytes: randomBytes(32) } as never)).rejects.toBeInstanceOf(
      EncryptedConfigurationError
    );
    expect(ring.isLocked).toBe(true);
  });

  it('rejects when both key and keyProvider are supplied', async () => {
    const { ring } = make();
    const key = await importKeyFromBytes(randomBytes(32));
    await expect(ring.unlock({ key, keyProvider: async () => key } as never)).rejects.toBeInstanceOf(
      EncryptedConfigurationError
    );
    expect(ring.isLocked).toBe(true);
  });
});

describe('Keyring in-flight semantics (T065)', () => {
  // RAE-003：原用例断言「lock() 后三个在途 encrypt 全部成功」，把缺陷锁成了正确行为 ——
  // 那意味着 `isLocked === true` 之后调用方仍拿得到用已清除密钥算出的信封。
  // lock() 必须是完成屏障：在途操作在 WebCrypto await 之后复核 epoch，已被取消就拒绝。
  it('lock() 取消在途 encrypt，不允许锁定后仍产出信封', async () => {
    const { ring } = make();
    await ring.unlock({ passphrase: PASSPHRASE });
    const args = (i: number) => ({
      plaintext: new TextEncoder().encode(`payload-${i}`),
      entityNamespace: 'public',
      tableName: 't',
      columnName: 'c',
      primaryKey: `pk-${i}`
    });
    const p1 = ring.encrypt(args(1));
    const p2 = ring.encrypt(args(2));
    const p3 = ring.encrypt(args(3));
    ring.lock();

    const results = await Promise.allSettled([p1, p2, p3]);
    expect(results.map(r => r.status)).toEqual(['rejected', 'rejected', 'rejected']);
    for (const result of results) {
      expect(result.status === 'rejected' && result.reason).toBeInstanceOf(EncryptedLockedError);
    }
    expect(ring.isLocked).toBe(true);
    await expect(ring.encrypt(args(4))).rejects.toBeInstanceOf(EncryptedLockedError);
  });

  // 解密尤其不能放行：拒绝之外还必须清零已解出的明文，不把它交给调用方。
  it('lock() 取消在途 decrypt，不允许锁定后仍返回明文', async () => {
    const { ring } = make();
    await ring.unlock({ passphrase: PASSPHRASE });
    const target = {
      entityNamespace: 'public',
      tableName: 't',
      columnName: 'c',
      primaryKey: 'pk-1'
    };
    const envelope = await ring.encrypt({ ...target, plaintext: new TextEncoder().encode('top-secret') });

    const pending = ring.decrypt({ ...target, envelope });
    ring.lock();

    await expect(pending).rejects.toBeInstanceOf(EncryptedLockedError);
    expect(ring.isLocked).toBe(true);
  });

  it('lock() during an in-flight unlock wins: the keyring stays locked', async () => {
    const { ring } = make();
    const pending = ring.unlock({ passphrase: PASSPHRASE });
    ring.lock();
    expect(ring.isLocked).toBe(true);

    await expect(pending).rejects.toMatchObject({ code: 'unlock_aborted_by_lock' });
    // 关键点：正在完成的 unlock 不能重新唤醒密钥。
    expect(ring.isLocked).toBe(true);
    expect(ring.kid).toBeNull();
  });

  it('unlock aborted by lock() rejects with EncryptedUnlockError and emits no false on lockChange$', async () => {
    const { ring } = make();
    const seen: boolean[] = [];
    const sub = ring.lockChange$.subscribe(v => seen.push(v));

    const pending = ring.unlock({ passphrase: PASSPHRASE });
    ring.lock();
    await expect(pending).rejects.toBeInstanceOf(EncryptedUnlockError);

    // 只有 BehaviorSubject 初始值，不应出现虚假的 "unlocked" 发射。
    expect(seen).toEqual([true]);
    sub.unsubscribe();
  });

  it('lock() cancelling an unlock is not sticky: a later unlock succeeds', async () => {
    const { ring } = make();
    const pending = ring.unlock({ passphrase: PASSPHRASE });
    ring.lock();
    await expect(pending).rejects.toMatchObject({ code: 'unlock_aborted_by_lock' });

    await ring.unlock({ passphrase: PASSPHRASE });
    expect(ring.isLocked).toBe(false);
    expect(ring.kid).not.toBeNull();
  });

  it('lock() before an unlock starts does not cancel that unlock', async () => {
    const { ring } = make();
    ring.lock();
    await ring.unlock({ passphrase: PASSPHRASE });
    expect(ring.isLocked).toBe(false);
  });
});
