import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Check, CheckCircle2, Database, Info, Layers, Link, LucideAngularModule, Type, X, type LucideIconData } from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { ValidationSuggestion } from '../../types/ai-schemas';

/** 建议条目的 UI 状态 */
export type SuggestionStatus = 'pending' | 'adopted' | 'ignored';

/** 带状态的建议条目 */
export interface SuggestionItem extends ValidationSuggestion {
  status: SuggestionStatus;
}

/**
 * AI 验证报告组件
 *
 * 展示验证摘要和建议列表，支持逐条采纳或忽略。
 */
@Component({
  selector: 'lib-ai-validation-report',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (summary()) {
      <div class="text-base-content/80 p-4 text-sm">{{ summary() }}</div>
    }

    <div class="flex flex-col gap-2 overflow-y-auto p-4">
      @for (item of items(); track $index) {
        <div class="border-base-300 rounded-lg border p-3" [class]="severityBorder(item)">
          <div class="mb-1 flex items-center gap-2">
            <lucide-icon [class]="severityColor(item)" [img]="dimensionIcon(item.dimension)" size="14" />
            <span class="text-xs font-medium uppercase" [class]="severityColor(item)">{{ item.dimension }}</span>
            <span class="text-base-content/50 text-xs"
              >{{ item.entityName }}{{ item.propertyName ? '.' + item.propertyName : '' }}</span
            >
          </div>
          <p class="mb-2 text-sm">{{ item.message }}</p>
          <div class="flex gap-2">
            @if (item.status === 'pending' && item.suggestedFix) {
              <button class="btn btn-primary btn-xs" (click)="onAdopt($index)">
                <lucide-icon [img]="Check" size="12" />
                {{ t().ai.adopt }}
              </button>
              <button class="btn btn-ghost btn-xs" (click)="onIgnore($index)">
                <lucide-icon [img]="XIcon" size="12" />
                {{ t().ai.ignore }}
              </button>
            }
            @if (item.status === 'adopted') {
              <span class="badge badge-success badge-sm">{{ t().ai.adopted }}</span>
            }
            @if (item.status === 'ignored') {
              <span class="badge badge-ghost badge-sm">{{ t().ai.ignored }}</span>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [':host { display: flex; flex-direction: column; height: 100%; }']
})
export class AiValidationReportComponent {
  readonly #statusMap = signal(new Map<ValidationSuggestion, SuggestionStatus>());

  protected readonly Check = Check;
  protected readonly XIcon = X;
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);

  /** 带状态的建议列表 */
  protected readonly items = computed<SuggestionItem[]>(() =>
    this.suggestions().map(s => ({
      ...s,
      status: this.#statusMap().get(s) ?? 'pending'
    }))
  );

  /** 验证摘要 */
  readonly summary = input('');

  /** 建议列表 */
  readonly suggestions = input<ValidationSuggestion[]>([]);

  /** 采纳建议 */
  readonly adoptSuggestion = output<ValidationSuggestion>();

  /** 忽略建议 */
  readonly ignoreSuggestion = output<ValidationSuggestion>();

  protected onAdopt(index: number) {
    const suggestion = this.suggestions()[index];
    if (!suggestion) return;
    this.#statusMap.update(m => new Map(m).set(suggestion, 'adopted'));
    this.adoptSuggestion.emit(suggestion);
  }

  protected onIgnore(index: number) {
    const suggestion = this.suggestions()[index];
    if (!suggestion) return;
    this.#statusMap.update(m => new Map(m).set(suggestion, 'ignored'));
    this.ignoreSuggestion.emit(suggestion);
  }

  protected dimensionIcon(dimension: string) {
    const icons: Record<string, LucideIconData> = {
      naming: Type,
      relationship: Link,
      index: Database,
      normalization: Layers,
      completeness: CheckCircle2
    };
    return icons[dimension] ?? Info;
  }

  protected severityColor(item: { severity: string }): string {
    const colors: Record<string, string> = {
      error: 'text-error',
      warning: 'text-warning',
      info: 'text-info'
    };
    return colors[item.severity] ?? 'text-base-content';
  }

  protected severityBorder(item: { severity: string }): string {
    const borders: Record<string, string> = {
      error: 'border-error/30',
      warning: 'border-warning/30',
      info: 'border-info/30'
    };
    return borders[item.severity] ?? '';
  }
}
