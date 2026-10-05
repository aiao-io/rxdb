import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RequiredWorkingTreePanel } from './input-fixture.js';

@Component({
  selector: 'r3-missing-required-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RequiredWorkingTreePanel],
  template: `<r3-required-working-tree-panel />`
})
export class MissingRequiredInputParent {}
