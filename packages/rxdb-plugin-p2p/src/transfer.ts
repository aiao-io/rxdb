/** 分块直传、续传、多源与坏 peer 隔离。 */

import { createSha256 } from '@aiao/rxdb';
import { describeChunks, verifyChunk, type P2PChunkDescriptor, type P2PFileManifest } from './chunking.js';
import { P2PTransferError } from './errors.js';
import { isValidChunkRange, MAX_P2P_BUFFERED_CHUNKS } from './limits.js';
import { isStoredChunkValid, persistChunk, readVerifiedChunk, type ReadStoredChunk } from './stored-chunks.js';

/** 一次块请求：按请求方清单的字节区间取数，持有方不必与请求方使用同一块大小。 */
export interface P2PChunkRequest {
  /** 请求的内容哈希。 */
  readonly contentHash: string;
  /** 区间在文件内的起始字节。 */
  readonly offset: number;
  /** 区间字节数。 */
  readonly size: number;
}

/** 能从一个已认证 peer 请求文件块的最小通道。 */
export interface P2PChunkSource {
  /** peer 标识，用于隔离坏 peer 与汇报 `sourcesUsed`。 */
  readonly id: string;
  /** 请求一个字节区间；`signal` 在超时、取消或传输失败时中止。 */
  readonly requestChunk: (request: P2PChunkRequest, signal: AbortSignal) => Promise<Uint8Array>;
}

/** 传输落盘与进度回调。 */
export interface P2PTransferOptions {
  /** 请求方信任的清单：块划分与校验都以它为准。 */
  readonly manifest: P2PFileManifest;
  /** 已认证的持有 peer；按负载分配块，连续失败的 peer 被隔离。 */
  readonly sources: readonly P2PChunkSource[];
  /** 落盘一个已校验的块；写入失败按存储故障处理，不可重试。 */
  readonly writeChunk: (index: number, bytes: Uint8Array) => Promise<void>;
  /**
   * 读回已落盘的块：续传前校验已完成块，传完后逐块复核落盘结果并核对整文件哈希。
   *
   * 省略时按块序流式写入，接收端至多缓冲 8 个块。
   */
  readonly readChunk?: (index: number) => Promise<Uint8Array>;
  /** 上次已完成的块；要求提供 `readChunk`，读不出或校验不过的块会重新拉取。 */
  readonly completedChunks?: Iterable<number>;
  /** 同时在途的块请求数，1～8；默认取 2 与持有 peer 数中的较大者。 */
  readonly concurrency?: number;
  /** 单个块最多尝试次数；默认为 peer 数的两倍且不少于 2。 */
  readonly maxAttemptsPerChunk?: number;
  /** peer 连续失败多少次后被隔离，默认 3；送达一个有效块即清零。 */
  readonly maxPeerFailures?: number;
  /** 单次块请求超时（毫秒），1～2147483647，默认 30000；不理会取消信号的 source 也会按时放弃。 */
  readonly requestTimeoutMs?: number;
  /** 取消整个传输；原因原样透传给调用方。 */
  readonly signal?: AbortSignal;
  /** 每落盘一个块回调一次；回调抛错会中止传输。 */
  readonly onProgress?: (progress: P2PTransferProgress) => void;
}

/** 本地进度事件；不写入同步实体。 */
export interface P2PTransferProgress {
  /** 已落盘的块数。 */
  readonly completedChunks: number;
  /** 文件总块数。 */
  readonly totalChunks: number;
  /** 已落盘的字节数。 */
  readonly bytesTransferred: number;
  /** 文件总字节数。 */
  readonly totalBytes: number;
}

/** 传输完成后的汇总。 */
export interface P2PTransferResult {
  /** 已校验的内容哈希。 */
  readonly contentHash: string;
  /** 落盘并通过校验的块数。 */
  readonly completedChunks: number;
  /** 落盘的字节数（含续传前已完成的部分）。 */
  readonly bytesTransferred: number;
  /** 实际送达过有效块的来源，按首次送达排序。 */
  readonly sourcesUsed: readonly string[];
}

