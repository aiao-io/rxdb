import { describe, expect, it, vi } from 'vitest';
import {
  createLocalManifestDiscovery,
  toRxDBManifestDocument,
  toSyncManifestDocument,
  validateHandshake
} from './discovery.js';
import { createAuthenticatedP2PFileManifest, deriveHolderId, P2PManifestStore, type P2PPrincipal } from './manifest.js';

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

/** 认证宿主签发的 token 绑定到连接：重放到别的连接即失效。 */
const connectionBoundAuthenticate = async (
  token: string,
  context: { readonly connectionId: string; readonly contentHash: string }
): Promise<P2PPrincipal | null> => (token === `token:${context.connectionId}` ? laptop : null);

describe('P2P 发现与信令', () => {
  it('校验认证身份与持有声明，并拒绝未授权、换设备或无清单的 peer', async () => {
    const record = await recordFixture();
    const store = new P2PManifestStore();
    store.upsert(record);
    const request = {
      connectionId: 'c1',
      contentHash: record.contentHash,
      holderId: record.holderId,
      token: 'token:c1'
    };
    const authenticate = vi.fn(connectionBoundAuthenticate);
    await expect(validateHandshake(request, { authenticate, manifests: store })).resolves.toEqual({
      connectionId: 'c1',
      contentHash: record.contentHash,
      holderId: record.holderId
    });
    expect(authenticate).toHaveBeenCalledWith('token:c1', { connectionId: 'c1', contentHash: record.contentHash });

    await expect(
      validateHandshake({ ...request, token: 'bad' }, { authenticate: async () => null, manifests: store })
    ).rejects.toThrow('peer is not authorized');
    await expect(
      validateHandshake(request, {
        authenticate: async () => ({ ...laptop, deviceId: 'desktop' }),
        manifests: store
      })
    ).rejects.toThrow('peer is not authorized');
    const stranger = { principal: 'device-b', deviceId: 'phone' };
    await expect(
      validateHandshake(
        { ...request, holderId: deriveHolderId(stranger) },
        { authenticate: async () => stranger, manifests: store }
      )
    ).rejects.toThrow('peer does not hold requested content');
  });

  it('token 绑定连接：把别的连接的 token 重放到这里会被拒绝', async () => {
    const record = await recordFixture();
    const store = new P2PManifestStore();
    store.upsert(record);
    await expect(
      validateHandshake(
        { connectionId: 'c2', contentHash: record.contentHash, holderId: record.holderId, token: 'token:c1' },
        { authenticate: connectionBoundAuthenticate, manifests: store }
      )
    ).rejects.toThrow('peer is not authorized');
  });

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
