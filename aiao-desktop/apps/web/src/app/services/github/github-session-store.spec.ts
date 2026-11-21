import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIndexedDbSecretStore, createIndexedDbSessionStore } from './github-session-store.js';

function databaseFixture() {
  const records = new Map<string, unknown>();
  const database = {
    objectStoreNames: { contains: vi.fn(() => false) },
    createObjectStore: vi.fn(),
    transaction(store: string) {
      const transaction: { oncomplete: () => void } = { oncomplete: () => undefined };
      const keyOf = (key: string) => `${store}:${key}`;
      const objectStore = {
        get(key: string) {
          const request = { result: records.get(keyOf(key)), onsuccess: () => undefined };
          queueMicrotask(() => request.onsuccess());
          return request;
        },
        put(value: unknown, key: string) {
          records.set(keyOf(key), structuredClone(value));
          queueMicrotask(() => transaction.oncomplete());
        },
        delete(key: string) {
          records.delete(keyOf(key));
          queueMicrotask(() => transaction.oncomplete());
        }
      };
      return {
        ...transaction,
        objectStore: () => objectStore,
        set oncomplete(callback: () => void) {
          transaction.oncomplete = callback;
        }
      };
    }
  };
  vi.stubGlobal('indexedDB', {
    open() {
      const request = { result: database, onsuccess: () => undefined, onupgradeneeded: () => undefined };
      queueMicrotask(() => {
        request.onupgradeneeded();
        request.onsuccess();
      });
      return request;
    }
  });
  return records;
}

afterEach(() => vi.unstubAllGlobals());

describe('GitHub 密封存储', () => {
  it('只持久化密文，新实例可以恢复原始 PKCE 数据，清除后不可读取', async () => {
    const records = databaseFixture();
    const pending = { verifier: 'private-pkce-verifier', state: 'callback-state', at: 1 };
    const store = createIndexedDbSecretStore<typeof pending>('oauth-test');
    await expect(store.load()).resolves.toBeNull();
    await store.save(pending);
    const ciphertext = records.get('sessions:session');
    expect(typeof ciphertext).toBe('string');
    expect(ciphertext).not.toContain(pending.verifier);
    await expect(createIndexedDbSecretStore<typeof pending>('oauth-test').load()).resolves.toEqual(pending);
    await store.save(pending);
    expect(records.get('sessions:session')).not.toEqual(ciphertext);
    await store.clear();
    await expect(store.load()).resolves.toBeNull();
  });

  it('拒绝被改写的密文，不把损坏数据恢复为登录凭据', async () => {
    const records = databaseFixture();
    const store = createIndexedDbSecretStore<{ verifier: string }>('oauth-test');
    await store.save({ verifier: 'secret' });
    const packed = atob(records.get('sessions:session') as string);
    records.set(
      'sessions:session',
      btoa(packed.slice(0, -1) + String.fromCharCode(packed.charCodeAt(packed.length - 1) ^ 1))
    );
    await expect(store.load()).resolves.toBeNull();
    await expect(store.load()).resolves.toBeNull();
  });

  it.each([
    ['typed array', new Uint8Array(32).fill(7)],
    ['array buffer', new Uint8Array(32).fill(8).buffer],
    ['number array', Array.from({ length: 32 }, () => 9)]
  ])('migrates a legacy raw key stored as %s', async (_label, legacyKey) => {
    const records = databaseFixture();
    records.set('key:aes', legacyKey);
    const store = createIndexedDbSecretStore<{ value: string }>('legacy-key-test');

    await store.save({ value: 'migrated' });

    expect(records.has('key:aes')).toBe(false);
    expect(records.has('key:aes-gcm')).toBe(true);
    await expect(store.load()).resolves.toEqual({ value: 'migrated' });
  });

  it('clears invalid persisted session shapes before returning them', async () => {
    databaseFixture();
    const invalidSessions = [
      { token: '', login: 'octo', avatarUrl: null, provider: 'pat', createdAt: 1 },
      { token: 'ghp_token', login: '', avatarUrl: null, provider: 'pat', createdAt: 1 },
      { token: 'ghp_token', login: 'octo', avatarUrl: null, provider: 'unknown', createdAt: 1 }
    ];

    for (const [index, invalid] of invalidSessions.entries()) {
      const databaseName = `invalid-session-${index}`;
      const rawStore = createIndexedDbSecretStore<typeof invalid>(databaseName);
      await rawStore.save(invalid);
      const store = createIndexedDbSessionStore(databaseName);
      await expect(store.load()).resolves.toBeNull();
      await expect(rawStore.load()).resolves.toBeNull();
    }
  });
});