export { P2PTransferError };

const MAX_TIMER_MS = 2 ** 31 - 1;

interface TransferSettings {
  readonly concurrency: number;
  readonly attempts: number;
  readonly peerFailureLimit: number;
  readonly requestTimeoutMs: number;
}

interface SourceState {
  readonly source: P2PChunkSource;
  inFlight: number;
  consecutiveFailures: number;
  lastPicked: number;
}

/** 落盘方式：有 `readChunk` 时随写随存、传完复核；没有时按块序流式写入。 */
interface ChunkSink {
  /** 等到该块进入接收窗口。 */
  admit(index: number, signal: AbortSignal): Promise<void>;
  /** 接收一个已校验的块。 */
  accept(descriptor: P2PChunkDescriptor, bytes: Uint8Array): Promise<void>;
  /** 全部块接收后核对整文件。 */
  finish(): Promise<void>;
}

const integerOption = (name: string, value: number | undefined, defaultValue: number, max: number): number => {
  const resolved = value ?? defaultValue;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > max) {
    throw new RangeError(`${name} must be an integer between 1 and ${max}`);
  }
  return resolved;
};

const resolveSettings = (options: P2PTransferOptions): TransferSettings => ({
  concurrency: integerOption(
    'concurrency',
    options.concurrency,
    Math.min(MAX_P2P_BUFFERED_CHUNKS, Math.max(2, options.sources.length)),
    MAX_P2P_BUFFERED_CHUNKS
  ),
  attempts: integerOption(
    'maxAttemptsPerChunk',
    options.maxAttemptsPerChunk,
    Math.max(2, options.sources.length * 2),
    Number.MAX_SAFE_INTEGER
  ),
  peerFailureLimit: integerOption('maxPeerFailures', options.maxPeerFailures, 3, Number.MAX_SAFE_INTEGER),
  requestTimeoutMs: integerOption('requestTimeoutMs', options.requestTimeoutMs, 30_000, MAX_TIMER_MS)
});

/** 已落盘块读不出或校验不过都按未完成处理，交给重新拉取。 */
const resumedChunks = async (
  options: P2PTransferOptions,
  descriptors: readonly P2PChunkDescriptor[]
): Promise<ReadonlySet<number>> => {
  const candidates = new Set(
    [...(options.completedChunks ?? [])].filter(
      index => Number.isSafeInteger(index) && index >= 0 && index < descriptors.length
    )
  );
  if (candidates.size === 0) return candidates;
  const { readChunk } = options;
  if (!readChunk) throw new P2PTransferError('readChunk is required to verify resumed chunks', { retryable: false });
  const completed = new Set<number>();
  for (const index of candidates) {
    if (await isStoredChunkValid(readChunk, descriptors[index])) completed.add(index);
  }
  return completed;
};

/** 请求与中止信号赛跑：source 不理会信号时也能按时放弃，被放弃的结果不再有人等。 */
const raceAbort = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });

/** 把单次请求的中止信号接到传输信号与超时上；返回解绑函数。 */
const linkRequestAbort = (
  controller: AbortController,
  parent: AbortSignal,
  timeoutMs: number,
  sourceId: string
): (() => void) => {
  const abort = (): void => controller.abort(parent.reason);
  parent.addEventListener('abort', abort, { once: true });
  if (parent.aborted) abort();
  const timer = setTimeout(
    () => controller.abort(new P2PTransferError(`peer ${sourceId} request timed out`)),
    timeoutMs
  );
  return () => {
    clearTimeout(timer);
    parent.removeEventListener('abort', abort);
  };
};

const byLoad = (left: SourceState, right: SourceState): number =>
  left.inFlight - right.inFlight || left.lastPicked - right.lastPicked;

/** 来源池：按在途请求数均衡负载，连续失败达到阈值的来源被隔离。 */
class SourcePool {
  readonly #states: SourceState[];
  readonly #failureLimit: number;
  readonly #delivered = new Set<string>();
  #picks = 0;

