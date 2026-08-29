/**
 * @fileoverview 级联同步的调度契约
 *
 * 单仓路径（`_pullRepositoryImpl` / `_pushRepositoryImpl`）在入口处按仓库自己的
 * `syncType` 校验同步资格；级联路径此前直接调 `pullSingleRepository` /
 * `pushSingleRepository`，把这层校验整个绕过去了 —— `local` / `remote` / `none`
 * 的关联仓照样被拿去问远端要数据，或把只在本地的私有数据推去远端。
 *
 * 这里把「资格判定」和「依赖失败」两件事收敛成共享契约：
 * - {@link pullIneligibility} / {@link pushIneligibility}：两条路径共用同一份口径，
 *   单仓路径拿它拼错误消息并抛出，级联路径拿它写 `skipped` 原因并跳过；
 * 两者的 `syncType` 口径统一从 `sync-type-utils` 的能力矩阵派生，
 *   并在同一处叠加 `RxDBSync.enabled` 开关 —— 此前 `enabled` 只被状态展示读取，
 *   任何调度路径都没看过它，用户在界面上关掉同步等于什么都没关；
 * - {@link RxDBDependencyFailedError}：依赖失败导致某仓库没被同步时的结构化错误，
 *   带上「是谁被阻断」「被哪个依赖阻断」「根因是什么」，取代原先那个自由文本
 *   `skipped: 'Dependency failed'`。
 */

import { RxDBError } from '../RxDBError.js';
import type { DependencyGraph } from './dependency-graph.js';
import {
  SYNC_DISABLED_REASON,
  getSyncCapability,
  isRepositorySyncEnabled,
  syncTypeIneligibility,
  type RepositorySyncSwitch,
  type RepositorySyncType
} from './sync-type-utils.js';
import type { RepositoryIdentifier } from './VersionManager.interface.js';

/**
 * 把仓库标识渲染成 `namespace:entity`（依赖图与错误消息共用的键格式）
 *
 * @param repository - 仓库标识
 * @returns `namespace:entity` 形式的键
 */
export function repositoryKey(repository: RepositoryIdentifier): string {
  return `${repository.namespace}:${repository.entity}`;
}

/**
 * 判定仓库是否没有拉取资格
 *
 * @param syncType - 该仓库的有效同步类型（已含全局配置回退）
 * @param repoSync - 该仓库在当前分支上的同步记录；查不到时省略（懒创建，视为启用）
 * @returns 不具备拉取资格时返回原因短语；具备资格时返回 `undefined`
 *
 * @remarks
 * 返回的短语同时用于两处，必须保持一致：
 * - 单仓路径：`Cannot pull repository <key>: <原因>.`
 * - 级联路径：`skipped` 字段的取值
 *
 * 两个否决条件的顺序是有意的：`syncType` 是配置写死的、改不动的事实，
 * `enabled` 是用户随时能翻回来的开关。先报前者，用户才不会去关一个本来就拉不动的仓库。
 *
 * @example
 * ```ts
 * pullIneligibility('full');                    // undefined
 * pullIneligibility('local');                   // "syncType is 'local' (no remote)"
 * pullIneligibility('full', { enabled: false }); // "sync is disabled (RxDBSync.enabled = false)"
 * ```
 */
export function pullIneligibility(
  syncType: RepositorySyncType,
  repoSync?: RepositorySyncSwitch | null
): string | undefined {
  if (!getSyncCapability(syncType).pull) return syncTypeIneligibility(syncType);
  if (!isRepositorySyncEnabled(repoSync)) return SYNC_DISABLED_REASON;
  return undefined;
}

