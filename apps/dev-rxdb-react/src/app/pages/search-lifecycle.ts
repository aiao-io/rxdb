export interface ExclusiveLock {
  current: boolean;
}

export type CancellationCheck = () => boolean;

export async function runExclusive<T>(lock: ExclusiveLock, action: () => Promise<T>): Promise<T | undefined> {
  if (lock.current) return undefined;
  lock.current = true;
  try {
    return await action();
  } finally {
    lock.current = false;
  }
}

interface InitializeSearchRecordsOptions<Article, Comment> {
  loadArticles: () => Promise<Article[]>;
  loadComments: () => Promise<Comment[]>;
  seed: (isCancelled: CancellationCheck) => Promise<void>;
  commit: (articles: Article[], comments: Comment[]) => void;
  isCancelled: CancellationCheck;
}

export async function initializeSearchRecords<Article, Comment>({
  loadArticles,
  loadComments,
  seed,
  commit,
  isCancelled
}: InitializeSearchRecordsOptions<Article, Comment>): Promise<void> {
  const articles = await loadArticles();
  if (isCancelled()) return;

  const comments = await loadComments();
  if (isCancelled()) return;

  if (articles.length === 0 && comments.length === 0) {
    await seed(isCancelled);
    return;
  }

  commit(articles, comments);
}
