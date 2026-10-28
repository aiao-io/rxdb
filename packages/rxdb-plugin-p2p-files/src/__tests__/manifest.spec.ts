import { describe, expect, it } from 'vitest';
import { createAuthenticatedP2PFileManifest, createManifestRecord, deriveHolderId, findP2PFileHolders, isManifestOwnedBy, manifestId, P2PManifestStore } from '../manifest.js';
import { createP2PFileManifest } from '../chunking.js';

describe('P2P manifest identity', () => {
  it('derives the same holder id only from the authenticated principal', async () => {
    const principal = { principal: 'user-a' };
    const other = { principal: 'user-b' };
    const [first, second] = await Promise.all([
      createAuthenticatedP2PFileManifest({ principal, fileName: 'x', size: 1, chunkSize: 1, readChunk: async () => new Uint8Array([1]) }),
      createAuthenticatedP2PFileManifest({ principal, fileName: 'x', size: 1, chunkSize: 1, readChunk: async () => new Uint8Array([1]) })
    ]);
    expect(first.holderId).toBe(await deriveHolderId(principal));
    expect(first.holderId).toBe(second.holderId);
    expect(isManifestOwnedBy(first, other)).toBe(false);
  });

  it('filters stale holders and keeps latest row per holder', async () => {
    const principal = { principal: 'user-a' };
    const manifest = await createAuthenticatedP2PFileManifest({ principal, fileName: 'x', size: 0, chunkSize: 1024, readChunk: async () => new Uint8Array() });
    const latest = { ...manifest, updatedAt: 90 };
    expect(findP2PFileHolders([{ ...manifest, updatedAt: 80 }, latest, { ...manifest, updatedAt: 1 }], manifest.contentHash, { now: 100, ttlMs: 20 })).toEqual([latest]);
    expect(findP2PFileHolders([{ ...manifest, updatedAt: 70 }], manifest.contentHash, { now: 100, ttlMs: 20 })).toEqual([]);
  });

  it('rejects empty identities, invalid timestamps and malformed manifest ids', async () => {
    await expect(createAuthenticatedP2PFileManifest({ principal: { principal: ' ' }, fileName: 'x', size: 0, chunkSize: 1024, readChunk: async () => new Uint8Array() })).rejects.toThrow();
    const manifest = await createP2PFileManifest({ fileName: 'x', size: 0, chunkSize: 1024, readChunk: async () => new Uint8Array() });
    expect(() => createManifestRecord(manifest, { authenticatedSubject: 'a', now: -1 })).toThrow(RangeError);
    expect(() => createManifestRecord(manifest, { authenticatedSubject: 'a', now: 1, ttlMs: 0 })).toThrow(RangeError);
    expect(() => manifestId('bad', 'holder')).toThrow(TypeError);
  });

  it('rejects spoofed holders, ignores old writes and expires heartbeats', async () => {
    const record = await createAuthenticatedP2PFileManifest({ principal: { principal: 'user-a' }, fileName: 'x', size: 0, chunkSize: 1024, updatedAt: 10, ttlMs: 100, readChunk: async () => new Uint8Array() });
    const store = new P2PManifestStore();
    expect(() => store.upsert({ ...record, id: 'bad' })).toThrow(/manifest id/);
    expect(() => store.upsertForSubject(record, 'other')).toThrow(/holderId/);
    store.upsert(record);
    store.upsert({ ...record, updatedAt: 1 });
    expect(store.heartbeat(record.contentHash, record.holderId, 20, 2).expiresAt).toBe(22);
    expect(store.pruneExpired(22)).toBe(1);
    expect(() => store.heartbeat(record.contentHash, record.holderId)).toThrow(/not registered/);
  });

  it('filters unrelated content and future updates', async () => {
    const record = await createAuthenticatedP2PFileManifest({ principal: { principal: 'user-a' }, fileName: 'x', size: 0, chunkSize: 1024, updatedAt: 10, readChunk: async () => new Uint8Array() });
    expect(findP2PFileHolders([record, { ...record, contentHash: 'other', updatedAt: 9 }, { ...record, updatedAt: 120 }], record.contentHash, { now: 100, ttlMs: 200 })).toHaveLength(1);
  });
});
