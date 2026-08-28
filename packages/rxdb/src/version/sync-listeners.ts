import { combineLatest, merge, type Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, exhaustMap, filter, map, withLatestFrom } from 'rxjs/operators';
import { countQueryCacheOutbox, flushQueryCacheOutbox } from '../repository/query-cache-outbox.js';
import {
  ENTITY_REMOTE_CREATE_EVENT,
  ENTITY_REMOTE_REMOVE_EVENT,
  ENTITY_REMOTE_UPDATE_EVENT,
  EntityRemoteCreatedEvent,
  EntityRemoteRemovedEvent,
  EntityRemoteUpdatedEvent
} from '../rxdb-events.js';
import { getEntityMetadata, isAdapterShutdownError } from '../rxdb-utils.js';
import type { SyncStateHub } from '../sync-state.js';
import type { HistoryManager } from './HistoryManager.js';
import { getSyncCapability, getSyncType } from './sync-type-utils.js';
import type { RepositoryIdentifier } from './VersionManager.interface.js';
import type { VersionManager } from './VersionManager.js';

/**
 * 远程实体事件类型集合（CREATE/UPDATE/REMOVE）
 */
type RemoteEntityEvent = EntityRemoteCreatedEvent | EntityRemoteUpdatedEvent | EntityRemoteRemovedEvent;

/**
 * 判断 detached event task 的错误是否可忽略
 *
 * 包括：
 * - errno 44 = ENODEV (Emscripten IDBFS 连接关闭)
 * - name === 'AbortError'
 * - adapter shutdown 错误（统一字符串匹配模式）
 */
export const isIgnorableDetachedVersionEventError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const name = 'name' in error ? String(error.name) : '';
  const errno = 'errno' in error ? Number((error as { errno?: unknown }).errno) : undefined;

  if (errno === 44 || name === 'AbortError') {
    return true;
  }

  return isAdapterShutdownError(error);
};

/**
 * 跑一步回推动作，把失败报给面板后吞掉
 *
 * @param syncState - 失败的去处
 * @param task - 这一步
 * @returns 这一步是否成功
 *
 * @remarks
 * 回推的三步互不背书：分支元数据同步不上，不代表本地攒了一周的写就该继续压着；
 * changelog 推不动，也不代表 QueryCache 那条 REST 路走不通。任何一步的失败都只
 * 影响它自己，剩下的照跑。
 *
 * 吞错也是为了不掐断订阅 —— rxjs 里一个逃逸到流上的异常会终结整条链，此后再恢复
 * 多少次网络都不会再有回推。真正的重试节奏交给
 * {@link ReachabilityMonitor.wakeup$} 的退避。吞掉不等于藏起来：错误进
 * {@link SyncStateHub.reportError}，用户在面板上看得见。
 */
async function runQuietly(syncState: SyncStateHub, task: () => Promise<unknown>): Promise<boolean> {
  try {
    await task();
    return true;
  } catch (error) {
    syncState.reportError(error);
    return false;
  }
}

/**
 * 枚举需要走 REST 重放的仓库
 *
 * @remarks
 * 判据是 `offlineWrite && !push`，也就是「能在离线时接受本地写，但没有 changelog 端点」——
 * 现阶段只有 `querycache`。`push` 那半边由 {@link VersionManager.push} 自己按能力矩阵筛，
 * 这里不重复。
 *
 * 不在这里查 `RxDBSync.enabled`：那要为每个仓库读一次库，而
 * {@link flushQueryCacheOutbox} 入口本来就会判并返回 `skipped`。判两遍等于把同一个口径
 * 抄成两份。
 */
function queryCacheRepositories(vm: VersionManager): RepositoryIdentifier[] {
  const repositories: RepositoryIdentifier[] = [];

  for (const EntityClass of vm.rxdb.config.entities) {
    const metadata = getEntityMetadata(EntityClass);
    const capability = getSyncCapability(getSyncType(metadata, vm.rxdb.config.sync));
    if (capability.offlineWrite && !capability.push) {
      repositories.push({ namespace: metadata.namespace, entity: metadata.name });
    }
  }

  return repositories;
}

