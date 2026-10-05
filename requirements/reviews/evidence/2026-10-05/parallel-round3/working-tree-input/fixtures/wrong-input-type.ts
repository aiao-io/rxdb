import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RequiredWorkingTreePanel } from './input-fixture.js';

@Component({
  selector: 'r3-wrong-input-type',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RequiredWorkingTreePanel],
  template: `<r3-required-working-tree-panel [branchId]="42" />`
})
export class WrongInputTypeParent {}
