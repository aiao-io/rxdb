import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-angular';
import { Component } from '@angular/core';

@Component({
  selector: 'review-working-tree-readme',
  standalone: true,
  template: `
    @switch (tree.statusState().phase) {
      @case ('loading') {
        <span>读取中…</span>
      }
      @case ('empty') {
        <span>没有未提交的改动</span>
      }
      @case ('success') {
        <span>{{ tree.statusState().value.entryCount }} 条未提交</span>
      }
    }
    <button [disabled]="tree.commitState().phase === 'loading'" (click)="save()">提交</button>
  `
})
export class ReadmeCommitBar {
  readonly tree = useWorkingTree();

  async save(): Promise<void> {
    const status = await this.tree.status();
    const result = await this.tree.commit('保存', {
      expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
      expectedHeadRevision: status.headRevision,
      expectedWorkingTreeRevision: status.workingTreeRevision,
      authorId: 'alice',
      operationId: crypto.randomUUID()
    });
    if (!result.ok) console.warn('别人先提交了，重试即可', result.conflict);
  }
}
