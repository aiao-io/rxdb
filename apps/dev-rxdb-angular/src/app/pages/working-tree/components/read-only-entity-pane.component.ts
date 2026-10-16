import { EntityListComponent } from '@aiao/rxdb-model-angular';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * 只读检出位查看器的右栏：快照实例上的实体列表（US-313）。
 *
 * @remarks
 * 由查看器经 `NgComponentOutlet` 建出，给它的注入器里 `RxDB` 指向视图的只读实例，列表 `inject(RxDB)` 拿到的就是它。
 */
@Component({
  selector: 'app-working-tree-read-only-entity-pane',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityListComponent],
  host: { class: 'block h-full' },
  template: `<rxdb-entity-list class="block h-full" [name]="name()" [namespace]="namespace()" />`
})
export class WorkingTreeReadOnlyEntityPaneComponent {
  readonly namespace = input.required<string>();
  readonly name = input.required<string>();
}
