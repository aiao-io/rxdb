import type {
  CommitOptions,
  CommitResult,
  WorkingTreeCommandState,
  WorkingTreeDiscardOptions,
  WorkingTreeQueryState,
  WorkingTreeRestoreOptions,
  WorkingTreeRestoreTarget,
  WorkingTreeStatus
} from '@aiao/rxdb-plugin-working-tree';
import { useWorkingTree, type WorkingTreeResource } from '@aiao/rxdb-plugin-working-tree-vue';
import { computed, defineComponent, watch, type ComputedRef } from 'vue';

export const Consumer = defineComponent({
  setup() {
    const tree: WorkingTreeResource = useWorkingTree();
    const { statusState, commitState, restoreState, switchBranchState } = tree;
    const status: ComputedRef<WorkingTreeQueryState<WorkingTreeStatus>> = statusState;
    const commit: ComputedRef<WorkingTreeCommandState<CommitResult>> = commitState;
    const phase = computed(() => status.value.phase);
    const stop = watch(status, state => {
      if (state.phase === 'error') console.error(state.error.message);
    });
    const submit = (message: string, options: CommitOptions): Promise<CommitResult> => tree.commit(message, options);
    const discard = (options: WorkingTreeDiscardOptions) => tree.discard(options);
    const restore = (target: WorkingTreeRestoreTarget, options: WorkingTreeRestoreOptions) =>
      tree.restore(target, options);
    const switchBranch = (branchId: string): Promise<void> => tree.switchBranch(branchId, { requireClean: true });
    return { status, commit, restoreState, switchBranchState, phase, submit, discard, restore, switchBranch, stop };
  },
  render() {
    return null;
  }
});
