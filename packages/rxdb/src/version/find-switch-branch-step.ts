import { RxDBError } from '../RxDBError.js';
import { RxDBBranch } from '../system/branch.js';

/**
 * 分支切换步骤
 */
export interface SwitchBranchStep {
  /**
   * 分支对象
   */
  branch: RxDBBranch;
  /**
   * 开始变更 ID
   */
  fromChangeId: number;

  /**
   * 目标变更 ID
   */
  toChangeId: number;
}

/**
 * 查找分支切换路径的参数
 */
export interface FindBranchPathOptions {
  /**
   * 所需分支列表
   */
  branches: RxDBBranch[];

  /**
   * 当前分支
   */
  currentBranch: RxDBBranch;

  /**
   * 当前分支的变更 ID
   */
  currentChangeId: number | null;

  /**
   * 目标分支
   */
  nextBranch: RxDBBranch;

  /**
   * 目标分支的变更 ID
   */
  nextChangeId: number | null;
}

/**
 * 计算出树的两个节点之间的切换路径
 * 规则如下:
 *  1, 如果两个树节点有共同的祖先节点,则路径为从当前节点到共同祖先节点,再到目标节点
 *  2, 如果没有共同祖先节点,则路径为从当前节点到根节点,再到目标节点
 *  3, 需要计算出路径内每个节点需要变更过程，也就是 fromChangeId -> toChangeId
 *  4, 由于 changeId 在不同分支的变化都是是递增的, 所以如果逆向还原数据那么 fromChangeId 会大于 toChangeId, 正向应用数据则相反
 */
/**
 * 读取分支的分叉点变更 id。
 *
 * `fromChangeId === null` 的含义是**分叉于根**（这条分支不是从某条变更上长出来的）。
 * 变更 id 从 1 开始递增，所以用 0 表示「根」既不会和任何真实变更撞上，又能让它
 * 直接参与后面的区间运算。
 *
 * 抽成具名函数是为了让这个约定只存在一处：从前它以 `branch.fromChangeId ?? 0` 的形式
 * 在本文件出现十余次，读的人无法判断哪一处是「表达根」、哪一处只是随手兜底。
 *
 * @param branch - 分支行
 * @returns 分叉点变更 id，分叉于根时为 0
 */
const forkPointOf = (branch: RxDBBranch): number => branch.fromChangeId ?? 0;

