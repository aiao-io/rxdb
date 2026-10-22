import { useSearch } from '@aiao/rxdb-plugin-search-react';
import { useRxDB } from '@aiao/rxdb-react';

const SEARCH_OPTIONS = { debounce: 300, pageSize: 20, snippetLength: 64 };

/** 命中记录的实体显示名（按实体名映射，未知实体回退实体名）。 */
const ENTITY_DISPLAY_NAMES: Record<string, string> = {
  Asset: '资产',
  AssetCategory: '资产分类',
  AssetEvent: '维护记录'
};

/**
 * 全文搜索页（FTS5 + CJK bigram）：跨工作台全部可搜索实体
 * （分类名 / 资产名称 / 维护事项），结果带命中字段与摘要。
 */
export default function SearchPage() {
  const rxdb = useRxDB();
  const search = useSearch(rxdb, SEARCH_OPTIONS);

  return (
    <div className='page-host gap-3 overflow-auto p-6' data-testid='search-page'>
      <h2 className='text-base font-semibold'>全文搜索</h2>
      <input
        className='input w-full max-w-md'
        placeholder='搜索分类、资产与维护记录…'
        data-testid='search-input'
        value={search.query}
        onChange={event => search.setQuery(event.target.value)}
      />
      <div className='flex flex-col gap-2' data-testid='search-results'>
        {search.state === 'loading' && <span className='text-base-content/60 text-sm'>搜索中…</span>}
        {search.state === 'error' && (
          <span className='text-error text-sm' role='alert'>
            搜索失败：{search.error?.message}
          </span>
        )}
        {search.state === 'empty' && search.query.trim() !== '' && (
          <span className='text-base-content/60 text-sm'>无匹配结果</span>
        )}
        {search.results.map(result => (
          <div
            key={`${result.collection}:${result.id}`}
            className='bg-base-200 rounded-box flex flex-col gap-1 p-3'
            data-testid='search-result'
          >
            <span className='text-sm font-medium'>
              {ENTITY_DISPLAY_NAMES[result.entity] ?? result.entity} · {result.matchedField}
            </span>
            <span className='text-base-content/70 text-sm'>{result.snippet}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
