/**
 * 模型列表组件
 *
 * 显示模型设计列表，支持选择、创建和删除操作。
 */
import type { ModelDesign } from '../../models/index.js';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';

@Component({
  selector: 'lib-model-list',
  templateUrl: './model-list.component.html',
  styleUrl: './model-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelListComponent {
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  readonly designs = input<ModelDesign[]>([]);
  readonly activeId = input<string | null>(null);

  readonly selected = output<string>();
  readonly created = output<string>();
  readonly deleted = output<string>();
  readonly copied = output<string>();

  readonly newName = signal('');

  asInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  onCreate() {
    const name = this.newName().trim();
    if (name) {
      this.created.emit(name);
      this.newName.set('');
    }
  }

  onDelete(event: Event, id: string) {
    event.stopPropagation();
    this.deleted.emit(id);
  }

  onCopy(event: Event, id: string) {
    event.stopPropagation();
    this.copied.emit(id);
  }
}
