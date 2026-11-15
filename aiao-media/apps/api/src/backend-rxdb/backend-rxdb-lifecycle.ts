import type { RxDB } from '@aiao/rxdb';
import type { BackendRxdbSession } from './backend-rxdb.ts';

export type BackendRxdbLifecycleState = 'idle' | 'starting' | 'online' | 'paused' | 'retrying' | 'closed' | 'error';

export interface BackendRxdbLifecycleOptions {
  syncIntervalMs?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  onStateChange?: (state: BackendRxdbLifecycleState) => void;
  onError?: (error: unknown) => void;
}

export interface BackendRxdbSyncResult {
  branches: unknown;
  sync: unknown;
}

const DEFAULT_SYNC_INTERVAL_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 60_000;

export class BackendRxdbLifecycle {
  #state: BackendRxdbLifecycleState = 'idle';
  #timer: ReturnType<typeof setTimeout> | null = null;
  #syncPromise: Promise<BackendRxdbSyncResult> | null = null;
  #retryDelayMs: number;
  #closed = false;

  readonly #syncIntervalMs: number;
  readonly #maxRetryDelayMs: number;
  readonly #onStateChange?: (state: BackendRxdbLifecycleState) => void;
  readonly #onError?: (error: unknown) => void;

  readonly #session: BackendRxdbSession;

  get state(): BackendRxdbLifecycleState {
    return this.#state;
  }

  constructor(session: BackendRxdbSession, options: BackendRxdbLifecycleOptions = {}) {
    this.#session = session;
    this.#syncIntervalMs = positiveDuration(options.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS, 'syncIntervalMs');
    this.#retryDelayMs = positiveDuration(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS, 'retryDelayMs');
    this.#maxRetryDelayMs = positiveDuration(options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS, 'maxRetryDelayMs');
    if (this.#retryDelayMs > this.#maxRetryDelayMs) throw new Error('maxRetryDelayMs must be greater than or equal to retryDelayMs');
    this.#onStateChange = options.onStateChange;
    this.#onError = options.onError;
  }

  async start(): Promise<BackendRxdbSyncResult> {
    if (this.#closed) throw new Error('backend RxDB lifecycle is closed');
    if (this.#state === 'online') return this.syncNow();
    if (this.#state === 'starting' && this.#syncPromise) return this.#syncPromise;
    this.#setState('starting');
    try {
      const result = await this.syncNow();
      this.#retryDelayMs = Math.min(this.#retryDelayMs, DEFAULT_RETRY_DELAY_MS);
      this.#setState('online');
      this.#schedule(this.#syncIntervalMs);
      return result;
    } catch (error) {
      this.#setState('retrying');
      this.#onError?.(error);
      this.#schedule(this.#retryDelayMs);
      this.#retryDelayMs = Math.min(this.#retryDelayMs * 2, this.#maxRetryDelayMs);
      throw error;
    }
  }

  async syncNow(): Promise<BackendRxdbSyncResult> {
    if (this.#closed) throw new Error('backend RxDB lifecycle is closed');
    if (this.#state === 'paused') throw new Error('backend RxDB lifecycle is paused');
    if (this.#syncPromise) return this.#syncPromise;
    const sync = this.#runSync();
    this.#syncPromise = sync;
    try {
      return await sync;
    } finally {
      if (this.#syncPromise === sync) this.#syncPromise = null;
    }
  }

  pause(): void {
    if (this.#closed) return;
    this.#clearTimer();
    this.#setState('paused');
  }

  async resume(): Promise<BackendRxdbSyncResult> {
    if (this.#closed) throw new Error('backend RxDB lifecycle is closed');
    if (this.#state !== 'paused') return this.start();
    return this.start();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#clearTimer();
    this.#setState('closed');
    await this.#session.close();
  }

  async #runSync(): Promise<BackendRxdbSyncResult> {
    const db = this.#session.db;
    const branches = await db.syncManager.syncBranches();
    const sync = await db.syncManager.sync();
    return { branches, sync };
  }

  #schedule(delayMs: number): void {
    this.#clearTimer();
    if (this.#closed || this.#state === 'paused') return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#tick();
    }, delayMs);
  }

  async #tick(): Promise<void> {
    if (this.#closed || this.#state === 'paused') return;
    try {
      await this.syncNow();
      this.#retryDelayMs = Math.min(this.#retryDelayMs, DEFAULT_RETRY_DELAY_MS);
      this.#setState('online');
      this.#schedule(this.#syncIntervalMs);
    } catch (error) {
      this.#onError?.(error);
      this.#setState('retrying');
      this.#schedule(this.#retryDelayMs);
      this.#retryDelayMs = Math.min(this.#retryDelayMs * 2, this.#maxRetryDelayMs);
    }
  }

  #clearTimer(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #setState(state: BackendRxdbLifecycleState): void {
    if (this.#state === state) return;
    this.#state = state;
    this.#onStateChange?.(state);
  }
}

function positiveDuration(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

export function createBackendRxdbLifecycleSession(session: BackendRxdbSession, options?: BackendRxdbLifecycleOptions): BackendRxdbLifecycle {
  return new BackendRxdbLifecycle(session, options);
}

export type BackendRxdbLifecycleDb = Pick<RxDB, 'syncManager'>;