/**
 * 判定仓库是否没有推送资格
 *
 * @param syncType - 该仓库的有效同步类型（已含全局配置回退）
 * @param repoSync - 该仓库在当前分支上的同步记录；查不到时省略（懒创建，视为启用）
 * @returns 不具备推送资格时返回原因短语；具备资格时返回 `undefined`
 *
 * @remarks
 * `'local'` 同样没有推送资格，与 `needsPush` 的公开契约一致：该类仓库连 remote
 * adapter 都没有，推送本就无从执行，放行只会让私有本地数据进入推送队列。
 *
 * `'querycache'` 没有推送资格，但**这不代表它的本地改动回不去**：它的远端契约是纯 REST，
 * 没有 changelog 端点（`RxDBAdapterHttp.mergeChanges()` 直接抛
 * `HttpChangelogUnsupportedError`），放行只会把它送进一条它的适配器不实现的管道。
 * 它的离线写走另一条路 —— `getSyncCapability(syncType).offlineWrite` 为 `true`，
 * 由 QueryCache 的出站重放按 REST 动词送回远端。
 *
 * @example
 * ```ts
 * pushIneligibility('filter'); // undefined
 * pushIneligibility('remote'); // "syncType is 'remote' (read-only)"
 * ```
 */
export function pushIneligibility(
  syncType: RepositorySyncType,
  repoSync?: RepositorySyncSwitch | null
): string | undefined {
  if (!getSyncCapability(syncType).push) return syncTypeIneligibility(syncType);
  if (!isRepositorySyncEnabled(repoSync)) return SYNC_DISABLED_REASON;
  return undefined;
}

/**
 * 依赖仓库同步失败，导致本仓库整个没有被同步
 *
 * @remarks
 * 取代原先的 `skipped: 'Dependency failed'` —— 那个字符串既不说是哪个依赖挂了、
 * 也不说为什么，并且因为没有 `error` 字段，调用方 `await` 到的是一个**成功**的
 * Promise，而目标仓一条变更都没同步。
 *
 * @example
 * ```ts
 * try {
 *   await pullRepository(vm, 'public', 'Comment');
 * } catch (error) {
 *   if (error instanceof RxDBDependencyFailedError) {
 *     console.warn(`${repositoryKey(error.dependency)} 挂了，${repositoryKey(error.repository)} 没同步`, error.cause);
 *   }
 * }
 * ```
 */
export class RxDBDependencyFailedError extends RxDBError {
  constructor(
    /** 因依赖失败而没有被同步的仓库 */
    readonly repository: RepositoryIdentifier,
    /** 直接导致阻断的依赖仓库 */
    readonly dependency: RepositoryIdentifier,
    /** 依赖仓库失败的根因 */
    override readonly cause: Error
  ) {
    super(
      `Repository ${repositoryKey(repository)} was not synced: dependency ${repositoryKey(dependency)} failed: ${cause.message}`
    );
    this.name = 'RxDBDependencyFailedError';
    Object.setPrototypeOf(this, RxDBDependencyFailedError.prototype);
  }
}

/**
 * 被依赖失败阻断的仓库，及其阻断来源
 */
export interface CascadeBlock {
  /** 直接导致阻断的依赖仓库 */
  dependency: RepositoryIdentifier;

  /** 该依赖仓库失败的错误 */
  cause: Error;
}

/**
 * 在依赖图上查找阻断当前仓库的第一个失败依赖
 *
 * @param graph - 依赖图
 * @param repoKey - 当前仓库的 `namespace:entity` 键
 * @param failed - 已失败仓库到其错误的映射（键同为 `namespace:entity`）
 * @returns 存在失败依赖时返回该依赖与其错误；否则返回 `undefined`
 *
 * @remarks
 * 只看直接依赖：级联按拓扑序执行，间接依赖的失败会先把中间那一层标成失败，
 * 再经由这一层传导下来。
 */
export function findBlockingDependency(
  graph: DependencyGraph,
  repoKey: string,
  failed: ReadonlyMap<string, Error>
): CascadeBlock | undefined {
  const dep = graph.get(repoKey);
  if (!dep) return undefined;

  for (const dependency of dep.dependsOn) {
    const cause = failed.get(repositoryKey(dependency));
    if (cause) return { dependency, cause };
  }

  return undefined;
}
