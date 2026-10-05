import type {
  CommitLogOptions,
  CommitOptions,
  CommitResult,
  WorkingTreeDiffOptions,
  WorkingTreeDiscardOptions,
  WorkingTreeQueryState,
  WorkingTreeRestoreOptions,
  WorkingTreeRestoreTarget,
  WorkingTreeStatus,
  WorkingTreeSwitchBranchOptions
} from '@aiao/rxdb-plugin-working-tree';
import { useWorkingTree, type WorkingTreeResource } from '@aiao/rxdb-plugin-working-tree-angular';
import { ChangeDetectionStrategy, Component, type Signal } from '@angular/core';

export const createResource: () => WorkingTreeResource = useWorkingTree;

@Component({
  selector: 'review-working-tree-valid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let state = tree.statusState();
    @switch (state.phase) {
      @case ('idle') {
        <span>尚未读取</span>
      }
      @case ('loading') {
        <span>读取中</span>
      }
      @case ('empty') {
        <span>{{ state.value.entryCount }}</span>
      }
      @case ('success') {
        <span>{{ state.value.branchId }}</span>
      }
      @case ('error') {
        <span>{{ state.error.message }}</span>
      }
    }
    <button [disabled]="tree.statusState().phase === 'loading'" (click)="refresh()">刷新</button>
  `
})
export class WorkingTreeConsumer {
  readonly tree: WorkingTreeResource = useWorkingTree();
  readonly state: Signal<WorkingTreeQueryState<WorkingTreeStatus>> = this.tree.statusState;

  async refresh(): Promise<void> {
    await this.tree.status();
  }
}

export async function consumeCommands(
  tree: WorkingTreeResource,
  commitOptions: CommitOptions,
  discardOptions: WorkingTreeDiscardOptions,
  restoreTarget: WorkingTreeRestoreTarget,
  restoreOptions: WorkingTreeRestoreOptions,
  diffOptions: WorkingTreeDiffOptions,
  logOptions: CommitLogOptions,
  switchOptions: WorkingTreeSwitchBranchOptions
): Promise<CommitResult> {
  const enabled: boolean = await tree.isEnabled();
  await tree.enable();
  await tree.enableIfEmpty();
  const status: WorkingTreeStatus = await tree.status();
  const state = tree.statusState();
  if (state.phase === 'success' || state.phase === 'empty') {
    const entries: number = state.value.entryCount;
    void entries;
  }
  await tree.diff(diffOptions);
  await tree.listCommits(logOptions);
  await tree.commitChanges('commit-1');
  const result: CommitResult = await tree.commit('提交', commitOptions);
  if (!result.ok) {
    const branch: string = result.conflict.branchId;
    void branch;
  }
  await tree.discard(discardOptions);
  const restored = await tree.restore(restoreTarget, restoreOptions);
  if (!restored.ok) {
    const reason: string = restored.reason;
    void reason;
  }
  await tree.restoreSession();
  await tree.switchBranch('main', switchOptions);
  void enabled;
  void status;
  return result;
}
