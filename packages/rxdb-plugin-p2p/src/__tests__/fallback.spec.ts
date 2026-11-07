import { describe, expect, it, vi } from 'vitest';
import { createP2PFileManifest } from '../chunking.js';
import { downloadFromServer, downloadP2PFile } from '../fallback.js';
import { P2PTransferError, type P2PChunkRequest } from '../transfer.js';

async function fixture() {
  const bytes = new Uint8Array(2050);
  bytes.forEach((_, index) => {
    bytes[index] = index % 251;
  });
  const manifest = await createP2PFileManifest({
    fileName: 'server.bin',
    size: bytes.byteLength,
    chunkSize: 1024,
    readChunk: async (offset, size) => bytes.slice(offset, offset + size)
  });
  return { bytes, manifest };
}

const sliceOf = (bytes: Uint8Array, request: P2PChunkRequest): Uint8Array =>
  bytes.slice(request.offset, request.offset + request.size);

/**
 * 服务器响应流：每段 `pieceSize` 字节，被读时才产出下一段（`highWaterMark: 0`）。
 * `pulled` 是已产出的字节数，`cancelReasons` 记下每次取消的原因。
 */
const responseStream = (size: number, readRange: (offset: number, length: number) => Uint8Array, pieceSize = 700) => {
  const state = { pulled: 0, cancelReasons: [] as unknown[] };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull: controller => {
        if (state.pulled >= size) {
          controller.close();
          return;
        }
        const piece = readRange(state.pulled, Math.min(pieceSize, size - state.pulled));
        state.pulled += piece.byteLength;
        controller.enqueue(piece);
      },
      cancel: reason => {
        state.cancelReasons.push(reason);
      }
    },
    { highWaterMark: 0 }
  );
  return { stream, state };
};

const streamOf = (bytes: Uint8Array, pieceSize?: number) =>
  responseStream(bytes.byteLength, (offset, length) => bytes.slice(offset, offset + length), pieceSize);

/** 内存落盘：可选地在写入时损坏某一块，模拟静默写坏的存储。 */
const memoryStorage = (corruptIndex?: number) => {
  const stored = new Map<number, Uint8Array>();
  return {
    stored,
    writeChunk: vi.fn(async (index: number, chunk: Uint8Array) => {
      stored.set(index, index === corruptIndex ? chunk.slice(1) : chunk.slice());
    }),
    readChunk: async (index: number): Promise<Uint8Array> => {
      const chunk = stored.get(index);
      if (!chunk) throw new Error(`chunk ${index} is not stored`);
      return chunk;
    }
  };
};

