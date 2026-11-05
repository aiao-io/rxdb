import { RxDB } from '@aiao/rxdb';
import { useI18nRuntime } from '@aiao/rxdb-i18n-angular';
import { injectEntityDetail } from '@aiao/rxdb-model-angular/headless';
import { type EntityDetailControllerOptions } from '@aiao/rxdb-model/headless';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import {
  buildEditFields,
  createBlankArticle,
  createFields,
  detailTabs,
  errorMessage,
  type DetailData,
  type DetailResult,
  type DetailSaveResult
} from './article-model';
import { injectFieldInputs } from './field-inputs';
import { FieldRowComponent } from './field-row.component';

/**
 * 自有弹窗外壳 + 详情控制器：草稿、Tab、保存与取消来自 `injectEntityDetail`，
 * 焦点约束交给原生 `<dialog>.showModal()`，关闭后的焦点恢复由本组件自己接线。
 */
@Component({
  selector: 'app-hl-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldRowComponent],
  template: `
    <dialog
      class="hl-dialog"
      #dialog
      (cancel)="onEscape($event)"
      aria-labelledby="hl-dialog-title"
      data-testid="detail-dialog"
    >
      <form (submit)="save($event)" novalidate>
        <h2 id="hl-dialog-title">{{ creating() ? '新建文章' : '编辑文章' }}</h2>
        <div class="hl-tabs" aria-label="详情分区" role="tablist">
          @for (tab of tabs(); track tab.key) {
            <button
              [attr.aria-controls]="'hl-panel-' + tab.key"
              [attr.aria-selected]="tab.key === detail.snapshot().activeTab"
              [id]="'hl-tab-' + tab.key"
              (click)="detail.controller.selectTab(tab.key)"
              role="tab"
              type="button"
            >
              {{ tab.label }}
            </button>
          }
        </div>
        <div
          [attr.aria-labelledby]="'hl-tab-' + detail.snapshot().activeTab"
          [id]="'hl-panel-' + detail.snapshot().activeTab"
          role="tabpanel"
        >
          @if (detail.snapshot().activeTab === 'basic') {
            @for (state of basicStates(); track state.config.field) {
              <app-hl-field-row [inputs]="inputs" [state]="state" idPrefix="hl-detail" />
            }
          } @else {
            <dl class="hl-system">
              @for (state of systemStates(); track state.config.field) {
                <div>
                  <dt>{{ state.config.displayName }}</dt>
                  <dd [attr.data-testid]="'system-' + state.config.field">{{ state.displayValue }}</dd>
                </div>
              }
            </dl>
          }
        </div>
        @if (errorText(); as message) {
          <p class="hl-error" data-testid="detail-error" role="alert">{{ message }}</p>
        }
        <div class="hl-actions">
          <button [disabled]="detail.snapshot().saving" type="submit">保存</button>
          <button (click)="cancel()" type="button">取消</button>
        </div>
      </form>
    </dialog>
  `
})
export class DetailDialogComponent {
  readonly #i18n = useI18nRuntime();
  readonly #rxdb = inject(RxDB);
  /** 输入 signal 在组件实例化后才可读取：先用占位选项建立控制器，再由 effect 写入真实选项，控制器随之同步。 */
  readonly #options = signal<EntityDetailControllerOptions>({
    fields: [],
    mode: 'view',
    tabs: detailTabs,
    i18n: this.#i18n
  });
  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly creating = computed(() => this.data().mode === 'create');
  /** 新建时没有只读的系统字段，系统字段 Tab 不显示。 */
  protected readonly tabs = computed(() => (this.creating() ? detailTabs.slice(0, 1) : detailTabs));
  protected readonly detail = injectEntityDetail(this.#options);
  protected readonly inputs = injectFieldInputs(this.detail.controller.form);
  protected readonly basicStates = computed(() =>
    this.detail.snapshot().form.fieldStates.filter(state => !state.readonly)
  );
  protected readonly systemStates = computed(() =>
    this.detail.snapshot().form.fieldStates.filter(state => state.readonly)
  );
  protected readonly errorText = computed(() => {
    const error = this.detail.snapshot().error;
    return error === null ? null : errorMessage(error);
  });

  readonly data = input.required<DetailData>();
  readonly persist = input.required<(result: DetailSaveResult) => Promise<void>>();
  readonly closed = output<DetailResult>();

  constructor() {
    effect(() => {
      const data = this.data();
      // 弹窗每次打开都是新实例：系统字段名按打开时的应用语言翻译，新建的基线来自实例化的草稿
      this.#options.set(
        data.mode === 'create' ?
          {
            fields: createFields,
            mode: 'create',
            tabs: detailTabs,
            i18n: this.#i18n,
            data: createBlankArticle(this.#rxdb)
          }
        : { fields: buildEditFields(this.#i18n), mode: 'edit', tabs: detailTabs, i18n: this.#i18n, entity: data.record }
      );
    });

    let dialog: HTMLDialogElement | null = null;
    let opener: HTMLElement | null = null;
    afterNextRender(() => {
      // 弹窗随组件销毁，浏览器不会替我们把焦点还给打开它的元素：自己记下并在关闭时恢复
      dialog = this.dialogRef().nativeElement;
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    });
    inject(DestroyRef).onDestroy(() => {
      dialog?.close();
      opener?.focus();
    });
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.inputs.markAttempted();
    try {
      const result = await this.detail.controller.save(this.persist());
      if (result.valid) this.closed.emit('saved');
    } catch {
      // 失败原因已在 snapshot.error 暴露，弹窗保持打开让用户修正
    }
  }

  protected onEscape(event: Event): void {
    event.preventDefault();
    this.cancel();
  }

  protected cancel(): void {
    this.detail.controller.cancel();
    this.closed.emit('cancelled');
  }
}
