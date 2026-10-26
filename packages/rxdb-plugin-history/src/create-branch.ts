import {
  assertUsableBranchId,
  type LocalRxDBBranchRepository,
  type LocalRxDBChangeRepository,
  resolve_current_branch,
  type RxDB,
  RxDBBranch,
  RxDBChange,
  RxDBError,
  type TransactionExecutor
} from '@aiao/rxdb';
import { VersionManager } from './VersionManager.js';

/** {@link write_new_branch} 的入参：一条新分支在树上的位置，以及可选的点名提交。 */
export interface NewBranchRowInput {
  /** 新分支的 id；调用方已经确认它可用、本地不存在 */
  readonly branchId: string;
  /** 父分支 id；调用方已经确认它在本事务里存在 */
  readonly parentId: string;
  /** 分叉点：父分支上的一条变更 id；`null` 是停在父分支自己的分叉点上 */
  readonly fromChangeId: number | null;
  /** 点名的源提交，原样交给贡献方（见 `RxDBBranchCreationContext.fromCommitId`） */
  readonly fromCommitId?: string;
}

/**
 * 在调用方的事务里写下一条新分支：分支行，再加每个系统贡献方的那几行。
 *
 * @param rxdb - 宿主；取它的实体管理器与系统贡献
 * @param executor - 调用方那个写事务的执行器
 * @param input - 见 {@link NewBranchRowInput}
 * @returns 刚写下的分支行
 *
 * @remarks
 * 从 {@link create_branch} 的事务体里拆出来，给工作树插件的「从提交建分支」（US-314）复用：那条路径要在
 * 自己的受管事务里过能力门禁，分叉点由那个提交记下的位置给出——`(父分支, null)` 这种「停在父分支自己的分叉点上」
 * 的位置，`createBranch(id, fromChangeId)` 的入参表达不了。查重、解析父分支都留给调用方：两条路径各自的
 * 校验次序不同，揉进这里就得在两边都兜着对方的次序。
 *
 * 分支行写在贡献行之前，贡献方串行调用、抛错即中断，理由见 {@link create_branch}。
 *
 * @internal
 */
export const write_new_branch = async (
  rxdb: RxDB,
  executor: TransactionExecutor,
  input: NewBranchRowInput
): Promise<RxDBBranch> => {
  const branchRepository = executor.getRepository(RxDBBranch) as unknown as LocalRxDBBranchRepository;
  // 用事务内仓库的 `create` 而非 `branch.save()`：后者经 entityManager 打到适配器上，
  // 正是事务体内不能碰的那条队列。
  const branch = rxdb.entityManager.instantiate(RxDBBranch);
  branch.id = input.branchId;
  branch.activated = false;
  // 冗余列与 `activated` 必须同写（`system/branch.ts` 的唯一索引就架在它上面）。
  // 漏写一处，那一行就绕过唯一约束，而 schema 那一半的保护正好在这种漏写上失效。
  branch.activeKey = null;
  branch.local = true;
  branch.remote = false;
  branch.fromChangeId = input.fromChangeId;
  branch.parentId = input.parentId;
  await branchRepository.create(branch);

  // 不点名提交时连键都不放：贡献方按「有没有点名」分流，`fromCommitId: undefined` 与没有这个键是两种形状
  const context =
    input.fromCommitId === undefined ?
      { executor, branchId: input.branchId }
    : { executor, branchId: input.branchId, fromCommitId: input.fromCommitId };
  for (const contribution of rxdb.systemContributions) {
    await contribution.writeBranchRows(rxdb.entityManager, context);
  }
  return branch;
};

/**
 * 远端已有同名分支就拒绝。
 *
 * @param version - 取远端配置与远端仓库
 * @param branchId - 要建的分支 id
 * @throws {@link RxDBError} 远端已有同名分支时
 *
 * @remarks
 * 没配远端、或远端适配器不支持查询时不查：这是一次尽力而为的预检，真正的互斥由本地主键约束兜底。
 * 它是网络往返，调用方必须在事务**外**调它，理由见 {@link create_branch}。
 *
 * @internal
 */
export const assert_branch_id_free_on_remote = async (version: VersionManager, branchId: string): Promise<void> => {
  const remoteAdapterName = version.rxdb.config.sync?.remote?.adapter;
  if (!remoteAdapterName) return;
  const { adapter: remoteAdapter } = await version.getRemoteRepositories();
  if (!remoteAdapter.branchExists) return;
  if (await remoteAdapter.branchExists(branchId)) {
    throw new RxDBError(`Branch id (${branchId}) already exists on remote`);
  }
};

/**
 * 创建一个新分支
 * @param version
 * @param branchId
 * @param fromChangeId
 * @returns
 *
 * @remarks
 * 「查重 → 解析分叉点 → 写入」在一个事务窗口内完成。只把 `remove_branch`
 * 包进事务是不够的：一个在删除之前就解析完父分支的 `create_branch`，仍会在删除之后
 * 把子分支写进去，留下孤儿。两侧同处一个写队列窗口，「只能有一方成功」才成立。
 *
 * 远端 `branchExists` 那一趟**留在事务外**：它是网络往返，放进事务会让并发度 1 的
 * 写队列被一次 RTT 堵住。它本来也只是尽力而为的预检，真正的互斥由本地主键约束兜底。
 *
 * **一条分支未必只有一行。** 贡献系统能力的插件可以在同一个事务里追写自己那几行
 * （{@link RxDBSystemContribution.writeBranchRows}）——装了 `@aiao/rxdb-plugin-working-tree`
 * 时是 `CommitBranchRef` 与 `WorkingTreeState` 两行。同属一个事务，正是为了不让
 * 「建了分支却没有对应视图」这种半成品状态存在：那样一条分支与一条正常的老分支
 * 在形状上分辨不出来，只会在下一次用到它时抛一句读不出主语的错。
 */
