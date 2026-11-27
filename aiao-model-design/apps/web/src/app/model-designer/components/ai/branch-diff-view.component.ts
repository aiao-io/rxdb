import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LucideAngularModule, Pencil, Plus, Trash2 } from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { BranchDiff, DiffItem } from '../../services/ai-branch.service';

interface EntityDiffGroup {
  name: string;
  items: (DiffItem & { diffKind: 'added' | 'modified' | 'deleted' })[];
}

/**
 * 分支对比视图组件
 *
 * 展示两个分支间的差异摘要，按实体分组。
 */
@Component({
  selector: 'lib-branch-diff-view',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (diff()) {
      <div class="flex w-full flex-col gap-2 overflow-y-auto">
        @for (group of groups(); track group.name) {
          <div class="border-base-300 border p-3">
            <div class="mb-2 font-mono text-sm font-bold">{{ group.name }}</div>
            @for (item of group.items; track $index) {
              <div class="flex items-center gap-2 py-1 text-xs">
                <lucide-icon [class]="kindColor(item.diffKind)" [img]="kindIcon(item.diffKind)" size="12" />
                <span [class]="kindColor(item.diffKind)">{{ t().ai[item.diffKind] }}</span>
                <span class="text-base-content/70">{{ item.type }}: {{ item.name }}</span>
              </div>
            }
          </div>
        }

        @if (groups().length === 0) {
          <div class="text-base-content/50 p-4 text-center text-sm">{{ t().ai.noChanges }}</div>
        }
      </div>
    }
  `
})
export class BranchDiffViewComponent {
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  protected readonly PlusIcon = Plus;
  protected readonly PencilIcon = Pencil;
  protected readonly Trash2Icon = Trash2;

  readonly diff = input<BranchDiff>();

  readonly groups = computed<EntityDiffGroup[]>(() => {
    const d = this.diff();
    if (!d) return [];

    const map = new Map<string, EntityDiffGroup>();

    const addItems = (items: DiffItem[], kind: 'added' | 'modified' | 'deleted') => {
      for (const item of items) {
        const groupName = item.type === 'entity' ? item.name : (item.entityId ?? 'unknown');
        const group = map.get(groupName) ?? { name: groupName, items: [] };
        group.items.push({ ...item, diffKind: kind });
        map.set(groupName, group);
      }
    };

    addItems(d.added, 'added');
    addItems(d.modified, 'modified');
    addItems(d.deleted, 'deleted');

    return [...map.values()];
  });

  protected kindIcon(kind: 'added' | 'modified' | 'deleted') {
    const map = { added: Plus, modified: Pencil, deleted: Trash2 };
    return map[kind];
  }

  protected kindColor(kind: 'added' | 'modified' | 'deleted'): string {
    const map = { added: 'text-success', modified: 'text-warning', deleted: 'text-error' };
    return map[kind];
  }
}
