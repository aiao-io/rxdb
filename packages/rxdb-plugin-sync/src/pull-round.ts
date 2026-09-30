/**
 * @packageDocumentation
 * 一轮拉取里与「谁推的、映射回哪一行」有关的两步。
 *
 * @remarks
 * `pullBatchOnce`（`pull-batch.ts`）与 `pullSingleRepository`（`pull-repository.ts`）走的是
 * 同一段流程：**拆分自推与他人的变更 → 回填自推变更的 `remoteId` → 压缩他人变更 → 解冲突 →
 * 合并进实体表 → 推水位线**。两边曾各抄一份，而抄件会分叉——next-11 评审复核时实测到的分叉
 * 正在这里：一侧把「只回填还没映射过的行」写进 SQL（`remoteId = null` → `IS NULL`），
 * 一侧写成 JS 守卫（`local.remoteId == null`）。两种写法当时判据相同，但**没有任何东西保证
 * 下一次改动仍然相同**，而一侧漏改不会让任何用例变红。
 *
 * 本模块收的是那段流程里**不碰受信写原语**的前半截。后半截（`executor.mergeChanges` 与随之
 * 而来的 supersession 标记）留在各自文件里，不是嫌麻烦：那一次写要按 `file`·`symbol`·`intent`
 * 在 `TRUSTED_CALLSITE_REGISTRY` 里对号入座（`declareTrustedWrite`），搬进本模块等于把两个
 * 登记入口合并成一个——那是核心包的适配器契约变更，不是同步插件自己能定的事。
 */

import { type IRepository, type RemoteChange, type RxDBChange } from '@aiao/rxdb';

/** {@link splitRemoteChangesByOrigin} 的结果 */
export interface RemoteChangeOrigins {
  /** 本客户端自己 push 上去、这轮又拉回来的变更 */
  ownChanges: RemoteChange[];
  /** 其他客户端产生的变更，只有这一批进 apply / conflict 链路 */
  otherChanges: RemoteChange[];
}

/**
 * 按 `clientId` 把一批远端变更拆成「自己推的」与「他人的」
 *
 * @param changes - 本轮拉到的远端变更
 * @param clientId - 本客户端 id
 * @returns 两个互斥的子集，顺序与入参一致
 *
 * @remarks
 * **只认 `clientId`，不拿 `localId` 当替补**：push 走 actions-only 路径时远端记录不带 `localId`，
 * 若用「有 localId 就是自己的」去判，这类记录会被判成他人的而重复应用一遍；反过来，若把
 * 「没有 clientId」也算成自己的，那这批数据拉下来了却永远不进 apply 链路——静默丢数据。
 * 所以缺 `clientId` 一律算他人的：多走一遍幂等的 apply，好过整批不落库。
 */
export const splitRemoteChangesByOrigin = (
  changes: RemoteChange[],
  clientId: string | undefined
): RemoteChangeOrigins => {
  const ownChanges: RemoteChange[] = [];
  const otherChanges: RemoteChange[] = [];

  for (const change of changes) {
    if (change.clientId != null && change.clientId === clientId) {
      ownChanges.push(change);
    } else {
      otherChanges.push(change);
    }
  }

  return { ownChanges, otherChanges };
};

/**
 * 把自推变更拿到的远端 id 回填到对应的本地 `RxDBChange` 行上
 *
 * @param changeRepo - 变更表仓库；在事务里调用时必须是经 executor 取到的那一个
 * @param ownChanges - {@link splitRemoteChangesByOrigin} 分出的自推变更
 *
 * @remarks
 * 只回填 `remoteId` 还空着的行，判据写在 SQL 里（`= null` 由适配器编译成 `IS NULL`）而不是
 * 取回来再用 JS 挑：少取一批行是次要的，主要是让「只写没映射过的」成为查询本身的一部分，
 * 而不是一条可以被下一次改动顺手删掉的 `if`。
 *
 * 覆盖已有映射不是小事：`cleanupExpired` 按 `remoteId` 判「这条已经同步出去了」，
 * 把旧映射改写成本轮的 id 会让保留窗口整段错位——旧变更被当成刚同步的留下来，
 * 而真正该留的那批反而先到期。
 *
 * 没有 `localId` 的自推变更直接跳过：对不上本地行，硬回填只能靠猜。
 */
export const backfillOwnChangeRemoteIds = async (
  changeRepo: IRepository<typeof RxDBChange>,
  ownChanges: RemoteChange[]
): Promise<void> => {
  const mappableChanges = ownChanges.filter(change => change.localId != null);
  if (mappableChanges.length === 0) return;

  const locals = await changeRepo.find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'id', operator: 'in', value: mappableChanges.map(change => change.localId!) },
        { field: 'remoteId', operator: '=', value: null }
      ]
    }
  });
  if (locals.length === 0) return;

  const remoteIdByLocalId = new Map(mappableChanges.map(change => [change.localId!, change.id]));
  for (const local of locals) {
    const remoteId = remoteIdByLocalId.get(local.id);
    if (remoteId != null) await changeRepo.update(local, { remoteId });
  }
};
