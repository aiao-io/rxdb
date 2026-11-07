import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Check, LucideAngularModule, Pencil, Plus, Trash2, X } from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { ChatChange, ChatChangeProposal } from '../../types/ai-schemas';

type ChangeKind = 'added' | 'modified' | 'removed';

interface GroupedEntity {
  entityName: string;
  kind: ChangeKind;
  changes: ChatChange[];
}

/**
 * AI 变更 Diff 预览组件
 *
 * 将 ChatChangeProposal 按实体分组展示，新增/修改/删除分别着色。
 * 底部提供确认应用和取消按钮。
 */
@Component({
  selector: 'lib-ai-diff-preview',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (proposal()) {
      <div class="text-base-content/70 p-3 text-sm">{{ proposal()!.description }}</div>

      @if (groups().length === 0) {
        <div class="text-base-content/50 p-4 text-center">{{ t().ai.noChanges }}</div>
      }

      <div class="flex flex-col gap-2 overflow-y-auto px-3 pb-3">
        @for (group of groups(); track group.entityName) {
          <div class="rounded-lg border p-3" [class]="borderClass(group.kind)">
            <div class="mb-2 flex items-center gap-2">
              <lucide-icon [class]="textClass(group.kind)" [img]="kindIcon(group.kind)" size="14" />
              <span class="text-xs font-bold uppercase" [class]="textClass(group.kind)">{{
                kindLabel(group.kind)
              }}</span>
              <span class="font-mono text-sm">{{ group.entityName }}</span>
            </div>

            @for (change of group.changes; track $index) {
              <div class="border-base-300 text-base-content/70 ml-4 border-l-2 py-1 pl-3 text-xs">
                <span class="font-medium">{{ change.action }}</span>
                @if (detailSummary(change); as summary) {
                  <span class="ml-1">{{ summary }}</span>
                }
              </div>
            }
          </div>
        }
      </div>

      <div class="border-base-300 flex justify-end gap-2 border-t p-3">
        <button class="btn btn-ghost btn-sm" (click)="cancelPreview.emit()">
          <lucide-icon [img]="XIcon" size="14" />
          {{ t().ai.cancelChanges }}
        </button>
        <button class="btn btn-primary btn-sm" (click)="confirm.emit()">
          <lucide-icon [img]="CheckIcon" size="14" />
          {{ t().ai.applyChanges }}
        </button>
      </div>
    }
  `
})
export class AiDiffPreviewComponent {
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  protected readonly Plus = Plus;
  protected readonly PencilIcon = Pencil;
  protected readonly Trash2Icon = Trash2;
  protected readonly CheckIcon = Check;
  protected readonly XIcon = X;

  readonly proposal = input<ChatChangeProposal>();
  readonly confirm = output<void>();
  readonly cancelPreview = output<void>();

  readonly groups = computed<GroupedEntity[]>(() => {
    const p = this.proposal();
    if (!p) return [];

    const map = new Map<string, GroupedEntity>();

    for (const change of p.changes) {
      const existing = map.get(change.entityName);
      if (existing) {
        existing.changes.push(change);
        existing.kind = this.#mergeKind(existing.kind, this.#changeKind(change));
      } else {
        map.set(change.entityName, {
          entityName: change.entityName,
          kind: this.#changeKind(change),
          changes: [change]
        });
      }
    }

    return [...map.values()];
  });

  protected borderClass(kind: ChangeKind): string {
    const map: Record<ChangeKind, string> = {
      added: 'border-success/40',
      modified: 'border-warning/40',
      removed: 'border-error/40'
    };
    return map[kind];
  }

  protected textClass(kind: ChangeKind): string {
    const map: Record<ChangeKind, string> = {
      added: 'text-success',
      modified: 'text-warning',
      removed: 'text-error'
    };
    return map[kind];
  }

  protected kindIcon(kind: ChangeKind) {
    const map = { added: Plus, modified: Pencil, removed: Trash2 };
    return map[kind];
  }

  protected kindLabel(kind: ChangeKind): string {
    return this.t().ai[kind];
  }

  protected detailSummary(change: ChatChange): string {
    const d = change.details;
    if (d['name']) return String(d['name']);
    if (d['propertyNames']) return (d['propertyNames'] as string[]).join(', ');
    if (d['targetEntity']) return `→ ${d['targetEntity']}`;
    return '';
  }

  #changeKind(change: ChatChange): ChangeKind {
    if (change.action.startsWith('add')) return 'added';
    if (change.action.startsWith('remove')) return 'removed';
    return 'modified';
  }

  #mergeKind(a: ChangeKind, b: ChangeKind): ChangeKind {
    if (a === b) return a;
    return 'modified';
  }
}
