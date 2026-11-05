/**
 * 清单同步节奏：启动时拉一次；Supabase Realtime 报来清单的远端变更就尽快拉；再按间隔兜底轮询一次
 * （Realtime 断线期间的通知会丢）。本地写入后立刻推。拉与推排成一条队列，不并发。
 *
 * @remarks
 * 失败不吞：写进 `status$` 显示在界面上，下一次成功才清掉。
 */
import { P2P_FILE_MANIFEST_ENTITY } from '@aiao/rxdb-plugin-p2p';
import { BehaviorSubject } from 'rxjs';
import { P2P_FALLBACK_ENVELOPE_ENTITY } from './fallback-envelope.entity';

/** 触发拉取的远端事件（`@aiao/rxdb` 的 `ENTITY_REMOTE_*`）。 */
export const REMOTE_EVENT_TYPES = ['ENTITY_REMOTE_CREATE', 'ENTITY_REMOTE_UPDATE', 'ENTITY_REMOTE_REMOVE'] as const;

/** 远端事件里本模块关心的字段。 */
export interface RemoteEntityEvent {
  readonly entities: readonly { readonly namespace: string; readonly entity: string }[];
}

/** 同步的对象：`rxdb.syncManager` 的推拉与 RxDB 的事件订阅。 */
export interface ManifestSyncTarget {
  pull(): Promise<unknown>;
  push(): Promise<unknown>;
  addEventListener(type: string, listener: (event: RemoteEntityEvent) => void): void;
  removeEventListener(type: string, listener: (event: RemoteEntityEvent) => void): void;
}

/** 同步状态。 */
export interface SyncStatus {
  readonly phase: 'idle' | 'syncing' | 'error';
  readonly error: string | null;
  /** 最近一次成功的时刻（epoch 毫秒）。 */
  readonly lastSyncedAt: number | null;
}

/** 节奏参数。 */
export interface ManifestSyncOptions {
  readonly intervalMs: number;
  readonly debounceMs: number;
  readonly now: () => number;
}

const MANIFEST_NAMESPACE = 'p2p';
/** 同步集合里本模块关心的实体：清单（持有声明）与回退加密信封（POOL-US-101）。 */
const SYNCED_ENTITIES = new Set([P2P_FILE_MANIFEST_ENTITY, P2P_FALLBACK_ENVELOPE_ENTITY]);

const touchesSyncedEntities = (event: RemoteEntityEvent): boolean =>
  event.entities.some(entity => entity.namespace === MANIFEST_NAMESPACE && SYNCED_ENTITIES.has(entity.entity));

/** 清单同步。 */
export class ManifestSync {
  readonly #target: ManifestSyncTarget;
  readonly #options: ManifestSyncOptions;
  #queue: Promise<void> = Promise.resolve();
  #interval: ReturnType<typeof setInterval> | undefined;
  #debounce: ReturnType<typeof setTimeout> | undefined;
  readonly status$ = new BehaviorSubject<SyncStatus>({ phase: 'idle', error: null, lastSyncedAt: null });

  constructor(target: ManifestSyncTarget, options: ManifestSyncOptions) {
    this.#target = target;
    this.#options = options;
  }

  /** 开始：拉一次，订阅远端事件，开始轮询。 */
  start(): void {
    for (const type of REMOTE_EVENT_TYPES) this.#target.addEventListener(type, this.#onRemote);
    this.#interval = setInterval(() => void this.pull(), this.#options.intervalMs);
    void this.pull();
  }

  /** 停止订阅与轮询；队列里已有的操作照常跑完。 */
  stop(): void {
    for (const type of REMOTE_EVENT_TYPES) this.#target.removeEventListener(type, this.#onRemote);
    clearInterval(this.#interval);
    clearTimeout(this.#debounce);
  }

  /** 拉取远端变更。 */
  pull(): Promise<void> {
    return this.#enqueue(() => this.#target.pull());
  }

  /** 推送本地变更。 */
  push(): Promise<void> {
    return this.#enqueue(() => this.#target.push());
  }

  /** 远端事件的订阅者；固定引用，`stop()` 才退订得掉。 */
  readonly #onRemote = (event: RemoteEntityEvent): void => {
    if (touchesSyncedEntities(event)) this.#pullSoon();
  };

  #pullSoon(): void {
    clearTimeout(this.#debounce);
    this.#debounce = setTimeout(() => void this.pull(), this.#options.debounceMs);
  }

  #enqueue(operation: () => Promise<unknown>): Promise<void> {
    this.#queue = this.#queue.then(() => this.#run(operation));
    return this.#queue;
  }

  async #run(operation: () => Promise<unknown>): Promise<void> {
    const { error: previousError, lastSyncedAt } = this.status$.value;
    this.status$.next({ phase: 'syncing', error: previousError, lastSyncedAt });
    try {
      await operation();
      this.status$.next({ phase: 'idle', error: null, lastSyncedAt: this.#options.now() });
    } catch (error) {
      this.status$.next({
        phase: 'error',
        error: error instanceof Error ? error.message : String(error),
        lastSyncedAt
      });
    }
  }
}
