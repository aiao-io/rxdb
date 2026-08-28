import { combineLatest, merge, Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, exhaustMap, filter, map, withLatestFrom } from 'rxjs/operators';
import { flushQueryCacheOutbox } from '../repository/query-cache-outbox.js';
import {
  ENTITY_REMOTE_CREATE_EVENT,
  ENTITY_REMOTE_REMOVE_EVENT,
  ENTITY_REMOTE_UPDATE_EVENT,
  EntityRemoteCreatedEvent,
  EntityRemoteRemovedEvent,
  EntityRemoteUpdatedEvent
} from '../rxdb-events.js';
import { getEntityMetadata, isAdapterShutdownError } from '../rxdb-utils.js';
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
 * 设置 VersionManager 的同步监听器
 *
 * 包含两条 reactive 链路：
 * 1. `connected$` → 连接成功后自动 `syncBranches`（失败仅吞错重试）
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

  // 1. 有远程适配器时，连接成功后自动同步分支信息
  const remoteAdapterName = vm.rxdb.config.sync?.remote?.adapter;
  if (remoteAdapterName) {
    const sub = vm.rxdb.connected$.subscribe(connected => {
      if (connected) {
        vm.syncBranches().catch(() => {
          // 连接后同步分支失败不应阻塞，下次连接时会重试
        });
      }
    });
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