describe('P2P 服务器回退', () => {
  it('流式读取：未落盘的字节不超过一个块加一段流，与文件大小无关', async () => {
    const size = 2 * 1024 * 1024 + 123;
    const chunkSize = 64 * 1024;
    const pieceSize = 16 * 1024 + 7;
    const readRange = (offset: number, length: number): Uint8Array => {
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) bytes[index] = ((offset + index) * 31 + 7) % 251;
      return bytes;
    };
    const manifest = await createP2PFileManifest({
      fileName: 'large.bin',
      size,
      chunkSize,
      readChunk: async (offset, length) => readRange(offset, length)
    });
    const { stream, state } = responseStream(size, readRange, pieceSize);
    let persisted = 0;
    let maxUnpersisted = 0;
    const result = await downloadFromServer({
      manifest,
      fallback: { download: async () => stream },
      writeChunk: async (_index, chunk) => {
        maxUnpersisted = Math.max(maxUnpersisted, state.pulled - persisted);
        persisted += chunk.byteLength;
      }
    });
    expect(result).toMatchObject({ completedChunks: manifest.chunkHashes.length, bytesTransferred: size });
    expect(persisted).toBe(size);
    expect(maxUnpersisted).toBeLessThanOrEqual(chunkSize + pieceSize);
    expect(state.cancelReasons).toEqual([]);
  });

  it('响应流按任意分段到达都按清单块校验写入，透传认证凭据并逐块报告进度', async () => {
    const { bytes, manifest } = await fixture();
    for (const pieceSize of [1, 1000, 4096]) {
      const writes: Uint8Array[] = [];
      const progress: string[] = [];
      const fallback = {
        download: async ({ token }: { token?: string }) => {
          expect(token).toBe('auth-token');
          return streamOf(bytes, pieceSize).stream;
        }
      };
      const result = await downloadFromServer({
        manifest,
        fallback,
        token: 'auth-token',
        writeChunk: async (_index, chunk) => {
          writes.push(chunk);
        },
        onProgress: value => progress.push(`${value.route}:${value.completedChunks}`)
      });
      expect(result).toEqual({
        contentHash: manifest.contentHash,
        completedChunks: 3,
        bytesTransferred: bytes.byteLength,
        sourcesUsed: ['server']
      });
      expect(writes.map(chunk => chunk.byteLength)).toEqual([1024, 1024, 2]);
      expect(Uint8Array.from(writes.flatMap(chunk => [...chunk]))).toEqual(bytes);
      expect(progress).toEqual(['server:1', 'server:2', 'server:3']);
    }
  });

  it('坏块不落盘：报出不符的块，其后的块不再写入，并取消响应流', async () => {
    const { bytes, manifest } = await fixture();
    const corrupted = bytes.slice();
    corrupted[1500] ^= 1;
    const response = streamOf(corrupted);
    const storage = memoryStorage();
    await expect(
      downloadFromServer({
        manifest,
        fallback: { download: async () => response.stream },
        writeChunk: storage.writeChunk
      })
    ).rejects.toThrow('server response chunk 1 does not match manifest');
    expect(storage.writeChunk.mock.calls.map(([index]) => index)).toEqual([0]);
    expect(response.state.cancelReasons).toHaveLength(1);
  });

  it('逐块都对而整文件哈希不符说明清单自相矛盾：报不可重试的错误', async () => {
    const { bytes, manifest } = await fixture();
    const failure = await downloadFromServer({
      manifest: { ...manifest, contentHash: '0'.repeat(64) },
      fallback: { download: async () => streamOf(bytes).stream },
      writeChunk: async () => undefined
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(P2PTransferError);
    expect((failure as P2PTransferError).message).toMatch(/contentHash does not match manifest/);
    expect((failure as P2PTransferError).retryable).toBe(false);
  });

  it('响应比清单短或长都报错：凑不满的末块不落盘，多余的字节取消响应流', async () => {
    const { bytes, manifest } = await fixture();
    const storage = memoryStorage();
    await expect(
      downloadFromServer({
        manifest,
        fallback: { download: async () => streamOf(bytes.slice(0, -1)).stream },
        writeChunk: storage.writeChunk
      })
    ).rejects.toThrow('server response is shorter than manifest');
    expect([...storage.stored.keys()]).toEqual([0, 1]);

    // 1025 字节一段时多出的字节单独成段，700 字节一段时与末块同段到达。
    for (const pieceSize of [700, 1025]) {
      const longer = streamOf(Uint8Array.from([...bytes, 0]), pieceSize);
      await expect(
        downloadFromServer({
          manifest,
          fallback: { download: async () => longer.stream },
          writeChunk: async () => undefined
        })
      ).rejects.toThrow('server response is longer than manifest');
      expect(longer.state.cancelReasons).toHaveLength(1);
    }
  });

  it('读流期间取消：原样抛出取消原因，并取消响应流', async () => {
    const { manifest } = await fixture();
    const cancelReasons: unknown[] = [];
    const stalled = new ReadableStream<Uint8Array>(
      {
        pull: () => new Promise<void>(() => undefined),
        cancel: reason => {
          cancelReasons.push(reason);
        }
      },
      { highWaterMark: 0 }
    );
    const controller = new AbortController();
    const download = downloadFromServer({
      manifest,
      fallback: { download: async () => stalled },
      signal: controller.signal,
      writeChunk: async () => undefined
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const reason = new Error('user cancelled');
    controller.abort(reason);
    await expect(download).rejects.toBe(reason);
    expect(cancelReasons).toEqual([reason]);
  });

  it('提供 readChunk 时读回复核落盘结果，存储写坏就报不可重试的错误', async () => {
    const { bytes, manifest } = await fixture();
    const storage = memoryStorage(1);
    const failure = await downloadFromServer({
      manifest,
      fallback: { download: async () => streamOf(bytes).stream },
      writeChunk: storage.writeChunk,
      readChunk: storage.readChunk
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(P2PTransferError);
    expect((failure as P2PTransferError).message).toMatch(/stored chunk 1 failed verification/);
    expect((failure as P2PTransferError).retryable).toBe(false);
  });

  it('无 peer 时走显式回退，没有配置回退就直接报错', async () => {
    const { bytes, manifest } = await fixture();
    const routes: string[] = [];
    await expect(
      downloadP2PFile({
        manifest,
        sources: [],
        fallback: { download: async () => streamOf(bytes).stream },
        writeChunk: async () => undefined,
        onProgress: progress => routes.push(progress.route)
      })
    ).resolves.toMatchObject({ sourcesUsed: ['server'] });
    expect(routes.every(route => route === 'server')).toBe(true);
    await expect(downloadP2PFile({ manifest, sources: [], writeChunk: async () => undefined })).rejects.toThrow(
      'no peer source is available'
    );
  });

  it('有 peer 时不调用服务器并报告 p2p 路由', async () => {
    const { manifest, bytes } = await fixture();
    const server = vi.fn(async () => streamOf(bytes).stream);
    const progress: string[] = [];
    await expect(
      downloadP2PFile({
        manifest,
        sources: [{ id: 'peer', requestChunk: async request => sliceOf(bytes, request) }],
        fallback: { download: server },
        writeChunk: async () => undefined,
        onProgress: value => progress.push(value.route)
      })
    ).resolves.toMatchObject({ sourcesUsed: ['peer'] });
    expect(server).not.toHaveBeenCalled();
    expect(progress.every(route => route === 'p2p')).toBe(true);
  });

  it('peer 全部不可用时回退服务器并校验服务器内容', async () => {
    const { manifest, bytes } = await fixture();
    const server = vi.fn(async () => streamOf(bytes).stream);
    const result = await downloadP2PFile({
      manifest,
      sources: [{ id: 'offline', requestChunk: async () => new Uint8Array(1024) }],
      fallback: { download: server },
      writeChunk: async () => undefined
    });
    expect(result.sourcesUsed).toEqual(['server']);
    expect(server).toHaveBeenCalledOnce();
  });

  it('P2P 中途失败回退服务器时，已校验落盘的块不再重写', async () => {
    const { manifest, bytes } = await fixture();
    const storage = memoryStorage();
    const progress: string[] = [];
    const result = await downloadP2PFile({
      manifest,
      sources: [
        {
          id: 'partial',
          requestChunk: async request => (request.offset === 2048 ? new Uint8Array(2) : sliceOf(bytes, request))
        }
      ],
      fallback: { download: async () => streamOf(bytes).stream },
      writeChunk: storage.writeChunk,
      readChunk: storage.readChunk,
      concurrency: 1,
      onProgress: value => progress.push(`${value.route}:${value.completedChunks}`)
    });
    expect(result.sourcesUsed).toEqual(['server']);
    expect(progress).toContain('p2p:2');
    expect(storage.writeChunk.mock.calls.map(([index]) => index)).toEqual([0, 1, 2]);
    expect(Uint8Array.from([0, 1, 2].flatMap(index => [...(storage.stored.get(index) ?? [])]))).toEqual(bytes);
  });

  it('P2P 写盘失败是存储故障：不回退服务器', async () => {
    const { manifest, bytes } = await fixture();
    const server = vi.fn(async () => streamOf(bytes).stream);
    await expect(
      downloadP2PFile({
        manifest,
        sources: [{ id: 'peer', requestChunk: async request => sliceOf(bytes, request) }],
        fallback: { download: server },
        writeChunk: async () => {
          throw new Error('disk full');
        }
      })
    ).rejects.toThrow('failed to persist chunk');
    expect(server).not.toHaveBeenCalled();
  });

  it('P2P 落盘复核失败是存储故障：不回退服务器，也不报成功', async () => {
    const { manifest, bytes } = await fixture();
    const storage = memoryStorage(1);
    const server = vi.fn(async () => streamOf(bytes).stream);
    await expect(
      downloadP2PFile({
        manifest,
        sources: [{ id: 'peer', requestChunk: async request => sliceOf(bytes, request) }],
        fallback: { download: server },
        writeChunk: storage.writeChunk,
        readChunk: storage.readChunk
      })
    ).rejects.toThrow(/stored chunk 1 failed verification/);
    expect(server).not.toHaveBeenCalled();
  });
});