/**
 * 重放一个 QueryCache 仓库，把判负的实体报给面板
 *
 * @remarks
 * 只有 `conflicts`（解析器判 `KEEP_REMOTE`）进面板：那是用户离线时写的东西被远端盖掉了，
 * 是唯一需要他知道的一类。逐条上报而不是只报最后一条，`lastConflict` 自然停在最新的那条。
 */
async function flushRepository(vm: VersionManager, namespace: string, entity: string): Promise<void> {
  const { syncState } = vm.rxdb;
  const result = await flushQueryCacheOutbox(vm, namespace, entity);

  for (const entityId of result.conflicts) {
    syncState.reportConflict({ namespace, entity, entityId, winner: 'remote' });
  }
}

/**
 * 重放本轮所有 QueryCache 仓库
 *
 * @returns 是否每个仓库都成功
 */
async function flushRepositories(vm: VersionManager): Promise<boolean> {
  const { syncState } = vm.rxdb;
  let allSucceeded = true;

  for (const { namespace, entity } of queryCacheRepositories(vm)) {
    const succeeded = await runQuietly(syncState, () => flushRepository(vm, namespace, entity));
    allSucceeded = succeeded && allSucceeded;
  }

  return allSucceeded;
}

/**
 * 重新数一遍 QueryCache 的出站积压，刷新面板
 *
 * @remarks
 * 失败**不**走 {@link runQuietly}：这是一次读，读不到只意味着面板停在上一个数字，
 * 而 `lastError` 说的是「你的数据没推上去」。把一次 COUNT 失败写进去会让用户
 * 以为刚推成功的一轮出了问题。
 *
 * 每轮都数而不是只在推过之后数：水位线推进不写 `rxdb_change`，实时查询看不见这个数
 * （见 {@link SyncStateHub.reportOutboxCount}），一轮一次重算是它唯一的纠偏时机。
 */
async function refreshOutboxCount(vm: VersionManager): Promise<void> {
  try {
    vm.rxdb.syncState.reportOutboxCount(await countQueryCacheOutbox(vm));
  } catch {
    // 面板保留上一个数字
  }
}

/**
 * 恢复联网后的一轮回推：分支元数据 → changelog 推送 → QueryCache REST 重放
 *
 * @remarks
 * 分支元数据先行：推送要落在正确的分支上，分支信息过期会把变更推到错的地方。
 * 两条推送路径串行而非并行 —— 它们打的是同一个远端，恢复瞬间并发只会把刚恢复的
 * 连接再压垮一次。
 *
 * `endRound` 放 `finally`：三步都被 {@link runQuietly} 兜住了，但重算积压那步之外
 * 若将来再加一步没兜住的，`syncing` 会永久卡在真上，面板从此显示「正在同步」。
 */
async function resumeSync(vm: VersionManager): Promise<void> {
  const { syncState } = vm.rxdb;
  syncState.beginRound();

  try {
    const branchesOk = await runQuietly(syncState, () => vm.syncBranches());
    const pushOk = await runQuietly(syncState, () => vm.push());
    const flushOk = await flushRepositories(vm);

    // 清账放在重算积压之前：先宣布本轮没出错，再把「还剩多少」更新上去
    if (branchesOk && pushOk && flushOk) {
      syncState.reportSuccess();
    }
    await refreshOutboxCount(vm);
  } finally {
    syncState.endRound();
  }
}

