/**
 * @fileoverview RxDB Workspace 插件
 * 工作空间插件核心实现，为尚未入库的 NEW 实体草稿提供缓存、持久化与恢复能力
 *
 * 工作原理：
 * - 监听实体本地事件：NEW 缓存草稿，CREATE / REMOVE 清理草稿
 * - 草稿写入 IndexedDB（`idb-keyval`），`install()` 时自动恢复
 * - 通过 BroadcastChannel 在同源标签页之间同步草稿增删
 * - 支持 autoSave 自动刷盘与 `flush()` 显式写入屏障
 *
 * @module rxdb-plugin-workspace
 */

import type { EntityUpdateData, RxDB, UUID } from '@aiao/rxdb';
import {
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_NEW_EVENT,
  ENTITY_LOCAL_REMOVE_EVENT,
  EntityLocalCreatedEvent,
  EntityLocalNewEvent,
  EntityLocalRemovedEvent,
  getEntityMetadata,
  IRxDBPlugin,
  Plugin,
  RxDBBranch,
  RxDBChange,
  RxDBEntityLocalEventData,
  RxDBMigration,
  RxDBPluginBase,
  RxDBSync,
  tryGetEntityStatus
} from '@aiao/rxdb';
import { delMany, entries, setMany } from 'idb-keyval';
import { debounceTime, Subject, Subscription } from 'rxjs';
import {
  decodeWorkspaceEntry,
  parseWorkspaceCacheId,
  type WorkspaceCacheId,
  type WorkspaceCorruptedEntry
} from './workspace-entry.js';
import { createWorkspaceStore, type WorkspaceStore } from './workspace-store.js';

type WorkspaceSyncMessage =
  | { type: 'add'; clientId: string; cacheId: WorkspaceCacheId; data: Record<string, unknown> }
  | { type: 'remove'; clientId: string; cacheId: WorkspaceCacheId };

const SYSTEM_ENTITY_IDENTITIES = new Set(
  [RxDBBranch, RxDBChange, RxDBMigration, RxDBSync].map(EntityType => {
    const { namespace, name } = getEntityMetadata(EntityType);
    return `${namespace}:${name}`;
  })
);

const isSystemEntityIdentity = (namespace: string, entity: string): boolean =>
  SYSTEM_ENTITY_IDENTITIES.has(`${namespace}:${entity}`);

const isLegacySystemEntry = (key: IDBValidKey, data: unknown): boolean => {
  if (typeof key !== 'string' || typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const storedId = String((data as Record<string, unknown>)['id']);
  return Array.from(SYSTEM_ENTITY_IDENTITIES).some(identity => {
    const prefix = `${identity}:`;
    return key.startsWith(prefix) && key.slice(prefix.length) === storedId;
  });
};

/**
 * 判定跨 tab 消息是否为合法的 {@link WorkspaceSyncMessage}。
 *
 * @param value - `MessageEvent.data`，结构化克隆后的任意值
 * @returns 形状合法则为 `true`
 *
 * @remarks
 * BroadcastChannel 的 payload 是**不可信输入**：灰度期新旧版本 tab 并存、或任意同源脚本
 * 都可能发来 `null` / `{}` / 字段类型错乱的对象。不校验的后果有两层：
 *
 * 1. 监听器里直接抛 `TypeError`，插件对该消息毫无反馈（错误只落到全局 `error` 事件）；
 * 2. 更糟的是 `data` 未经校验就进 `#cache_entities` / `#need_save_entities`，
 *    **随下一次 flush 持久化进 IndexedDB**，并在下次 `install()` 时被恢复 —— 污染跨会话存活。
 *
 * 核心的 `RxDBTabsGateway` 对同一场景已有 `isGatewayMessage` / `isRxDBEventLike` 守卫，
 * 此处与之对齐。`cacheId` 必须是 `namespace:entity:id` 三段式，否则解析出的
 * `namespace` / `entity` / `id` 全是 `undefined`。
 */
const isWorkspaceSyncMessage = (value: unknown): value is WorkspaceSyncMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  if (typeof msg['clientId'] !== 'string') return false;
  // RWS-005：与 IndexedDB 恢复走同一个 cacheId 校验。早先这里只数冒号是否三段，
  // 空 namespace / entity、伪 UUID 都能过关并被持久化。
  if (!parseWorkspaceCacheId(msg['cacheId']).ok) return false;
  if (msg['type'] === 'remove') return true;
  if (msg['type'] !== 'add') return false;
  // add 还要求 data 自身身份与 cacheId 一致，否则会按 data.id 建实体缓存、
  // 却按 cacheId 的另一个 id 管理 workspace。
  return decodeWorkspaceEntry(msg['cacheId'], msg['data']).ok;
};

