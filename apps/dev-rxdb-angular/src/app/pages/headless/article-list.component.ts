import type { OrderBy } from '@aiao/rxdb';
import type { EntityListController, EntityListSnapshot } from '@aiao/rxdb-model/headless';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ArticleRecord } from './article-model';

/** 可排序列：表头按钮循环 无序 → 升序 → 降序。 */
const COLUMNS = [
  { field: 'title', label: '标题' },
  { field: 'category', label: '分类' },
  { field: 'viewCount', label: '浏览量' }
] as const;

/** 列表展示层：表格、分页、选择与行内动作全是本页自己的，状态与动作来自列表控制器。 */
@Component({
  selector: 'app-hl-article-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hl-section" aria-labelledby="hl-list-title" data-testid="headless-list">
      <h2 id="hl-list-title">文章列表</h2>
      <div class="hl-actions">
        <button type="button" (click)="refresh()">刷新</button>
        <button
          type="button"
          [disabled]="snapshot().selectedIds.length === 0 || !canDelete()"
          (click)="remove(snapshot().selectedIds)"
        >
          删除所选 ({{ snapshot().selectedIds.length }})
        </button>
      </div>
      <table class="hl-table" aria-label="文章" [attr.aria-busy]="snapshot().loading">
        <thead>
          <tr>
            <th scope="col"><span class="hl-sr">选择</span></th>
            @for (column of columns; track column.field) {
              <th scope="col" [attr.aria-sort]="sortOf(column.field)">
                <button type="button" (click)="toggleSort(column.field)">{{ column.label }}</button>
              </th>
            }
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          @if (snapshot().records.length === 0 && !snapshot().loading) {
            <tr>
              <td [attr.colspan]="columns.length + 2" data-testid="list-empty">暂无数据</td>
            </tr>
          }
          @for (record of snapshot().records; track record.id) {
            <tr data-testid="list-row" [attr.data-id]="record.id">
              <td>
                <input
                  type="checkbox"
                  [attr.aria-label]="'选择 ' + record.title"
                  [checked]="snapshot().selectedIds.includes(record.id)"
                  (change)="controller().toggleSelection(record.id)"
                />
              </td>
              <td>{{ record.title }}</td>
              <td>{{ record.category }}</td>
              <td>{{ record.viewCount ?? '' }}</td>
              <td>
                <button
                  type="button"
                  [disabled]="!canEdit()"
                  [attr.aria-label]="'编辑 ' + record.title"
                  (click)="edit.emit(record)"
                >
                  编辑
                </button>
                <button
                  type="button"
                  [disabled]="!canDelete()"
                  [attr.aria-label]="'删除 ' + record.title"
                  (click)="remove([record.id])"
                >
                  删除
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (snapshot().error !== null) {
        <p class="hl-error" role="alert" data-testid="list-error">{{ message(snapshot().error) }}</p>
      }
      <div class="hl-pager">
        <button type="button" [disabled]="snapshot().page === 0" (click)="controller().setPage(snapshot().page - 1)">
          上一页
        </button>
        <span role="status" data-testid="list-page-info">
          第 {{ snapshot().page + 1 }} / {{ pages() ?? '?' }} 页，共 {{ snapshot().total ?? '?' }} 条{{
            snapshot().loading ? '（加载中）' : ''
          }}
        </span>
        <button
          type="button"
          [disabled]="snapshot().hasNext !== true"
          (click)="controller().setPage(snapshot().page + 1)"
        >
          下一页
        </button>
      </div>
    </section>
  `
})
export class ArticleListComponent {
  protected readonly columns = COLUMNS;
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

  protected message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