  /** 送达过有效块的来源，按首次送达排序。 */
  get used(): readonly string[] {
    return [...this.#delivered];
  }

  constructor(sources: readonly P2PChunkSource[], failureLimit: number) {
    this.#states = sources.map(source => ({ source, inFlight: 0, consecutiveFailures: 0, lastPicked: 0 }));
    this.#failureLimit = failureLimit;
  }

  /** 选一个来源：优先本块还没试过的，其次在途请求最少的，再次最久没被选中的。 */
  pick(tried: ReadonlySet<SourceState>): SourceState | undefined {
    const healthy = this.#states.filter(state => state.consecutiveFailures < this.#failureLimit);
    const untried = healthy.filter(state => !tried.has(state));
    const [chosen] = (untried.length > 0 ? untried : healthy).sort(byLoad);
    if (chosen) chosen.lastPicked = ++this.#picks;
    return chosen;
  }

  succeed(state: SourceState): void {
    state.consecutiveFailures = 0;
    this.#delivered.add(state.source.id);
  }

  fail(state: SourceState): void {
    state.consecutiveFailures += 1;
  }
}

/** 落盘进度：已完成块数与字节数，变化时回调 `onProgress`。 */
class ProgressTracker {
  readonly #options: P2PTransferOptions;
  readonly #totalChunks: number;
  #completedChunks: number;
  #bytes: number;

  constructor(options: P2PTransferOptions, descriptors: readonly P2PChunkDescriptor[], completed: ReadonlySet<number>) {
    this.#options = options;
    this.#totalChunks = descriptors.length;
    this.#completedChunks = completed.size;
    this.#bytes = [...completed].reduce((total, index) => total + descriptors[index].size, 0);
  }

  add(descriptor: P2PChunkDescriptor): void {
    this.#completedChunks += 1;
    this.#bytes += descriptor.size;
    this.report();
  }

  report(): void {
    this.#options.onProgress?.({
      completedChunks: this.#completedChunks,
      totalChunks: this.#totalChunks,
      bytesTransferred: this.#bytes,
      totalBytes: this.#options.manifest.size
    });
  }

  result(sourcesUsed: readonly string[]): P2PTransferResult {
    return {
      contentHash: this.#options.manifest.contentHash,
      completedChunks: this.#completedChunks,
      bytesTransferred: this.#bytes,
      sourcesUsed
    };
  }
}

/** 有 `readChunk`：块随到随写，传完后逐块读回复核并核对整文件哈希。 */
class StoredSink implements ChunkSink {
  readonly #options: P2PTransferOptions;
  readonly #readChunk: ReadStoredChunk;
  readonly #descriptors: readonly P2PChunkDescriptor[];
  readonly #progress: ProgressTracker;

  constructor(
    options: P2PTransferOptions,
    readChunk: ReadStoredChunk,
    descriptors: readonly P2PChunkDescriptor[],
    progress: ProgressTracker
  ) {
    this.#options = options;
    this.#readChunk = readChunk;
    this.#descriptors = descriptors;
    this.#progress = progress;
  }

  async admit(): Promise<void> {
    return undefined;
  }

