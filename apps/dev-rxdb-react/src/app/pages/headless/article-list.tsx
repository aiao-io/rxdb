import type { OrderBy } from '@aiao/rxdb';
import { useI18n } from '@aiao/rxdb-i18n-react';
import type { EntityListController, EntityListSnapshot } from '@aiao/rxdb-model/headless';
import { errorMessage, type ArticleRecord } from './article-model';

/** 可排序列：表头按钮循环 无序 → 升序 → 降序；label 存目录键，渲染时经 t() 翻译。 */
const COLUMNS = [
  { field: 'title', label: 'page.headless.titleColumn' },
  { field: 'category', label: 'page.headless.categoryColumn' },
  { field: 'viewCount', label: 'page.headless.viewCountColumn' }
] as const;

const sortOf = (sorts: readonly OrderBy[], field: string): 'ascending' | 'descending' | 'none' => {
  const sort = sorts.find(item => item.field === field)?.sort;
  if (sort === undefined) return 'none';
  return sort === 'asc' ? 'ascending' : 'descending';
};

const nextSorts = (sorts: readonly OrderBy[], field: string): OrderBy[] => {
  const current = sortOf(sorts, field);
  if (current === 'none') return [{ field, sort: 'asc' }];
  if (current === 'ascending') return [{ field, sort: 'desc' }];
  return [];
};

/** 列表展示层：表格、分页、选择与行内动作全是本页自己的，状态与动作来自列表控制器。 */
export function ArticleList({
  controller,
  snapshot,
  onEdit
}: {
  controller: EntityListController<ArticleRecord>;
  snapshot: EntityListSnapshot<ArticleRecord>;
  onEdit(record: ArticleRecord): void;
}): React.JSX.Element {
  const { records, selectedIds, page, pageSize, total, hasNext, loading, error, sorts } = snapshot;
  const { t } = useI18n();
  const pages = total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize));
  const canEdit = snapshot.capabilities?.canEdit !== false;
  const canDelete = snapshot.capabilities?.canDelete !== false;

  return (
    <section className='hl-section' aria-labelledby='hl-list-title' data-testid='headless-list'>
      <h2 id='hl-list-title'>{t('page.headless.listTitle')}</h2>
      <div className='hl-actions'>
        <button type='button' onClick={() => void controller.refresh().catch(() => undefined)}>
          {t('page.headless.refresh')}
        </button>
        <button
          type='button'
          disabled={selectedIds.length === 0 || !canDelete}
          onClick={() => void controller.remove(selectedIds).catch(() => undefined)}
        >
          {t('page.headless.deleteSelected', { count: selectedIds.length })}
        </button>
      </div>
      <table className='hl-table' aria-label={t('page.headless.articleTable')} aria-busy={loading}>
        <thead>
          <tr>
            <th scope='col'>
              <span className='hl-sr'>{t('page.headless.selectColumn')}</span>
            </th>
            {COLUMNS.map(column => (
              <th key={column.field} scope='col' aria-sort={sortOf(sorts, column.field)}>
                <button type='button' onClick={() => controller.setSorts(nextSorts(sorts, column.field))}>
                  {t(column.label)}
                </button>
              </th>
            ))}
            <th scope='col'>{t('page.headless.actionsColumn')}</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 && !loading && (
            <tr>
              <td colSpan={COLUMNS.length + 2} data-testid='list-empty'>
                {t('common.noData')}
              </td>
            </tr>
          )}
          {records.map(record => (
            <tr key={record.id} data-testid='list-row' data-id={record.id}>
              <td>
                <input
                  type='checkbox'
                  aria-label={t('page.headless.selectRow', { title: record.title })}
                  checked={selectedIds.includes(record.id)}
                  onChange={() => controller.toggleSelection(record.id)}
                />
              </td>
              <td>{record.title}</td>
              <td>{record.category}</td>
              <td>{record.viewCount ?? ''}</td>
              <td>
                <button
                  type='button'
                  disabled={!canEdit}
                  aria-label={t('page.headless.editRow', { title: record.title })}
                  onClick={() => onEdit(record)}
                >
                  {t('common.edit')}
                </button>
                <button
                  type='button'
                  disabled={!canDelete}
                  aria-label={t('page.headless.deleteRow', { title: record.title })}
                  onClick={() => void controller.remove([record.id]).catch(() => undefined)}
                >
                  {t('common.delete')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error !== null && (
        <p className='hl-error' role='alert' data-testid='list-error'>
          {errorMessage(error)}
        </p>
      )}
      <div className='hl-pager'>
        <button type='button' disabled={page === 0} onClick={() => controller.setPage(page - 1)}>
          {t('page.headless.previousPage')}
        </button>
        <span role='status' data-testid='list-page-info'>
          {t('page.headless.pageInfo', { page: page + 1, pages: pages ?? '?', total: total ?? '?' })}
          {loading ? t('page.headless.loadingSuffix') : ''}
        </span>
        <button type='button' disabled={hasNext !== true} onClick={() => controller.setPage(page + 1)}>
          {t('page.headless.nextPage')}
        </button>
      </div>
    </section>
  );
}
