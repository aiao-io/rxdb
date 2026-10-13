/**
 * @fileoverview US-310 四个命令的单测场景：在 {@link createWorktreeScene} 之上加分支、worktree 行与一个假的 `versionManager`。
 *
 * @remarks
 * 底座仍是 `createCommitGraphProbe()`——不执行 SQL、不校验唯一约束、事务不串行。所以这里测的只是
 * **命令体的判定与两阶段次序**；唯一约束与并发仲裁在 capture conformance 套件里由 6 个真后端测。
 *
 * `versionManager` 是假的，理由是本包不能 `use(rxDBPluginHistory)` 进一个探针库（历史插件要真连接）。
 * 假的那个只做两件事：记下每次 `switchBranch()` 的实参与「被调时是否还在事务里」，以及把探针里的
 * `activated` 翻过去——后者让「切完之后 `listWorktrees()` 的 active 跟着走」在单测层就能看见。
 * 它**不**判 `requireClean` / `expectedActivationRevision`：那两项的语义归 `switchBranch()` 自己，
 * 本故事只承诺原样透传，单测断言的也只是透传。
 */

import { RxDBBranch } from '@aiao/rxdb';
import type { VersionManager } from '@aiao/rxdb-plugin-history';
import { vi, type Mock } from 'vitest';
import { CommitBranchRef } from '../../../commit/commit-branch-ref.entity.js';
import { CommitCapabilityState } from '../../../commit/commit-capability-state.entity.js';
import type { WorktreeSwitchBranchOptions } from '../../../working-tree/switch-branch-options.js';
import { WorkingTreeState } from '../../../working-tree/working-tree-state.entity.js';
import { Worktree } from '../../../worktree/worktree.entity.js';
import {
  createWorktreeScene,
  SCENE_BRANCH_ID,
  type WorktreeScene
} from '../../working-tree/fixtures/working-tree-scene.js';

/** 一次 `switchBranch()` 调用的现场。 */
export interface SwitchBranchCall {
  readonly branchId: string;
  readonly options: WorktreeSwitchBranchOptions | undefined;
  /** 被调那一刻还压着几层事务；两阶段契约要求恒为 0 */
  readonly transactionDepth: number;
}

/** 加了 worktree 能力的场景。 */
export interface WorktreeContextsScene extends WorktreeScene {
  /** 假 `versionManager.switchBranch`；实现可以被单个用例换掉（例如让它抛） */
  readonly switchBranch: Mock<(branchId: string, options?: WorktreeSwitchBranchOptions) => Promise<void>>;
  /** 按发生顺序记下的全部切换 */
  readonly switchCalls: SwitchBranchCall[];
  /** 再加一条非 active 的本地分支，连同它的 ref 与工作树状态行 */
  readonly addBranch: (branchId: string, options?: { readonly entryCount?: number }) => RxDBBranch;
  /** 只加分支行、不加 ref / 状态行：metadata-only 的远端分支 */
  readonly addMetadataOnlyBranch: (branchId: string) => RxDBBranch;
  /** 直接往探针里塞一行 worktree */
  readonly addWorktree: (seed: {
    readonly id: string;
    readonly branchId: string;
    readonly label?: string | null;
    readonly createdAt?: Date;
  }) => Worktree;
  /** 探针里当前的 worktree 行 */
  readonly worktreeRows: () => Worktree[];
  /** 当前 active 分支 id（读探针里的 `activated`） */
  readonly activeBranchId: () => string;
}

/**
 * 造一个 `main` 为 active、装了假 `versionManager` 的场景。
 *
 * @param options - `enabled: false` 造一个未启用能力的库（门禁用例），缺省已启用
 */
export function createWorktreeContextsScene(options: { readonly enabled?: boolean } = {}): WorktreeContextsScene {
  const scene = createWorktreeScene();
  const { database, probe, adapter } = scene;
  const { entityManager } = database;

  // 未启用：只翻能力位，其余种子原样留着——门禁拒掉之后「一行都没写、一次都没切」才看得出来。
  for (const capability of probe.rowsOf(CommitCapabilityState) as CommitCapabilityState[]) {
    capability.enabled = options.enabled ?? true;
  }

  // 事务深度计数：包在场景原有的事务替身外面。自愈补装（`installWorktreeCapture`）会把
  // `adapter.transaction` 换成转发回原件的包装，所以计数挂在原件上照样作数。
  let depth = 0;
  const original = adapter.transaction.getMockImplementation();
  adapter.transaction.mockImplementation(async (fun, transactionLog) => {
    depth += 1;
    try {
      return await original?.(fun, transactionLog);
    } finally {
      depth -= 1;
    }
  });

  const branchRows = (): RxDBBranch[] => probe.rowsOf(RxDBBranch) as RxDBBranch[];
  const activeBranchId = (): string => {
    const active = branchRows().filter(branch => branch.activated);
    if (active.length !== 1) throw new Error(`场景里 active 分支应恰好一条，实际 ${active.length} 条`);
    return active[0].id;
  };

  const switchCalls: SwitchBranchCall[] = [];
  const switchBranch = vi.fn(async (branchId: string, switchOptions?: WorktreeSwitchBranchOptions) => {
    switchCalls.push({ branchId, options: switchOptions, transactionDepth: depth });
    for (const branch of branchRows()) branch.activated = branch.id === branchId;
  });
  const versionManager = { switchBranch } as unknown as VersionManager;
  Object.defineProperty(database, 'versionManager', { value: versionManager, configurable: true });

  const addBranchRow = (branchId: string): RxDBBranch => {
    const branch = entityManager.instantiate(RxDBBranch);
    branch.id = branchId;
    branch.activated = false;
    branch.local = true;
    branch.remote = false;
    branch.parentId = SCENE_BRANCH_ID;
    branch.fromChangeId = null;
    probe.seed(RxDBBranch, [branch]);
    return branch;
  };

  const addBranch = (branchId: string, branchOptions: { readonly entryCount?: number } = {}): RxDBBranch => {
    const branch = addBranchRow(branchId);
    const ref = entityManager.instantiate(CommitBranchRef);
    ref.id = branchId;
    ref.branchId = branchId;
    ref.generation = probe.rowsOf(CommitBranchRef).length + 1;
    ref.headCommitId = null;
    ref.headRevision = 0;
    ref.status = 'ok';
    ref.corruptedAt = null;
    probe.seed(CommitBranchRef, [ref]);
    const state = entityManager.instantiate(WorkingTreeState);
    state.id = branchId;
    state.branchId = branchId;
    state.baseHeadCommitId = null;
    state.workingTreeRevision = 0;
    state.entryCount = branchOptions.entryCount ?? 0;
    state.updatedAt = new Date('2026-01-01T00:00:00.000Z');
    probe.seed(WorkingTreeState, [state]);
    return branch;
  };

  const addWorktree: WorktreeContextsScene['addWorktree'] = seed => {
    const row = entityManager.instantiate(Worktree);
    row.id = seed.id;
    row.branchId = seed.branchId;
    row.label = seed.label ?? null;
    row.createdAt = seed.createdAt ?? new Date('2026-01-01T00:00:00.000Z');
    probe.seed(Worktree, [row]);
    return row;
  };

  return {
    ...scene,
    switchBranch,
    switchCalls,
    addBranch,
    addMetadataOnlyBranch: addBranchRow,
    addWorktree,
    worktreeRows: () => probe.rowsOf(Worktree) as Worktree[],
    activeBranchId
  };
}
