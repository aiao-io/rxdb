/**
 * @fileoverview 级联阻断判定：在依赖图上找出挡住当前仓库的那个失败依赖。
 *
 * 与 {@link ../sync-contract/cascade-contract.js | cascade-contract} 分家的理由见后者的文件头 ——
 * 这一半读依赖图，跟着级联调度器走；那一半只做资格判定，核心的 QueryCache 出站队列也要用。
 */

import { type RepositoryIdentifier, repositoryKey } from '@aiao/rxdb';
import type { DependencyGraph } from './dependency-graph.js';
import type { DependencyEdge } from './topological-sort.js';
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
 * @param edge - 本相位沿哪条依赖边判定阻断，取自 `dependencyEdgeForAction`。
 * **没有默认值是刻意的**：这个值必须和本相位的
 * 拓扑序同源，随手给一个默认就等于允许两者各说各话。
 * @returns 存在失败依赖时返回该依赖与其错误；否则返回 `undefined`
 *
 * @remarks
 * 只看直接邻居：级联按拓扑序执行，间接依赖的失败会先把中间那一层标成失败，
 * 再经由这一层传导下来。
 *
 * 边必须跟着相位走，不能一律取 `dependsOn`：
 *
 * - **INSERT/UPDATE** 父先子后，父建不出来子就挂不上外键 → 子被 `dependsOn` 阻断；
 * - **DELETE** 子先父后，子删不掉父就删不得（外键还指着它）→ 父被 `requiredBy` 阻断。
 *
 * 此前两个相位都取 `dependsOn`，等于把 DELETE 的方向反过来看：子仓删除失败时
 * 父仓照删不误，远端要么直接违反外键约束、要么留下指向已删父行的孤儿；反过来
 * 父仓删除失败又会白白挡住子仓——删子从来不会破坏父。
 */
export function findBlockingDependency(
  graph: DependencyGraph,
  repoKey: string,
  failed: ReadonlyMap<string, Error>,
  edge: DependencyEdge
): CascadeBlock | undefined {
  const dep = graph.get(repoKey);
  if (!dep) return undefined;

  for (const dependency of dep[edge]) {
    const cause = failed.get(repositoryKey(dependency));
    if (cause) return { dependency, cause };
  }

  return undefined;
}
