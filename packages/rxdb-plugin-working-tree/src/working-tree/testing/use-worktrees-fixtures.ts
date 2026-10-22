/**
 * @fileoverview 三端 `useWorktrees()` 单测共用的桩（US-314 C1）：检出位命令的十个方法，与本实例挂着的那套表的流。
 *
 * @remarks
 * 与 `use-working-tree-fixtures.ts` 同一个理由放在核心包：桩的形状只放一处，核心加减一个命令时三端一起红，
 * 不会有一端的桩少一个方法、而那一端的用例照样绿。
 */

import { WorktreeTableSet, type RxDB } from '@aiao/rxdb';
import { BehaviorSubject } from 'rxjs';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import type { WorktreeAddOptions, WorktreeOpenOptions, WorktreeView } from '../../checkout/worktree-manager.js';
import type { WorktreeTarget } from '../../checkout/worktree-target.js';
import type { Worktree } from '../../checkout/worktree.entity.js';

/** `RxDB.workingTree.checkouts` 这一层的桩：只读检出位的四个方法与可写检出位的六个。 */
export interface WorktreeManagerStub {
  /** 登记着的检出位；预置成一行都没有 */
  readonly list: Mock<() => Promise<readonly Worktree[]>>;
  /** 打开一个只读检出位 */
  readonly open: Mock<(target: WorktreeTarget, options?: WorktreeOpenOptions) => Promise<WorktreeView>>;
  /** 再打开一个持久归属的检出位 */
  readonly attach: Mock<(id: string) => Promise<WorktreeView>>;
  /** 回收没人在用的检出位 */
  readonly prune: Mock<() => Promise<readonly string[]>>;
  /** 开一个可写检出位 */
  readonly add: Mock<(branchId: string, options?: WorktreeAddOptions) => Promise<Worktree>>;
  /** 挂上一个可写检出位 */
  readonly mount: Mock<(id: string) => Promise<void>>;
  /** 挂回主检出位 */
  readonly mountMain: Mock<() => Promise<void>>;
  /** 交出认领 */
  readonly release: Mock<(id: string) => Promise<void>>;
  /** 删掉一个可写检出位 */
  readonly remove: Mock<(id: string) => Promise<void>>;
  /** 改名 */
  readonly rename: Mock<(id: string, name: string) => Promise<Worktree>>;
}

/** 一套 `useWorktrees` 入口所需的桩，外加把它们装好的 `RxDB`。 */
export interface WorktreeHookStubs {
  /** `RxDB.workingTree.checkouts` 这一层的桩 */
  readonly checkouts: WorktreeManagerStub;
  /** `RxDB.worktreeTableSet$` 的源：推一个新值就是一次换挂；`observed` 看入口退没退订 */
  readonly tableSet$: BehaviorSubject<WorktreeTableSet>;
  /** 装好桩、可以直接喂给各端 provider 的库 */
  readonly rxdb: RxDB;
}

/**
 * 建一套桩并装成一个可以喂给 provider 的 `RxDB`。
 *
 * @returns 检出位命令的桩、挂载流的源，以及装着它们的 {@link WorktreeHookStubs.rxdb}
 *
 * @remarks
 * 挂载流初值是主表集，与刚连上的实例一样。`as unknown as` 是故意的：桩只桩到入口用得到的那几样，
 * 不实现 `RxDB` 的其余部分。
 */
export const createWorktreeHookStubs = (): WorktreeHookStubs => {
  const checkouts: WorktreeManagerStub = {
    list: vi.fn<() => Promise<readonly Worktree[]>>(),
    open: vi.fn<(target: WorktreeTarget, options?: WorktreeOpenOptions) => Promise<WorktreeView>>(),
    attach: vi.fn<(id: string) => Promise<WorktreeView>>(),
    prune: vi.fn<() => Promise<readonly string[]>>(),
    add: vi.fn<(branchId: string, options?: WorktreeAddOptions) => Promise<Worktree>>(),
    mount: vi.fn<(id: string) => Promise<void>>(),
    mountMain: vi.fn<() => Promise<void>>(),
    release: vi.fn<(id: string) => Promise<void>>(),
    remove: vi.fn<(id: string) => Promise<void>>(),
    rename: vi.fn<(id: string, name: string) => Promise<Worktree>>()
  };
  checkouts.list.mockResolvedValue([]);
  const tableSet$ = new BehaviorSubject<WorktreeTableSet>(WorktreeTableSet.MAIN);
  const rxdb = { workingTree: { checkouts }, worktreeTableSet$: tableSet$.asObservable() } as unknown as RxDB;
  return { checkouts, tableSet$, rxdb };
};
