/**
 * @fileoverview 提交交换记录：导入远端提交与导出本地提交共用的那一种形状（US-316）。
 *
 * @remarks
 * 一条记录就是一个提交在服务端那一份身份：id、父链、种类、消息、作者、时间、内容指纹，外加它的全部变更单元。
 * 导出（{@link readCommitExportPage}）交出的就是导入（`importCommits()`）收的那一种，一台设备导出的记录经服务端认可之后，
 * 原样交给另一台设备导入——中间没有第二种格式，也就没有第二套字段映射可以漂移。
 *
 * **变更单元是落库形态，不是 `commitChanges()` 那份解码形态。** 内容指纹算在落库形态上（`change-unit.ts` 的
 * 「规范化取的是落库形态」）：`bigint` / `binary` 列是 `{ $rxdbChangeValue: … }` 包装、加密列是信封字符串，
 * 与 JSON 往返同形。交出解码形态的话，`bigint` 根本过不了 `JSON.stringify`，而服务端拿解码值复算出的指纹
 * 与库里那个对不上。`commitChanges()` 是给人看的明细，这里是交换格式，两者不合并。
 *
 * **内容指纹在这里是跨系统契约。** 服务端按同一套规范化规则复算、核对（规则写在插件文档「指纹规范化」一节，
 * 实现只有 `change-unit.ts` 那一份）；稳定性由摘要域串里的版本号承诺：`rxdb.commit.content.v1` 不变，规则就不变，
 * 换算法必换域串。JavaScript 的服务端不照文档另写：`@aiao/rxdb-plugin-working-tree/exchange` 交出指纹、批次形状判定与
 * 本记录的 JSON 编解码（`commit-exchange-json.ts`）。本文件要读库，不在那个子路径的模块闭包里——那里只 `export type` 本记录。
 */

import type { TransactionExecutor } from '@aiao/rxdb';
import { RxDBError } from '@aiao/rxdb';
import type { CommitChangeUnitContent } from './change-unit.js';
import { collectReachableCommitIds } from './commit-ancestry.js';
import { CommitChangeSet } from './commit-change-set.entity.js';
import type { Commit, CommitKind } from './commit.entity.js';
import { listReachableCommits, loadCommitsByIds, readCommitBranchRef } from './list-commits.js';

/**
 * 一个提交的交换记录：导入的入参、导出的产物（US-316）。
 *
 * @remarks
 * 字段与 `Commit` 实体的列一一对应，少两列：`operationId`（本地幂等键，每台设备各自派生）与 `changeSetCount`
 * （就是 `units.length`，单列一份只会多一处可以对不上的地方）。`id` 改叫 `commitId`、`author` 改叫 `authorId`，
 * 与 `CommitLogEntry` 同名。
 *
 * @public
 */
export interface CommitExchangeRecord {
  /** 提交 id；导入后原样作为本地 id */
  readonly commitId: string;

  /**
   * 全部父，有序：第 0 个是第一父，ChangeSet 就是相对它的增量
   *
   * @remarks
   * 根提交为 `[]`；`normal` 至多一个；`merge` 两个及以上且互不相同；两种系统根节点恒为 `[]`。
   */
  readonly parentIds: readonly string[];

  /** 提交种类；`merge` 只能经导入写下 */
  readonly kind: CommitKind;

  /**
   * 提交消息，原样保存，不 trim
   *
   * @remarks
   * 参与内容指纹：改一个字节指纹就对不上。普通与合并提交要求 trim 后非空；系统根节点是写下它的那台设备的固定文案。
   */
  readonly message: string;

  /** 作者；普通与合并提交必填（trim 后非空），两种系统根节点为 `null` */
  readonly authorId: string | null;

  /**
   * 创建时间
   *
   * @remarks
   * **不进内容指纹，也不参与「同一个 id 是不是同一个提交」的判定。** 本地已有这个 id 且指纹相同时，导入保留本地那一份时间
   * ——历史不改写；服务端应原样保存客户端上传的时间，否则同一个提交在各台设备上的时间会不一样（只是不一样，不会被判成冲突）。
   */
  readonly createdAt: Date;

