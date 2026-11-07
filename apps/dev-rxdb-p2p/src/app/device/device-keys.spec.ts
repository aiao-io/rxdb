// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  generateContentKey,
  generateDeviceKeyPair,
  importDevicePrivateKey,
  openContentKey,
  sealContentKey
} from '../p2p/fallback-crypto';
import { deviceKeysStorageKey, ensureDeviceKeyPair, type DeviceKeyStore } from './device-keys';

const memoryStore = (): DeviceKeyStore & { readonly map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value)
  };
};

describe('ensureDeviceKeyPair', () => {
  it('首次调用生成密钥对并写进本机存储，公钥是 base64url', async () => {
    const store = memoryStore();
    const pair = await ensureDeviceKeyPair('user-1', store);

    expect(pair.publicKeyBase64).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.parse(store.getItem(deviceKeysStorageKey('user-1')) ?? '{}')).toMatchObject({
      publicKeyBase64: pair.publicKeyBase64
    });
  });

  it('再次调用读回同一密钥对，不重新生成', async () => {
    const store = memoryStore();
    const first = await ensureDeviceKeyPair('user-1', store);
    const second = await ensureDeviceKeyPair('user-1', store);

    expect(second.publicKeyBase64).toBe(first.publicKeyBase64);
    expect(second.privateKeyJwk).toEqual(first.privateKeyJwk);
  });

  it('不同用户的密钥对互相独立', async () => {
    const store = memoryStore();
    const [alice, bob] = await Promise.all([ensureDeviceKeyPair('alice', store), ensureDeviceKeyPair('bob', store)]);

    expect(alice.publicKeyBase64).not.toBe(bob.publicKeyBase64);
  });

  it('读回的私钥可以解出用读回的公钥封装的信封', async () => {
    const store = memoryStore();
    const pair = await ensureDeviceKeyPair('user-1', store);
    const contentKey = await generateContentKey();
    const envelope = await sealContentKey(contentKey, pair.publicKeyBase64);
    const opened = await openContentKey(envelope, await importDevicePrivateKey(pair.privateKeyJwk));
    expect(opened.type).toBe('secret');
  });

  it('生成的原语与 fallback-crypto 的 generateDeviceKeyPair 互通', async () => {
    const store = memoryStore();
    const fromEnsure = await ensureDeviceKeyPair('user-1', store);
    const direct = await generateDeviceKeyPair();
    expect(fromEnsure.publicKeyBase64).toHaveLength(direct.publicKeyBase64.length);
    expect(fromEnsure.privateKeyJwk.kty).toBe(direct.privateKeyJwk.kty);
  });
});
