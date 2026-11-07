import { createSha256 } from '@aiao/rxdb';
import { describeChunks, verifyChunk, type P2PChunkDescriptor, type P2PFileManifest } from './chunking.js';
import { isStoredChunkValid, persistChunk, readVerifiedChunk, type ReadStoredChunk } from './stored-chunks.js';
import { P2PTransferError, transferP2PFile, type P2PChunkSource, type P2PTransferResult } from './transfer.js';

/** 服务器回退下载器；实现方负责复用现有 HTTP 适配器的认证配置。 */
export interface P2PServerFallback {
  /**
   * 打开整个文件的字节流，例如 `fetch()` 响应的 `body`。
   *
   * @remarks
   * 字节按清单切块、逐块校验通过才落盘，读流时只缓冲凑满当前块所需的字节，整个文件不进内存；
   * 下载失败或取消时流会被取消，以释放底层连接。
   */
  readonly download: (options: {
    readonly manifest: P2PFileManifest;
    readonly signal?: AbortSignal;
    readonly token?: string;
  }) => Promise<ReadableStream<Uint8Array>>;
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

/** 逐块落盘用到的选项，取自 {@link downloadFromServer} 的参数。 */
interface ServerChunkOptions {
  readonly manifest: P2PFileManifest;
  readonly signal?: AbortSignal;
  readonly writeChunk: (index: number, bytes: Uint8Array) => Promise<void>;
  readonly readChunk?: ReadStoredChunk;
  readonly onProgress?: P2PDownloadOptions['onProgress'];
}

/** 把任意分段到达的响应流重新切成清单块：只缓冲凑满当前块所需的字节和流里的一段余量。 */
class StreamChunker {
  readonly #reader: ReadableStreamDefaultReader<Uint8Array>;
  #pending: Uint8Array = new Uint8Array(0);

  constructor(stream: ReadableStream<Uint8Array>) {
    this.#reader = stream.getReader();
  }

  /** 读出恰好 `size` 字节；流提前结束即报响应短于清单。 */
  async read(size: number): Promise<Uint8Array> {
    const chunk = new Uint8Array(size);
    let filled = 0;
    while (filled < size) {
      if (this.#pending.byteLength === 0) this.#pending = await this.#pull();
      const part = this.#pending.subarray(0, size - filled);
      chunk.set(part, filled);
      filled += part.byteLength;
      this.#pending = this.#pending.subarray(part.byteLength);
    }
    return chunk;
  }

  /** 清单之外不得再有字节。 */
  async assertEnded(): Promise<void> {
    while (this.#pending.byteLength === 0) {
      const { done, value } = await this.#reader.read();
      if (done) return;
      this.#pending = value;
    }
    throw new Error('server response is longer than manifest');
  }

  /** 取消响应流以释放底层连接；流已出错时取消会拒绝，那时没有连接可释放。 */
  async cancel(reason: unknown): Promise<void> {
    await this.#reader.cancel(reason).catch(() => undefined);
  }

  async #pull(): Promise<Uint8Array> {
    const { done, value } = await this.#reader.read();
    if (done) throw new Error('server response is shorter than manifest');
    return value;
  }
}

/** 写入一个已校验的服务器块：已校验落盘的块跳过，新写入的块读回复核。 */
const storeServerChunk = async (
  descriptor: P2PChunkDescriptor,
  chunk: Uint8Array,
  options: ServerChunkOptions
): Promise<void> => {
  const { readChunk } = options;
  if (readChunk && (await isStoredChunkValid(readChunk, descriptor))) return;
  await persistChunk(options.writeChunk, descriptor.index, chunk);
  if (readChunk) await readVerifiedChunk(readChunk, descriptor);
};

/** 按块序读流、校验、落盘并累计整文件哈希；任何一块不符都在它落盘前报错。 */
const storeServerStream = async (
  chunker: StreamChunker,
  descriptors: readonly P2PChunkDescriptor[],
  options: ServerChunkOptions
): Promise<void> => {
  const hash = createSha256();
  for (const descriptor of descriptors) {
    options.signal?.throwIfAborted();
    const chunk = await chunker.read(descriptor.size);
    if (!(await verifyChunk(chunk, descriptor)))
      throw new Error(`server response chunk ${descriptor.index} does not match manifest`);
    hash.update(chunk);
    await storeServerChunk(descriptor, chunk, options);
    options.onProgress?.({
      completedChunks: descriptor.index + 1,
      totalChunks: descriptors.length,
      bytesTransferred: descriptor.offset + descriptor.size,
      totalBytes: options.manifest.size,
      route: 'server'
    });
  }
  await chunker.assertEnded();
  if (hash.digestHex() !== options.manifest.contentHash) {
    throw new P2PTransferError('server response contentHash does not match manifest', { retryable: false });
  }
};

/**
 * 按清单逐块校验服务器响应流并落盘：坏块不落盘，响应长度不符即报错，整个文件不进内存。
 *
 * @remarks
 * 校验通过的块随读随写，后面的块出错时已写的块留给续传。提供 `readChunk` 时，已校验落盘的块
 * （例如 P2P 中途失败前写好的块）不再重写，新写入的块逐块读回复核。落盘结果与清单不符、
 * 逐块都对而整文件哈希不符（清单自相矛盾）抛不可重试的 {@link P2PTransferError}。
 * 失败或取消时取消响应流；取消原因原样抛给调用方。
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
  const stream = await options.fallback.download({
    manifest: options.manifest,
    signal: options.signal,
    token: options.token
  });
  const chunker = new StreamChunker(stream);
  // 下载器不一定把 signal 接到流上：取消时主动取消流，挂起的读随之结束。
  const cancelOnAbort = (): void => void chunker.cancel(options.signal?.reason);
  options.signal?.addEventListener('abort', cancelOnAbort, { once: true });
  if (options.signal?.aborted) cancelOnAbort();
  try {
    await storeServerStream(chunker, descriptors, options);
  } catch (error) {
    await chunker.cancel(error);
    options.signal?.throwIfAborted();
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', cancelOnAbort);
  }
  options.signal?.throwIfAborted();
  return {
    contentHash: options.manifest.contentHash,
    completedChunks: descriptors.length,
    bytesTransferred: options.manifest.size,
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
