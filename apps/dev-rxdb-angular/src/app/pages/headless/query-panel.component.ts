import type { RuleGroup } from '@aiao/rxdb';
import { useI18nRuntime } from '@aiao/rxdb-i18n-angular';
import { injectQueryBuilder } from '@aiao/rxdb-model-angular/headless';
import { ChangeDetectionStrategy, Component, computed, output } from '@angular/core';
import { I18nPipe } from '../../pipes/i18n.pipe';
import { queryFields } from './article-model';
import { QueryGroupComponent } from './query-group.component';

/** 筛选面板：自有的分组 / 规则行 / 控件，状态与动作来自 `injectQueryBuilder`。 */
@Component({
  selector: 'app-hl-query-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QueryGroupComponent, I18nPipe],
  template: `
    <section class="hl-section" aria-labelledby="hl-query-title" data-testid="headless-query">
      <h2 id="hl-query-title">{{ 'page.headless.queryTitle' | i18n }}</h2>
      <app-hl-query-group
        [controller]="builder.controller"
        [fields]="builder.snapshot().fields"
        [group]="builder.snapshot().state.rootGroup"
        [isRoot]="true"
      />
      @if (errors().length > 0) {
        <ul class="hl-error" data-testid="qb-errors" role="alert">
          @for (error of errors(); track $index) {
            <li>{{ error.message }}</li>
          }
        </ul>
      }
      <div class="hl-actions">
        <button
          [disabled]="!builder.snapshot().valid"
          (click)="apply.emit(builder.controller.toRxDBQuery())"
          type="button"
        >
          {{ 'page.headless.applyFilter' | i18n }}
        </button>
        <button (click)="clear()" type="button">{{ 'page.headless.clearFilter' | i18n }}</button>
      </div>
      <pre class="hl-output" [attr.aria-label]="'page.headless.queryOutput' | i18n" data-testid="qb-query">{{
        queryText()
      }}</pre>
    </section>
  `
})
export class QueryPanelComponent {
  /** 校验文案用应用的 i18n 运行时。 */
  protected readonly builder = injectQueryBuilder({ fields: queryFields, i18n: useI18nRuntime() });
  protected readonly errors = computed(() => this.builder.snapshot().validation.errors ?? []);
  protected readonly queryText = computed(() => JSON.stringify(this.builder.snapshot().query));

  readonly apply = output<RuleGroup>();

  protected clear(): void {
    this.builder.controller.clear();
    this.apply.emit(this.builder.controller.toRxDBQuery());
  }
}