export const find_switch_branch_step = (options: FindBranchPathOptions): SwitchBranchStep[] => {
  const { branches, currentBranch, nextBranch } = options;

  // 如果分支没有自己的变更记录，使用 fromChangeId 作为当前状态
  // 否则使用该分支的最大 changeId
  const currentChangeId = options.currentChangeId ?? forkPointOf(currentBranch);
  const nextChangeId = options.nextChangeId ?? forkPointOf(nextBranch);

  // 任意分支只要变更 id 相同，都无需切换数据
  if (currentChangeId === nextChangeId) {
    return [];
  }

  // 如果是同一个分支但变更 id 不同，直接在当前分支上移动
  if (currentBranch.id === nextBranch.id) {
    return [
      {
        branch: currentBranch,
        fromChangeId: currentChangeId,
        toChangeId: nextChangeId
      }
    ];
  }

  // 构建分支映射表
  const branchMap = new Map<string, RxDBBranch>();
  for (const branch of branches) {
    branchMap.set(branch.id, branch);
  }

  // 获取从某个分支到根的路径
  //
  // 断链（parentId 指不到分支）与成环都是**持久化完整性错误**：调用方传进来的 `branches`
  // 是全量无过滤查询的结果，不存在「父分支被过滤掉了」这种正常情况。
  // 曾经这两种情况都是 `break` —— 相当于把坏数据当成「已经到根」，继续算出一条通往
  // 并不存在的根的完整 action 序列，调用方照单全收地写库，半条路径被应用而没有任何报错。
  // 切分支失败远好过静默切错，因此这里必须终止且不产生任何 action。
  const getPathToRoot = (branch: RxDBBranch): RxDBBranch[] => {
    const path: RxDBBranch[] = [branch];
    const visited = new Set<string>([branch.id]);
    let current = branch;
    while (current.parentId) {
      if (visited.has(current.parentId)) {
        throw new RxDBError(
          `Branch history is corrupt: cycle detected at branch '${current.id}' (parentId '${current.parentId}' already visited)`
        );
      }
      const parent = branchMap.get(current.parentId);
      if (!parent) {
        throw new RxDBError(
          `Branch history is corrupt: branch '${current.id}' references missing parent '${current.parentId}'`
        );
      }
      visited.add(parent.id);
      path.push(parent);
      current = parent;
    }
    return path;
  };

  // 获取当前分支和目标分支到根的路径
  const currentPath = getPathToRoot(currentBranch);
  const nextPath = getPathToRoot(nextBranch);

  // 找到最近的共同祖先
  let commonAncestor: RxDBBranch | null = null;
  let commonAncestorIndex = -1;

  for (let i = 0; i < currentPath.length; i++) {
    const idx = nextPath.findIndex(b => b.id === currentPath[i].id);
    if (idx !== -1) {
      commonAncestor = currentPath[i];
      commonAncestorIndex = i;
      break;
    }
  }

  const steps: SwitchBranchStep[] = [];

  if (commonAncestor) {
    // 从当前分支回退到共同祖先
    for (let i = 0; i < commonAncestorIndex; i++) {
      const branch = currentPath[i];
      const fromId = i === 0 ? currentChangeId : forkPointOf(currentPath[i - 1]);
      const toId = forkPointOf(branch);

      // 只有当需要实际变更时才添加步骤
      if (fromId !== toId) {
        steps.push({
          branch,
          fromChangeId: fromId,
          toChangeId: toId
        });
      }
    }

    // 在共同祖先上可能也需要移动
    const ancestorIndexInNext = nextPath.findIndex(b => b.id === commonAncestor!.id);

    if (ancestorIndexInNext === 0) {
      // 共同祖先就是目标分支，需要移动到目标 changeId
      const ancestorFromId =
        commonAncestorIndex === 0 ? currentChangeId : forkPointOf(currentPath[commonAncestorIndex - 1]);
      const ancestorToId = nextChangeId;

      if (ancestorFromId !== ancestorToId) {
        steps.push({
          branch: commonAncestor,
          fromChangeId: ancestorFromId,
          toChangeId: ancestorToId
        });
      }
    } else if (ancestorIndexInNext > 0) {
      // 需要从当前位置移动到目标分支的 fromChangeId
      const ancestorFromId =
        commonAncestorIndex === 0 ? currentChangeId : forkPointOf(currentPath[commonAncestorIndex - 1]);
      const ancestorToId = forkPointOf(nextPath[ancestorIndexInNext - 1]);

      if (ancestorFromId !== ancestorToId) {
        steps.push({
          branch: commonAncestor,
          fromChangeId: ancestorFromId,
          toChangeId: ancestorToId
        });
      }
    }

    // 从共同祖先前进到目标分支
    const forwardPath = nextPath.slice(0, ancestorIndexInNext).reverse();

    for (let i = 0; i < forwardPath.length; i++) {
      const branch = forwardPath[i];
      const fromId = forkPointOf(branch);
      const toId = i === forwardPath.length - 1 ? nextChangeId : forkPointOf(forwardPath[i + 1]);

      // 只有当需要实际变更时才添加步骤
      if (fromId !== toId) {
        steps.push({
          branch,
          fromChangeId: fromId,
          toChangeId: toId
        });
      }
    }
  } else {
    // 没有共同祖先，回退到当前分支的根，然后前进到目标分支
    // 1. 回退当前分支的所有节点到根
    for (let i = 0; i < currentPath.length; i++) {
      const branch = currentPath[i];
      const fromId = i === 0 ? currentChangeId : forkPointOf(currentPath[i - 1]);
      const toId = forkPointOf(branch);

      if (fromId !== toId) {
        steps.push({
          branch,
          fromChangeId: fromId,
          toChangeId: toId
        });
      }
    }

    // 2. 将当前树的根节点回退到 0
    const currentRoot = currentPath[currentPath.length - 1];
    const currentRootFromId = forkPointOf(currentRoot);

    if (currentRootFromId !== 0) {
      steps.push({
        branch: currentRoot,
        fromChangeId: currentRootFromId,
        toChangeId: 0
      });
    }

    // 3. 从目标树的根节点开始前进到目标分支
    const nextRoot = nextPath[nextPath.length - 1];
    const nextRootTargetId = nextPath.length > 1 ? forkPointOf(nextPath[nextPath.length - 2]) : nextChangeId;

    if (nextRootTargetId !== 0) {
      steps.push({
        branch: nextRoot,
        fromChangeId: 0,
        toChangeId: nextRootTargetId
      });
    }

    // 4. 前进目标树的所有子节点
    const forwardPath = nextPath.slice(0, nextPath.length - 1).reverse();
    for (let i = 0; i < forwardPath.length; i++) {
      const branch = forwardPath[i];
      const fromId = forkPointOf(branch);
      const toId = i === forwardPath.length - 1 ? nextChangeId : forkPointOf(forwardPath[i + 1]);

      if (fromId !== toId) {
        steps.push({
          branch,
          fromChangeId: fromId,
          toChangeId: toId
        });
      }
    }
  }

  return steps;
};