/**
 * 构造回推触发流
 *
 * @remarks
 * 两个触发源，语义不同：
 *
 * - **可回推了**：`connected$`（适配器生命周期）与 `online$`（网络可达）**同时**为真。
 *   两者缺一不可，也不能互相替代 —— HTTP 适配器的 `connect()` 不发任何网络请求，
 *   断网时它照样报 connected；反过来网通了但适配器没连上，回推没有可用的本地仓储。
 * - **再试一次**：离线期间的退避节拍。它只按 `connected$` 过滤，**不**按 `online$` ——
 *   节拍存在的意义正是在判定为离线时驱动重试，用离线状态把它挡掉会让重试链彻底断掉。
 */
function createResumeTrigger(vm: VersionManager): Observable<unknown> {
  const connected$ = vm.rxdb.connected$;
  const ready$ = combineLatest([connected$, vm.rxdb.reachability.online$]).pipe(
    map(([connected, online]) => connected && online),
    distinctUntilChanged()
  );

  return merge(
    ready$.pipe(filter(ready => ready)),
    vm.rxdb.reachability.wakeup$.pipe(
      withLatestFrom(connected$),
      filter(([, connected]) => connected)
    )
  );
}

/**
 * 设置 VersionManager 的同步监听器
 *
 * 包含两条 reactive 链路：
 * 1. 「已连接且网络可达」→ 自动回推（分支元数据 + changelog 推送 + QueryCache 重放），
 *    离线期间由退避节拍驱动重试，每一步失败仅吞错
 * 2. Remote 实体事件 → 累计 `pullableCount`（仅统计当前激活分支）
 *
 * 调用方负责管理返回的 subscriptions / removers 生命周期（destroy 时清理）。
 *
 * @returns 已注册的 rxjs subscriptions 和事件解绑闭包
 */
export function setupVersionSyncListeners(
  vm: VersionManager,
  historyManager: HistoryManager
): {
  subscriptions: Subscription[];
  removers: Array<() => void>;
} {
  const subscriptions: Subscription[] = [];
  const removers: Array<() => void> = [];

  // 1. 有远程适配器时，恢复联网后自动回推
  const remoteAdapterName = vm.rxdb.config.sync?.remote?.adapter;
  if (remoteAdapterName) {
    // `exhaustMap` 而不是 `mergeMap`：恢复瞬间往往连着来好几个信号（`online` 事件、
    // 退避节拍、用户手动重试），并发起两轮回推会把同一批变更重放两次 ——
    // 第二轮读到的还是第一轮尚未推进的水位线。
    const sub = createResumeTrigger(vm)
      .pipe(exhaustMap(() => resumeSync(vm)))
      .subscribe();
    subscriptions.push(sub);
  }

  // 2. 只累计当前激活分支的远程变更数量
  const filterByBranch = async (entities: { branchId?: string }[]): Promise<number> => {
    const branch = await vm.getCurrentBranch();
    return entities.filter(e => !e.branchId || e.branchId === branch.id).length;
  };

  const makeRemoteHandler = (label: string) => {
    return (event: RemoteEntityEvent) => {
      void (async () => {
        try {
          const count = await filterByBranch(event.entities);
          if (count > 0) historyManager.incrementPullableCount(count);
        } catch (error) {
          if (!isIgnorableDetachedVersionEventError(error)) {
            console.error(`[VersionManager] ${label} failed:`, error);
          }
        }
      })();
    };
  };

  const remoteHandlers = [
    { type: ENTITY_REMOTE_CREATE_EVENT, handler: makeRemoteHandler('onRemoteCreate') },
    { type: ENTITY_REMOTE_UPDATE_EVENT, handler: makeRemoteHandler('onRemoteUpdate') },
    { type: ENTITY_REMOTE_REMOVE_EVENT, handler: makeRemoteHandler('onRemoteRemove') }
  ] as const;

  for (const { type, handler } of remoteHandlers) {
    vm.rxdb.addEventListener(type, handler);
    // 在注册点闭包捕获已静态对齐的 type/handler，解绑时无需类型断言
    removers.push(() => vm.rxdb.removeEventListener(type, handler));
  }

  return { subscriptions, removers };
}
