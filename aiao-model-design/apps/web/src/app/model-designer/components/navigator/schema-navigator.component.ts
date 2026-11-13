import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Folder, LucideAngularModule, Pencil, Plus, Table2, Trash2 } from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { DesignEntity, ModelDesign } from '../../models/index.js';
import { ModelSwitcherComponent } from '../model-switcher/model-switcher.component';

/**
 * Schema 导航器组件
 *
 * 左侧导航：顶部为模型切换器，下方按命名空间分组展示实体。
 * 支持快速选择实体、拖动实体到其他命名空间、hover 快捷操作
 * （按命名空间新建、重命名、删除）。
 */
@Component({
  selector: 'lib-schema-navigator',
  imports: [LucideAngularModule, ModelSwitcherComponent],
  templateUrl: './schema-navigator.component.html',
  styleUrl: './schema-navigator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SchemaNavigatorComponent {
  protected readonly Folder = Folder;
  protected readonly Pencil = Pencil;
  protected readonly Plus = Plus;
  protected readonly Table2 = Table2;
  protected readonly Trash2 = Trash2;

  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  readonly entities = input.required<DesignEntity[]>();
  readonly selectedEntityIds = input<ReadonlySet<string>>(new Set());
  /** 全部模型设计（顶部切换器用） */
  readonly models = input<ModelDesign[]>([]);
  /** 当前激活的模型设计 ID（顶部切换器用） */
  readonly activeModelId = input<string | null>(null);

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
  readonly modelSelected = output<string>();
  readonly modelCreated = output<string>();
  readonly modelRenamed = output<string>();
  /** 在指定命名空间下新建实体 */
  readonly entityCreatedInNamespace = output<string>();
  readonly entityRenamed = output<{ id: string; name: string }>();
  readonly entityDeleted = output<string>();
  /** 把实体拖到指定命名空间 */
  readonly entityMoved = output<{ id: string; namespace: string }>();

  /** 正在重命名的实体 ID（null = 非编辑态） */
  readonly editingEntityId = signal<string | null>(null);
  /** 实体重命名输入框的当前值 */
  readonly editValue = signal('');
  /** 正在拖拽的实体 ID */
  readonly draggedEntityId = signal<string | null>(null);
  /** 拖拽悬停的命名空间 */
  readonly dragOverNamespace = signal<string | null>(null);

  onEntityClick(entityId: string) {
    this.entitySelected.emit(entityId);
  }

  asInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** hover 重命名图标 → 进入内联编辑态 */
  startEntityRename(event: Event, entity: DesignEntity) {
    event.stopPropagation();
    this.editValue.set(entity.name);
    this.editingEntityId.set(entity.id);
  }

  /** 提交重命名：空值忽略，退出编辑态 */
  commitEntityRename() {
    const id = this.editingEntityId();
    if (!id) return;
    const name = this.editValue().trim();
    if (name) this.entityRenamed.emit({ id, name });
    this.editingEntityId.set(null);
  }

  cancelEntityRename() {
    this.editingEntityId.set(null);
  }

  /** hover 删除图标 → 删除实体（确认与关系清理由宿主处理） */
  onDeleteEntity(event: Event, id: string) {
    event.stopPropagation();
    this.entityDeleted.emit(id);
  }

  /** 命名空间 hover 的 + → 在该命名空间下新建实体 */
  onAddEntityToNamespace(event: Event, namespace: string) {
    event.preventDefault();
    event.stopPropagation();
    this.entityCreatedInNamespace.emit(namespace);
  }

  onDragStart(event: DragEvent, id: string) {
    event.dataTransfer?.setData('text/plain', id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.draggedEntityId.set(id);
  }

  onDragEnd() {
    this.draggedEntityId.set(null);
    this.dragOverNamespace.set(null);
  }

  onFolderDragOver(event: DragEvent, namespace: string) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverNamespace.set(namespace);
  }

  /** 移出目标文件夹（含内部子元素时忽略，避免高亮闪烁） */
  onFolderDragLeave(event: DragEvent) {
    const target = event.currentTarget as HTMLElement;
    if (!target.contains(event.relatedTarget as Node | null)) {
      this.dragOverNamespace.set(null);
    }
  }

  onFolderDrop(event: DragEvent, namespace: string) {
    event.preventDefault();
    const id = this.draggedEntityId();
    this.draggedEntityId.set(null);
    this.dragOverNamespace.set(null);
    if (id) this.entityMoved.emit({ id, namespace });
  }
}
