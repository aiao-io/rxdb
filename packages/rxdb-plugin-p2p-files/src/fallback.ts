import { verifyChunk, verifyContentHash, type P2PFileManifest } from './chunking.js';
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
  const value = await options.fallback.download({ manifest: options.manifest, signal: options.signal, token: options.token });
  const bytes = value instanceof Blob ? new Uint8Array(await value.arrayBuffer()) : value;
  if (bytes.byteLength !== options.manifest.size) throw new Error('server response size does not match manifest');
  const chunks: Uint8Array[] = [];
  for (let offset = 0, index = 0; offset < bytes.byteLength; offset += options.manifest.chunkSize, index += 1) {
    const chunk = bytes.slice(offset, offset + options.manifest.chunkSize);
    if (!(await verifyChunk(chunk, {
      size: Math.min(options.manifest.chunkSize, options.manifest.size - offset),
      hash: options.manifest.chunkHashes[index] ?? ''
    }))) throw new Error(`server response chunk ${index} does not match manifest`);
    chunks.push(chunk);
  }
  if (!(await verifyContentHash(chunks, options.manifest.contentHash))) throw new Error('server response contentHash does not match manifest');
  for (const [index, chunk] of chunks.entries()) {
    await options.writeChunk(index, chunk);
    options.onProgress?.({
      completedChunks: index + 1,
      totalChunks: chunks.length,
      bytesTransferred: Math.min(bytes.byteLength, (index + 1) * options.manifest.chunkSize),
      totalBytes: options.manifest.size,
      route: 'server'
    });
  }
  return {
    contentHash: options.manifest.contentHash,
    completedChunks: chunks.length,
    bytesTransferred: bytes.byteLength,
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
        onProgress: progress => options.onProgress?.({ ...progress, route: 'p2p' })
      });
    } catch (error) {
      if (options.signal?.aborted || !options.fallback || !(error instanceof P2PTransferError) || !error.retryable) throw error;
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
