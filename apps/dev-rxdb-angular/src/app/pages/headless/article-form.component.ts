import { RxDB } from '@aiao/rxdb';
import { useI18nRuntime } from '@aiao/rxdb-i18n-angular';
import { injectEntityForm } from '@aiao/rxdb-model-angular/headless';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { createBlankArticle, createFields, errorMessage } from './article-model';
import { fieldId, injectFieldInputs } from './field-inputs';
import { FieldRowComponent } from './field-row.component';

/** 新建文章表单：字段、校验与提交都来自 `injectEntityForm`，控件与布局是本页自己的。 */
@Component({
  selector: 'app-hl-article-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldRowComponent],
  template: `
    <section class="hl-section" aria-labelledby="hl-form-title" data-testid="headless-form">
      <h2 id="hl-form-title">新建文章</h2>
      <form (submit)="submit($event)" aria-labelledby="hl-form-title" novalidate>
        @for (state of form.snapshot().fieldStates; track state.config.field) {
          <app-hl-field-row [inputs]="inputs" [state]="state" idPrefix="hl-form" />
        }
        <div class="hl-actions">
          <button type="submit">提交</button>
          <button (click)="form.controller.cancel()" type="button">取消</button>
        </div>
        <p data-testid="form-state" role="status">{{ form.snapshot().dirty ? '有未提交的修改' : '没有修改' }}</p>
        @if (failure(); as message) {
          <p class="hl-error" data-testid="form-failure" role="alert">{{ message }}</p>
        }
      </form>
    </section>
  `
})
export class ArticleFormComponent {
  /** 校验文案用应用的 i18n 运行时。 */
  protected readonly form = injectEntityForm({
    fields: createFields,
    data: createBlankArticle(inject(RxDB)),
    mode: 'create',
    i18n: useI18nRuntime()
  });
  protected readonly inputs = injectFieldInputs(this.form.controller);
  protected readonly failure = signal<string | null>(null);

  readonly create = input.required<(data: Record<string, unknown>) => Promise<unknown>>();

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.inputs.markAttempted();
    const result = this.form.controller.submit();
    if (!result.valid) {
      const [first] = result.result.errors;
      if (first) document.getElementById(fieldId('hl-form', first.field))?.focus();
      return;
    }
    try {
      await this.create()(result.data);
      this.failure.set(null);
      this.form.controller.cancel();
    } catch (error) {
      this.failure.set(errorMessage(error));
    }
  }
}
