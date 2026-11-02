import type { OrderBy } from '@aiao/rxdb';
import type { EntityListController, EntityListSnapshot } from '@aiao/rxdb-model/headless';
import type { ArticleRecord } from './article-model';

/** 可排序列：表头按钮循环 无序 → 升序 → 降序。 */
const COLUMNS = [
  { field: 'title', label: '标题' },
  { field: 'category', label: '分类' },
  { field: 'viewCount', label: '浏览量' }
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
  const pages = total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize));
  const canEdit = snapshot.capabilities?.canEdit !== false;
  const canDelete = snapshot.capabilities?.canDelete !== false;

  return (
    <section className='hl-section' aria-labelledby='hl-list-title' data-testid='headless-list'>
      <h2 id='hl-list-title'>文章列表</h2>
      <div className='hl-actions'>
        <button type='button' onClick={() => void controller.refresh().catch(() => undefined)}>
          刷新
        </button>
        <button
          type='button'
          disabled={selectedIds.length === 0 || !canDelete}
          onClick={() => void controller.remove(selectedIds).catch(() => undefined)}
        >
          删除所选 ({selectedIds.length})
        </button>
      </div>
      <table className='hl-table' aria-label='文章' aria-busy={loading}>
        <thead>
          <tr>
            <th scope='col'>
              <span className='hl-sr'>选择</span>
            </th>
            {COLUMNS.map(column => (
              <th key={column.field} scope='col' aria-sort={sortOf(sorts, column.field)}>
                <button type='button' onClick={() => controller.setSorts(nextSorts(sorts, column.field))}>
                  {column.label}
                </button>
              </th>
            ))}
            <th scope='col'>操作</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 && !loading && (
            <tr>
              <td colSpan={COLUMNS.length + 2} data-testid='list-empty'>
                暂无数据
              </td>
            </tr>
          )}
          {records.map(record => (
            <tr key={record.id} data-testid='list-row' data-id={record.id}>
              <td>
                <input
                  type='checkbox'
                  aria-label={`选择 ${record.title}`}
                  checked={selectedIds.includes(record.id)}
                  onChange={() => controller.toggleSelection(record.id)}
                />
              </td>
              <td>{record.title}</td>
              <td>{record.category}</td>
              <td>{record.viewCount ?? ''}</td>
              <td>
                <button type='button' disabled={!canEdit} aria-label={`编辑 ${record.title}`} onClick={() => onEdit(record)}>
                  编辑
                </button>
                <button
                  type='button'
                  disabled={!canDelete}
                  aria-label={`删除 ${record.title}`}
                  onClick={() => void controller.remove([record.id]).catch(() => undefined)}
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error !== null && (
        <p className='hl-error' role='alert' data-testid='list-error'>
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}
      <div className='hl-pager'>
        <button type='button' disabled={page === 0} onClick={() => controller.setPage(page - 1)}>
          上一页
        </button>
        <span role='status' data-testid='list-page-info'>
          第 {page + 1} / {pages ?? '?'} 页，共 {total ?? '?'} 条{loading ? '（加载中）' : ''}
        </span>
        <button type='button' disabled={hasNext !== true} onClick={() => controller.setPage(page + 1)}>
          下一页
        </button>
      </div>
    </section>
  );
}