export const create_branch = async (version: VersionManager, branchId: string, fromChangeId?: number) => {
  // 挡在所有 I/O 之前。排在查重之后的话，一条从第一个字符起就不可用的 id 会先跑完本地
  // 查重、再跑一趟远端 RTT 才被拒——而这两趟的答案与结论无关。
  assertUsableBranchId(branchId);

  const { branchRepository: queuedBranchRepository, adapter } = await version.getLocalRepositories();
  // 检查分支 ID 是否存在（本地）
  //
  // 事务里还会再查一次。这一次是快速失败：它挡在远端往返之前，
  // 保证「本地已存在」比「远端已存在」先报，错误信息的优先级不因加事务而改变。
  const branchEntity = await queuedBranchRepository.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'id', operator: '=', value: branchId }]
    },
    limit: 1
  });
  if (branchEntity.length) throw new RxDBError(`Branch id (${branchId}) already exists`);

  // 检查分支 ID 是否存在（远程）
  await assert_branch_id_free_on_remote(version, branchId);

  // 校验失败返回而不是就地抛出，理由同 `remove_branch`：不让适配器的事务包装层改写异常身份。
  const result = await adapter.transaction(async executor => {
    const branchRepository = executor.getRepository(RxDBBranch) as unknown as LocalRxDBBranchRepository;
    const changeRepository = executor.getRepository(RxDBChange) as unknown as LocalRxDBChangeRepository;

    const existed = await branchRepository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: branchId }]
      },
      limit: 1
    });
    if (existed.length) return `Branch id (${branchId}) already exists`;

    let fromBranch: InstanceType<typeof RxDBBranch> | undefined;
    let fromChange: InstanceType<typeof RxDBChange> | undefined;

    // 找出当前分支
    if (fromChangeId) {
      // 从 RxDBChange 表查找包含指定 changeId 的记录，获取其 branchId
      const changeEntity = (
        await changeRepository.find({
          where: {
            combinator: 'and',
            rules: [{ field: 'id', operator: '=', value: fromChangeId }]
          },
          limit: 1
        })
      )[0];
      if (!changeEntity) return `Change ID (${fromChangeId}) not found`;

      // 保存找到的 change 作为 fromChange
      fromChange = changeEntity;

      // 通过 branchId 查找分支
      fromBranch = (
        await branchRepository.find({
          where: {
            combinator: 'and',
            rules: [{ field: 'id', operator: '=', value: changeEntity.branchId! }]
          },
          limit: 1
        })
      )[0];
    } else {
      // 不能调 `version.getCurrentBranch()`：那一份走绑在适配器上的仓库，
      // 会排在自己这个事务后面（队列并发度 1）而挂死。共用同一段逻辑，换成事务内的仓库。
      fromBranch = await resolve_current_branch(branchRepository, version.rxdb);
      fromChange = await get_current_branch_last_change(changeRepository, fromBranch.id);
    }
    if (!fromBranch) return 'Source branch not found';

    // 贡献方的分支级行写在**这一个**事务里，不另开一个：分支行与贡献行分处两个事务的话，
    // 中间失败留下的是一条「分支在、贡献行不在」的记录，而这种半条分支与一条正常的老分支
    // 在形状上分辨不出来。抛错就让整条 `create_branch` 回滚，这是对的。
    //
    // 串行而非 `Promise.all`：`executor` 是一条并发度为 1 的队列，并行发起只会让
    // 写入顺序取决于各贡献方内部 await 的排布，出问题时复现不出来。
    return write_new_branch(version.rxdb, executor, {
      branchId,
      parentId: fromBranch.id,
      fromChangeId: fromChange?.id ?? null
    });
  });

  if (typeof result === 'string') throw new RxDBError(result);
  return result;
};

/**
 * 获取分支最新一笔可作为分叉点的变更记录
 *
 * @param changeRepository - 变更仓库。由调用方决定它属于哪个事务 ——
 * `create_branch` 传的是事务内的那一份，不能在这里自己去 `getLocalRepositories()`。
 * @param currentBranchId - 分支 ID；不传则按「当前激活分支」查
 *
 * 独立导出而非内联，是为了被 `__tests__/version/create-branch.spec.ts` 单独测试。
 */
export const get_current_branch_last_change = async (
  changeRepository: LocalRxDBChangeRepository,
  currentBranchId?: string
) => {
  return (
    await changeRepository.find({
      where: {
        combinator: 'and',
        rules: [
          currentBranchId ?
            { field: 'branchId', operator: '=', value: currentBranchId }
          : { field: 'branch.activated', operator: '=', value: true },
          {
            field: 'revertChangeId',
            operator: '=',
            value: null
          }
        ]
      },
      orderBy: [{ field: 'id', sort: 'desc' }],
      limit: 1
    })
  )[0];
};
