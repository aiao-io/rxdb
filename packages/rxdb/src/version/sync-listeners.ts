import { combineLatest, merge, type Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, exhaustMap, filter, map, withLatestFrom } from 'rxjs/operators';
import type { EntityType } from '../entity/entity.interface.js';
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
import { isSystemEntity } from '../system/system-entities.js';
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
 * 一轮里的各个仓库互不背书：一个仓库的出站队列重放不上，不代表别的仓库那条 REST 路
 * 也走不通。任何一步的失败都只影响它自己，剩下的照跑。
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
 * 接入方声明的实体，即摘掉系统表之后的 `config.entities`
 *
 * @remarks
 * 分派问的是「**用户的**数据该往哪走」，而 `config.entities` 里还混着
 * {@link SchemaManager.init} 补进来的四张系统表。它们不带自己的 `sync`，于是跟随库级配置 ——
 * 库级两端俱全时 {@link getSyncType} 会把它们判成 `full`，四张本地簿记表就这么被卷进
 * 用户数据的分派里。系统表自己的同步由 {@link VersionManager} 直接安排，从不经过这里。
 */
function consumerEntities(vm: VersionManager): EntityType[] {
  return vm.rxdb.config.entities.filter(EntityClass => !isSystemEntity(EntityClass));
}

/**
 * 枚举需要走 REST 重放的仓库
 *
 * @remarks
 * 判据是 `offlineWrite && !push`，也就是「能在离线时接受本地写，但没有 changelog 端点」——
 * 现阶段只有 `querycache`。带 `push` 能力的仓库不在这里：它们由用户显式调
 * {@link VersionManager.push}，那条路自己按能力矩阵筛。
 *
 * 不在这里查 `RxDBSync.enabled`：那要为每个仓库读一次库，而
 * {@link flushQueryCacheOutbox} 入口本来就会判并返回 `skipped`。判两遍等于把同一个口径
 * 抄成两份。
 */
function queryCacheRepositories(vm: VersionManager): RepositoryIdentifier[] {
  const repositories: RepositoryIdentifier[] = [];

  for (const EntityClass of consumerEntities(vm)) {
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
 * @param vm - 当前 VersionManager
 * @param repositories - 本轮的仓库名单，由 {@link queryCacheRepositories} 枚举
 * @returns 是否每个仓库都成功
 */
async function flushRepositories(vm: VersionManager, repositories: RepositoryIdentifier[]): Promise<boolean> {
  const { syncState } = vm.rxdb;
  let allSucceeded = true;

  for (const { namespace, entity } of repositories) {
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
 * 恢复联网后的一轮回推：逐个重放 QueryCache 仓库的出站队列
 *
 * @remarks
 * 这一轮**只**管 QueryCache 那条 REST 路（[US-020 D5-R](../../../../requirements/stories/core/US-020-querycache-repository.md)）。
 * changelog 那半边 —— {@link VersionManager.syncBranches} 与 {@link VersionManager.push} ——
 * 不在这里自动跑：`push` 问的是「把我这条分支上攒的提交送到远端去」，和 git 的 `push`
 * 一样是用户的决定。自动替他按下去，`pushableCount` 与界面上的 Push 按钮就成了摆设，
 * 「写在本地、还没推」这个状态从此不存在。QueryCache 没有这层分支语义，它的出站队列
 * 就是「这次写本该直接进远端，只是当时网断了」，联网补上才是它的正确行为。
 *
 * 各仓库串行而非并行 —— 它们打的是同一个远端，恢复瞬间并发只会把刚恢复的连接再压垮一次。
 *
 * 一个 QueryCache 仓库都没有时整轮不进：既省掉必然为空的一次 COUNT，也不让面板的
 * `syncing` 为了一轮什么都不做的回推闪一下。
 *
 * `endRound` 放 `finally`：每一步都被 {@link runQuietly} 兜住了，但重算积压那步之外
 * 若将来再加一步没兜住的，`syncing` 会永久卡在真上，面板从此显示「正在同步」。
 */
async function resumeSync(vm: VersionManager): Promise<void> {
  const repositories = queryCacheRepositories(vm);
  if (repositories.length === 0) {
    return;
  }

  const { syncState } = vm.rxdb;
  syncState.beginRound();

  try {
    // 清账放在重算积压之前：先宣布本轮没出错，再把「还剩多少」更新上去
    if (await flushRepositories(vm, repositories)) {
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
 * 1. 「已连接且网络可达」→ 自动重放 QueryCache 出站队列，离线期间由退避节拍驱动重试，
 *    每个仓库失败仅吞错。changelog 的 `push` 不在其中，见 {@link resumeSync}
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
      .pipe(
        exhaustMap(() =>
          // 一轮回推失败只终结这一轮。`resumeSync` 里 `runQuietly` 兜住的只有逐仓库 flush，
          // 枚举仓库与面板上报都在兜底之外；它们抛错顺着 `exhaustMap` 冒到订阅上就会终结整条
          // 触发流 —— 此后 online 事件、退避节拍、重新连接一律无效，自动回推永久停摆，
          // 而离线恢复本就是最容易出错的场景。吞掉不等于藏起来：错误进面板，用户看得见。
          resumeSync(vm).catch((error: unknown) => {
            vm.rxdb.syncState.reportError(error);
          })
        )
      )
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
