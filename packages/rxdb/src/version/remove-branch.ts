import { RxDBError } from '../RxDBError.js';
import { RxDBBranch } from '../system/branch.js';
import { RxDBChange } from '../system/change.js';
import type { LocalRxDBBranchRepository, LocalRxDBChangeRepository } from '../system/types.local.js';
import { VersionManager } from './VersionManager.js';

/**
 * 移除一个分支
 * @param version
 * @param branchId
 *
 * @remarks
 * 「查子分支 → 查 change → 删」整段必须在一个事务窗口内完成。
 * 拆开之后，检查与删除之间新建的子分支会漏判，留下 `parentId` 指向不存在分支的孤儿，
 * 而孤儿又会被切分支时的「父节点缺失即当作到根」静默吞掉，损坏无声。
 *
 * 事务体内一律用 `executor.getRepository(...)`：绑在适配器上的仓库会重新入队，
 * 排在自己这个事务后面（队列并发度 1），永久挂起。
 */
export const remove_branch = async (version: VersionManager, branchId: string) => {
  const { adapter } = await version.getLocalRepositories();
  // 检查是否为主分支
  if (branchId === 'main') {
    throw new RxDBError(`Cannot remove main branch`);
  }

  // 校验失败**返回**而不是就地抛出：抛出会被适配器的事务包装层裹成适配器错误类型
  // （`RxDBAdapterSqliteError` 等），调用方拿到的异常身份就跟着实现细节变了。
  // 校验失败时本事务一行都没写，回不回滚无所谓，留到事务外抛更稳。
  const rejection = await adapter.transaction(async executor => {
    const branchRepository = executor.getRepository(RxDBBranch) as unknown as LocalRxDBBranchRepository;
    const changeRepository = executor.getRepository(RxDBChange) as unknown as LocalRxDBChangeRepository;

    // 检查分支是否存在
    const branch = (
      await branchRepository.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: branchId }]
        },
        limit: 1
      })
    )[0];

    if (!branch) {
      return `Branch '${branchId}' not found`;
    }

    // 检查分支是否为激活状态
    if (branch.activated) {
      return `Cannot remove active branch '${branchId}'. Switch to another branch first.`;
    }

    // 检查是否有子分支依赖于该分支
    //
    // 必须直接查 `parentId`：拿「父分支有哪些 change、子分支的 fromChangeId 是否落在其中」
    // 反推拓扑有两个漏洞 —— 父分支一条 change 都没有时整段检查被跳过；子分支的 fromChangeId
    // 指向的 change 若已被清理也会漏判。两者都留下 `parentId` 指向不存在分支的孤儿。
    const childBranches = await branchRepository.find({
      where: {
        combinator: 'and',
        rules: [
          { field: 'parentId', operator: '=', value: branchId },
          { field: 'id', operator: '!=', value: branchId }
        ]
      },
      limit: 1
    });
    if (childBranches?.length) {
      return `Cannot remove branch '${branchId}' because it has child branches`;
    }

    const branchChanges = await changeRepository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'branchId', operator: '=', value: branchId }]
      }
    });
    await executor.removeMany([...branchChanges, branch]);
    return undefined;
  });

  if (rejection) {
    throw new RxDBError(rejection);
  }
};