/** Workspace 插件配置。 */
export interface RxDBPluginWorkspaceOptions {
  /**
   * 草稿变更后是否自动写入 IndexedDB。
   *
   * @defaultValue `true`
   */
  autoSave?: boolean;
}

/**
 * `flush()` 因部分草稿无法结构化克隆而失败。
 *
 * @remarks
 * RWS-FRESH-02：workspace 草稿存的是「用户正在编辑的实体」，字段类型由业务定义，
 * 插件对它没有约束力 —— 函数 / DOM 节点 / `Proxy` / class 实例都会让 `structuredClone` 抛错。
 *
 * 这类失败**不影响同批其他草稿**：克隆预检发生在事务之外，坏记录进不了事务，
 * 其余草稿照常落盘。但调用方必须知道**是哪一条**，否则唯一的补救手段
 * {@link RxDBPluginWorkspace.discard} 无从下手 —— 旧实现只 reject 出一个不带 key 的
 * `DataCloneError`，调用方除了清空整个工作区别无办法。
 *
 * 处置方式二选一：把 {@link cacheIds} 对应实体上的字段改成可克隆的值后重试，
 * 或对这些 `cacheId` 调用 `discard()` 丢弃该草稿。
 */
export class WorkspaceFlushError extends Error {
  /** 未能落盘的草稿 —— 同批其余草稿已成功写入。 */
  readonly cacheIds: readonly WorkspaceCacheId[];

  /**
   * @param cacheIds - 未能落盘的草稿主键
   * @param cause - 首个结构化克隆失败原因
   */
  constructor(cacheIds: readonly WorkspaceCacheId[], cause: unknown) {
    super(`workspace drafts could not be cloned and were not persisted: ${cacheIds.join(', ')}`, { cause });
    this.name = 'WorkspaceFlushError';
    this.cacheIds = cacheIds;
  }
}

export type { WorkspaceCacheId, WorkspaceCorruptedEntry } from './workspace-entry.js';

/** {@link RxDBPluginWorkspace.list} 返回的草稿深快照。 */
export interface WorkspaceCacheEntry {
  /** 草稿的持久化主键。 */
  cacheId: WorkspaceCacheId;
  /** 实体 namespace。 */
  namespace: string;
  /** 实体名。 */
  entity: string;
  /** 实体 UUID。 */
  id: UUID;
  /** 与插件内部状态无共享引用的草稿深快照。 */
  data: Record<string, unknown>;
}

type CacheId = WorkspaceCacheId;

type FlushWaiter = {
  resolve: () => void;
  reject: (reason: unknown) => void;
};

/**
 * 缓存、持久化并恢复未入库 RxDB 实体草稿。
 *
 * @remarks
 * 运行环境需要 IndexedDB、`structuredClone` 与 `crypto.randomUUID`；
 * BroadcastChannel 可缺省，缺省时只关闭跨 tab 草稿同步。
 */
export class RxDBPluginWorkspace extends RxDBPluginBase implements IRxDBPlugin {
  readonly #indexedDBStore!: WorkspaceStore;
  readonly #task = new Subject<void>();
  readonly #changes = new Subject<void>();
  #taskSubscription: Subscription | undefined;
  #installPromise: Promise<void> | undefined;
  #installFailed = false;
  readonly #flushWaiters = new Set<FlushWaiter>();
  #syncChannel: BroadcastChannel | undefined;
  #syncClientId: string | undefined;
  readonly #autoSave: boolean;

  readonly #need_save_entities = new Map<CacheId, Record<string, unknown>>();
  readonly #need_delete_ids = new Set<CacheId>();

  readonly #cache_ids = new Set<CacheId>();
  readonly #cache_entities = new Map<CacheId, Record<string, unknown>>();
  readonly #draft_subscriptions = new Map<CacheId, Subscription>();
  readonly #draft_versions = new Map<CacheId, number>();
  readonly #draft_snapshots = new Map<CacheId, Record<string, unknown>>();
  readonly #active_commit_versions = new Map<CacheId, number>();
  readonly #pending_commit_versions = new Map<CacheId, number>();

  readonly #corrupted_entries: WorkspaceCorruptedEntry[] = [];
  readonly #sync_errors = new Map<CacheId, WorkspaceCorruptedEntry>();
  readonly #restore_delete_intents = new Set<CacheId>();

