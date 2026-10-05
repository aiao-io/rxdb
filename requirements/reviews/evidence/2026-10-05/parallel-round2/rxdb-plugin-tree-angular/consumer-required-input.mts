import { useFindDescendants } from '@aiao/rxdb-plugin-tree-angular';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { NumericTree } from './consumer-valid.mjs';

@Component({
  selector: 'review-required-tree',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span data-required-id>{{ rootId() }}</span>
    <span data-loading>{{ nodes.isLoading() }}</span>
    @if (nodes.error(); as error) {
      <p role="alert">{{ error.message }}</p>
    }
  `
})
export class RequiredInputTree {
  readonly rootId = input.required<number>();
  readonly nodes = useFindDescendants(NumericTree, () => ({ entityId: this.rootId(), level: 1 }));
}

@Component({
  selector: 'review-required-input-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RequiredInputTree],
  template: `<review-required-tree [rootId]="rootId()" />`
})
export class RequiredInputHost {
  readonly rootId = signal(0);
}
