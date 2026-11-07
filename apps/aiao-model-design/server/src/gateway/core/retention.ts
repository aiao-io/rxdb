import { createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

const TRACE_ID_RE = /^[a-zA-Z0-9-]+$/;
const EXT_RE = /^[a-zA-Z0-9]+$/;

export interface RetentionStoreOptions {
  rootDir?: string;
  ttlMs?: number;
  sweepIntervalMs?: number;
}

/**
 * /tmp/aiao-gateway 落盘 + 5 分钟 TTL 自动清理（FR-043）
 *
 * 用法：
 * - 启动期 new RetentionStore() → 自动 mkdir 0700
 * - 调 `startupSweep()` 清理上次进程崩溃残留
 * - 调 `startInterval()` 开启周期巡检（每 60s `tick()` 一次）
 * - 请求受理时 `register(traceId, ext, payload)` 落盘到 `<rootDir>/<traceId>.<ext>`（0600）
 *
 * 不变式：路径必须以 `<rootDir>/<traceId>.<ext>` 形式，防止路径穿越。
 */
export class RetentionStore {
  readonly #rootDir: string;
  readonly #ttlMs: number;
  readonly #sweepIntervalMs: number;
  #interval: ReturnType<typeof setInterval> | null = null;

  get rootDir(): string {
    return this.#rootDir;
  }

  constructor(opts: RetentionStoreOptions = {}) {
    this.#rootDir = opts.rootDir ?? process.env.GATEWAY_TMP_DIR ?? join(tmpdir(), 'aiao-gateway');
    this.#ttlMs = opts.ttlMs ?? FIVE_MINUTES_MS;
    this.#sweepIntervalMs = opts.sweepIntervalMs ?? SWEEP_INTERVAL_MS;
    mkdirSync(this.#rootDir, { recursive: true, mode: 0o700 });
  }

  /**
   * 落盘请求级二进制 payload，写入 0600 文件
   *
   * @param traceId 文件名前缀，MUST 匹配 `/^[a-zA-Z0-9-]+$/`
   * @param ext 扩展名（不含点），MUST 匹配 `/^[a-zA-Z0-9]+$/`
   * @param payload 内容；支持 Buffer / Uint8Array / Web ReadableStream
   * @returns 落盘后的绝对路径
   */
  async register(
    traceId: string,
    ext: string,
    payload: Buffer | Uint8Array | ReadableStream<Uint8Array>
  ): Promise<string> {
    if (!TRACE_ID_RE.test(traceId)) {
      throw new Error(`RetentionStore.register: invalid traceId "${traceId}"`);
    }
    if (!EXT_RE.test(ext)) {
      throw new Error(`RetentionStore.register: invalid ext "${ext}"`);
    }
    const path = join(this.#rootDir, `${traceId}.${ext}`);
    if (payload instanceof ReadableStream) {
      const nodeReadable = Readable.fromWeb(payload as never);
      const stream = createWriteStream(path, { mode: 0o600 });
      await pipeline(nodeReadable, stream);
    } else {
      await writeFile(path, payload, { mode: 0o600 });
    }
    return path;
  }

  /** 启动期一次性 sweep，返回清理的文件数 */
  async startupSweep(): Promise<number> {
    return this.#sweep();
  }

  /** 周期巡检 tick，返回清理的文件数 */
  async tick(): Promise<number> {
    return this.#sweep();
  }

  /** 启动周期巡检；返回 stop 函数（也可调用 stopInterval()） */
  startInterval(): () => void {
    if (this.#interval) return () => this.stopInterval();
    this.#interval = setInterval(() => {
      this.tick().catch(err => console.error('[gateway] retention sweep failed:', err));
    }, this.#sweepIntervalMs);
    this.#interval.unref?.();
    return () => this.stopInterval();
  }

  stopInterval(): void {
    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }
  }

  async #sweep(): Promise<number> {
    const now = Date.now();
    let removed = 0;
    let entries: string[];
    try {
      entries = readdirSync(this.#rootDir);
    } catch {
      return 0;
    }
    for (const name of entries) {
      const path = join(this.#rootDir, name);
      try {
        const stat = statSync(path);
        if (!stat.isFile()) continue;
        if (now - stat.mtimeMs >= this.#ttlMs) {
          unlinkSync(path);
          removed++;
        }
      } catch {
        // 文件可能在 stat / unlink 间被另一进程清理掉，忽略
      }
    }
    return removed;
  }
}