  /** 64 位小写 hex 的内容指纹；导入时按 {@link CommitExchangeRecord.units} 等字段复算核对 */
  readonly contentFingerprint: string;

  /**
   * 全部变更单元，按 `sequence` 升序，**落库形态**
   *
   * @remarks
   * 每个值都必须是 JSON 值（字符串、有限数、布尔、`null`、数组、普通对象）——把记录 `JSON.stringify` 再 `JSON.parse`
   * 一遍得到的仍是同一条记录，指纹也不变。普通提交至少一个；合并提交可以为空；系统根节点恒为空。
   */
  readonly units: readonly CommitChangeUnitContent[];
}

/**
 * 一次 `exportCommits()` 的入参。
 *
 * @public
 */
export interface CommitExportOptions {
  /**
   * 只要这个提交**之后**的那一段：HEAD 可达、它自己不可达的提交（git 的 `after..HEAD`）
   *
   * @remarks
   * 不给就是整条可达历史，含根节点——第一次上传时用。给的 id 必须是本库里有的提交，不要求在当前分支的历史上：
   * 它不在的话，交回的是两条线分叉以来本分支这一侧的全部提交，服务端照样拿得到它们的父。本库里没有这个提交时抛错。
   */
  readonly afterCommitId?: string;
}

/**
 * 一次 `exportCommits()` 的结果。
 *
 * @remarks
 * 带 `headRevision`：调用方上传成功、服务端回一批提交要导入时，拿它与那一刻的 `status()` 一起核对 HEAD 有没有在中间动过。
 *
 * @public
 */
export interface CommitExportPage {
  /** 读的是哪个分支；恒为读取时刻的 active 分支 */
  readonly branchId: string;

  /** 该分支此刻的 HEAD；空分支为 `null` */
  readonly headCommitId: string | null;

  /** 该分支此刻的 HEAD 修订号 */
  readonly headRevision: number;

  /**
   * 选中的提交，**父先于子**：每个提交的父要么在它前面，要么在 `afterCommitId` 那一侧
   *
   * @remarks
   * 顺序就是 `listCommits()` 的倒序，最后一个是 HEAD——与导入要求的批次顺序相同，导出的这一段可以原样交给另一台设备导入。
   */
  readonly commits: readonly CommitExchangeRecord[];
}

/**
 * `exportCommits()` 的空：`afterCommitId` 之后这条分支上没有新提交。
 *
 * @param page - 一次导出的结果
 * @returns 没有任何提交时为 `true`
 *
 * @public
 */
export const isCommitExportPageEmpty = (page: CommitExportPage): boolean => page.commits.length === 0;

/** 一行 ChangeSet 还原成落库形态的单元：九列原样，不解码。 */
const toStoredUnit = (row: CommitChangeSet): CommitChangeUnitContent => ({
  unitId: row.unitId,
  transactionId: row.transactionId,
  namespace: row.namespace,
  entity: row.entity,
  entityId: row.entityId,
  operation: row.operation,
  patch: row.patch,
  inversePatch: row.inversePatch,
  origin: row.origin
});

/**
 * 一批提交各自的全部 ChangeSet，与入参同序、每个提交内按 `sequence` 升序。
 *
 * @throws {@link RxDBError} 查回来的行指向这批之外的提交时（`in` 条件被改坏了）
 *
 * @remarks
 * 一次 `in` 查完，不逐个提交各查一次：导出一段历史的往返数不该随提交数涨。排序在 JS 侧做，不依赖后端返回顺序——
 * `sequence` 决定重放次序，也决定指纹的合成次序。桶先按入参铺好，空 ChangeSet 的提交（系统根节点）拿到的是空数组；
 * 行落不进任何桶就抛，理由同损坏守卫的 `bucketOf`：安静丢掉它等于让一条写错的 where 继续伪装成正确的。
 */
