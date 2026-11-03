import { describe, expect, it, vi } from 'vitest';
import { createP2PFileManifest, digestSha256Hex, type P2PFileManifest } from './chunking.js';
import { P2PTransferError, transferP2PFile, type P2PChunkRequest, type P2PChunkSource } from './transfer.js';

const CHUNK = 1024;

const makeFile = async (chunkCount: number): Promise<{ manifest: P2PFileManifest; bytes: Uint8Array }> => {
  const bytes = Uint8Array.from({ length: chunkCount * CHUNK }, (_, offset) => (offset * 7 + (offset >> 10)) % 251);
  const manifest = await createP2PFileManifest({
    fileName: 'fixture.bin',
    size: bytes.byteLength,
    chunkSize: CHUNK,
    readChunk: async (offset, size) => bytes.slice(offset, offset + size)
  });
  return { manifest, bytes };
};

const indexOf = (request: P2PChunkRequest): number => request.offset / CHUNK;
const sliceOf = (bytes: Uint8Array, request: P2PChunkRequest): Uint8Array =>
  bytes.slice(request.offset, request.offset + request.size);
const delay = (ms: number): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, ms));
const discard = async (): Promise<void> => undefined;

describe('P2P 多源调度', () => {
  it('每个 peer 只持有部分块时，按块换到持有它的 peer', async () => {
    const { manifest, bytes } = await makeFile(2);
    const requests: string[] = [];
    const holderOf = (id: string, index: number): P2PChunkSource => ({
      id,
      requestChunk: async request => {
        requests.push(`${id}:${indexOf(request)}`);
        if (indexOf(request) !== index) throw new Error(`${id} does not have this chunk`);
        return sliceOf(bytes, request);
      }
    });
    const result = await transferP2PFile({
      manifest,
      sources: [holderOf('peer-a', 0), holderOf('peer-b', 1)],
      concurrency: 1,
      maxAttemptsPerChunk: 3,
      writeChunk: discard
    });

    expect(result.completedChunks).toBe(2);
    expect(result.sourcesUsed).toEqual(['peer-a', 'peer-b']);
    expect(requests).toEqual(['peer-a:0', 'peer-b:1']);
  });

  it('多个健康 peer 并行分担块，而不是全部压在第一个 peer 上', async () => {
    const { manifest, bytes } = await makeFile(20);
    const served = new Map<string, number>();
    const healthy = (id: string): P2PChunkSource => ({
      id,
      requestChunk: async request => {
        served.set(id, (served.get(id) ?? 0) + 1);
        await delay(1);
        return sliceOf(bytes, request);
      }
    });
    const result = await transferP2PFile({
      manifest,
      sources: [healthy('a'), healthy('b')],
      concurrency: 2,
      writeChunk: discard
    });

    expect(served.get('a')).toBeGreaterThan(0);
    expect(served.get('b')).toBeGreaterThan(0);
    expect((served.get('a') ?? 0) + (served.get('b') ?? 0)).toBe(20);
    expect(result.sourcesUsed).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('慢源排在前面时，快源承担大部分块', async () => {
    const { manifest, bytes } = await makeFile(20);
    const served = { slow: 0, fast: 0 };
    const slow: P2PChunkSource = {
      id: 'slow',
      requestChunk: async request => {
        served.slow += 1;
        await delay(40);
        return sliceOf(bytes, request);
      }
    };
    const fast: P2PChunkSource = {
      id: 'fast',
      requestChunk: async request => {
        served.fast += 1;
        return sliceOf(bytes, request);
      }
    };
    await transferP2PFile({ manifest, sources: [slow, fast], concurrency: 2, writeChunk: discard });

    expect(served.fast).toBeGreaterThan(served.slow);
  });

  it('偶发失败不会累计拉黑健康 peer：成功一次就清零连续失败计数', async () => {
    const { manifest, bytes } = await makeFile(10);
    const failOnce = new Set([1, 4, 7]);
    const flaky: P2PChunkSource = {
      id: 'flaky',
      requestChunk: async request => {
        if (failOnce.delete(indexOf(request))) throw new Error('transient');
        return sliceOf(bytes, request);
      }
    };
    await expect(
      transferP2PFile({ manifest, sources: [flaky], concurrency: 1, writeChunk: discard })
    ).resolves.toMatchObject({ completedChunks: 10, sourcesUsed: ['flaky'] });
  });

  it('坏 peer 连续失败达到阈值后被隔离，不再污染后续块', async () => {
    const { manifest, bytes } = await makeFile(2);
    let badCalls = 0;
    const bad: P2PChunkSource = {
      id: 'bad',
      requestChunk: async () => {
        badCalls += 1;
        return new Uint8Array(CHUNK);
      }
    };
    const good: P2PChunkSource = { id: 'good', requestChunk: async request => sliceOf(bytes, request) };
    const result = await transferP2PFile({
      manifest,
      sources: [bad, good],
      concurrency: 1,
      maxAttemptsPerChunk: 4,
      maxPeerFailures: 1,
      writeChunk: discard
    });

    expect(badCalls).toBe(1);
    expect(result.sourcesUsed).toEqual(['good']);
  });

  it('source 收到的是请求方清单里的字节区间', async () => {
    const { manifest, bytes } = await makeFile(3);
    const requests: P2PChunkRequest[] = [];
    await transferP2PFile({
      manifest,
      sources: [
        {
          id: 'peer',
          requestChunk: async request => {
            requests.push(request);
            return sliceOf(bytes, request);
          }
        }
      ],
      concurrency: 1,
      writeChunk: discard
    });
    expect(requests).toEqual(
      [0, 1, 2].map(index => ({ contentHash: manifest.contentHash, offset: index * CHUNK, size: CHUNK }))
    );
  });
});

describe('P2P 传输的内存与落盘', () => {
  it('流式落盘只在滑动窗口内取块：靠前的块卡住不会把后面的块全部堆进内存', async () => {
    const { manifest, bytes } = await makeFile(40);
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => (releaseFirst = resolve));
    const requested: number[] = [];
    const source: P2PChunkSource = {
      id: 'peer',
      requestChunk: async request => {
        requested.push(indexOf(request));
        if (indexOf(request) === 0) await firstGate;
        return sliceOf(bytes, request);
      }
    };
    const task = transferP2PFile({ manifest, sources: [source], concurrency: 4, writeChunk: discard });
    await delay(20);

    expect(Math.max(...requested)).toBeLessThan(8);
    releaseFirst();
    await expect(task).resolves.toMatchObject({ completedChunks: 40 });
  });

  it('流式落盘按块序写入，且先算内容哈希再把字节交给 writeChunk', async () => {
    const { manifest, bytes } = await makeFile(4);
    const written: number[] = [];
    const result = await transferP2PFile({
      manifest,
      sources: [{ id: 'peer', requestChunk: async request => sliceOf(bytes, request) }],
      concurrency: 2,
      writeChunk: async (_index, chunk) => {
        written.push(...chunk);
        chunk.fill(0);
      }
    });
    expect(result.completedChunks).toBe(4);
    expect(Uint8Array.from(written)).toEqual(bytes);
  });

  it('续传时已完成块读不出来就当作未完成，重新拉取', async () => {
    const { manifest, bytes } = await makeFile(2);
    const stored = new Map<number, Uint8Array>([[1, bytes.slice(CHUNK)]]);
    const result = await transferP2PFile({
      manifest,
      sources: [{ id: 'peer', requestChunk: async request => sliceOf(bytes, request) }],
      completedChunks: [0, 1],
      readChunk: async index => {
        const chunk = stored.get(index);
        if (!chunk) throw new Error('ENOENT');
        return chunk;
      },
      writeChunk: async (index, chunk) => void stored.set(index, chunk)
    });
    expect(result.completedChunks).toBe(2);
    expect(stored.get(0)).toEqual(bytes.slice(0, CHUNK));
  });

  it('续传前发现坏块时重新拉取该块', async () => {
    const { manifest, bytes } = await makeFile(2);
    const stored = new Map<number, Uint8Array>([
      [0, new Uint8Array([9, 9, 9])],
      [1, bytes.slice(CHUNK)]
    ]);
    const result = await transferP2PFile({
      manifest,
      sources: [{ id: 'peer', requestChunk: async request => sliceOf(bytes, request) }],
      completedChunks: [0, 1],
      readChunk: async index => stored.get(index) as Uint8Array,
      writeChunk: async (index, chunk) => void stored.set(index, chunk)
    });
    expect(result.completedChunks).toBe(2);
    expect(stored.get(0)).toEqual(bytes.slice(0, CHUNK));
  });

  it('落盘读回校验失败是存储故障：报错且不可重试', async () => {
    const { manifest, bytes } = await makeFile(3);
    const stored = new Map<number, Uint8Array>();
    const failure = await transferP2PFile({
      manifest,
      sources: [{ id: 'peer', requestChunk: async request => sliceOf(bytes, request) }],
      readChunk: async index => stored.get(index) as Uint8Array,
      writeChunk: async (index, chunk) => void stored.set(index, index === 1 ? chunk.slice(1) : chunk)
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(P2PTransferError);
    expect((failure as P2PTransferError).message).toMatch(/stored chunk 1 failed verification/);
    expect((failure as P2PTransferError).retryable).toBe(false);
  });

  it('写盘失败、读回失败与清单自相矛盾都是不可重试的故障', async () => {
    const { manifest, bytes } = await makeFile(2);
    const sources = [{ id: 'peer', requestChunk: async (request: P2PChunkRequest) => sliceOf(bytes, request) }];
    const stored = new Map<number, Uint8Array>();
    const failures = await Promise.all([
      transferP2PFile({
        manifest,
        sources,
        writeChunk: async () => {
          throw new Error('disk full');
        }
      }).catch((error: unknown) => error),
      transferP2PFile({
        manifest,
        sources,
        readChunk: async () => {
          throw new Error('EIO');
        },
        writeChunk: discard
      }).catch((error: unknown) => error),
      transferP2PFile({
        manifest: { ...manifest, contentHash: '0'.repeat(64) },
        sources,
        readChunk: async index => stored.get(index) as Uint8Array,
        writeChunk: async (index, chunk) => void stored.set(index, chunk)
      }).catch((error: unknown) => error)
    ]);
    expect(failures.map(failure => (failure as Error).message)).toEqual([
      'failed to persist chunk 0',
      'failed to read stored chunk 0',
      'stored file contentHash does not match manifest'
    ]);
    expect(failures.every(failure => failure instanceof P2PTransferError && !failure.retryable)).toBe(true);
  });

  it('给了已完成块却没有 readChunk 时直接报错', async () => {
    const { manifest, bytes } = await makeFile(2);
    await expect(
      transferP2PFile({
        manifest,
        sources: [{ id: 'peer', requestChunk: async request => sliceOf(bytes, request) }],
        completedChunks: [0],
        writeChunk: discard
      })
    ).rejects.toThrow('readChunk is required');
  });

  it('没有 readChunk 时仍校验收到的完整文件哈希', async () => {
    const { manifest, bytes } = await makeFile(2);
    const badManifest = { ...manifest, contentHash: await digestSha256Hex(new Uint8Array([99])) };
    await expect(
      transferP2PFile({
        manifest: badManifest,
        sources: [{ id: 'peer', requestChunk: async request => sliceOf(bytes, request) }],
        writeChunk: discard
      })
    ).rejects.toThrow('contentHash does not match');
  });
});

describe('P2P 传输的取消、超时与参数', () => {
  it('在开始传输前尊重已取消的信号', async () => {
    const { manifest } = await makeFile(2);
    const controller = new AbortController();
    controller.abort(new Error('cancelled by caller'));
    const requestChunk = vi.fn();

    await expect(
      transferP2PFile({
        manifest,
        sources: [{ id: 'peer', requestChunk }],
        signal: controller.signal,
        writeChunk: discard
      })
    ).rejects.toThrow('cancelled by caller');
    expect(requestChunk).not.toHaveBeenCalled();
  });

  it('传输中的取消原样透传调用方原因', async () => {
    const { manifest } = await makeFile(2);
    const controller = new AbortController();
    const requestChunk = async (_request: P2PChunkRequest, signal: AbortSignal): Promise<Uint8Array> =>
      new Promise<Uint8Array>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    const task = transferP2PFile({
      manifest,
      sources: [{ id: 'peer', requestChunk }],
      signal: controller.signal,
      writeChunk: discard
    });
    controller.abort(new Error('cancelled during transfer'));
    await expect(task).rejects.toThrow('cancelled during transfer');
  });

  it('在接收窗口外等待时被取消，同样原样透传调用方原因', async () => {
    const { manifest, bytes } = await makeFile(40);
    const controller = new AbortController();
    const source: P2PChunkSource = {
      id: 'peer',
      requestChunk: (request, signal) =>
        indexOf(request) === 0 ?
          new Promise<Uint8Array>((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason), { once: true })
          )
        : Promise.resolve(sliceOf(bytes, request))
    };
    const task = transferP2PFile({
      manifest,
      sources: [source],
      concurrency: 4,
      signal: controller.signal,
      writeChunk: discard
    });
    await delay(10);
    controller.abort(new Error('cancelled while the window is full'));
    await expect(task).rejects.toThrow('cancelled while the window is full');
  });

  it('不响应取消信号的 source 也会按超时放弃，传输不会永久挂起', async () => {
    const { manifest } = await makeFile(2);
    const hanging: P2PChunkSource = { id: 'hanging', requestChunk: () => new Promise<Uint8Array>(() => undefined) };
    const outcome = await Promise.race([
      transferP2PFile({
        manifest,
        sources: [hanging],
        requestTimeoutMs: 10,
        maxAttemptsPerChunk: 1,
        writeChunk: discard
      }).catch((error: unknown) => error),
      delay(1000).then(() => 'hung')
    ]);
    expect(outcome).toBeInstanceOf(P2PTransferError);
    expect((outcome as Error).message).toMatch(/unable to transfer chunk/);
  });

  it('onProgress 抛错原样中止传输，不算到 peer 头上', async () => {
    const { manifest, bytes } = await makeFile(2);
    const requestChunk = vi.fn(async (request: P2PChunkRequest) => sliceOf(bytes, request));
    const failure = new Error('progress listener broke');
    let calls = 0;
    await expect(
      transferP2PFile({
        manifest,
        sources: [{ id: 'peer', requestChunk }],
        concurrency: 1,
        writeChunk: discard,
        onProgress: () => {
          calls += 1;
          if (calls === 2) throw failure;
        }
      })
    ).rejects.toBe(failure);
    expect(requestChunk).toHaveBeenCalledTimes(1);
  });

  it('拒绝非法的超时、并发、重试与隔离阈值，而不是悄悄改成别的值', async () => {
    const { manifest, bytes } = await makeFile(1);
    const base = {
      manifest,
      sources: [{ id: 'peer', requestChunk: async (request: P2PChunkRequest) => sliceOf(bytes, request) }],
      writeChunk: discard
    };
    const invalid = [
      ...[0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, 2 ** 31].map(requestTimeoutMs => ({ requestTimeoutMs })),
      ...[0, 9, 1.5].map(concurrency => ({ concurrency })),
      { maxAttemptsPerChunk: 0 },
      { maxPeerFailures: 0 }
    ];
    for (const options of invalid) {
      await expect(transferP2PFile({ ...base, ...options })).rejects.toThrow(RangeError);
    }
  });
});
