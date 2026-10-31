/** 分块直传、续传、多源与坏 peer 隔离。 */

import { createSha256 } from '@aiao/rxdb';
import { describeChunk, describeChunks, verifyChunk, type P2PFileManifest } from './chunking.js';

/** 能从一个已认证 peer 请求文件块的最小通道。 */
export interface P2PChunkSource {
  readonly id: string;
  readonly requestChunk: (contentHash: string, index: number, signal: AbortSignal) => Promise<Uint8Array>;
}

/** 传输落盘与进度回调。 */
export interface P2PTransferOptions {
  readonly manifest: P2PFileManifest;
  readonly sources: readonly P2PChunkSource[];
  readonly writeChunk: (index: number, bytes: Uint8Array) => Promise<void>;
  readonly readChunk?: (index: number) => Promise<Uint8Array>;
  readonly completedChunks?: Iterable<number>;
  readonly concurrency?: number;
  readonly maxAttemptsPerChunk?: number;
  readonly maxPeerFailures?: number;
  readonly requestTimeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: P2PTransferProgress) => void;
}

export interface P2PTransferProgress {
  readonly completedChunks: number;
  readonly totalChunks: number;
  readonly bytesTransferred: number;
  readonly totalBytes: number;
}

export interface P2PTransferResult {
  readonly contentHash: string;
  readonly completedChunks: number;
  readonly bytesTransferred: number;
  readonly sourcesUsed: readonly string[];
}

export class P2PTransferError extends Error {
  readonly code = 'P2P_TRANSFER_FAILED' as const;
  readonly retryable: boolean;
  constructor(message: string, options?: { readonly cause?: unknown; readonly retryable?: boolean }) {
    super(message, options);
    this.name = 'P2PTransferError';
    this.retryable = options?.retryable ?? true;
  }
}

/**
 * 从多个 peer 拉取清单块。
 *
 * 每个块独立校验；坏块只计入对应 peer 的失败次数并切换来源。已完成块通过
 * `completedChunks` 跳过，因此网络断开后可以用同一份临时文件继续传输。
 */
