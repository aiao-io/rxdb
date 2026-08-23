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

export function localizeCollection(collection: string): string {
  if (collection === 'article') return '文章';
  if (collection === 'comment') return '评论';
  if (collection === 'todos') return 'Todo';
  return collection;
}

export function localizeField(field: string): string {
  const map: Record<string, string> = {
    title: '标题',
    body: '正文',
    content: '内容',
    authorName: '作者',
    authorId: '作者 ID',
    category: '分类',
    tags: '标签'
  };
  return map[field] ?? field;
}

export function collectionBadgeClass(collection: string): string {
  if (collection === 'article') return 'badge-primary';
  if (collection === 'comment') return 'badge-secondary';
  if (collection === 'todos') return 'badge-accent';
  return 'badge-ghost';
}
