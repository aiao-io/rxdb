import type { Article } from '@aiao/rxdb-test/entities';

export const SEARCH_DEMO_COLLECTIONS = ['article', 'comment', 'todos'] as const;
export type SearchDemoCollection = (typeof SEARCH_DEMO_COLLECTIONS)[number];
export type SearchDemoMode = 'global' | 'custom';

export interface ArticleCreateDraft {
  title: string;
  body: string;
  category: Article['category'];
  tagsText: string;
  authorId: string;
  viewCount: number;
}

export interface CommentCreateDraft {
  articleId: string;
  content: string;
  authorName: string;
}

/** 集合 ID 与匹配字段 ID 的展示文案翻译器；Todo 是实体名，两端保持一致不翻译。 */
export type SearchLocalizer = (key: string) => string;

export function localizeCollection(t: SearchLocalizer, collection: string): string {
  if (collection === 'article') return t('page.search.collectionArticle');
  if (collection === 'comment') return t('page.search.collectionComment');
  if (collection === 'todos') return 'Todo';
  return collection;
}

export function localizeField(t: SearchLocalizer, field: string): string {
  const keys: Record<string, string> = {
    title: 'page.search.titleField',
    body: 'page.search.bodyField',
    content: 'page.search.contentField',
    authorName: 'page.search.authorField',
    authorId: 'page.search.authorIdField',
    category: 'page.search.categoryField',
    tags: 'page.search.tags'
  };
  const key = keys[field];
  return key ? t(key) : field;
}

export function collectionBadgeClass(collection: string): string {
  if (collection === 'article') return 'badge-primary';
  if (collection === 'comment') return 'badge-secondary';
  if (collection === 'todos') return 'badge-accent';
  return 'badge-ghost';
}
