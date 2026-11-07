/**
 * 一次下载的进度：块图记下每块由哪个来源送达，校验没通过的送达单独计数。
 *
 * @remarks
 * 包里的 `onProgress` 只给计数，这里在来源外面再包一层：送达的字节先按清单校验，
 * 通过就记下来源，不通过计一次「坏块」——传输本身仍由 `downloadP2PFile` 校验、换源、隔离坏 peer。
 * 不经来源直接落盘的块来自服务器回退。P2P 中途失败后，服务器回退从 0 号块起重写整个文件：
 * 同一块落盘两次只计一次字节；切到服务器之后落盘的块都记在服务器名下——P2P 失败时还在路上的请求
 * 会在这之后才送达，送达记录不再说明落盘的是谁的字节。
 */
import { describeChunk, verifyChunk, type P2PChunkSource, type P2PFileManifest } from '@aiao/rxdb-plugin-p2p';

/** 服务器回退送达的块在块图里的来源名。 */
export const SERVER_SOURCE = 'server';

/** 下载状态。 */
export type TransferState = 'running' | 'done' | 'failed' | 'cancelled';

/** 页面上的一次下载。 */
export interface TransferView {
  readonly id: string;
  readonly contentHash: string;
  readonly fileName: string;
  readonly size: number;
  readonly state: TransferState;
  readonly route: 'p2p' | 'server';
  /** 已落盘的字节数；同一块重写只计一次。 */
  readonly bytes: number;
  /** 每块的来源；还没落盘的为 null。 */
  readonly chunks: readonly (string | null)[];
  /** 没通过校验的送达次数。 */
  readonly rejected: number;
  /** 参与这次下载的来源。 */
  readonly sources: readonly string[];
  readonly error: string | null;
  readonly startedAt: number;
  readonly finishedAt: number | null;
}

/** 下载进度。 */
export class TransferProgress {
  readonly #id: string;
  readonly #manifest: P2PFileManifest;
  readonly #sources: readonly string[];
  readonly #now: () => number;
  readonly #changed: () => void;
  readonly #startedAt: number;
  readonly #chunks: (string | null)[];
  readonly #deliveredBy = new Map<number, string>();
  #bytes = 0;
  #rejected = 0;
  #route: 'p2p' | 'server' = 'p2p';
  #state: TransferState = 'running';
  #error: string | null = null;
  #finishedAt: number | null = null;

  /**
   * @param sources - 参与下载的来源名
   * @param changed - 进度有变化时回调（页面据此节流刷新）
   */
  constructor(
    id: string,
    manifest: P2PFileManifest,
    sources: readonly string[],
    now: () => number,
    changed: () => void
  ) {
    this.#id = id;
    this.#manifest = manifest;
    this.#sources = sources;
    this.#now = now;
    this.#changed = changed;
    this.#startedAt = now();
    this.#chunks = manifest.chunkHashes.map(() => null);
  }

  /** 包一层来源：送达的块按清单校验，记下来源或计一次坏块。 */
  attribute(source: P2PChunkSource): P2PChunkSource {
    return {
      id: source.id,
      requestChunk: async (request, signal) => {
        const bytes = await source.requestChunk(request, signal);
        const index = request.offset / this.#manifest.chunkSize;
        if (await verifyChunk(bytes, describeChunk(this.#manifest, index))) this.#deliveredBy.set(index, source.id);
        else this.#rejected += 1;
        this.#changed();
        return bytes;
      }
    };
  }

  /** 一块已落盘。 */
  written(index: number, byteLength: number): void {
    if (this.#chunks[index] === null) this.#bytes += byteLength;
    this.#chunks[index] = this.#route === 'server' ? SERVER_SOURCE : (this.#deliveredBy.get(index) ?? SERVER_SOURCE);
    this.#changed();
  }

  /** 下载改走另一条路；要在服务器回退写第一块之前调用。 */
  switchRoute(route: 'p2p' | 'server'): void {
    if (route === this.#route) return;
    this.#route = route;
    this.#changed();
  }

  /** 下载结束。 */
  finish(state: Exclude<TransferState, 'running'>, error: string | null = null): void {
    this.#state = state;
    this.#error = error;
    this.#finishedAt = this.#now();
    this.#changed();
  }

  /** 当前快照。 */
  view(): TransferView {
    return {
      id: this.#id,
      contentHash: this.#manifest.contentHash,
      fileName: this.#manifest.fileName,
      size: this.#manifest.size,
      state: this.#state,
      route: this.#route,
      bytes: this.#bytes,
      chunks: [...this.#chunks],
      rejected: this.#rejected,
      sources: this.#sources,
      error: this.#error,
      startedAt: this.#startedAt,
      finishedAt: this.#finishedAt
    };
  }
}
