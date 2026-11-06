import { describe, expect, it } from 'vitest';
import { createLocalManifestDiscovery, toRxDBManifestDocument, toSyncManifestDocument } from '../discovery.js';
import { createAuthenticatedP2PFileManifest, P2PManifestStore } from '../manifest.js';
import type { P2PPrincipal } from '../session/identity.js';

const laptop: P2PPrincipal = { principal: 'device-owner', deviceId: 'laptop' };

async function recordFixture(options: { readonly principal?: P2PPrincipal; readonly now?: number } = {}) {
  return createAuthenticatedP2PFileManifest({
    principal: options.principal ?? laptop,
    fileName: 'demo.bin',
    size: 3,
    chunkSize: 1,
    updatedAt: options.now ?? Date.now(),
    readChunk: async (offset, size) => Uint8Array.from({ length: size }, (_, index) => offset + index)
  });
}

describe('P2P 发现与信令', () => {
  it('从本地清单离线发现持有者，支持取消，撤回的声明不能再连接', async () => {
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
    await expect(discovery.connect(record)).rejects.toThrow('peer no longer holds requested content');
  });

  it('把清单映射为同步文档并复制 chunkHashes，可选的 sourceUrl 缺省时不写出', async () => {
    const record = await recordFixture({ now: 10 });
    const document = toSyncManifestDocument(record);
    expect(document).toEqual({
      id: record.id,
      contentHash: record.contentHash,
      fileName: record.fileName,
      size: record.size,
      chunkSize: record.chunkSize,
      chunkHashes: record.chunkHashes,
      holderId: record.holderId,
      updatedAt: 10
    });
    expect(document.chunkHashes).not.toBe(record.chunkHashes);
    expect(toSyncManifestDocument({ ...record, sourceUrl: 'https://files.example/demo' })).toMatchObject({
      sourceUrl: 'https://files.example/demo'
    });
    expect(toRxDBManifestDocument(record).updatedAt).toEqual(new Date(10));
  });
});
