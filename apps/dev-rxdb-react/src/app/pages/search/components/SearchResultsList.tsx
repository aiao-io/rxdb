import type { SearchResult, SearchState } from '@aiao/rxdb-plugin-search';
import { collectionBadgeClass, localizeCollection, localizeField } from '../types';

interface SearchResultsListProps {
  results: readonly SearchResult[];
  displayState: SearchState;
  displayError: string | null;
  resultAnnouncement: string;
  query: string;
  hasMore: boolean;
  mutationBusy: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onUpdateResult: (result: SearchResult) => void;
  onRemoveResult: (result: SearchResult) => void;
}

export function SearchResultsList({
  results,
  displayState,
  displayError,
  resultAnnouncement,
  query,
  hasMore,
  mutationBusy,
  onLoadMore,
  onRetry,
  onUpdateResult,
  onRemoveResult
}: SearchResultsListProps): React.JSX.Element {
  return (
    <section className='flex flex-col gap-2' aria-live='polite' data-testid='search-results'>
      <div
        className={`rounded-box border-base-300 bg-base-100 flex items-center gap-2 border px-3 py-2 text-sm${
          displayState === 'loading' ? 'border-primary'
          : displayState === 'error' ? 'border-warning'
          : ''
        }`}
      >
        {displayState === 'loading' && <span className='loading loading-spinner loading-xs text-primary' />}
        {displayState === 'error' && <span className='text-warning'>⚠</span>}
        {displayState === 'empty' && <span className='text-base-content/50'>∅</span>}
        {displayState === 'success' && <span className='text-success'>✓</span>}
        {displayState === 'idle' && <span className='text-base-content/50'>⌕</span>}
        <span className='text-base-content/80' data-testid='search-results-count' role='status'>
          {resultAnnouncement}
        </span>
        <span className='text-base-content/50 text-xs'>·</span>
        <span className='text-base-content/60 text-xs' data-testid='search-state'>
          {displayState}
        </span>
        {displayError && <span className='text-warning text-xs'>— {displayError}</span>}
      </div>

      {displayState === 'empty' && query.trim() && (
        <p className='text-sm italic' data-testid='search-empty'>
          未找到 "{query}" 相关结果
        </p>
      )}

      <ul className='flex flex-col gap-2'>
        {results.map(r => (
          <li
            key={`${r.collection}:${r.id}`}
            className='group card bg-base-200 hover:bg-base-300 relative p-3 transition-colors'
            data-testid='search-result'
            data-collection={r.collection}
            data-id={r.id}
            data-rank={r.rank}
          >
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-1.5 text-xs'>
                  <span className={`badge badge-sm ${collectionBadgeClass(r.collection)}`}>
                    {localizeCollection(r.collection)}
                  </span>
                  <span className='text-base-content/80 font-mono'>#{r.id}</span>
                  <span className='text-base-content/30'>·</span>
                  <span className='text-base-content/60'>
                    匹配：<span className='text-base-content/90 font-medium'>{localizeField(r.matchedField)}</span>
                  </span>
                  <span className='text-base-content/30'>·</span>
                  {/* FTS5 bm25() 返回负值，越负越相关；取反后展示为正数，数值越大相关度越高 */}
                  <span className='badge badge-outline badge-sm font-mono'>相关度 {(-r.rank).toFixed(4)}</span>
                </div>
                <p className='mt-1.5 text-sm leading-relaxed break-words'>{r.snippet}</p>
              </div>
              {(r.collection === 'article' || r.collection === 'comment') && (
                <div className='flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'>
                  <button
                    type='button'
                    className='btn btn-xs btn-ghost'
                    disabled={mutationBusy}
                    onClick={() => void onUpdateResult(r)}
                    aria-label='更新'
                    title='更新'
                    data-testid={`search-result-update-${r.collection}`}
                  >
                    <svg
                      fill='none'
                      height='12'
                      stroke='currentColor'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth='2'
                      viewBox='0 0 24 24'
                      width='12'
                      xmlns='http://www.w3.org/2000/svg'
                    >
                      <path d='M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' />
                      <path d='M3 3v5h5' />
                      <path d='M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16' />
                      <path d='M16 16h5v5' />
                    </svg>
                  </button>
                  <button
                    type='button'
                    className='btn btn-xs btn-ghost text-error'
                    disabled={mutationBusy}
                    onClick={() => void onRemoveResult(r)}
                    aria-label='删除'
                    title='删除'
                    data-testid={`search-result-delete-${r.collection}`}
                  >
                    <svg
                      fill='none'
                      height='12'
                      stroke='currentColor'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth='2'
                      viewBox='0 0 24 24'
                      width='12'
                      xmlns='http://www.w3.org/2000/svg'
                    >
                      <path d='M3 6h18' />
                      <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' />
                      <path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button type='button' className='btn btn-sm' onClick={() => void onLoadMore()} data-testid='search-load-more'>
          加载更多
        </button>
      )}

      {displayState === 'error' && (
        <button type='button' className='btn btn-sm btn-warning' onClick={onRetry} data-testid='search-retry'>
          重试
        </button>
      )}
    </section>
  );
}
