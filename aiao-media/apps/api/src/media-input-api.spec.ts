import { describe, expect, it } from 'vitest';
import { fixtureWav } from './media-fixtures.ts';
import { removeStoredMediaInput, readMediaInput, type MediaInputReference } from './media-input-api.ts';
import type { RelayResultStore, WorkerEnv } from './worker-env.ts';

function inputStore(): RelayResultStore {
  const objects = new Map<string, { bytes: Uint8Array<ArrayBuffer>; customMetadata: Record<string, string> }>();
  return {
    async put(key, value, options) {
      objects.set(key, { bytes: new Uint8Array(value), customMetadata: options?.customMetadata ?? {} });
    },
    async get(key) {
      const object = objects.get(key);
      return object ? { body: new Response(object.bytes).body!, customMetadata: object.customMetadata } : null;
    },
    async head(key) {
      const object = objects.get(key);
      return object ? { customMetadata: object.customMetadata } : null;
    },
    async delete(key) {
      objects.delete(key);
    }
  };
}
async function digest(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)),
    byte => byte.toString(16).padStart(2, '0')
  ).join('');
}

describe('ASR 临时输入所有权', () => {
  it('只允许上传者读取和删除输入对象', async () => {
    const store = inputStore();
    const env = { MEDIA_INPUTS: store } as WorkerEnv;
    const wav = fixtureWav(500);
    const reference: MediaInputReference = {
      id: '10000000-0000-4000-8000-000000000010',
      mediaType: 'audio/wav',
      bytes: wav.byteLength,
      durationMs: 500,
      sha256: await digest(wav),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    };
    await store.put(`inputs/${reference.id}`, wav, {
      httpMetadata: { contentType: 'audio/wav' },
      customMetadata: { ownerId: '10000000-0000-4000-8000-000000000011' }
    });
    await expect(readMediaInput(env, reference, '10000000-0000-4000-8000-000000000011')).resolves.toHaveLength(wav.length);
    await expect(readMediaInput(env, reference, '10000000-0000-4000-8000-000000000012')).rejects.toThrow('不存在');
    await removeStoredMediaInput(env, reference.id, '10000000-0000-4000-8000-000000000012');
    await expect(store.head(`inputs/${reference.id}`)).resolves.not.toBeNull();
    await removeStoredMediaInput(env, reference.id, '10000000-0000-4000-8000-000000000011');
    await expect(store.head(`inputs/${reference.id}`)).resolves.toBeNull();
  });

  it('拒绝过期引用，即使对象仍存在', async () => {
    const store = inputStore();
    const env = { MEDIA_INPUTS: store } as WorkerEnv;
    const reference: MediaInputReference = {
      id: '10000000-0000-4000-8000-000000000013',
      mediaType: 'audio/wav',
      bytes: 46,
      durationMs: 1,
      sha256: 'a'.repeat(64),
      expiresAt: new Date(Date.now() - 1).toISOString()
    };
    await expect(readMediaInput(env, reference, '10000000-0000-4000-8000-000000000011')).rejects.toThrow('过期');
  });

  it('没有独立输入存储时不回退到结果存储', async () => {
    await expect(
      readMediaInput({ RELAY_RESULTS: inputStore() } as WorkerEnv, {
        id: '10000000-0000-4000-8000-000000000014',
        mediaType: 'audio/wav',
        bytes: 46,
        durationMs: 1,
        sha256: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      }, '10000000-0000-4000-8000-000000000011')
    ).rejects.toThrow('尚未启用');
  });
});
