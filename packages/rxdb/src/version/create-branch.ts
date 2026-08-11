import { RxDBError } from '../RxDBError.js';
import { RxDBBranch } from '../system/branch.js';
import { RxDBChange } from '../system/change.js';
import type { LocalRxDBBranchRepository, LocalRxDBChangeRepository } from '../system/types.local.js';
import { resolve_current_branch } from './resolve-current-branch.js';
import { VersionManager } from './VersionManager.js';

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
 */
export const create_branch = async (version: VersionManager, branchId: string, fromChangeId?: number) => {
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
  const remoteAdapterName = version.rxdb.config.sync?.remote?.adapter;
  if (remoteAdapterName) {
    const { adapter: remoteAdapter } = await version.getRemoteRepositories();
    if (remoteAdapter.branchExists) {
      const existsOnRemote = await remoteAdapter.branchExists(branchId);
      if (existsOnRemote) throw new RxDBError(`Branch id (${branchId}) already exists on remote`);
    }
  }

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

    // 创建新分支
    //
    // 用事务内仓库的 `create` 而非 `branch.save()`：后者经 entityManager 打到适配器上，
    // 正是事务体内不能碰的那条队列。
    const branch = version.rxdb.entityManager.instantiate(RxDBBranch);
    branch.id = branchId;
    branch.activated = false;
    branch.local = true;
    branch.remote = false;
    branch.fromChangeId = fromChange?.id ?? null;
    branch.parentId = fromBranch.id;
    await branchRepository.create(branch);
    return branch;
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
