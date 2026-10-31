import { createSha256 } from '@aiao/rxdb';
import { describeChunks, verifyChunk, type P2PFileManifest } from './chunking.js';
import { P2PTransferError, transferP2PFile, type P2PChunkSource, type P2PTransferResult } from './transfer.js';

/** 服务器兜底下载器；实现方负责复用现有 HTTP 适配器的认证配置。 */
export interface P2PServerFallback {
  readonly download: (options: {
    readonly manifest: P2PFileManifest;
    readonly signal?: AbortSignal;
    readonly token?: string;
  }) => Promise<Uint8Array | Blob>;
}

/** P2P 选路的输入。服务器只在没有可用 peer 时被调用。 */
export interface P2PDownloadOptions {
  readonly manifest: P2PFileManifest;
  readonly sources: readonly P2PChunkSource[];
  readonly fallback?: P2PServerFallback;
  readonly token?: string;
  readonly signal?: AbortSignal;
  readonly writeChunk: (index: number, bytes: Uint8Array) => Promise<void>;
  readonly readChunk?: (index: number) => Promise<Uint8Array>;
  readonly completedChunks?: Iterable<number>;
  readonly requestTimeoutMs?: number;
  readonly concurrency?: number;
  readonly onProgress?: (progress: {
    readonly completedChunks: number;
    readonly totalChunks: number;
    readonly bytesTransferred: number;
    readonly totalBytes: number;
    readonly route: 'p2p' | 'server';
  }) => void;
}

/** 校验服务器返回的完整字节并按清单块写入，校验失败时绝不落盘。 */
export async function downloadFromServer(options: {
  readonly manifest: P2PFileManifest;
  readonly fallback: P2PServerFallback;
  readonly signal?: AbortSignal;
  readonly token?: string;
  readonly writeChunk: (index: number, bytes: Uint8Array) => Promise<void>;
  readonly onProgress?: P2PDownloadOptions['onProgress'];
}): Promise<P2PTransferResult> {
  options.signal?.throwIfAborted();
  const descriptors = describeChunks(options.manifest);
  const value = await options.fallback.download({
    manifest: options.manifest,
    signal: options.signal,
    token: options.token
  });
  options.signal?.throwIfAborted();
  const size = value instanceof Blob ? value.size : value.byteLength;
  if (size !== options.manifest.size) throw new Error('server response size does not match manifest');
  const readChunk = async (offset: number, size: number): Promise<Uint8Array> =>
    value instanceof Blob ?
      new Uint8Array(await value.slice(offset, offset + size).arrayBuffer())
    : value.slice(offset, offset + size);
  const hash = createSha256();
  for (const descriptor of descriptors) {
    options.signal?.throwIfAborted();
    const chunk = await readChunk(descriptor.offset, descriptor.size);
    if (!(await verifyChunk(chunk, descriptor)))
      throw new Error(`server response chunk ${descriptor.index} does not match manifest`);
    hash.update(chunk);
  }
  if (hash.digestHex() !== options.manifest.contentHash)
    throw new Error('server response contentHash does not match manifest');
  for (const descriptor of descriptors) {
    options.signal?.throwIfAborted();
    const chunk = await readChunk(descriptor.offset, descriptor.size);
    options.signal?.throwIfAborted();
    await options.writeChunk(descriptor.index, chunk);
    options.onProgress?.({
      completedChunks: descriptor.index + 1,
      totalChunks: descriptors.length,
      bytesTransferred: descriptor.offset + descriptor.size,
      totalBytes: options.manifest.size,
      route: 'server'
    });
  }
  options.signal?.throwIfAborted();
  return {
    contentHash: options.manifest.contentHash,
    completedChunks: descriptors.length,
    bytesTransferred: size,
    sourcesUsed: ['server']
  };
}

/** 先尝试 peer；没有 peer 时显式走服务器兜底。 */
export async function downloadP2PFile(options: P2PDownloadOptions): Promise<P2PTransferResult> {
  if (options.sources.length > 0) {
    try {
      return await transferP2PFile({
        manifest: options.manifest,
        sources: options.sources,
        signal: options.signal,
        writeChunk: options.writeChunk,
        readChunk: options.readChunk,
        completedChunks: options.completedChunks,
        requestTimeoutMs: options.requestTimeoutMs,
        concurrency: options.concurrency,
        onProgress: progress => options.onProgress?.({ ...progress, route: 'p2p' })
      });
    } catch (error) {
      if (options.signal?.aborted || !options.fallback || !(error instanceof P2PTransferError) || !error.retryable)
        throw error;
      return downloadFromServer({
        manifest: options.manifest,
        fallback: options.fallback,
        signal: options.signal,
        token: options.token,
        writeChunk: options.writeChunk,
        onProgress: options.onProgress
      });
    }
  }
  if (!options.fallback) throw new Error('no peer source is available and no server fallback was configured');
  return downloadFromServer({
    manifest: options.manifest,
    fallback: options.fallback,
    signal: options.signal,
    token: options.token,
    writeChunk: options.writeChunk,
    onProgress: options.onProgress
  });
}
