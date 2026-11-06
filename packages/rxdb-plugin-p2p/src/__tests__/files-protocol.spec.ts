import { describe, expect, it, vi } from 'vitest';
import { alice, delay, linkedChannels, linkedTransports, openSessionPair, sameBytes } from './fixtures.js';
import { createP2PFileManifest, type P2PFileManifest } from '../chunking.js';
import {
  createP2PFilesProtocol,
  createP2PFilesSource,
  P2P_FILES_PROTOCOL,
  type P2PFilesAuthorizeContext,
  type P2PLocalContent
} from '../files-protocol.js';
import type { P2PJsonValue } from '../session/frame.js';
import { createWebRTCTransport } from '../session/webrtc-transport.js';
import { transferP2PFile, type P2PChunkSource } from '../transfer.js';

interface Held {
  readonly bytes: Uint8Array;
  readonly manifest: P2PFileManifest;
}

const fileOf = async (bytes: Uint8Array, chunkSize: number): Promise<Held> => ({
  bytes,
  manifest: await createP2PFileManifest({
    fileName: 'peer.bin',
    size: bytes.byteLength,
    chunkSize,
    readChunk: async (offset, size) => bytes.slice(offset, offset + size)
  })
});

const patterned = (length: number, seed: number): Uint8Array =>
  Uint8Array.from({ length }, (_, index) => (index * seed + seed) % 256);

/** 本端持有的内容表：按内容哈希找文件，`onRead` 用来计读盘次数。 */
const contentsOf =
  (files: readonly Held[], onRead: () => void = () => undefined) =>
  (contentHash: string): P2PLocalContent | undefined => {
    const held = files.find(file => file.manifest.contentHash === contentHash);
    if (!held) return undefined;
    return {
      manifest: held.manifest,
      readRange: async (offset, size) => {
        onRead();
        return held.bytes.slice(offset, offset + size);
      }
    };
  };

const allow = (): void => undefined;

/** 经块来源完整拉取一个文件，返回拼好的字节。 */
const download = async (manifest: P2PFileManifest, source: P2PChunkSource): Promise<Uint8Array> => {
  const bytes = new Uint8Array(manifest.size);
  await transferP2PFile({
    manifest,
    sources: [source],
    writeChunk: async (index, chunk) => void bytes.set(chunk, index * manifest.chunkSize)
  });
  return bytes;
};

