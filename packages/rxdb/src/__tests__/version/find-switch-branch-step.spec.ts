import { describe, expect, it } from 'vitest';
import { RxDBBranch } from '../../system/branch.js';
import { find_switch_branch_step, SwitchBranchStep } from '../../version/find-switch-branch-step.js';

let data_index = 1;

/**
 * 创建模拟的分支对象
 * @param data 部分分支数据
 */
const createMockBranch = (data: Partial<RxDBBranch>): RxDBBranch => {
  data_index++;
  return {
    activated: false,
    local: true,
    remote: false,
    fromChangeId: null,
    parentId: null,
    createdAt: new Date(data_index),
    updatedAt: new Date(data_index),
    ...data
  } as RxDBBranch;
};

/**
 * 测试函数：提取分支 ID 和变更 ID 信息
 */
const getBranchInfo = (steps: SwitchBranchStep[]) =>
  steps.map(p => p.branch.id + '|' + p.fromChangeId + '->' + p.toChangeId);

describe('find_switch_branch_step', () => {
  it('两个空分支切换，无需变化', () => {
    // 树结构:
    //   tree1      tree2
    const branches = [createMockBranch({ id: 'tree1' }), createMockBranch({ id: 'tree2' })];
    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[0],
      currentChangeId: null,
      nextBranch: branches[1],
      nextChangeId: null
    });
    expect(getBranchInfo(steps)).toEqual([]);
  });

  it('有数据切换到空分支，先清楚数据', () => {
    // 树结构:
    //   tree1      tree2
    const branches = [createMockBranch({ id: 'tree1' }), createMockBranch({ id: 'tree2' })];
    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[0],
      currentChangeId: 1,
      nextBranch: branches[1],
      nextChangeId: null
    });
    expect(getBranchInfo(steps)).toEqual(['tree1|1->0']);
  });

  it('父子关系：从空数据切换的子分支', () => {
    // 树结构: root -> child
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'child', parentId: 'root', fromChangeId: 1 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[0],
      currentChangeId: null,
      nextBranch: branches[1],
      nextChangeId: 3
    });
    expect(getBranchInfo(steps)).toEqual(['root|0->1', 'child|1->3']);
  });

  it('父子关系：从父分支到子分支', () => {
    // 树结构: root -> child
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'child', parentId: 'root', fromChangeId: 1 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[0],
      currentChangeId: 1,
      nextBranch: branches[1],
      nextChangeId: 3
    });
    expect(getBranchInfo(steps)).toEqual(['child|1->3']);
  });

  it('兄弟分支：通过共同父节点', () => {
    // 树结构:
    //       根节点 root
    //      /    \
    //   child1  child2
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'child1', parentId: 'root', fromChangeId: 1 }),
      createMockBranch({ id: 'child2', parentId: 'root', fromChangeId: 1 })
    ];
    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[1],
      currentChangeId: 3,
      nextBranch: branches[2],
      nextChangeId: 6
    });
    expect(getBranchInfo(steps)).toEqual(['child1|3->1', 'child2|1->6']);
  });

  it('兄弟分支：通过共同父节点，但是 fromChangeId 不同', () => {
    // 树结构:
    //       root
    //      /    \
    //   child1  child2
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'child1', parentId: 'root', fromChangeId: 1 }),
      createMockBranch({ id: 'child2', parentId: 'root', fromChangeId: 2 })
    ];
    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[1],
      currentChangeId: 3,
      nextBranch: branches[2],
      nextChangeId: 4
    });
    expect(getBranchInfo(steps)).toEqual(['child1|3->1', 'root|1->2', 'child2|2->4']);
  });

  it('堂兄弟分支:通过共同祖先', () => {
    // 树结构:
    //           root
    //          /    \
    //      branch1  branch2
    //         |        |
    //      child1   child2
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'branch1', parentId: 'root', fromChangeId: 1 }),
      createMockBranch({ id: 'branch2', parentId: 'root', fromChangeId: 1 }),
      createMockBranch({ id: 'child1', parentId: 'branch1', fromChangeId: 3 }),
      createMockBranch({ id: 'child2', parentId: 'branch2', fromChangeId: 3 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[3],
      currentChangeId: 10,
      nextBranch: branches[4],
      nextChangeId: 6
    });

    expect(getBranchInfo(steps)).toEqual(['child1|10->3', 'branch1|3->1', 'branch2|1->3', 'child2|3->6']);
  });

  it('两个独立的树（无共同祖先）', () => {
    // 树结构:
    //   tree1      tree2
    //     |          |
    //  child1     child2
    const branches = [
      createMockBranch({ id: 'tree1' }), // 0
      createMockBranch({ id: 'tree2' }), // 1
      createMockBranch({ id: 'child1', parentId: 'tree1', fromChangeId: 1 }), // 2
      createMockBranch({ id: 'child2', parentId: 'tree2', fromChangeId: 5 }) // 3
    ];
    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[2],
      currentChangeId: 3,
      nextBranch: branches[3],
      nextChangeId: 9
    });

    expect(getBranchInfo(steps)).toEqual(['child1|3->1', 'tree1|1->0', 'tree2|0->5', 'child2|5->9']);
  });

  it('子分支回退到父分支', () => {
    // 树结构: root -> child
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'child', parentId: 'root', fromChangeId: 2 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[1],
      currentChangeId: 5,
      nextBranch: branches[0],
      nextChangeId: 3
    });
    expect(getBranchInfo(steps)).toEqual(['child|5->2', 'root|2->3']);
  });

  it('同一分支前进（changeId 增加）', () => {
    const branches = [createMockBranch({ id: 'main' })];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[0],
      currentChangeId: 1,
      nextBranch: branches[0],
      nextChangeId: 5
    });
    expect(getBranchInfo(steps)).toEqual(['main|1->5']);
  });

  it('同一分支后退（changeId 减少）', () => {
    const branches = [createMockBranch({ id: 'main' })];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[0],
      currentChangeId: 5,
      nextBranch: branches[0],
      nextChangeId: 2
    });
    expect(getBranchInfo(steps)).toEqual(['main|5->2']);
  });

  it('同一分支同一 changeId（无操作）', () => {
    const branches = [createMockBranch({ id: 'main' })];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[0],
      currentChangeId: 3,
      nextBranch: branches[0],
      nextChangeId: 3
    });
    expect(getBranchInfo(steps)).toEqual([]);
  });

  it('孙子分支回退到祖父分支', () => {
    // 树结构: root -> child -> grandchild
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'child', parentId: 'root', fromChangeId: 2 }),
      createMockBranch({ id: 'grandchild', parentId: 'child', fromChangeId: 5 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[2],
      currentChangeId: 8,
      nextBranch: branches[0],
      nextChangeId: 1
    });
    expect(getBranchInfo(steps)).toEqual(['grandchild|8->5', 'child|5->2', 'root|2->1']);
  });

  it('祖父分支前进到孙子分支', () => {
    // 树结构: root -> child -> grandchild
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'child', parentId: 'root', fromChangeId: 2 }),
      createMockBranch({ id: 'grandchild', parentId: 'child', fromChangeId: 5 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[0],
      currentChangeId: 1,
      nextBranch: branches[2],
      nextChangeId: 8
    });
    expect(getBranchInfo(steps)).toEqual(['root|1->2', 'child|2->5', 'grandchild|5->8']);
  });

  it('两个根分支切换（都有变更）', () => {
    // 树结构:
    //   root1      root2
    const branches = [createMockBranch({ id: 'root1' }), createMockBranch({ id: 'root2' })];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[0],
      currentChangeId: 3,
      nextBranch: branches[1],
      nextChangeId: 5
    });
    expect(getBranchInfo(steps)).toEqual(['root1|3->0', 'root2|0->5']);
  });

  it('跨越多代的堂兄弟切换', () => {
    // 树结构:
    //              root
    //            /      \
    //        branch1   branch2
    //          /           \
    //      child1        child2
    //        |
    //    grandchild1
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'branch1', parentId: 'root', fromChangeId: 1 }),
      createMockBranch({ id: 'branch2', parentId: 'root', fromChangeId: 1 }),
      createMockBranch({ id: 'child1', parentId: 'branch1', fromChangeId: 3 }),
      createMockBranch({ id: 'child2', parentId: 'branch2', fromChangeId: 4 }),
      createMockBranch({ id: 'grandchild1', parentId: 'child1', fromChangeId: 7 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[5],
      currentChangeId: 10,
      nextBranch: branches[4],
      nextChangeId: 6
    });

    expect(getBranchInfo(steps)).toEqual([
      'grandchild1|10->7',
      'child1|7->3',
      'branch1|3->1',
      'branch2|1->4',
      'child2|4->6'
    ]);
  });

  it('从子分支回退到父分支的起点', () => {
    // 树结构: root -> child
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'child', parentId: 'root', fromChangeId: 5 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[1],
      currentChangeId: 8,
      nextBranch: branches[0],
      nextChangeId: 5
    });
    expect(getBranchInfo(steps)).toEqual(['child|8->5']);
  });

  it('叔侄关系：从叔叔切换到侄子', () => {
    // 树结构:
    //       root
    //      /    \
    //  child1  child2
    //            |
    //        grandchild2
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'child1', parentId: 'root', fromChangeId: 2 }),
      createMockBranch({ id: 'child2', parentId: 'root', fromChangeId: 2 }),
      createMockBranch({ id: 'grandchild2', parentId: 'child2', fromChangeId: 5 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[1],
      currentChangeId: 4,
      nextBranch: branches[3],
      nextChangeId: 8
    });
    expect(getBranchInfo(steps)).toEqual(['child1|4->2', 'child2|2->5', 'grandchild2|5->8']);
  });

  it('叔侄关系：从侄子切换到叔叔', () => {
    // 树结构:
    //       root
    //      /    \
    //  child1  child2
    //            |
    //        grandchild2
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'child1', parentId: 'root', fromChangeId: 2 }),
      createMockBranch({ id: 'child2', parentId: 'root', fromChangeId: 2 }),
      createMockBranch({ id: 'grandchild2', parentId: 'child2', fromChangeId: 5 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[3],
      currentChangeId: 8,
      nextBranch: branches[1],
      nextChangeId: 4
    });
    expect(getBranchInfo(steps)).toEqual(['grandchild2|8->5', 'child2|5->2', 'child1|2->4']);
  });

  it('三个兄弟分支：从第一个切换到第三个', () => {
    // 树结构:
    //           root
    //        /   |   \
    //   child1 child2 child3
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'child1', parentId: 'root', fromChangeId: 2 }),
      createMockBranch({ id: 'child2', parentId: 'root', fromChangeId: 3 }),
      createMockBranch({ id: 'child3', parentId: 'root', fromChangeId: 4 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[1],
      currentChangeId: 5,
      nextBranch: branches[3],
      nextChangeId: 7
    });
    expect(getBranchInfo(steps)).toEqual(['child1|5->2', 'root|2->4', 'child3|4->7']);
  });

  it('父分支回退再进入子分支', () => {
    // 树结构: root -> child
    // 场景：root(changeId=5) → child(fromChangeId=2, targetChangeId=4)
    // 需要先在 root 回退到 2，再进入 child
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'child', parentId: 'root', fromChangeId: 2 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[0],
      currentChangeId: 5,
      nextBranch: branches[1],
      nextChangeId: 4
    });
    expect(getBranchInfo(steps)).toEqual(['root|5->2', 'child|2->4']);
  });

  it('从子分支回退到父分支的更早状态', () => {
    // 树结构: root -> child
    // 场景：child(changeId=5, fromChangeId=3) → root(changeId=1)
    // 子分支创建于 root 的 changeId=3，现在要回到 root 的 changeId=1
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'child', parentId: 'root', fromChangeId: 3 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[1],
      currentChangeId: 5,
      nextBranch: branches[0],
      nextChangeId: 1
    });
    expect(getBranchInfo(steps)).toEqual(['child|5->3', 'root|3->1']);
  });

  it('空父分支到子分支（fromChangeId=0）', () => {
    // 树结构: root -> child
    // 场景：root(changeId=null) → child(fromChangeId=0, changeId=3)
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'child', parentId: 'root', fromChangeId: 0 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[0],
      currentChangeId: null,
      nextBranch: branches[1],
      nextChangeId: 3
    });
    expect(getBranchInfo(steps)).toEqual(['child|0->3']);
  });

  it('子分支回退到空父分支', () => {
    // 树结构: root -> child
    // 场景：child(changeId=3, fromChangeId=0) → root(changeId=null)
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'child', parentId: 'root', fromChangeId: 0 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[1],
      currentChangeId: 3,
      nextBranch: branches[0],
      nextChangeId: null
    });
    expect(getBranchInfo(steps)).toEqual(['child|3->0']);
  });

  it('复杂场景：多个分支层级，不同的fromChangeId', () => {
    // 树结构:
    //              root
    //            /      \
    //        branch1   branch2 (fromChangeId=3)
    //     (fromChangeId=1)  \
    //          |          child2 (fromChangeId=5)
    //       child1
    //    (fromChangeId=2)
    const branches = [
      createMockBranch({ id: 'root' }),
      createMockBranch({ id: 'branch1', parentId: 'root', fromChangeId: 1 }),
      createMockBranch({ id: 'branch2', parentId: 'root', fromChangeId: 3 }),
      createMockBranch({ id: 'child1', parentId: 'branch1', fromChangeId: 2 }),
      createMockBranch({ id: 'child2', parentId: 'branch2', fromChangeId: 5 })
    ];

    const steps = find_switch_branch_step({
      branches,
      currentBranch: branches[3],
      currentChangeId: 4,
      nextBranch: branches[4],
      nextChangeId: 7
    });

    expect(getBranchInfo(steps)).toEqual(['child1|4->2', 'branch1|2->1', 'root|1->3', 'branch2|3->5', 'child2|5->7']);
  });

  describe('边界拓扑', () => {
    it('null changeId 使用分支起点，同时保留显式的 0', () => {
      const branch = createMockBranch({ id: 'main', fromChangeId: 7 });

      const steps = find_switch_branch_step({
        branches: [branch],
        currentBranch: branch,
        currentChangeId: null,
        nextBranch: branch,
        nextChangeId: 0
      });

      expect(getBranchInfo(steps)).toEqual(['main|7->0']);
    });

    it('祖先进入后代时跳过没有数据变化的中间分支', () => {
      const root = createMockBranch({ id: 'root' });
      const child = createMockBranch({ id: 'child', parentId: root.id, fromChangeId: 2 });
      const grandchild = createMockBranch({ id: 'grandchild', parentId: child.id, fromChangeId: 2 });

      const steps = find_switch_branch_step({
        branches: [root, child, grandchild],
        currentBranch: root,
        currentChangeId: 2,
        nextBranch: grandchild,
        nextChangeId: 5
      });

      expect(getBranchInfo(steps)).toEqual(['grandchild|2->5']);
    });

    it('共同祖先切换时跳过已位于分叉点的当前分支', () => {
      const root = createMockBranch({ id: 'root' });
      const current = createMockBranch({ id: 'current', parentId: root.id, fromChangeId: 2 });
      const next = createMockBranch({ id: 'next', parentId: root.id, fromChangeId: 3 });

      const steps = find_switch_branch_step({
        branches: [root, current, next],
        currentBranch: current,
        currentChangeId: 2,
        nextBranch: next,
        nextChangeId: 5
      });

      expect(getBranchInfo(steps)).toEqual(['root|2->3', 'next|3->5']);
    });

    /**
     * RXD-058：断链与成环是持久化完整性错误，不是「安全终止」。
     *
     * `switch_branch_actions` 传进来的 `branches` 是**全量无过滤**查询的结果，所以
     * `parentId` 指不到任何分支，只可能是数据坏了。原实现把它当成「已经到根」继续往下算，
     * 于是生成一条通往并不存在的根的完整 action 序列 —— 调用方照单全收地写库，
     * 半条路径被应用，损坏无声扩散。成环同理。
     *
     * 正确行为是终止且不产生任何 action：切分支失败远好过静默切错。
     */
    it('父节点缺失时终止并抛错，不产生任何 action', () => {
      const orphan = createMockBranch({ id: 'orphan', parentId: 'missing', fromChangeId: 0 });
      const target = createMockBranch({ id: 'target' });

      expect(() =>
        find_switch_branch_step({
          branches: [orphan, target],
          currentBranch: orphan,
          currentChangeId: 4,
          nextBranch: target,
          nextChangeId: 3
        })
      ).toThrow(/orphan.*missing/);
    });

    it('自引用父节点终止并抛错', () => {
      const self = createMockBranch({ id: 'self', parentId: 'self', fromChangeId: 0 });
      const target = createMockBranch({ id: 'target' });

      expect(() =>
        find_switch_branch_step({
          branches: [self, target],
          currentBranch: self,
          currentChangeId: 4,
          nextBranch: target,
          nextChangeId: 3
        })
      ).toThrow(/cycle/i);
    });

    it('父链成环时终止并抛错', () => {
      const first = createMockBranch({ id: 'first', parentId: 'second', fromChangeId: 2 });
      const second = createMockBranch({ id: 'second', parentId: 'first', fromChangeId: 0 });
      const target = createMockBranch({ id: 'target' });

      expect(() =>
        find_switch_branch_step({
          branches: [first, second, target],
          currentBranch: first,
          currentChangeId: 6,
          nextBranch: target,
          nextChangeId: 5
        })
      ).toThrow(/cycle/i);
    });

    it('无共同祖先时完整进入多层目标树', () => {
      const currentRoot = createMockBranch({ id: 'current-root' });
      const nextRoot = createMockBranch({ id: 'next-root' });
      const nextChild = createMockBranch({ id: 'next-child', parentId: nextRoot.id, fromChangeId: 2 });
      const nextLeaf = createMockBranch({ id: 'next-leaf', parentId: nextChild.id, fromChangeId: 5 });

      const steps = find_switch_branch_step({
        branches: [currentRoot, nextRoot, nextChild, nextLeaf],
        currentBranch: currentRoot,
        currentChangeId: 1,
        nextBranch: nextLeaf,
        nextChangeId: 7
      });

      expect(getBranchInfo(steps)).toEqual([
        'current-root|1->0',
        'next-root|0->2',
        'next-child|2->5',
        'next-leaf|5->7'
      ]);
    });
  });
});