  async accept(descriptor: P2PChunkDescriptor, bytes: Uint8Array): Promise<void> {
    await persistChunk(this.#options.writeChunk, descriptor.index, bytes);
    this.#progress.add(descriptor);
  }

  async finish(): Promise<void> {
    const hash = createSha256();
    for (const descriptor of this.#descriptors) hash.update(await readVerifiedChunk(this.#readChunk, descriptor));
    if (hash.digestHex() !== this.#options.manifest.contentHash) {
      throw new P2PTransferError('stored file contentHash does not match manifest', { retryable: false });
    }
  }
}

/** 没有 `readChunk`：按块序先算内容哈希再写入，只放行接收窗口内的块。 */
class StreamingSink implements ChunkSink {
  readonly #options: P2PTransferOptions;
  readonly #descriptors: readonly P2PChunkDescriptor[];
  readonly #progress: ProgressTracker;
  readonly #received = new Map<number, Uint8Array>();
  readonly #hash = createSha256();
  readonly #windowWaiters: Array<() => void> = [];
  #nextIndex = 0;
  #flushing: Promise<void> = Promise.resolve();

  constructor(options: P2PTransferOptions, descriptors: readonly P2PChunkDescriptor[], progress: ProgressTracker) {
    this.#options = options;
    this.#descriptors = descriptors;
    this.#progress = progress;
  }

  async admit(index: number, signal: AbortSignal): Promise<void> {
    while (index >= this.#nextIndex + MAX_P2P_BUFFERED_CHUNKS) await this.#windowAdvance(signal);
  }

  async accept(descriptor: P2PChunkDescriptor, bytes: Uint8Array): Promise<void> {
    this.#received.set(descriptor.index, bytes);
    this.#flushing = this.#flushing.then(() => this.#flush());
    await this.#flushing;
  }

  async finish(): Promise<void> {
    if (this.#hash.digestHex() !== this.#options.manifest.contentHash) {
      throw new P2PTransferError('transferred file contentHash does not match manifest', { retryable: false });
    }
  }

  async #flush(): Promise<void> {
    for (let bytes = this.#received.get(this.#nextIndex); bytes; bytes = this.#received.get(this.#nextIndex)) {
      const descriptor = this.#descriptors[this.#nextIndex];
      this.#received.delete(descriptor.index);
      this.#hash.update(bytes);
      await persistChunk(this.#options.writeChunk, descriptor.index, bytes);
      this.#nextIndex += 1;
      for (const wake of this.#windowWaiters.splice(0)) wake();
      this.#progress.add(descriptor);
    }
  }

  #windowAdvance(signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const abort = (): void => reject(signal.reason);
      if (signal.aborted) return abort();
      signal.addEventListener('abort', abort, { once: true });
      this.#windowWaiters.push(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      });
    });
  }
}

/** 一次传输：多个 worker 按块序领取块，各自从来源池挑 peer 取数并交给落盘方式。 */
class TransferRun {
  readonly #options: P2PTransferOptions;
  readonly #settings: TransferSettings;
  readonly #pending: readonly P2PChunkDescriptor[];
  readonly #pool: SourcePool;
  readonly #progress: ProgressTracker;
  readonly #sink: ChunkSink;
  readonly #abort = new AbortController();
  #cursor = 0;

  constructor(
    options: P2PTransferOptions,
    settings: TransferSettings,
    descriptors: readonly P2PChunkDescriptor[],
    completed: ReadonlySet<number>
  ) {
    this.#options = options;
    this.#settings = settings;
    this.#pending = descriptors.filter(descriptor => !completed.has(descriptor.index));
    this.#pool = new SourcePool(options.sources, settings.peerFailureLimit);
    this.#progress = new ProgressTracker(options, descriptors, completed);
    this.#sink =
      options.readChunk ?
        new StoredSink(options, options.readChunk, descriptors, this.#progress)
      : new StreamingSink(options, descriptors, this.#progress);
  }

  async execute(): Promise<P2PTransferResult> {
    const stopOnCallerAbort = (): void => this.#abort.abort(this.#options.signal?.reason);
    this.#options.signal?.addEventListener('abort', stopOnCallerAbort, { once: true });
    if (this.#options.signal?.aborted) stopOnCallerAbort();
    try {
      this.#progress.report();
      await this.#runWorkers();
      await this.#sink.finish();
      return this.#progress.result(this.#pool.used);
    } finally {
      this.#options.signal?.removeEventListener('abort', stopOnCallerAbort);
    }
  }

  async #runWorkers(): Promise<void> {
    const count = Math.min(this.#settings.concurrency, this.#pending.length);
    const workers = Array.from({ length: count }, () =>
      this.#work().catch((error: unknown) => {
        this.#abort.abort(error);
        throw error;
      })
    );
    const results = await Promise.allSettled(workers);
    if (results.some(result => result.status === 'rejected')) throw this.#abort.signal.reason;
  }

  async #work(): Promise<void> {
    for (let descriptor = await this.#next(); descriptor; descriptor = await this.#next()) {
      const bytes = await this.#fetch(descriptor);
      this.#throwIfStopped();
      await this.#sink.accept(descriptor, bytes);
    }
  }

