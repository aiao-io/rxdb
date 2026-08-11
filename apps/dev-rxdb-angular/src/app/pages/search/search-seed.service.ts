import { type EntityType, RxDB } from '@aiao/rxdb';
import { SEARCH_PARITY_ARTICLES, SEARCH_PARITY_COMMENTS, withSeedLock } from '@aiao/rxdb-test';
import { Article, Comment } from '@aiao/rxdb-test/entities';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

const SEARCH_PARITY_ARTICLE_IDS = new Set<string>(
  SEARCH_PARITY_ARTICLES.map(article => article.id).filter((id): id is string => Boolean(id))
);
const SEARCH_PARITY_COMMENT_IDS = new Set<string>(
  SEARCH_PARITY_COMMENTS.map(comment => comment.id).filter((id): id is string => Boolean(id))
);

/**
 * `/search` demo 共用的 parity seed 处理。
 *
 * 与 React / Vue 端 (`@aiao/rxdb-test/cross-framework-fixtures`) 共享同一份固定 ID
 * 数据集；该服务在打开 demo 页时按需补齐缺失记录，保证三端 E2E 数据完全一致。
 */
@Injectable()
export class SearchSeedService {
  private readonly rxdb = inject(RxDB);
  readonly seeding = signal(false);

  async removeLegacySeedData(): Promise<void> {
    const [articles, comments] = await Promise.all([this.list(Article), this.list(Comment)]);
    const parityArticles = articles.filter(article => SEARCH_PARITY_ARTICLE_IDS.has(String(article.id)));
    const parityComments = comments.filter(comment => SEARCH_PARITY_COMMENT_IDS.has(String(comment.id)));

    if (parityArticles.length > 0) await this.rxdb.entityManager.removeMany(parityArticles);
    if (parityComments.length > 0) await this.rxdb.entityManager.removeMany(parityComments);
  }

  /** 补齐缺失的 parity 数据；返回最终条目数。 */
  async seed(): Promise<{ article: number; comment: number } | null> {
    if (this.seeding()) return null;
    this.seeding.set(true);
    try {
      return await withSeedLock(this.rxdb, async () => {
        const articleRepo = this.rxdb.entityManager.getRepository(Article);
        const commentRepo = this.rxdb.entityManager.getRepository(Comment);
        const [existingArticles, existingComments] = await Promise.all([this.list(Article), this.list(Comment)]);
        const existingArticleIds = new Set<string>(existingArticles.map(article => String(article.id)));
        const existingCommentIds = new Set<string>(existingComments.map(comment => String(comment.id)));

        const articleSetComplete =
          SEARCH_PARITY_ARTICLE_IDS.size > 0 && [...SEARCH_PARITY_ARTICLE_IDS].every(id => existingArticleIds.has(id));
        const commentSetComplete =
          SEARCH_PARITY_COMMENT_IDS.size > 0 && [...SEARCH_PARITY_COMMENT_IDS].every(id => existingCommentIds.has(id));

        if (articleSetComplete && commentSetComplete) {
          return {
            article: SEARCH_PARITY_ARTICLES.length,
            comment: SEARCH_PARITY_COMMENTS.length
          };
        }

        for (const a of SEARCH_PARITY_ARTICLES) {
          if (a.id && existingArticleIds.has(a.id)) continue;
          await articleRepo.create(Object.assign(new Article(), a));
        }
        for (const c of SEARCH_PARITY_COMMENTS) {
          if (c.id && existingCommentIds.has(c.id)) continue;
          await commentRepo.create(Object.assign(new Comment(), c));
        }
        return {
          article: SEARCH_PARITY_ARTICLES.length,
          comment: SEARCH_PARITY_COMMENTS.length
        };
      });
    } finally {
      this.seeding.set(false);
    }
  }

  private async list<T extends EntityType>(entityType: T): Promise<InstanceType<T>[]> {
    const repo = this.rxdb.entityManager.getRepository(entityType);
    return firstValueFrom(repo.findAll({ where: { combinator: 'and', rules: [] } }));
  }
}