const readStoredUnitsOf = async (
  executor: TransactionExecutor,
  commits: readonly Commit[]
): Promise<CommitChangeUnitContent[][]> => {
  if (commits.length === 0) return [];
  const buckets = new Map<string, CommitChangeSet[]>(commits.map(commit => [commit.id, []]));
  const rows = await executor.getRepository(CommitChangeSet).find({
    where: {
      combinator: 'and',
      rules: [{ field: 'commitId', operator: 'in', value: commits.map(commit => commit.id) }]
    }
  });
  for (const row of rows) {
    const bucket = buckets.get(row.commitId);
    if (!bucket) throw new RxDBError(`Change set row of commit '${row.commitId}' is outside the exported batch.`);
    bucket.push(row);
  }
  return [...buckets.values()].map(bucket =>
    [...bucket].sort((left, right) => left.sequence - right.sequence).map(toStoredUnit)
  );
};

/** 一行提交连同它的单元摊成交换记录；逐字段挑，不 `{...row}`。 */
const toExchangeRecord = (commit: Commit, units: readonly CommitChangeUnitContent[]): CommitExchangeRecord => ({
  commitId: commit.id,
  parentIds: [...commit.parentIds],
  kind: commit.kind,
  message: commit.message,
  authorId: commit.author,
  createdAt: commit.createdAt,
  contentFingerprint: commit.contentFingerprint,
  units
});

/**
 * 读 `afterCommitId` 那一侧不要的提交：它自己与它的全部祖先。
 *
 * @throws {@link RxDBError} 本库里没有这个提交时
 *
 * @remarks
 * 读不到就抛，不当成「从头导出」：调用方给的多半是服务端认可的最后一个提交，本地没有它说明本地还没导入那一段，
 * 这时从头导出会把整条历史重新上传一遍，而服务端只能把它们当成一批重复提交。
 */
const readExcludedIds = async (executor: TransactionExecutor, afterCommitId: string): Promise<Set<string>> => {
  const [after] = await loadCommitsByIds(executor, [afterCommitId]);
  if (!after) throw new RxDBError(`Commit '${afterCommitId}' does not exist.`);
  return new Set(await collectReachableCommitIds(executor, afterCommitId));
};

/**
 * 读一个分支上某个提交之后的提交，摊成交换记录（`exportCommits()` 的命令体）。
 *
 * @param executor - 调用方那个事务的执行器；本函数**不自己开事务**
 * @param branchId - 要导出的分支；调用方（门面）从 active 分支令牌取
 * @param options - 见 {@link CommitExportOptions}
 * @returns 见 {@link CommitExportPage}
 * @throws {@link RxDBError} `afterCommitId` 在本库里不存在时；该分支的 ref 行缺失时
 *
 * @remarks
 * 选的是 HEAD 沿**全部父链**可达、`afterCommitId` 不可达的那些提交——合并进来的侧枝也要上传，服务端才拼得出父链。
 * 顺序是 `listCommits()` 同一份遍历的倒序（父先于子），一份遍历、两种用法，不会在合并图的排序上分叉。
 */
export const readCommitExportPage = async (
  executor: TransactionExecutor,
  branchId: string,
  options: CommitExportOptions = {}
): Promise<CommitExportPage> => {
  const ref = await readCommitBranchRef(executor, branchId);
  const page = { branchId, headCommitId: ref.headCommitId, headRevision: ref.headRevision };
  const excluded =
    options.afterCommitId === undefined ? new Set<string>() : await readExcludedIds(executor, options.afterCommitId);
  if (ref.headCommitId === null) return { ...page, commits: [] };

  const selected = (await listReachableCommits(executor, ref.headCommitId))
    .filter(commit => !excluded.has(commit.id))
    .reverse();
  const units = await readStoredUnitsOf(executor, selected);
  return { ...page, commits: selected.map((commit, index) => toExchangeRecord(commit, units[index])) };
};
