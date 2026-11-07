/**
 * Schema 导航器组件
 *
 * 显示模型设计中的实体列表，按命名空间分组，支持快速选择实体。
 */
import type { DesignEntity, ModelDesign } from '../../models/index.js';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Database, Folder, LucideAngularModule, Plus, Table2 } from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';

@Component({
  selector: 'lib-schema-navigator',
  imports: [LucideAngularModule],
  templateUrl: './schema-navigator.component.html',
  styleUrl: './schema-navigator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SchemaNavigatorComponent {
  protected readonly Database = Database;
  protected readonly Folder = Folder;
  protected readonly Table2 = Table2;
  protected readonly Plus = Plus;

  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  readonly schema = input<ModelDesign | null>(null);
  readonly entities = input.required<DesignEntity[]>();
  readonly selectedEntityIds = input<ReadonlySet<string>>(new Set());

  readonly groupedEntities = computed(() => {
    const groups = new Map<string, DesignEntity[]>();
    for (const entity of this.entities()) {
      const ns = entity.entityNamespace || 'public';
      const group = groups.get(ns) ?? [];
      group.push(entity);
      groups.set(ns, group);
    }
    return Array.from(groups.entries())
      .map(([namespace, entities]) => ({
        namespace,
        entities
      }))
      .sort((a, b) => a.namespace.localeCompare(b.namespace));
  });

  readonly entitySelected = output<string>();
  readonly entityCreated = output<void>();

  onEntityClick(entityId: string) {
    this.entitySelected.emit(entityId);
  }
}
