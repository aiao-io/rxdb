import { useI18n } from '@aiao/rxdb-i18n-react';
import type { ArticleCreateDraft, CommentCreateDraft, SearchDemoCollection } from '../types';

interface SearchCreateModalProps {
  open: boolean;
  type: SearchDemoCollection;
  articleDraft: ArticleCreateDraft;
  commentDraft: CommentCreateDraft;
  mutationBusy: boolean;
  canSubmit: boolean;
  onOpenChange: (open: boolean) => void;
  onArticleDraftChange: (draft: ArticleCreateDraft) => void;
  onCommentDraftChange: (draft: CommentCreateDraft) => void;
  onSubmit: () => void;
}

export function SearchCreateModal({
  open,
  type,
  articleDraft,
  commentDraft,
  mutationBusy,
  canSubmit,
  onOpenChange,
  onArticleDraftChange,
  onCommentDraftChange,
  onSubmit
}: SearchCreateModalProps): React.JSX.Element | null {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div
      className='modal modal-open'
      data-testid='search-create-modal'
      tabIndex={-1}
      onKeyDown={e => {
        if (e.key === 'Escape') onOpenChange(false);
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void onSubmit();
      }}
    >
      <div className='modal-box max-w-2xl' aria-labelledby='search-create-title' aria-modal='true' role='dialog'>
        <div className='flex items-start justify-between gap-3'>
          <h2 className='text-lg font-semibold' id='search-create-title'>
            {type === 'article' ? t('page.search.createArticle') : t('page.search.createComment')}
          </h2>
          <button
            type='button'
            className='btn btn-ghost btn-sm btn-circle'
            onClick={() => onOpenChange(false)}
            aria-label={t('common.close')}
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
              <path d='M18 6 6 18' />
              <path d='m6 6 12 12' />
            </svg>
          </button>
        </div>

        {type === 'article' ?
          <div className='mt-4 grid gap-3 sm:grid-cols-2'>
            <label className='floating-label sm:col-span-2'>
              <input
                type='text'
                className='input input-bordered w-full'
                placeholder={t('page.search.titleField')}
                value={articleDraft.title}
                onChange={e => onArticleDraftChange({ ...articleDraft, title: e.target.value })}
                autoFocus
              />
              <span>{t('page.search.titleField')}</span>
            </label>
            <label className='floating-label sm:col-span-2'>
              <textarea
                className='textarea textarea-bordered min-h-28 w-full'
                placeholder={t('page.search.bodyField')}
                value={articleDraft.body}
                onChange={e => onArticleDraftChange({ ...articleDraft, body: e.target.value })}
              />
              <span>{t('page.search.bodyField')}</span>
            </label>
            <label className='floating-label'>
              <select
                className='select select-bordered w-full'
                value={articleDraft.category}
                onChange={e =>
                  onArticleDraftChange({ ...articleDraft, category: e.target.value as ArticleCreateDraft['category'] })
                }
              >
                <option value='tech'>tech</option>
                <option value='life'>life</option>
                <option value='travel'>travel</option>
              </select>
              <span>{t('page.search.categoryField')}</span>
            </label>
            <label className='floating-label'>
              <input
                type='number'
                className='input input-bordered w-full'
                placeholder={t('page.search.viewsField')}
                value={articleDraft.viewCount}
                onChange={e => {
                  const n = Number(e.target.value);
                  onArticleDraftChange({ ...articleDraft, viewCount: Number.isFinite(n) ? n : 0 });
                }}
              />
              <span>{t('page.search.viewsField')}</span>
            </label>
            <label className='floating-label'>
              <input
                type='text'
                className='input input-bordered w-full'
                placeholder={t('page.search.authorIdField')}
                value={articleDraft.authorId}
                onChange={e => onArticleDraftChange({ ...articleDraft, authorId: e.target.value })}
              />
              <span>{t('page.search.authorIdField')}</span>
            </label>
            <label className='floating-label'>
              <input
                type='text'
                className='input input-bordered w-full'
                placeholder={t('page.search.tagsPlaceholder')}
                value={articleDraft.tagsText}
                onChange={e => onArticleDraftChange({ ...articleDraft, tagsText: e.target.value })}
              />
              <span>{t('page.search.tagsField')}</span>
            </label>
          </div>
        : <div className='mt-4 grid gap-3'>
            <label className='floating-label'>
              <input
                type='text'
                className='input input-bordered w-full'
                placeholder={t('page.search.articleIdField')}
                value={commentDraft.articleId}
                onChange={e => onCommentDraftChange({ ...commentDraft, articleId: e.target.value })}
                autoFocus
              />
              <span>{t('page.search.articleIdField')}</span>
            </label>
            <label className='floating-label'>
              <input
                type='text'
                className='input input-bordered w-full'
                placeholder={t('page.search.authorField')}
                value={commentDraft.authorName}
                onChange={e => onCommentDraftChange({ ...commentDraft, authorName: e.target.value })}
              />
              <span>{t('page.search.authorField')}</span>
            </label>
            <label className='floating-label'>
              <textarea
                className='textarea textarea-bordered min-h-28 w-full'
                placeholder={t('page.search.contentField')}
                value={commentDraft.content}
                onChange={e => onCommentDraftChange({ ...commentDraft, content: e.target.value })}
              />
              <span>{t('page.search.contentField')}</span>
            </label>
          </div>
        }

        <div className='modal-action'>
          <button type='button' className='btn btn-ghost' onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </button>
          <button
            type='button'
            className='btn btn-primary'
            disabled={mutationBusy || !canSubmit}
            onClick={() => void onSubmit()}
            data-testid='search-create-submit'
          >
            {t('common.create')}
          </button>
        </div>
      </div>
      <button type='button' className='modal-backdrop' onClick={() => onOpenChange(false)} aria-label={t('common.close')} />
    </div>
  );
}
