import { describe, expect, it } from 'vitest';
import {
  createLocalManifestDiscovery,
  toRxDBManifestDocument,
  toSyncManifestDocument,
  validateHandshake
} from './discovery';
import { createAuthenticatedP2PFileManifest, deriveHolderId, findP2PFileHolders, P2PManifestStore } from './manifest';

async function recordFixture(options: { readonly subject?: string; readonly now?: number } = {}) {
  return createAuthenticatedP2PFileManifest({
    principal: { principal: options.subject ?? 'device-a' },
    fileName: 'demo.bin',
    size: 3,
    chunkSize: 1,
    updatedAt: options.now ?? 100,
    readChunk: async (offset, size) => Uint8Array.from({ length: size }, (_, index) => offset + index)
  });
}

describe('P2P 发现与信令', () => {
  it('校验认证身份和活跃持有声明，并拒绝未授权或无清单 peer', async () => {
    const record = await recordFixture();
    const store = new P2PManifestStore();
    store.upsert(record);
    const request = {
      connectionId: 'c1',
      contentHash: record.contentHash,
      holderId: record.holderId,
      token: 'token-a'
    };
    await expect(
      validateHandshake(request, {
        authenticate: async token => (token === 'token-a' ? { subject: 'device-a' } : null),
        manifests: store,
        now: 100
      })
    ).resolves.toEqual({ connectionId: 'c1', contentHash: record.contentHash, holderId: record.holderId });
    await expect(
      validateHandshake(
        { ...request, token: 'bad' },
        {
          authenticate: async () => null,
          manifests: store
        }
      )
    ).rejects.toThrow('peer is not authorized');
    await expect(
      validateHandshake(
        { ...request, holderId: deriveHolderId('device-b') },
        {
          authenticate: async () => ({ subject: 'device-b' }),
          manifests: store
        }
      )
    ).rejects.toThrow('peer does not hold requested content');
  });

  it('从本地清单离线发现持有者，支持取消和过期连接拒绝', async () => {
    const record = await recordFixture();
    const store = new P2PManifestStore();
    store.upsert(record);
    const discovery = createLocalManifestDiscovery(store);
    const discovered: string[] = [];
    for await (const item of discovery.discover(record.contentHash)) discovered.push(item.holderId);
    expect(discovered).toEqual([record.holderId]);
    await expect(discovery.connect(record)).resolves.toEqual(record);

    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const iterator = discovery.discover(record.contentHash, controller.signal)[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow('cancelled');
    store.revoke(record.contentHash, record.holderId);
    await expect(discovery.connect(record)).rejects.toThrow('peer manifest is expired');
  });

  it('把清单映射为同步文档并复制 chunkHashes', async () => {
    const record = await recordFixture({ now: 10 });
    const document = toSyncManifestDocument(record);
    expect(document).toMatchObject({
      id: record.id,
      contentHash: record.contentHash,
      holderId: record.holderId,
      updatedAt: 10
    });
    expect(document.chunkHashes).toEqual(record.chunkHashes);
    expect(document.chunkHashes).not.toBe(record.chunkHashes);
    expect(toRxDBManifestDocument(record).updatedAt).toEqual(new Date(10));
    expect(findP2PFileHolders([record], record.contentHash, { now: 100, ttlMs: 100 })).toHaveLength(1);
    expect(findP2PFileHolders([record], record.contentHash, { now: 111, ttlMs: 100 })).toHaveLength(0);
  });
});
