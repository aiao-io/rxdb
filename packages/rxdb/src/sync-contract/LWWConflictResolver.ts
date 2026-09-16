import { Conflict, ConflictResolution, ConflictResolver } from './conflict.js';

/**
 * Last-Write-Wins 冲突解决器
 *
 * 基于 createdAt 时间戳，更晚的变更胜出
 * 这是默认的冲突解决策略
 *
 * @example
 * ```typescript
 * const resolver = new LWWConflictResolver();
 * const resolution = await resolver.resolve(conflict);
 *
 * if (resolution.type === 'KEEP_LOCAL') {
 *   // 使用本地变更
 * } else {
 *   // 使用远程变更
 * }
 * ```
 */
export class LWWConflictResolver implements ConflictResolver {
  /**
   * 解决单个冲突
   *
   * 比较本地和远程变更的 createdAt 时间戳，更晚的胜出。
   *
   * 时间戳相同时按 `clientId` 字典序决胜 —— 这是**全局确定**的：两个副本从各自视角
   * 拿到的是同一对 clientId，因此独立解决后会收敛到同一份数据。
   * 若固定「本地优先」，A 和 B 都会保留自己，永久分叉且每次同步都再冲突一次。
   * `clientId` 缺失或两侧相同时无从判别，退回本地优先。
   *
   * @param conflict - 冲突信息
   * @returns 冲突解决结果
   */
  async resolve(conflict: Conflict): Promise<ConflictResolution> {
    // `createdAt` 在 IRxDBChange 上是必填，故直接解引用：从前的 `?.getTime() ?? 0`
    // 一旦真的兜到，两侧会同时塌成 epoch 0 变成平局，胜负改由 clientId 字典序决定 ——
    // 时间戳缺失这件事被吞掉，赢家却已经换人。缺字段就该当场炸。
    const localTime = conflict.local.createdAt.getTime();
    const remoteTime = conflict.remote.createdAt.getTime();

    if (localTime !== remoteTime) {
      return localTime > remoteTime ? { type: 'KEEP_LOCAL' } : { type: 'KEEP_REMOTE' };
    }

    // 时间戳相同：必须用**全局确定**的 tie-breaker，否则两个副本各自「保留自己」，
    // 结果是永久分叉 —— 后续每次同步都再冲突一次，永不收敛。
    // `clientId` 在两侧视角下是同一对值，字典序比较能让双方独立算出同一个赢家。
    const localClient = conflict.local.clientId;
    const remoteClient = conflict.remote.clientId;
    if (localClient && remoteClient && localClient !== remoteClient) {
      return localClient > remoteClient ? { type: 'KEEP_LOCAL' } : { type: 'KEEP_REMOTE' };
    }

    // 无法判别（缺 clientId 或同一 client）时退回既有约定：本地优先。
    return { type: 'KEEP_LOCAL' };
  }

  /**
   * 批量解决冲突
   *
   * 逐个调用 resolve() 方法
   *
   * @param conflicts - 冲突列表
   * @returns 解决结果列表
   */
  async resolveAll(conflicts: Conflict[]): Promise<ConflictResolution[]> {
    return Promise.all(conflicts.map(conflict => this.resolve(conflict)));
  }
}
