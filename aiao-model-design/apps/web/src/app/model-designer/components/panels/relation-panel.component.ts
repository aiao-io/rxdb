/**
 * 关系面板组件
 *
 * 显示实体所有关系的列表，包括继承关系和自定义关系。
 * 支持关系的添加、编辑、删除和排序操作。
 */
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ChevronRight, LucideAngularModule } from 'lucide-angular';
import { type InheritedPropertyDef } from '../../constants';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { DesignRelationChanges } from '../../interfaces';
import type { DesignRelation } from '../../models/index.js';
import { sortOrderBetween } from '../../services/entity-utils';
import { snapshotEntity } from '../shared/entity-edit-utils';
import { RelationItemComponent } from './relation-item.component';

@Component({
  selector: 'lib-relation-panel',
  imports: [RelationItemComponent, CdkDropList, CdkDrag, LucideAngularModule],
  templateUrl: './relation-panel.component.html',
  styleUrl: './relation-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RelationPanelComponent {
  protected readonly ChevronRight = ChevronRight;
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  readonly inheritedRelations = input<readonly InheritedPropertyDef[]>([]);
  readonly invalidRelationIds = input<ReadonlySet<string>>(new Set());
  /** 关系校验错误：relationId → 错误 key 列表（透传给 lib-relation-item） */
  readonly relationErrors = input<ReadonlyMap<string, string[]>>(new Map());
  readonly relations = input<DesignRelation[]>([]);
  readonly allRelations = input<DesignRelation[]>([]);
  readonly entities = input<ReadonlyArray<{ id: string; name: string }>>([]);
  readonly currentEntityName = input<string>('');
  readonly expandedGroups = input<ReadonlySet<string>>(new Set());
  /** 当前展开的自定义关系项 */
  readonly expandedItemId = input<string | null>(null);
  /** 新增关系后待聚焦的 id（透传给 lib-relation-item） */
  readonly autoFocusId = input<string | null>(null);

  /** 继承关系按来源分组 */
  readonly inheritedRelationGroups = computed(() => {
    const map = new Map<string, InheritedPropertyDef[]>();
    for (const rel of this.inheritedRelations()) {
      const list = map.get(rel.source);
      if (list) list.push(rel);
      else map.set(rel.source, [rel]);
    }
    return [...map.entries()].map(([source, relations]) => ({ source, relations }));
  });

  /** 关系快照 — undo/redo 时保证新引用，驱动 lib-relation-item 的 linkedSignal 重置 */
  readonly relationSnapshots = computed(() => this.relations().map(snapshotEntity));

  readonly relationUpdated = output<{ id: string; changes: DesignRelationChanges }>();
  readonly relationDeleted = output<string>();
  readonly groupToggled = output<string>();
  readonly itemExpandToggled = output<string>();
  /** 展开/折叠全部继承分组（true = 展开全部） */
  readonly groupBulkToggled = output<boolean>();
  /** 子项名称输入框已聚焦（透传给父级清除 autoFocusId） */
  readonly focusHandled = output<void>();

  /** 关系拖动排序 */
  onRelationDrop(event: CdkDragDrop<DesignRelation[]>) {
    if (event.previousIndex === event.currentIndex) return;
    const rels = this.relationSnapshots();
    const moved = rels[event.previousIndex];
    if (!moved) return;
    const sorted = [...rels];
    sorted.splice(event.previousIndex, 1);
    const prev = sorted[event.currentIndex - 1]?.sortOrder ?? null;
    const next = sorted[event.currentIndex]?.sortOrder ?? null;
    this.relationUpdated.emit({ id: moved.id, changes: { sortOrder: sortOrderBetween(prev, next) } });
  }
}