export async function transferP2PFile(options: P2PTransferOptions): Promise<P2PTransferResult> {
  const { manifest, sources } = options;
  const descriptors = describeChunks(manifest);
  if (sources.length === 0 && descriptors.length > 0) throw new P2PTransferError('no peer source is available');
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 2, Math.max(1, descriptors.length)));
  const attemptsLimit = Math.max(1, options.maxAttemptsPerChunk ?? Math.max(2, sources.length * 2));
  const peerFailureLimit = Math.max(1, options.maxPeerFailures ?? 3);
  const requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? 30_000);
  const completed = new Set<number>();
  for (const index of options.completedChunks ?? []) {
    if (Number.isSafeInteger(index) && index >= 0 && index < descriptors.length) completed.add(index);
  }
  if (completed.size > 0 && !options.readChunk) {
    throw new P2PTransferError('readChunk is required to verify resumed chunks', { retryable: false });
  }
  if (options.readChunk) {
    for (const index of [...completed]) {
      const bytes = await options.readChunk(index);
      if (!(await verifyChunk(bytes, descriptors[index]))) completed.delete(index);
    }
  }
  const pending = descriptors.filter(descriptor => !completed.has(descriptor.index));
  const failures = new Map<string, number>();
  const used = new Set<string>();
  const workerAbort = new AbortController();
  const receivedForHash = new Map<number, Uint8Array>();
  const contentHasher = options.readChunk ? undefined : createSha256();
  let nextHashIndex = 0;
  let bytesTransferred = descriptors
    .filter(descriptor => completed.has(descriptor.index))
    .reduce((total, descriptor) => total + descriptor.size, 0);
  let cursor = 0;
  const report = (): void => {
    options.onProgress?.({
      completedChunks: completed.size,
      totalChunks: descriptors.length,
      bytesTransferred,
      totalBytes: manifest.size
    });
  };
  report();

  const worker = async (): Promise<void> => {
    while (cursor < pending.length) {
      if (options.signal?.aborted || workerAbort.signal.aborted)
        throw (
          options.signal?.reason ??
          workerAbort.signal.reason ??
          new DOMException('The operation was aborted', 'AbortError')
        );
      const descriptor = pending[cursor++];
      let lastError: unknown;
      for (let attempt = 0; attempt < attemptsLimit; attempt++) {
        const source = selectSource(sources, failures, attempt);
        if (!source) break;
        used.add(source.id);
        const controller = new AbortController();
        const abort = (): void => controller.abort(options.signal?.reason ?? workerAbort.signal.reason);
        options.signal?.addEventListener('abort', abort, { once: true });
        workerAbort.signal.addEventListener('abort', abort, { once: true });
        const timeout = setTimeout(
          () => controller.abort(new P2PTransferError(`peer ${source.id} request timed out`)),
          requestTimeoutMs
        );
        try {
          const bytes = await source.requestChunk(manifest.contentHash, descriptor.index, controller.signal);
          if (!(await verifyChunk(bytes, descriptor))) {
            throw new P2PTransferError(`peer ${source.id} returned an invalid chunk ${descriptor.index}`);
          }
          if (options.signal?.aborted || workerAbort.signal.aborted)
            throw (
              options.signal?.reason ??
              workerAbort.signal.reason ??
              new DOMException('The operation was aborted', 'AbortError')
            );
          try {
            await options.writeChunk(descriptor.index, bytes);
          } catch (error) {
            throw new P2PTransferError(`failed to persist chunk ${descriptor.index}`, {
              cause: error,
              retryable: false
            });
          }
          completed.add(descriptor.index);
          if (contentHasher) {
            receivedForHash.set(descriptor.index, bytes);
            while (receivedForHash.has(nextHashIndex)) {
              contentHasher.update(receivedForHash.get(nextHashIndex) as Uint8Array);
              receivedForHash.delete(nextHashIndex);
              nextHashIndex += 1;
            }
          }
          bytesTransferred += bytes.byteLength;
          report();
          lastError = undefined;
          break;
        } catch (error) {
          if (options.signal?.aborted || workerAbort.signal.aborted)
            throw (
              options.signal?.reason ??
              workerAbort.signal.reason ??
              new DOMException('The operation was aborted', 'AbortError')
            );
          if (error instanceof P2PTransferError && !error.retryable) throw error;
          lastError = error;
          failures.set(source.id, (failures.get(source.id) ?? 0) + 1);
          if ((failures.get(source.id) ?? 0) >= peerFailureLimit) failures.set(source.id, Number.MAX_SAFE_INTEGER);
        } finally {
          clearTimeout(timeout);
          options.signal?.removeEventListener('abort', abort);
          workerAbort.signal.removeEventListener('abort', abort);
        }
      }
      if (!completed.has(descriptor.index)) {
        throw new P2PTransferError(`unable to transfer chunk ${descriptor.index}`, { cause: lastError });
      }
    }
  };
  const workers = Array.from({ length: concurrency }, () => worker());
  try {
    await Promise.all(workers);
  } catch (error) {
    workerAbort.abort(error);
    await Promise.allSettled(workers);
    throw error;
  }

  if (options.readChunk) {
    const hash = createSha256();
    for (const descriptor of descriptors) {
      const bytes = await options.readChunk(descriptor.index);
      if (!(await verifyChunk(bytes, descriptor)))
        throw new P2PTransferError(`stored chunk ${descriptor.index} failed verification`);
      hash.update(bytes);
    }
    if (hash.digestHex() !== manifest.contentHash) {
      throw new P2PTransferError('stored file contentHash does not match manifest');
    }
  } else if (
    contentHasher &&
    (nextHashIndex !== descriptors.length || contentHasher.digestHex() !== manifest.contentHash)
  ) {
    throw new P2PTransferError('transferred file contentHash does not match manifest');
  }
  return {
    contentHash: manifest.contentHash,
    completedChunks: completed.size,
    bytesTransferred,
    sourcesUsed: [...used]
  };
}

function selectSource(
  sources: readonly P2PChunkSource[],
  failures: ReadonlyMap<string, number>,
  attempt: number
): P2PChunkSource | undefined {
  const available = sources.filter(source => (failures.get(source.id) ?? 0) < Number.MAX_SAFE_INTEGER);
  if (available.length === 0) return undefined;
  return available[attempt % available.length];
}

/** 建立一个只允许清单声明块的 peer 请求处理器。 */
export function createChunkRequestHandler(
  manifest: P2PFileManifest,
  readChunk: (index: number) => Promise<Uint8Array>
): (contentHash: string, index: number, signal?: AbortSignal) => Promise<Uint8Array> {
  return async (contentHash, index, signal) => {
    if (contentHash !== manifest.contentHash) throw new P2PTransferError('contentHash is not served by this peer');
    if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
    const descriptor = describeChunk(manifest, index);
    const bytes = await readChunk(index);
    if (!(await verifyChunk(bytes, descriptor)))
      throw new P2PTransferError(`local chunk ${index} does not match manifest`);
    return bytes;
  };
}
