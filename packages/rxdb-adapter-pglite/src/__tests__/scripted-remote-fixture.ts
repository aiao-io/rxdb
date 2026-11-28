/**
 * @fileoverview 按剧本应答的远端替身：真实 PGlite 本地 + 只在远端一侧打桩。
 *
 * @remarks
 * 推送按 {@link RemoteScript.receipt} 逐条给回执，拉取按 {@link RemoteScript.log} 交出远端日志。
 * 本地事务、触发器、外键与 `executor.mergeChanges` 全是真的——推送回执的落库、撤销历史的边界都出在本地，
 * mock 掉本地就测不到。
 */
import type {
  EntityType,
  IRepository,
  IRxDBAdapter,
  IRxDBChange,
  QueryCacheEntityMetadata,
  RemoteChange,
  RemoteChangeResult,
  RemoteMergeOptions,
  RemoteMergeResult,
  RxDB
} from '@aiao/rxdb';
import { RxDBAdapterRemoteBase } from '@aiao/rxdb';
import { Observable, of } from 'rxjs';

/** 远端替身在 RxDB 上注册的适配器名 */
export const SCRIPTED_REMOTE_ADAPTER = 'scripted-remote';

/** 一次 `mergeChanges` 调用 */
export interface MergeCall {
  readonly branchId: string | undefined;
  readonly changes: readonly IRxDBChange[];
  /** 第四个参数：外键成环时的延迟外键（US-038） */
  readonly options?: RemoteMergeOptions;
}

/** 远端替身的剧本：逐条源变更给回执，可在回执返回前插入本地动作 */
export interface RemoteScript {
  /** 逐条源变更的回执；抛错即整次 `mergeChanges` 失败 */
  receipt: (change: IRxDBChange) => RemoteChangeResult;
  /** 回执返回前的钩子：模拟远端往返期间发生在本地的动作 */
  beforeReply?: (call: MergeCall) => Promise<void>;
  /** 远端当前行，键为 `namespace:entity:id`（与 `findByIds` 的实体名 + id 拼接一致） */
  readonly rows: Map<string, Record<string, unknown>>;
  /** 全部 `mergeChanges` 调用记录 */
  readonly calls: MergeCall[];
  /** 远端日志：`pullChanges` 按分支、仓库与 `sinceId` 交出，id 升序 */
  readonly log: RemoteChange[];
  /** 声明支持先写空、再补写外键（US-038），默认不支持 */
  supportsDeferredForeignKeys?: boolean;
}

/** `repositoryFilter` 的元素与同步插件传的同形：`namespace:entity` */
const matchesRepository = (change: RemoteChange, repositoryFilter: readonly string[] | undefined): boolean =>
  repositoryFilter === undefined || repositoryFilter.includes(`${change.namespace}:${change.entity}`);

/**
 * 按剧本应答的远端替身
 *
 * @remarks
 * 拉取不求值过滤条件：剧本里的日志就是远端按条件挑剩的结果。
 */
export class ScriptedRemote extends RxDBAdapterRemoteBase implements IRxDBAdapter {
  readonly name = SCRIPTED_REMOTE_ADAPTER;
  override readonly supportsDeferredForeignKeys: boolean;

  constructor(
    rxdb: RxDB,
    readonly script: RemoteScript
  ) {
    super(rxdb);
    this.supportsDeferredForeignKeys = script.supportsDeferredForeignKeys ?? false;
  }

  connect(): Promise<IRxDBAdapter> {
    return Promise.resolve(this);
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  version(): Promise<string> {
    return Promise.resolve(SCRIPTED_REMOTE_ADAPTER);
  }

  /** 同步插件会顺手取远端系统表仓库；推送回执不读它，给一个永远为空的只读句柄 */
  getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(): RT {
    return { find: () => Promise.resolve([]), count: () => Promise.resolve(0) } as unknown as RT;
  }

  saveMany(): Promise<never> {
    return Promise.reject(new Error('scripted-remote: 只经 mergeChanges 写入'));
  }

  removeMany(): Promise<never> {
    return Promise.reject(new Error('scripted-remote: 只经 mergeChanges 写入'));
  }

  mutations(): Promise<never> {
    return Promise.reject(new Error('scripted-remote: 只经 mergeChanges 写入'));
  }

  isTableExisted(): Promise<boolean> {
    return Promise.resolve(true);
  }

  backendId(): Promise<string> {
    return Promise.resolve(SCRIPTED_REMOTE_ADAPTER);
  }

  pullChanges(sinceId: number, limit?: number, repositoryFilter?: string[], _filter?: unknown, branchId?: string) {
    const matched = this.#logAfter(sinceId, repositoryFilter, branchId);
    return Promise.resolve(structuredClone(limit === undefined ? matched : matched.slice(0, limit)));
  }

  getChangeCount(
    sinceId: number,
    repositoryFilter?: string[],
    branchId?: string
  ): Promise<{ count: number; latestChangeId: number }> {
    const matched = this.#logAfter(sinceId, repositoryFilter, branchId);
    return Promise.resolve({ count: matched.length, latestChangeId: matched.at(-1)?.id ?? sinceId });
  }

  async mergeChanges(
    _actions: unknown,
    branchId?: string,
    changes: IRxDBChange[] = [],
    options?: RemoteMergeOptions
  ): Promise<RemoteMergeResult> {
    const call: MergeCall = { branchId, changes: [...changes], ...(options ? { options } : {}) };
    this.script.calls.push(call);
    await this.script.beforeReply?.(call);
    return { results: changes.map(change => this.script.receipt(change)) };
  }

  fetchMetadata(): Observable<QueryCacheEntityMetadata[]> {
    return of([]);
  }

  findByIds<T>(entityName: string, ids: string[]): Observable<T[]> {
    return of(
      ids.flatMap(id => {
        const row = this.script.rows.get(`${entityName}:${id}`);
        return row ? [structuredClone(row) as T] : [];
      })
    );
  }

  override pushBranches(branches: Record<string, unknown>[]): Promise<{ synced: number; skipped: string[] }> {
    return Promise.resolve({ synced: branches.length, skipped: [] });
  }

  #logAfter(sinceId: number, repositoryFilter: readonly string[] | undefined, branchId: string | undefined) {
    return this.script.log
      .filter(
        change =>
          change.id > sinceId &&
          (branchId === undefined || change.branchId === branchId) &&
          matchesRepository(change, repositoryFilter)
      )
      .sort((left, right) => left.id - right.id);
  }
}

/** 远端接受这条源变更，`remoteId = localId + 1000` */
export const applied = (change: IRxDBChange): RemoteChangeResult => ({
  localId: change.id,
  status: 'applied',
  remoteId: change.id + 1000
});

/** 远端拒绝这条源变更：`denied` 记 42501，`dependency` 记 23503 并带 `dependsOn` */
export const rejected = (change: IRxDBChange, reason: 'denied' | 'dependency' = 'denied'): RemoteChangeResult => ({
  localId: change.id,
  status: 'rejected',
  rejection: {
    code: reason === 'denied' ? '42501' : '23503',
    reason,
    message: `rejected ${change.entity}`,
    entity: { namespace: change.namespace, entity: change.entity, entityId: String(change.entityId) },
    ...(reason === 'dependency' ? { dependsOn: { constraint: 'parent_fk' } } : {})
  }
});

/** 新剧本：默认全部接受，远端没有行、没有日志 */
export const newScript = (receipt: RemoteScript['receipt'] = applied): RemoteScript => ({
  receipt,
  rows: new Map(),
  calls: [],
  log: []
});