  async #next(): Promise<P2PChunkDescriptor | undefined> {
    this.#throwIfStopped();
    const descriptor = this.#pending[this.#cursor];
    if (!descriptor) return undefined;
    this.#cursor += 1;
    await this.#sink.admit(descriptor.index, this.#abort.signal);
    return descriptor;
  }

  async #fetch(descriptor: P2PChunkDescriptor): Promise<Uint8Array> {
    const tried = new Set<SourceState>();
    let lastError: unknown;
    for (let attempt = 0; attempt < this.#settings.attempts; attempt += 1) {
      const state = this.#pool.pick(tried);
      if (!state) break;
      tried.add(state);
      try {
        return await this.#request(state, descriptor);
      } catch (error) {
        this.#throwIfStopped();
        lastError = error;
        this.#pool.fail(state);
      }
    }
    throw new P2PTransferError(`unable to transfer chunk ${descriptor.index}`, { cause: lastError });
  }

  async #request(state: SourceState, descriptor: P2PChunkDescriptor): Promise<Uint8Array> {
    const { source } = state;
    const controller = new AbortController();
    const unlink = linkRequestAbort(controller, this.#abort.signal, this.#settings.requestTimeoutMs, source.id);
    state.inFlight += 1;
    try {
      const request = {
        contentHash: this.#options.manifest.contentHash,
        offset: descriptor.offset,
        size: descriptor.size
      };
      const bytes = await raceAbort(source.requestChunk(request, controller.signal), controller.signal);
      if (!(await verifyChunk(bytes, descriptor))) {
        throw new P2PTransferError(`peer ${source.id} returned an invalid chunk ${descriptor.index}`);
      }
      this.#pool.succeed(state);
      return bytes;
    } finally {
      state.inFlight -= 1;
      unlink();
    }
  }

  #throwIfStopped(): void {
    if (this.#abort.signal.aborted) throw this.#abort.signal.reason;
  }
}

/**
 * 从多个 peer 拉取清单块。
 *
 * 每个块独立校验；坏块只计入对应 peer 的连续失败次数并换源。已完成块通过 `completedChunks`
 * 跳过，因此网络断开后可以用同一份临时文件继续传输。
 *
 * @throws RangeError 选项越界
 * @throws P2PTransferError 无法取得某个块（可重试），或存储故障、清单自相矛盾（不可重试）
 */
export async function transferP2PFile(options: P2PTransferOptions): Promise<P2PTransferResult> {
  const settings = resolveSettings(options);
  const descriptors = describeChunks(options.manifest);
  if (options.sources.length === 0 && descriptors.length > 0) throw new P2PTransferError('no peer source is available');
  options.signal?.throwIfAborted();
  const completed = await resumedChunks(options, descriptors);
  return new TransferRun(options, settings, descriptors, completed).execute();
}

/**
 * 建立只服务本清单内容的块请求处理器。
 *
 * @remarks
 * 请求按字节区间取数，持有方不必与请求方使用同一块大小；字节正确性由请求方按自己的清单校验。
 */
export function createChunkRequestHandler(
  manifest: P2PFileManifest,
  readRange: (offset: number, size: number) => Promise<Uint8Array>
): (request: P2PChunkRequest, signal?: AbortSignal) => Promise<Uint8Array> {
  return async (request, signal) => {
    if (request.contentHash !== manifest.contentHash)
      throw new P2PTransferError('contentHash is not served by this peer');
    if (!isValidChunkRange(request.offset, request.size)) throw new RangeError('requested chunk range is invalid');
    if (request.offset + request.size > manifest.size) throw new RangeError('requested range is outside the file');
    signal?.throwIfAborted();
    const bytes = await readRange(request.offset, request.size);
    if (bytes.byteLength !== request.size) {
      throw new P2PTransferError(`local read returned ${bytes.byteLength} bytes, expected ${request.size}`);
    }
    return bytes;
  };
}