describe('files 协议', () => {
  it('一条会话上并发拉取三个文件：字节与各自清单一致', async () => {
    const files = await Promise.all([1, 2, 3].map(seed => fileOf(patterned(10 + seed, seed), 4)));
    const [requester, holder] = openSessionPair({
      left: { protocols: [createP2PFilesProtocol()] },
      right: { protocols: [createP2PFilesProtocol({ contents: contentsOf(files), authorize: allow })] }
    });
    const source = createP2PFilesSource(requester, 'bob');
    const downloaded = await Promise.all(files.map(file => download(file.manifest, source)));
    expect(downloaded).toEqual(files.map(file => file.bytes));
    expect(requester.supports(P2P_FILES_PROTOCOL)).toBe(true);
    await requester.close();
    await holder.close();
  });

  it('双方在同一会话上互相拉取对方持有的文件', async () => {
    const leftFile = await fileOf(patterned(9, 5), 4);
    const rightFile = await fileOf(patterned(7, 3), 2);
    const [left, right] = openSessionPair({
      left: { protocols: [createP2PFilesProtocol({ contents: contentsOf([leftFile]), authorize: allow })] },
      right: { protocols: [createP2PFilesProtocol({ contents: contentsOf([rightFile]), authorize: allow })] }
    });
    const [fromRight, fromLeft] = await Promise.all([
      download(rightFile.manifest, createP2PFilesSource(left, 'right')),
      download(leftFile.manifest, createP2PFilesSource(right, 'left'))
    ]);
    expect([fromRight, fromLeft]).toEqual([rightFile.bytes, leftFile.bytes]);
    await left.close();
    await right.close();
  });

  it('对端没有该内容：请求以 not_holder 被拒，会话不断，其它内容照常', async () => {
    const held = await fileOf(patterned(6, 1), 3);
    const missing = await fileOf(patterned(6, 2), 3);
    const [requester, holder] = openSessionPair({
      left: { protocols: [createP2PFilesProtocol()] },
      right: { protocols: [createP2PFilesProtocol({ contents: contentsOf([held]), authorize: allow })] }
    });
    const source = createP2PFilesSource(requester, 'bob');
    const signal = new AbortController().signal;
    await expect(
      source.requestChunk({ contentHash: missing.manifest.contentHash, offset: 0, size: 3 }, signal)
    ).rejects.toMatchObject({ code: 'not_holder' });
    await expect(download(held.manifest, source)).resolves.toEqual(held.bytes);
    expect(requester.state).toBe('ready');
    await requester.close();
    await holder.close();
  });

  it('逐请求授权：未授权给该对端的内容以 unauthorized 被拒，已授权内容照常', async () => {
    const shared = await fileOf(patterned(6, 1), 3);
    const secret = await fileOf(patterned(6, 2), 3);
    const contexts: P2PFilesAuthorizeContext[] = [];
    const authorize = (context: P2PFilesAuthorizeContext): void => {
      contexts.push(context);
      if (context.contentHash === secret.manifest.contentHash) throw new Error('not shared with this peer');
    };
    const [requester, holder] = openSessionPair({
      left: { protocols: [createP2PFilesProtocol()] },
      right: { protocols: [createP2PFilesProtocol({ contents: contentsOf([shared, secret]), authorize })] }
    });
    const source = createP2PFilesSource(requester, 'bob');
    await expect(
      source.requestChunk(
        { contentHash: secret.manifest.contentHash, offset: 0, size: 3 },
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'unauthorized', message: 'not shared with this peer' });
    await expect(download(shared.manifest, source)).resolves.toEqual(shared.bytes);
    expect(contexts[0]).toMatchObject({ contentHash: secret.manifest.contentHash, offset: 0, size: 3, peer: alice });
    await requester.close();
    await holder.close();
  });

  it('没有内容表或授权钩子的一端不供块', async () => {
    const held = await fileOf(patterned(3, 1), 3);
    for (const options of [{ contents: contentsOf([held]) }, { authorize: allow }]) {
      const [requester, holder] = openSessionPair({
        left: { protocols: [createP2PFilesProtocol()] },
        right: { protocols: [createP2PFilesProtocol(options)] }
      });
      await expect(
        createP2PFilesSource(requester, 'bob').requestChunk(
          { contentHash: held.manifest.contentHash, offset: 0, size: 3 },
          new AbortController().signal
        )
      ).rejects.toMatchObject({ code: 'unauthorized', message: expect.stringContaining('authorization is required') });
      await requester.close();
      await holder.close();
    }
  });

  it('请求取消后供块端不再读盘', async () => {
    const held = await fileOf(patterned(3, 1), 3);
    let reads = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const authorizing = vi.fn(async () => gate);
    const [requester, holder] = openSessionPair({
      left: { protocols: [createP2PFilesProtocol()] },
      right: {
        protocols: [
          createP2PFilesProtocol({ contents: contentsOf([held], () => (reads += 1)), authorize: authorizing })
        ]
      }
    });
    const controller = new AbortController();
    const pending = createP2PFilesSource(requester, 'bob').requestChunk(
      { contentHash: held.manifest.contentHash, offset: 0, size: 3 },
      controller.signal
    );
    await vi.waitFor(() => expect(authorizing).toHaveBeenCalledTimes(1));
    controller.abort(new Error('request timed out'));
    await expect(pending).rejects.toThrow('request timed out');
    await delay(5);
    release();
    await delay(5);
    expect(reads).toBe(0);
    await requester.close();
    await holder.close();
  });

  it('方法未知或参数不合法时分别以 unknown_method、invalid_request 拒绝', async () => {
    const held = await fileOf(patterned(3, 1), 3);
    const [requester, holder] = openSessionPair({
      left: { protocols: [createP2PFilesProtocol()] },
      right: { protocols: [createP2PFilesProtocol({ contents: contentsOf([held]), authorize: allow })] }
    });
    await expect(requester.request(P2P_FILES_PROTOCOL, { method: 'list' })).rejects.toMatchObject({
      code: 'unknown_method'
    });
    const invalid: P2PJsonValue[] = [
      null,
      { contentHash: held.manifest.contentHash, offset: -1, size: 3 },
      { offset: 0, size: 3 }
    ];
    for (const params of invalid) {
      await expect(requester.request(P2P_FILES_PROTOCOL, { method: 'read', params })).rejects.toMatchObject({
        code: 'invalid_request'
      });
    }
    await expect(
      requester.request(P2P_FILES_PROTOCOL, {
        method: 'read',
        params: { contentHash: held.manifest.contentHash, offset: 2, size: 3 }
      })
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await requester.close();
    await holder.close();
  });

  it('持有方块大小与请求方不同也能供块：按请求方清单的字节区间取数', async () => {
    const bytes = Uint8Array.from({ length: 12 }, (_, index) => index * 3 + 1);
    const requesterFile = await fileOf(bytes, 3);
    const holderFile = await fileOf(bytes, 4);
    expect(holderFile.manifest.contentHash).toBe(requesterFile.manifest.contentHash);
    const [requester, holder] = openSessionPair({
      left: { protocols: [createP2PFilesProtocol()] },
      right: { protocols: [createP2PFilesProtocol({ contents: contentsOf([holderFile]), authorize: allow })] }
    });
    await expect(
      transferP2PFile({
        manifest: requesterFile.manifest,
        sources: [createP2PFilesSource(requester, 'holder')],
        writeChunk: async () => undefined
      })
    ).resolves.toMatchObject({ completedChunks: 4, sourcesUsed: ['holder'] });
    await requester.close();
    await holder.close();
  });

  it('经 WebRTC 传输超过单条消息上限的大块：分片传输，会话不被拆掉', async () => {
    const held = await fileOf(
      Uint8Array.from({ length: 1024 * 1024 }, (_, index) => (index * 13) % 256),
      512 * 1024
    );
    const [leftChannel, rightChannel] = linkedChannels();
    const [requester, holder] = openSessionPair({
      transports: [createWebRTCTransport(leftChannel), createWebRTCTransport(rightChannel)],
      left: { protocols: [createP2PFilesProtocol()] },
      right: { protocols: [createP2PFilesProtocol({ contents: contentsOf([held]), authorize: allow })] }
    });
    const downloaded = await download(held.manifest, createP2PFilesSource(requester, 'holder'));
    expect(sameBytes(downloaded, held.bytes)).toBe(true);
    expect([...leftChannel.sent, ...rightChannel.sent].every(message => message.byteLength <= 65536)).toBe(true);
    await requester.close();
    await holder.close();
  });

  it('同一会话上的内容表随时变化：先没有、登记后可拉取', async () => {
    const held = await fileOf(patterned(4, 7), 2);
    const table: Held[] = [];
    const [lt, rt] = linkedTransports();
    const [requester, holder] = openSessionPair({
      transports: [lt, rt],
      left: { protocols: [createP2PFilesProtocol()] },
      right: { protocols: [createP2PFilesProtocol({ contents: hash => contentsOf(table)(hash), authorize: allow })] }
    });
    const source = createP2PFilesSource(requester, 'bob');
    const chunk = { contentHash: held.manifest.contentHash, offset: 0, size: 2 };
    await expect(source.requestChunk(chunk, new AbortController().signal)).rejects.toMatchObject({
      code: 'not_holder'
    });
    table.push(held);
    await expect(source.requestChunk(chunk, new AbortController().signal)).resolves.toEqual(held.bytes.slice(0, 2));
    await requester.close();
    await holder.close();
  });
});
