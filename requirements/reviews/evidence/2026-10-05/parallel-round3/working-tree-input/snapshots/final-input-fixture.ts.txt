import type { RxDB } from '@aiao/rxdb';
import type { WorkingTreeResource } from '@aiao/rxdb-plugin-working-tree-angular';
import { ChangeDetectionStrategy, Component, inject, InjectionToken, input, signal } from '@angular/core';

export const RXDB_ENTRY = new InjectionToken<() => RxDB>('R3 真实 useRxDB');
export const WORKING_TREE_ENTRY = new InjectionToken<() => WorkingTreeResource>('R3 真实 useWorkingTree');

@Component({
  selector: 'r3-required-working-tree-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span data-testid="branch">{{ branchId() }}</span>
    <span data-testid="phase">{{ tree.statusState().phase }}</span>
    <span data-testid="switch-phase">{{ tree.switchBranchState().phase }}</span>
    @let state = tree.statusState();
    @if (state.phase === 'empty' || state.phase === 'success') {
      <span data-testid="status-branch">{{ state.value.branchId }}</span>
    }
    <button (click)="selectBranch()" data-testid="switch">切分支</button>
  `
})
export class RequiredWorkingTreePanel {
  readonly branchId = input.required<string>();
  readonly database = inject(RXDB_ENTRY)();
  readonly tree = inject(WORKING_TREE_ENTRY)();
  lastSwitch?: Promise<void>;

  selectBranch(): Promise<void> {
    this.lastSwitch = this.tree.switchBranch(this.branchId());
    return this.lastSwitch;
  }
}

@Component({
  selector: 'r3-working-tree-parent',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RequiredWorkingTreePanel],
  template: `<r3-required-working-tree-panel [branchId]="branchId()" />`
})
export class WorkingTreeInputParent {
  readonly branchId = signal('main');
}
