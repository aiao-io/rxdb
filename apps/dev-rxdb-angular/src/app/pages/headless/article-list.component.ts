import type { OrderBy } from '@aiao/rxdb';
import type { EntityListController, EntityListSnapshot } from '@aiao/rxdb-model/headless';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { I18nPipe } from '../../pipes/i18n.pipe';
import { errorMessage, type ArticleRecord } from './article-model';

/** 可排序列：表头按钮循环 无序 → 升序 → 降序；label 存目录键，渲染时经 i18n 管道翻译。 */
const COLUMNS = [
  { field: 'title', label: 'page.headless.titleColumn' },
  { field: 'category', label: 'page.headless.categoryColumn' },
  { field: 'viewCount', label: 'page.headless.viewCountColumn' }
] as const;

/** 列表展示层：表格、分页、选择与行内动作全是本页自己的，状态与动作来自列表控制器。 */
@Component({
  selector: 'app-hl-article-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [I18nPipe],
  template: `
    <section class="hl-section" aria-labelledby="hl-list-title" data-testid="headless-list">
      <h2 id="hl-list-title">{{ 'page.headless.listTitle' | i18n }}</h2>
      <div class="hl-actions">
        <button (click)="refresh()" type="button">{{ 'page.headless.refresh' | i18n }}</button>
        <button
          [disabled]="snapshot().selectedIds.length === 0 || !canDelete()"
          (click)="remove(snapshot().selectedIds)"
          type="button"
        >
          {{ 'page.headless.deleteSelected' | i18n: { count: snapshot().selectedIds.length } }}
        </button>
      </div>
      <table
        class="hl-table"
        [attr.aria-busy]="snapshot().loading"
        [attr.aria-label]="'page.headless.articleTable' | i18n"
      >
        <thead>
          <tr>
            <th scope="col">
              <span class="hl-sr">{{ 'page.headless.selectColumn' | i18n }}</span>
            </th>
            @for (column of columns; track column.field) {
              <th [attr.aria-sort]="sortOf(column.field)" scope="col">
                <button (click)="toggleSort(column.field)" type="button">{{ column.label | i18n }}</button>
              </th>
            }
            <th scope="col">{{ 'page.headless.actionsColumn' | i18n }}</th>
          </tr>
        </thead>
        <tbody>
          @if (snapshot().records.length === 0 && !snapshot().loading) {
            <tr>
              <td [attr.colspan]="columns.length + 2" data-testid="list-empty">{{ 'common.noData' | i18n }}</td>
            </tr>
          }
          @for (record of snapshot().records; track record.id) {
            <tr [attr.data-id]="record.id" data-testid="list-row">
              <td>
                <input
                  [attr.aria-label]="'page.headless.selectRow' | i18n: { title: record.title }"
                  [checked]="snapshot().selectedIds.includes(record.id)"
                  (change)="controller().toggleSelection(record.id)"
                  type="checkbox"
                />
              </td>
              <td>{{ record.title }}</td>
              <td>{{ record.category }}</td>
              <td>{{ record.viewCount ?? '' }}</td>
              <td>
                <button
                  [attr.aria-label]="'page.headless.editRow' | i18n: { title: record.title }"
                  [disabled]="!canEdit()"
                  (click)="edit.emit(record)"
                  type="button"
                >
                  {{ 'common.edit' | i18n }}
                </button>
                <button
                  [attr.aria-label]="'page.headless.deleteRow' | i18n: { title: record.title }"
                  [disabled]="!canDelete()"
                  (click)="remove([record.id])"
                  type="button"
                >
                  {{ 'common.delete' | i18n }}
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (snapshot().error !== null) {
        <p class="hl-error" data-testid="list-error" role="alert">{{ errorMessage(snapshot().error) }}</p>
      }
      <div class="hl-pager">
        <button [disabled]="snapshot().page === 0" (click)="controller().setPage(snapshot().page - 1)" type="button">
          {{ 'page.headless.previousPage' | i18n }}
        </button>
        <span data-testid="list-page-info" role="status">
          {{
            'page.headless.pageInfo'
              | i18n: { page: snapshot().page + 1, pages: pages() ?? '?', total: snapshot().total ?? '?' }
          }}{{ snapshot().loading ? ('page.headless.loadingSuffix' | i18n) : '' }}
        </span>
        <button
          [disabled]="snapshot().hasNext !== true"
          (click)="controller().setPage(snapshot().page + 1)"
          type="button"
        >
          {{ 'page.headless.nextPage' | i18n }}
        </button>
      </div>
    </section>
  `
})
export class ArticleListComponent {
  protected readonly columns = COLUMNS;
  protected readonly errorMessage = errorMessage;
  protected readonly pages = computed(() => {
    const { total, pageSize } = this.snapshot();
    return total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize));
  });
  protected readonly canEdit = computed(() => this.snapshot().capabilities?.canEdit !== false);
  protected readonly canDelete = computed(() => this.snapshot().capabilities?.canDelete !== false);

  readonly controller = input.required<EntityListController<ArticleRecord>>();
  readonly snapshot = input.required<EntityListSnapshot<ArticleRecord>>();
  readonly edit = output<ArticleRecord>();

  protected sortOf(field: string): 'ascending' | 'descending' | 'none' {
    const sort = this.snapshot().sorts.find((item: OrderBy) => item.field === field)?.sort;
    if (sort === undefined) return 'none';
    return sort === 'asc' ? 'ascending' : 'descending';
  }

  protected toggleSort(field: string): void {
    const current = this.sortOf(field);
    if (current === 'none') this.controller().setSorts([{ field, sort: 'asc' }]);
    else if (current === 'ascending') this.controller().setSorts([{ field, sort: 'desc' }]);
    else this.controller().setSorts([]);
  }

  /** 失败已经写入 snapshot.error 并由列表展示，这里只防未处理的拒绝。 */
  protected refresh(): void {
    void this.controller()
      .refresh()
      .catch(() => undefined);
  }

  protected remove(ids: readonly string[]): void {
    void this.controller()
      .remove(ids)
      .catch(() => undefined);
  }
}
