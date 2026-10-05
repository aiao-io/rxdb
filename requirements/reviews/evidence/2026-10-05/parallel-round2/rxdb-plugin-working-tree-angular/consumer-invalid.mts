import { useWorkingTree, type WorkingTreeResource } from '@aiao/rxdb-plugin-working-tree-angular';

export function rejectInvalidConsumer(tree: WorkingTreeResource): void {
  tree.statusState.set({ phase: 'idle' });
  tree.statusState().value.entryCount;
  tree.commit(123, {});
  tree.commit('提交', {});
  tree.restore({ kind: 'unknown', commitId: 'commit-1' }, {});
  tree.discard({ expectedHeadRevision: 'bad' });
  tree.diff({ limit: 'bad' });
  tree.switchBranch(123);
  tree.switchBranch('main', { requireClean: 'yes' });
  const wrong: () => string = useWorkingTree;
  wrong();
}
