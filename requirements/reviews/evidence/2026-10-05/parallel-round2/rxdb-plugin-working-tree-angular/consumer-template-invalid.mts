import { useWorkingTree, type WorkingTreeResource } from '@aiao/rxdb-plugin-working-tree-angular';
import { Component, input } from '@angular/core';

@Component({
  selector: 'review-working-tree-message',
  standalone: true,
  template: ''
})
export class WorkingTreeMessage {
  readonly message = input.required<string>();
}

@Component({
  selector: 'review-working-tree-invalid-template',
  standalone: true,
  imports: [WorkingTreeMessage],
  template: `
    <review-working-tree-message [message]="42" />
    <button (click)="tree.switchBranch(42)">切分支</button>
    <span>{{ tree.statusState().value.entryCount }}</span>
  `
})
export class WorkingTreeInvalidTemplate {
  readonly tree: WorkingTreeResource = useWorkingTree();
}
