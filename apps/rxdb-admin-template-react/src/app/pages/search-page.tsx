import { useAdminStore } from '@aiao/rxdb-admin-react';
import { useI18n } from '@aiao/rxdb-i18n-react';
import { useSearch } from '@aiao/rxdb-plugin-search-react';
import { useRxDB } from '@aiao/rxdb-react';
import { useMemo } from 'react';
import { entityDisplayName, fieldDisplayName } from '../entities/entity-labels';
import { visibleEntityEntries } from '../entities/entity-registry';
import { SEARCH_PAGE_SIZE_KEY, workbenchShell } from '../shell/workbench-shell';

/**
 * 全文搜索页（FTS5 + CJK bigram）：跨工作台全部可搜索实体
 * （分类名 / 资产名称 / 维护事项），结果带命中字段与摘要。
 */
export default function SearchPage() {
  const rxdb = useRxDB();
  const { t } = useI18n();
  const entries = useMemo(() => visibleEntityEntries(rxdb.config.entities), [rxdb]);
  const pageSize = useAdminStore(workbenchShell.preferences).extension[SEARCH_PAGE_SIZE_KEY] as number;
  const options = useMemo(() => ({ debounce: 300, pageSize, snippetLength: 64 }), [pageSize]);
  const search = useSearch(rxdb, options);

  return (
    <div className='page-host gap-3 overflow-auto p-6' data-testid='search-page'>
      <h2 className='text-base font-semibold'>{t('search.title')}</h2>
      <input
        className='input w-full max-w-md'
        placeholder={t('search.placeholder')}
        aria-label={t('search.title')}
        data-testid='search-input'
        value={search.query}
        onChange={event => search.setQuery(event.target.value)}
      />
      <div className='flex flex-col gap-2' data-testid='search-results'>
        {search.state === 'loading' && <span className='text-base-content/60 text-sm'>{t('search.loading')}</span>}
        {search.state === 'error' && (
          <span className='text-error text-sm' role='alert'>
            {t('search.failed', { message: search.error?.message ?? '' })}
          </span>
        )}
        {search.state === 'empty' && search.query.trim() !== '' && (
          <span className='text-base-content/60 text-sm'>{t('search.empty')}</span>
        )}
        {search.results.map(result => {
          const entry = entries.find(candidate => candidate.name === result.entity);
          return (
            <div
              key={`${result.collection}:${result.id}`}
              className='bg-base-200 rounded-box flex flex-col gap-1 p-3'
              data-testid='search-result'
            >
              <span className='text-sm font-medium'>
                {entry ? entityDisplayName(entry, t) : result.entity} ·{' '}
                {entry ? fieldDisplayName(entry, result.matchedField, t) : result.matchedField}
              </span>
              <span className='text-base-content/70 text-sm'>{result.snippet}</span>
            </div>
          );
        })}
      </div>
      {search.hasMore && (
        <button
          className='btn btn-outline w-fit'
          type='button'
          disabled={search.state !== 'success'}
          onClick={() => void search.loadMore()}
        >
          {t(search.state === 'loading' ? 'search.loadingMore' : 'search.loadMore')}
        </button>
      )}
    </div>
  );
}
