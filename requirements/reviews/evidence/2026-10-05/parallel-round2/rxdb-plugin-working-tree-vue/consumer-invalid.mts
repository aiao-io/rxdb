import { useWorkingTree, type WorkingTreeResource } from '@aiao/rxdb-plugin-working-tree-vue';

export function rejectInvalidUsage(tree: WorkingTreeResource): void {
  useWorkingTree(() => undefined);
  tree.statusState.value = { phase: 'idle' };
  tree.commit('缺少必填凭据', {});
  tree.switchBranch('branch-b', { requireClean: 'true' });
  tree.restore({ commitId: 42 }, {});
}
