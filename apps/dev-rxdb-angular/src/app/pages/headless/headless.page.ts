import { RxDB, type RuleGroup } from '@aiao/rxdb';
import { injectEntityDialog, injectEntityList } from '@aiao/rxdb-model-angular/headless';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  ViewEncapsulation
} from '@angular/core';
import { ArticleFormComponent } from './article-form.component';
import { ArticleListComponent } from './article-list.component';
import {
  createArticleSource,
  PAGE_SIZE,
  type ArticleRecord,
  type DetailData,
  type DetailResult,
  type DetailSaveResult
} from './article-model';
import { DetailDialogComponent } from './detail-dialog.component';
import { QueryPanelComponent } from './query-panel.component';

/**
 * Headless 实体示例页（`/headless`）。
 *
 * 只经 `@aiao/rxdb-model/headless` 与 `@aiao/rxdb-model-angular/headless` 取状态和动作：
 * 表单、筛选、列表、详情与弹窗的 DOM、控件和样式都是本页自己的，不渲染任何默认组件，也不使用 Tailwind / daisyUI 类名。
 * 样式用 `ViewEncapsulation.None` 挂在页面上，子组件共用同一份普通 CSS。
 */
@Component({
  selector: 'app-headless-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './headless.css',
  imports: [ArticleFormComponent, ArticleListComponent, DetailDialogComponent, QueryPanelComponent],
  host: { class: 'hl-page', 'data-testid': 'headless-page' },
  template: `
    <h1>Headless 实体</h1>
    <p class="hl-lead">本页只使用 headless 入口提供的状态与动作；DOM、控件、布局和样式都是自己的。</p>
    <div class="hl-grid">
      <app-hl-article-form [create]="create" />
      <app-hl-query-panel (apply)="query.set($event)" />
      <div class="hl-wide">
        <div class="hl-actions">
          <button (click)="dialog.controller.open({ mode: 'create' })" type="button">新建文章</button>
          <span data-testid="dialog-result" role="status">
            {{ dialog.snapshot().result === undefined ? '' : '弹窗结果：' + dialog.snapshot().result }}
          </span>
        </div>
        <app-hl-article-list
          [controller]="list.controller"
          [snapshot]="list.snapshot()"
          (edit)="dialog.controller.open({ mode: 'edit', record: $event })"
        />
      </div>
    </div>
    @if (dialog.snapshot().open && dialog.snapshot().data; as data) {
      <app-hl-detail-dialog [data]="data" [persist]="save" (closed)="close($event)" />
    }
  `
})
export default class HeadlessPage {
  readonly #source = createArticleSource(inject(RxDB));
  /** 查询 / 排序 / 分页任一变化就重新取数。快照里的 sorts 每次发布都是新数组，所以用序列化后的请求键做依赖。 */
  readonly #requestKey = computed(() => {
    const { query, sorts, page, pageSize } = this.list.snapshot();
    return JSON.stringify([query, sorts, page, pageSize]);
  });
  protected readonly query = signal<RuleGroup | undefined>(undefined);
  protected readonly list = injectEntityList<ArticleRecord>(() => ({
    ...this.#source,
    query: this.query(),
    pageSize: PAGE_SIZE
  }));
  protected readonly dialog = injectEntityDialog<DetailResult, DetailData>();

  constructor() {
    effect(() => {
      this.#requestKey();
      // 失败已经写入 snapshot.error 并由列表展示，这里只防未处理的拒绝
      untracked(() => void this.list.controller.refresh().catch(() => undefined));
    });
  }

  /** 以下两个回调作为输入传给子组件，用箭头函数保持 `this`。 */
  protected readonly create = (data: Record<string, unknown>): Promise<unknown> => this.list.controller.create(data);
  protected readonly save = async ({ data, changes }: DetailSaveResult): Promise<void> => {
    const current = this.dialog.snapshot().data;
    if (current?.mode === 'edit') await this.list.controller.update(current.record.id, changes);
    else await this.list.controller.create(data);
  };

  protected close(result: DetailResult): void {
    if (result === 'saved') this.dialog.controller.resolve(result);
    else this.dialog.controller.close(result);
  }
}