  #pending = false;
  #destroyed = false;
  #restoring = true;

  /** 插件名称。 */
  readonly name: Uncapitalize<string> = 'workspace';
  /**
   * 草稿列表、暂存状态或可观测错误变化时发射。
   * `destroy()` 后完成。
   */
  readonly changes$ = this.#changes.asObservable();

  /** 首次 {@link install} 的完成 Promise；未安装时立即 resolve。 */
  get ready() {
    return this.#installPromise ?? Promise.resolve();
  }

  /** 当前内存草稿数。 */
  get cacheCount() {
    return this.#cache_ids.size;
  }

  /**
   * 无法解码的 IndexedDB 记录，以及当前无法跨 tab 同步的草稿。
   *
   * @remarks
   * RWS-005：坏记录不再让 `install()` 抛错（那会使 `ready` 永久 rejected、
   * 一条坏记录报废整个插件），而是跳过并登记在这里，其余合法草稿照常恢复。
   * 原始 `key` 原样保留，应用可据此定位并自行清理 —— 插件不主动删除无法理解的数据。
   * 广播错误按 `cacheId` 去重，后续同步成功或草稿被删除时自动清除。
   */
  get corruptedEntries(): ReadonlyArray<WorkspaceCorruptedEntry> {
    return [...this.#corrupted_entries, ...this.#sync_errors.values()];
  }

  /**
   * 创建插件并原子发布到 `rxdb.workspace`。
   *
   * @param rxdb - 要安装的 RxDB 实例
   * @param options - 插件配置
   * @throws `rxdb.workspace` 已存在，或底层资源初始化失败
   *
   * @remarks
   * 所有构造阶段资源都在不可配置属性发布前建立。构造失败会回滚已注册的
   * 监听器、BroadcastChannel、任务订阅与 IndexedDB store，同一 RxDB 可直接重试。
   * IndexedDB 的首次实际打开在 {@link install} 中发生，失败后可再次调用 `install()`。
   */
  constructor(rxdb: RxDB, options?: RxDBPluginWorkspaceOptions) {
    super(rxdb);

    if (Object.prototype.hasOwnProperty.call(rxdb, 'workspace')) {
      throw new Error('workspace plugin is already installed');
    }

    this.#autoSave = options?.autoSave ?? true;
    const removeListeners: Array<() => void> = [];
    let indexedDBStore: WorkspaceStore | undefined;

    try {
      const dbName = this.rxdb.config.dbName;
      indexedDBStore = createWorkspaceStore(dbName, this.name);
      this.#indexedDBStore = indexedDBStore;

      if (typeof BroadcastChannel !== 'undefined') {
        this.#syncChannel = new BroadcastChannel(`${dbName}_workspace_sync`);
        this.#syncClientId = crypto.randomUUID();
        this.#syncChannel.addEventListener('message', this.#handleSyncMessage);
      }

      this.#taskSubscription = this.#task
        .asObservable()
        .pipe(debounceTime(0))
        .subscribe(() => {
          void this.#runTask();
        });

      removeListeners.push(() => this.rxdb.removeEventListener(ENTITY_LOCAL_NEW_EVENT, this.#entityEventHandler));
      this.rxdb.addEventListener(ENTITY_LOCAL_NEW_EVENT, this.#entityEventHandler);
      removeListeners.push(() => this.rxdb.removeEventListener(ENTITY_LOCAL_REMOVE_EVENT, this.#entityEventHandler));
      this.rxdb.addEventListener(ENTITY_LOCAL_REMOVE_EVENT, this.#entityEventHandler);
      removeListeners.push(() => this.rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, this.#entityEventHandler));
      this.rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, this.#entityEventHandler);

      Object.defineProperty(rxdb, 'workspace', {
        value: this,
        enumerable: false,
        configurable: false,
        writable: false
      });
    } catch (reason) {
      const rollback = (cleanup: () => void) => {
        try {
          cleanup();
        } catch {
          // 回滚失败不能覆盖原始初始化错误，其余资源仍需继续释放。
        }
      };
      removeListeners.reverse().forEach(remove => rollback(remove));
      rollback(() => this.#syncChannel?.removeEventListener('message', this.#handleSyncMessage));
      rollback(() => this.#syncChannel?.close());
      rollback(() => this.#taskSubscription?.unsubscribe());
      rollback(() => this.#task.complete());
      rollback(() => this.#changes.complete());
      rollback(() => indexedDBStore?.close());
      throw reason;
    }
  }

  /**
   * 写入屏障：resolve 时队列里的草稿已经进了 IndexedDB。
   *
   * @returns 当前队列全部落盘后 resolve 的 Promise
   * @throws `WorkspaceFlushError` - 部分草稿无法结构化克隆。其余草稿**已经落盘**，
   *   失败的 `cacheId` 列在 {@link WorkspaceFlushError.cacheIds} 里；改好字段重试或
   *   {@link discard} 掉即可。
   * @throws `Error` - 插件已 `destroy()`，或底层 IndexedDB 写入失败（整批回队列，重试即可）。
   */
  async flush() {
    await this.ready;
    // #destroyed 必须在 await 之后检查：destroy() 可能恰好在本次 await 期间清空队列，
    // 若只在入口检查一次，队列被清空后下面的 #hasQueuedChanges() 会误判为「无事可做」而静默 resolve。
    if (this.#destroyed) throw new Error('workspace plugin has been destroyed');
    if (!this.#pending && !this.#hasQueuedChanges()) return;

    const flushed = new Promise<void>((resolve, reject) => {
      this.#flushWaiters.add({ resolve, reject });
    });
    this.#task.next();
    await flushed;
  }

  /**
   * 从 IndexedDB 恢复草稿。进行中或成功后重复调用返回同一 Promise；失败后再次调用会重试。
   *
   * @returns 恢复完成后 resolve 的 Promise
   * @throws IndexedDB 读取或存量系统草稿清理失败
   */
  install() {
    if (this.#installPromise && !this.#installFailed) return this.#installPromise;
    this.#installFailed = false;
    this.#restoring = true;
    const installPromise = this.#restoreEntries()
      .catch(reason => {
        this.#installFailed = true;
        throw reason;
      })
      .finally(() => {
        this.#restoring = this.#installFailed;
        if (!this.#installFailed) this.#restore_delete_intents.clear();
      });
    this.#installPromise = installPromise;
    return this.#installPromise;
  }

  /**
   * 返回当前草稿的深快照。
   *
   * @returns 与插件内部缓存无共享引用的草稿数组
   * @throws `DataCloneError` 某条草稿包含函数、DOM 节点等不可结构化克隆值
   */
  list(): WorkspaceCacheEntry[] {
    return Array.from(this.#cache_entities.entries()).map(([cacheId, data]) => {
      const [namespace, entity, id] = cacheId.split(':');
      return {
        cacheId,
        namespace,
        entity,
        id: id as UUID,
        data: structuredClone(data)
      };
    });
  }

  /**
   * 丢弃一条草稿并排队删除持久化快照。
   *
   * @param cacheId - 要丢弃的草稿主键
   * @returns 草稿存在并已排队删除时为 `true`，否则为 `false`
   *
   * @remarks
   * 本方法不是落盘屏障；需要确认 IndexedDB 已删除时继续 `await flush()`。
   */
  discard(cacheId: WorkspaceCacheId) {
    if (!this.#cache_entities.has(cacheId)) return false;

    const [namespace, entity, id] = cacheId.split(':');
    const EntityType = this.rxdb.schemaManager.getEntityType(entity, namespace);
    if (EntityType) {
      const entityRef = this.rxdb.entityManager.getEntityRef(EntityType, id as UUID);
      if (entityRef) {
        this.rxdb.entityManager.removeEntityCache(entityRef);
      }
    }

    this.#delete(cacheId);
    this.#emitChange();
    this.#scheduleAutoSave();
    this.#broadcastRemove(cacheId);
    return true;
  }

  /**
   * 释放监听器、订阅与浏览器资源。
   *
   * @remarks
   * `destroy()` 幂等且是终态：它不隐式 flush，未落盘变更会被丢弃；
   * 已挂起的 {@link flush} 会 reject，后续 `flush()` 也会 reject。
   */
  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;

    this.rxdb.removeEventListener(ENTITY_LOCAL_NEW_EVENT, this.#entityEventHandler);
    this.rxdb.removeEventListener(ENTITY_LOCAL_REMOVE_EVENT, this.#entityEventHandler);
    this.rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, this.#entityEventHandler);
    this.#syncChannel?.removeEventListener('message', this.#handleSyncMessage);
    this.#syncChannel?.close();
    this.#taskSubscription?.unsubscribe();
    this.#draft_subscriptions.forEach(subscription => subscription.unsubscribe());
    this.#task.complete();
    this.#changes.complete();

    // 清空前先判断是否存在会被丢弃的未落盘变更：挂起的 flush() 语义是「已写入 IndexedDB」，
    // 丢弃时必须 reject 而非 resolve，否则调用方会把数据丢失误当成功。
    const dropped = this.#pending || this.#hasQueuedChanges();
    this.#cache_ids.clear();
    this.#cache_entities.clear();
    this.#need_save_entities.clear();
    this.#need_delete_ids.clear();
    this.#restore_delete_intents.clear();
    this.#draft_subscriptions.clear();
    this.#draft_versions.clear();
    this.#draft_snapshots.clear();
    this.#active_commit_versions.clear();
    this.#pending_commit_versions.clear();
    this.#sync_errors.clear();
    // 必须关：这条连接不释放，之后任何 indexedDB.deleteDatabase(dbName) 都会永久 blocked。
    this.#indexedDBStore.close();

    if (dropped) {
      this.#rejectFlushWaiters(new Error('workspace plugin was destroyed with unflushed changes'));
    } else {
      this.#resolveFlushWaiters();
    }
  }

  async #restoreEntries() {
    const stored = await entries(this.#indexedDBStore);
    // RWS-003：`await` 之后必须复核终止状态。数据库若在读取期间被销毁，
    // destroy() 已清空缓存并关闭资源，这里再往下走就会重新填充一个已销毁的实例
    // （而 `rxdb.workspace` 不可配置，该实例仍可达，后续 discard() 还会向已关闭 channel 发消息）。
    if (this.#destroyed) return;

    const legacySystemKeys = stored.filter(([key, data]) => isLegacySystemEntry(key, data)).map(([key]) => key);
    if (legacySystemKeys.length > 0) {
      await delMany(legacySystemKeys, this.#indexedDBStore);
      if (this.#destroyed) return;
    }

    const corruptedEntries: WorkspaceCorruptedEntry[] = [];
    const restoredDeletionIds: CacheId[] = [];
    const restoredDrafts: Array<{ cacheId: CacheId; draft: Record<string, unknown> }> = [];
    const rollbackEntityRefs: Array<() => void> = [];
    const publishedIds: CacheId[] = [];
    const addedDeletionIds: CacheId[] = [];
    const corruptedStart = this.#corrupted_entries.length;

    try {
      for (const [key, data] of stored) {
        if (legacySystemKeys.includes(key)) continue;
        const decoded = decodeWorkspaceEntry(key, data);
        if (!decoded.ok) {
          corruptedEntries.push({ key, reason: decoded.reason });
          continue;
        }

        const { cacheId, namespace, entity, id, data: entryData } = decoded.entry;
        if (this.#cache_entities.has(cacheId)) continue;
        if (this.#restore_delete_intents.has(cacheId)) {
          restoredDeletionIds.push(cacheId);
          continue;
        }
        if (this.#need_delete_ids.has(cacheId)) continue;

        const EntityType = this.rxdb.schemaManager.getEntityType(entity, namespace);
        let draft: Record<string, unknown> = entryData;
        if (EntityType) {
          const existing = this.rxdb.entityManager.getEntityRef(EntityType, id);
          const entityRef = this.rxdb.entityManager.createEntityRef(
            EntityType,
            entryData as unknown as EntityUpdateData<typeof EntityType>,
            {
              local: false,
              remote: false,
              modified: true
            }
          );
          if (!existing) rollbackEntityRefs.push(() => this.rxdb.entityManager.removeEntityCache(entityRef));
          draft = entityRef as unknown as Record<string, unknown>;
        }
        restoredDrafts.push({ cacheId, draft });
      }

      for (const { cacheId, draft } of restoredDrafts) {
        publishedIds.push(cacheId);
        this.#cache_ids.add(cacheId);
        this.#bindDraft(cacheId, draft);
      }
      for (const cacheId of restoredDeletionIds) {
        if (this.#need_delete_ids.has(cacheId)) continue;
        this.#need_delete_ids.add(cacheId);
        addedDeletionIds.push(cacheId);
      }
      this.#corrupted_entries.push(...corruptedEntries);
      this.#emitChange();
      if (restoredDeletionIds.length > 0) this.#scheduleAutoSave();
    } catch (reason) {
      publishedIds.reverse().forEach(cacheId => {
        this.#unbindDraft(cacheId);
        this.#cache_ids.delete(cacheId);
        this.#cache_entities.delete(cacheId);
        this.#draft_versions.delete(cacheId);
        this.#draft_snapshots.delete(cacheId);
      });
      addedDeletionIds.forEach(cacheId => this.#need_delete_ids.delete(cacheId));
      this.#corrupted_entries.length = corruptedStart;
      rollbackEntityRefs.reverse().forEach(rollback => {
        try {
          rollback();
        } catch {
          // 清理失败不能覆盖原始恢复错误。
        }
      });
      throw reason;
    }
  }
  #entityEventHandler = (event: EntityLocalCreatedEvent | EntityLocalRemovedEvent | EntityLocalNewEvent) => {
    const { entities } = event;
    entities.forEach(data => {
      if (!data?.id || !data?.entity || !data?.namespace) {
        return;
      }

      if (isSystemEntityIdentity(data.namespace, data.entity)) return;

      const cacheId = get_cache_id(data);
      if (!parseWorkspaceCacheId(cacheId).ok) return;
      switch (event.type) {
        case ENTITY_LOCAL_NEW_EVENT: {
          const patch = (data.patch && typeof data.patch === 'object' ? data.patch : {}) as Record<string, unknown>;
          this.#need_delete_ids.delete(cacheId);
          this.#restore_delete_intents.delete(cacheId);
          this.#cache_ids.add(cacheId);
          const draft = this.#bindDraft(cacheId, patch);
          this.#need_save_entities.set(cacheId, draft);
          this.#emitChange();
          this.#scheduleAutoSave();
          if (data.origin !== 'cross-tab') {
            this.#broadcastDraft(cacheId, draft);
          }
          break;
        }
        case ENTITY_LOCAL_CREATE_EVENT: {
          const draftStatus = tryGetEntityStatus(this.#cache_entities.get(cacheId));
          const currentVersion = this.#draft_versions.get(cacheId);
          const activeVersion = this.#active_commit_versions.get(cacheId);
          if (activeVersion !== undefined) break;
          const pendingVersion = this.#pending_commit_versions.get(cacheId);
          if (pendingVersion !== undefined && currentVersion !== undefined && currentVersion !== pendingVersion) {
            this.#pending_commit_versions.delete(cacheId);
            break;
          }
          if (draftStatus?.modified) break;
          if (this.#delete(cacheId)) {
            this.#emitChange();
            this.#scheduleAutoSave();
          }
          break;
        }
        case ENTITY_LOCAL_REMOVE_EVENT:
          if (this.#delete(cacheId)) {
            this.#emitChange();
            this.#scheduleAutoSave();
          }
          break;
        default:
          break;
      }
    });
  };

  #handleSyncMessage = (event: MessageEvent<unknown>): void => {
    // 不可信输入：形状不合法一律丢弃，既不抛错也不落库（见 isWorkspaceSyncMessage）
    if (!isWorkspaceSyncMessage(event.data)) return;
    const msg = event.data;
    if (msg.clientId === this.#syncClientId) return;

    const [namespace, entity, id] = msg.cacheId.split(':');
    const EntityType = this.rxdb.schemaManager.getEntityType(entity, namespace);

    if (msg.type === 'add') {
      this.#unbindDraft(msg.cacheId);
      let draft: Record<string, unknown> = msg.data;
      if (EntityType) {
        const entityRef = this.rxdb.entityManager.createEntityRef(
          EntityType,
          msg.data as unknown as EntityUpdateData<typeof EntityType>,
          {
            local: false,
            remote: false,
            modified: true
          }
        );
        draft = entityRef as unknown as Record<string, unknown>;
      }
      this.#need_delete_ids.delete(msg.cacheId);
      this.#restore_delete_intents.delete(msg.cacheId);
      this.#cache_ids.add(msg.cacheId);
      draft = this.#bindDraft(msg.cacheId, draft);
      this.#need_save_entities.set(msg.cacheId, draft);
      this.#emitChange();
      this.#scheduleAutoSave();
    } else if (msg.type === 'remove') {
      if (EntityType) {
        const entityRef = this.rxdb.entityManager.getEntityRef(EntityType, id as UUID);
        if (entityRef) {
          this.rxdb.entityManager.removeEntityCache(entityRef);
        }
      }
      if (this.#delete(msg.cacheId)) {
        this.#emitChange();
        this.#scheduleAutoSave();
      }
    }
  };

  #delete(cacheId: CacheId): boolean {
    if (!this.#cache_ids.has(cacheId)) {
      if (this.#restoring) this.#restore_delete_intents.add(cacheId);
      return false;
    }
    this.#unbindDraft(cacheId);
    this.#cache_ids.delete(cacheId);
    this.#cache_entities.delete(cacheId);
    this.#need_save_entities.delete(cacheId);
    this.#need_delete_ids.add(cacheId);
    this.#draft_versions.delete(cacheId);
    this.#draft_snapshots.delete(cacheId);
    this.#active_commit_versions.delete(cacheId);
    this.#pending_commit_versions.delete(cacheId);
    this.#sync_errors.delete(cacheId);
    return true;
  }

  #bindDraft(cacheId: CacheId, value: Record<string, unknown>): Record<string, unknown> {
    this.#unbindDraft(cacheId);
    const status = tryGetEntityStatus(value);
    const draft = (status?.target ?? value) as Record<string, unknown>;
    this.#cache_entities.set(cacheId, draft);
    this.#advanceDraftVersion(cacheId, draft);
    if (!status) return draft;

    let subscribing = true;
    const subscription = status.patches$.subscribe(patches => {
      if (subscribing) return;
      if (this.#destroyed || this.#cache_entities.get(cacheId) !== draft) return;
      if (this.#active_commit_versions.has(cacheId) && patches.length === 0) return;
      this.#advanceDraftVersion(cacheId, draft);
      this.#restore_delete_intents.delete(cacheId);
      this.#need_delete_ids.delete(cacheId);
      this.#need_save_entities.set(cacheId, draft);
      this.#emitChange();
      this.#scheduleAutoSave();
      this.#broadcastDraft(cacheId, draft);
    });
    subscribing = false;
    this.#draft_subscriptions.set(cacheId, subscription);
    return draft;
  }

  #advanceDraftVersion(cacheId: CacheId, draft: Record<string, unknown>) {
    this.#draft_versions.set(cacheId, (this.#draft_versions.get(cacheId) ?? 0) + 1);
    this.#draft_snapshots.set(cacheId, { ...draft });
  }

  #unbindDraft(cacheId: CacheId) {
    this.#draft_subscriptions.get(cacheId)?.unsubscribe();
    this.#draft_subscriptions.delete(cacheId);
  }

  #broadcastDraft(cacheId: CacheId, data: Record<string, unknown>) {
    const clientId = this.#syncClientId;
    if (!clientId) return;
    this.#postSyncMessage(cacheId, { type: 'add', clientId, cacheId, data });
  }

  #broadcastRemove(cacheId: CacheId) {
    const clientId = this.#syncClientId;
    if (!clientId) return;
    this.#postSyncMessage(cacheId, { type: 'remove', clientId, cacheId });
  }

  #postSyncMessage(cacheId: CacheId, message: WorkspaceSyncMessage) {
    if (!this.#syncChannel) return;
    try {
      this.#syncChannel.postMessage(structuredClone(message));
      if (this.#sync_errors.delete(cacheId)) this.#emitChange();
    } catch (reason) {
      const detail = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
      const entry = { key: cacheId, reason: `草稿无法跨 tab 同步：${detail}` } satisfies WorkspaceCorruptedEntry;
      const previous = this.#sync_errors.get(cacheId);
      if (previous?.reason === entry.reason) return;
      this.#sync_errors.set(cacheId, entry);
      this.#emitChange();
    }
  }

  async #runTask() {
    if (this.#pending) return;
    if (!this.#hasQueuedChanges()) {
      this.#resolveFlushWaiters();
      return;
    }

    this.#pending = true;
    const pendingSaves = Array.from(this.#need_save_entities.entries());
    const needDeleteIds = Array.from(this.#need_delete_ids);

    this.#need_save_entities.clear();
    this.#need_delete_ids.clear();

    // RWS-FRESH-02：结构化克隆必须在**进事务之前**试一遍。
    // `idb-keyval` 的 setMany 在同一个事务里顺序 put，而 `DataCloneError` 是
    // `IDBObjectStore.put()` **同步**抛出的 —— 异常穿出回调之后事务并不会 abort，
    // 先排上队的那些记录照常提交。于是 catch 分支看到「整批失败」，磁盘上留的却是半批数据。
    // 事务外先克隆，坏 key 在开事务前就被挑走，送进事务的那批才是真正原子的。
    const writable: Array<[IDBValidKey, Record<string, unknown>]> = [];
    const clonable: Array<[CacheId, Record<string, unknown>]> = [];
    const unclonable: Array<[CacheId, Record<string, unknown>]> = [];
    let cloneFailure: unknown;

    for (const [cacheId, value] of pendingSaves) {
      let snapshot: Record<string, unknown>;
      try {
        snapshot = structuredClone(value);
      } catch (reason) {
        cloneFailure ??= reason;
        unclonable.push([cacheId, value]);
        continue;
      }
      writable.push([cacheId, snapshot]);
      clonable.push([cacheId, value]);
    }

    try {
      if (writable.length) {
        await setMany(writable, this.#indexedDBStore);
      }
      if (needDeleteIds.length) {
        await delMany(needDeleteIds, this.#indexedDBStore);
      }
    } catch (reason) {
      // 真正的 IDB 故障：整批（含没能克隆的那些）回队列，语义仍是「重试即可」
      this.#restoreFailedTask([...clonable, ...unclonable], needDeleteIds);
      this.#pending = false;
      this.#rejectFlushWaiters(reason);
      return;
    }

    if (unclonable.length) {
      // 只回填克隆失败的那些，且回填的是**活引用**而不是快照。
      // 旧实现回填 `{ ...value }` 浅拷贝，它的嵌套字段仍指向那个不可克隆的旧对象 ——
      // 调用方把实体改好也没用，这条草稿此后每次 flush 都以同一个错误失败，
      // 而 `#hasQueuedChanges()` 恒真，同一个工作区里其他草稿也跟着永远存不下去。
      this.#restoreFailedTask(unclonable, []);
      this.#pending = false;
      this.#rejectFlushWaiters(
        new WorkspaceFlushError(
          unclonable.map(([cacheId]) => cacheId),
          cloneFailure
        )
      );
      return;
    }

    this.#pending = false;
    if (this.#hasQueuedChanges()) {
      this.#task.next();
      return;
    }
    this.#resolveFlushWaiters();
  }

  /**
   * 把一次失败的写盘任务放回队列。
   *
   * @param needSaveEntities - 待写条目，值必须是 `#cache_entities` 里的**活引用**而非快照
   * @param needDeleteIds - 待删 key
   *
   * @remarks
   * RWS-FRESH-02：传快照会让「调用方修好实体再重试」这条路失效 ——
   * 快照的嵌套字段仍指向出错时的旧对象。
   */
  #restoreFailedTask(needSaveEntities: Array<[CacheId, Record<string, unknown>]>, needDeleteIds: CacheId[]) {
    for (const [cacheId, value] of needSaveEntities) {
      if (this.#need_save_entities.has(cacheId) || this.#need_delete_ids.has(cacheId)) continue;
      this.#need_save_entities.set(cacheId, value);
    }
    for (const cacheId of needDeleteIds) {
      if (!this.#need_save_entities.has(cacheId)) this.#need_delete_ids.add(cacheId);
    }
  }

  #hasQueuedChanges() {
    return this.#need_save_entities.size > 0 || this.#need_delete_ids.size > 0;
  }

  #scheduleAutoSave() {
    if (this.#autoSave) this.#task.next();
  }

  #emitChange() {
    this.#changes.next();
  }

  #resolveFlushWaiters() {
    if (this.#pending || this.#hasQueuedChanges()) return;

    const waiters = Array.from(this.#flushWaiters);
    this.#flushWaiters.clear();
    waiters.forEach(({ resolve }) => resolve());
  }

  #rejectFlushWaiters(reason: unknown) {
    const waiters = Array.from(this.#flushWaiters);
    this.#flushWaiters.clear();
    waiters.forEach(({ reject }) => reject(reason));
  }
}

/**
 * 安装或取得已安装的 workspace 插件。
 *
 * @param db - RxDB 实例
 * @param options - 首次安装时使用的配置；已安装时忽略
 * @returns `db.workspace` 上的唯一插件实例
 * @throws `workspace` 属性被不兼容实例占用，或底层资源初始化失败
 */
export const rxDBPluginWorkspace = ((db: RxDB, options?: RxDBPluginWorkspaceOptions) => {
  if (Object.prototype.hasOwnProperty.call(db, 'workspace')) {
    const installed = Object.getOwnPropertyDescriptor(db, 'workspace')?.value;
    if (installed instanceof RxDBPluginWorkspace) return installed;
    throw new Error('workspace plugin is already installed with an incompatible instance');
  }
  return new RxDBPluginWorkspace(db, options);
}) satisfies Plugin<RxDBPluginWorkspaceOptions>;

declare module '@aiao/rxdb' {
  interface RxDB {
    /** 已安装的 workspace 插件实例。 */
    workspace: RxDBPluginWorkspace;
  }
}

/**
 * 把实体事件身份编码为 workspace 草稿主键。
 *
 * @param eventData - 带 namespace、entity 与 UUID 的实体事件数据
 * @returns `namespace:entity:id` 格式的草稿主键
 */
export const get_cache_id = (eventData: RxDBEntityLocalEventData) =>
  (eventData.namespace + ':' + eventData.entity + ':' + eventData.id) as CacheId;
