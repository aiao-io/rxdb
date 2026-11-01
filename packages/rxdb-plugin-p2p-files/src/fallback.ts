import { createSha256 } from '@aiao/rxdb';
import { describeChunks, verifyChunk, type P2PChunkDescriptor, type P2PFileManifest } from './chunking.js';
import { isStoredChunkValid, persistChunk, readVerifiedChunk, type ReadStoredChunk } from './stored-chunks.js';
import { P2PTransferError, transferP2PFile, type P2PChunkSource, type P2PTransferResult } from './transfer.js';

/** 服务器回退下载器；实现方负责复用现有 HTTP 适配器的认证配置。 */
export interface P2PServerFallback {
  /** 下载整个文件；返回的字节会先对照清单完整校验再落盘。 */
  readonly download: (options: {
    readonly manifest: P2PFileManifest;
    readonly signal?: AbortSignal;
    readonly token?: string;
  }) => Promise<Uint8Array | Blob>;
}

/** P2P 选路的输入。服务器只在没有可用 peer 或 P2P 可重试地失败时被调用。 */
export interface P2PDownloadOptions {
  /** 请求方信任的清单。 */
  readonly manifest: P2PFileManifest;
  /** 已认证的持有 peer；为空时直接走服务器。 */
  readonly sources: readonly P2PChunkSource[];
  /** 服务器回退下载器；不配置时 P2P 失败直接报错。 */
  readonly fallback?: P2PServerFallback;
  /** 服务器下载使用的认证凭据。 */
  readonly token?: string;
  /** 取消整个下载。 */
  readonly signal?: AbortSignal;
  /** 落盘一个已校验的块。 */
  readonly writeChunk: (index: number, bytes: Uint8Array) => Promise<void>;
  /** 读回已落盘的块：续传、回退时跳过已校验的块，并复核落盘结果。 */
  readonly readChunk?: (index: number) => Promise<Uint8Array>;
  /** 上次已完成的块；要求提供 `readChunk`。 */
  readonly completedChunks?: Iterable<number>;
  /** 单次块请求超时（毫秒）。 */
  readonly requestTimeoutMs?: number;
  /** 同时在途的块请求数，1～8。 */
  readonly concurrency?: number;
  /** 本地进度事件，`route` 标明当前走 P2P 还是服务器。 */
  readonly onProgress?: (progress: {
    readonly completedChunks: number;
    readonly totalChunks: number;
    readonly bytesTransferred: number;
    readonly totalBytes: number;
    readonly route: 'p2p' | 'server';
  }) => void;
}

type ReadRange = (offset: number, size: number) => Promise<Uint8Array>;

const rangeReaderOf = (value: Uint8Array | Blob): ReadRange =>
  value instanceof Blob ?
    async (offset, size) => new Uint8Array(await value.slice(offset, offset + size).arrayBuffer())
  : async (offset, size) => value.slice(offset, offset + size);

/** 落盘前先对照清单逐块校验并核对整文件哈希，任何不符都不写入一个字节。 */
const verifyServerResponse = async (
  readRange: ReadRange,
  descriptors: readonly P2PChunkDescriptor[],
  contentHash: string,
  signal?: AbortSignal
): Promise<void> => {
  const hash = createSha256();
  for (const descriptor of descriptors) {
    signal?.throwIfAborted();
    const chunk = await readRange(descriptor.offset, descriptor.size);
    if (!(await verifyChunk(chunk, descriptor)))
      throw new Error(`server response chunk ${descriptor.index} does not match manifest`);
    hash.update(chunk);
  }
  if (hash.digestHex() !== contentHash) throw new Error('server response contentHash does not match manifest');
};

/** 写入一个服务器块：已校验落盘的块跳过，新写入的块读回复核。 */
const storeServerChunk = async (
  descriptor: P2PChunkDescriptor,
  readRange: ReadRange,
  writeChunk: (index: number, bytes: Uint8Array) => Promise<void>,
  readChunk?: ReadStoredChunk
): Promise<void> => {
  if (readChunk && (await isStoredChunkValid(readChunk, descriptor))) return;
  await persistChunk(writeChunk, descriptor.index, await readRange(descriptor.offset, descriptor.size));
  if (readChunk) await readVerifiedChunk(readChunk, descriptor);
};

/**
 * 校验服务器返回的完整字节并按清单块写入，校验失败时绝不落盘。
 *
 * @remarks
 * 提供 `readChunk` 时，已校验落盘的块（例如 P2P 中途失败前写好的块）不再重写，新写入的块逐块读回复核；
 * 落盘结果与清单不符按存储故障抛出不可重试的 {@link P2PTransferError}。
 */
export async function downloadFromServer(options: {
  readonly manifest: P2PFileManifest;
  readonly fallback: P2PServerFallback;
  readonly signal?: AbortSignal;
  readonly token?: string;
  readonly writeChunk: (index: number, bytes: Uint8Array) => Promise<void>;
  readonly readChunk?: (index: number) => Promise<Uint8Array>;
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
  const readRange = rangeReaderOf(value);
  await verifyServerResponse(readRange, descriptors, options.manifest.contentHash, options.signal);
  for (const descriptor of descriptors) {
    options.signal?.throwIfAborted();
    await storeServerChunk(descriptor, readRange, options.writeChunk, options.readChunk);
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

/**
 * 先尝试 peer；没有 peer 或 P2P 可重试地失败时显式走服务器回退。
 *
 * @remarks
 * 存储故障与清单自相矛盾（不可重试的 {@link P2PTransferError}）、取消以及其它错误原样抛出：
 * 换服务器重下救不回来。
 */
export async function downloadP2PFile(options: P2PDownloadOptions): Promise<P2PTransferResult> {
  const server = (fallback: P2PServerFallback): Promise<P2PTransferResult> =>
    downloadFromServer({
      manifest: options.manifest,
      fallback,
      signal: options.signal,
      token: options.token,
      writeChunk: options.writeChunk,
      readChunk: options.readChunk,
      onProgress: options.onProgress
    });
  if (options.sources.length === 0) {
    if (!options.fallback) throw new Error('no peer source is available and no server fallback was configured');
    return server(options.fallback);
  }
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
    return server(options.fallback);
  }
}
