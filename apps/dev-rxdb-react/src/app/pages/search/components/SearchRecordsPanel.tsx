import type { Article, Comment } from '@aiao/rxdb-test/entities';
import type { SearchDemoCollection } from '../types';

interface SearchRecordsPanelProps {
  collapsed: boolean;
  activeTab: SearchDemoCollection;
  articleRecords: readonly Article[];
  commentRecords: readonly Comment[];
  mutationBusy: boolean;
  mutationMessage: string | null;
  onCollapsedChange: (collapsed: boolean) => void;
  onActiveTabChange: (tab: SearchDemoCollection) => void;
  onOpenCreate: (type: SearchDemoCollection) => void;
  onRemoveArticle: (id: string) => void;
  onRemoveComment: (id: string) => void;
}

export function SearchRecordsPanel({
  collapsed,
  activeTab,
  articleRecords,
  commentRecords,
  mutationBusy,
  mutationMessage,
  onCollapsedChange,
  onActiveTabChange,
  onOpenCreate,
  onRemoveArticle,
  onRemoveComment
}: SearchRecordsPanelProps): React.JSX.Element {
  return (
    <section className='card bg-base-200/60' data-testid='search-records-panel'>
      <button
        type='button'
        className='flex w-full items-center justify-between gap-2 p-3 text-left'
        aria-expanded={!collapsed}
        onClick={() => onCollapsedChange(!collapsed)}
        data-testid='search-records-toggle'
      >
        <span className='flex items-center gap-2 text-sm font-medium'>
          <svg
            className={`transition-transform ${!collapsed ? 'rotate-90' : ''}`}
            fill='none'
            height='14'
            stroke='currentColor'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth='2'
            viewBox='0 0 24 24'
            width='14'
            xmlns='http://www.w3.org/2000/svg'
          >
            <path d='m9 18 6-6-6-6' />
          </svg>
          数据记录
          <span className='text-base-content/60 text-xs font-normal'>
            文章 {articleRecords.length} · 评论 {commentRecords.length}
          </span>
        </span>
      </button>

      {!collapsed && (
        <div className='px-3 pb-3'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='tabs tabs-border w-full sm:w-auto' role='tablist'>
              {(['article', 'comment'] as const).map(tab => (
                <button
                  key={tab}
                  type='button'
                  role='tab'
                  aria-selected={activeTab === tab}
                  className={`tab text-base-content${activeTab === tab ? 'tab-active' : ''}`}
                  onClick={() => onActiveTabChange(tab)}
                  data-testid={`search-tab-${tab}`}
                >
                  {tab === 'article' ? '文章' : '评论'} (
                  {tab === 'article' ? articleRecords.length : commentRecords.length})
                </button>
              ))}
            </div>
            <button
              type='button'
              className='btn btn-sm btn-primary gap-1 self-start sm:self-center'
              disabled={mutationBusy}
              onClick={() => onOpenCreate(activeTab)}
              aria-label={`新建${activeTab === 'article' ? '文章' : '评论'}`}
              data-testid={activeTab === 'article' ? 'search-create-article' : 'search-create-comment'}
            >
              <svg
                fill='none'
                height='14'
                stroke='currentColor'
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                viewBox='0 0 24 24'
                width='14'
                xmlns='http://www.w3.org/2000/svg'
              >
                <path d='M5 12h14' />
                <path d='M12 5v14' />
              </svg>
              新建{activeTab === 'article' ? '文章' : '评论'}
            </button>
          </div>

          {activeTab === 'article' ?
            articleRecords.length === 0 ?
              <p className='text-base-content/60 mt-3 text-sm italic'>暂无文章</p>
            : <ul className='divide-base-300 rounded-box bg-base-100 mt-3 max-h-96 divide-y overflow-y-auto'>
                {articleRecords.map(article => (
                  <li
                    key={article.id}
                    className='flex items-start justify-between gap-3 px-4 py-3'
                    data-testid={`search-record-article-${article.id}`}
                  >
                    <div className='min-w-0 flex-1'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='font-medium'>{article.title}</span>
                        <span className='badge badge-primary badge-sm'>{article.category}</span>
                        <span className='text-base-content/80 text-xs'>#{article.id}</span>
                      </div>
                      <p className='text-base-content/80 mt-1 text-sm'>{article.body}</p>
                      <div className='mt-2 flex flex-wrap gap-1'>
                        {article.tags?.map(tag => (
                          <span key={tag} className='badge badge-outline badge-xs'>
                            {tag}
                          </span>
                        ))}
                      </div>
                      <p className='text-base-content/80 mt-2 text-xs'>
                        {article.authorId} · {article.viewCount} 次浏览
                      </p>
                    </div>
                    <button
                      type='button'
                      className='btn btn-xs btn-ghost text-error'
                      disabled={mutationBusy}
                      onClick={() => onRemoveArticle(String(article.id))}
                      data-testid={`search-delete-article-${article.id}`}
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>

          : commentRecords.length === 0 ?
            <p className='text-base-content/60 mt-3 text-sm italic'>暂无评论</p>
          : <ul className='divide-base-300 rounded-box bg-base-100 mt-3 max-h-96 divide-y overflow-y-auto'>
              {commentRecords.map(comment => (
                <li
                  key={comment.id}
                  className='flex items-start justify-between gap-3 px-4 py-3'
                  data-testid={`search-record-comment-${comment.id}`}
                >
                  <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='font-medium'>{comment.authorName}</span>
                      <span className='text-base-content/80 text-xs'>文章 {comment.articleId}</span>
                      <span className='text-base-content/80 text-xs'>#{comment.id}</span>
                    </div>
                    <p className='text-base-content/80 mt-1 text-sm'>{comment.content}</p>
                  </div>
                  <button
                    type='button'
                    className='btn btn-xs btn-ghost text-error'
                    disabled={mutationBusy}
                    onClick={() => onRemoveComment(String(comment.id))}
                    data-testid={`search-delete-comment-${comment.id}`}
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          }

          {mutationMessage && (
            <p className='text-base-content/70 mt-3 text-xs' data-testid='search-mutation-message' role='status'>
              {mutationMessage}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
