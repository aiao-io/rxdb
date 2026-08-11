import { type EntityType, RxDB } from '@aiao/rxdb';
import { Article, Comment } from '@aiao/rxdb-test/entities';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * `/search` demo 页用的记录维护与变更服务。
 *
 * 持有 article/comment 两个集合的本地快照（articleRecords / commentRecords）以及
 * mutation 状态（mutationBusy / mutationMessage / seedCount），并把所有 CRUD 包
 * 在 {@link runMutation} 串行化中。
 *
 * 抽出来是为了让 SearchPage 组件聚焦于搜索 UI，CRUD 与计数逻辑独立可测。
 */
@Injectable()
export class SearchRecordsService {
  private readonly rxdb = inject(RxDB);

  readonly articleRecords = signal<readonly Article[]>([]);
  readonly commentRecords = signal<readonly Comment[]>([]);
  readonly mutationBusy = signal(false);
  readonly mutationMessage = signal<string | null>(null);
  readonly seedCount = signal<{ article: number; comment: number } | null>(null);

  async refreshCounts(): Promise<void> {
    const [articles, comments] = await Promise.all([this.listEntities(Article), this.listEntities(Comment)]);
    this.articleRecords.set(articles);
    this.commentRecords.set(comments);
    this.seedCount.set({ article: articles.length, comment: comments.length });
  }

  async listEntities<T extends EntityType>(entityType: T): Promise<InstanceType<T>[]> {
    const repo = this.rxdb.entityManager.getRepository(entityType);
    return firstValueFrom(repo.findAll({ where: { combinator: 'and', rules: [] } }));
  }

  async findEntityById<T extends EntityType<object, { id: unknown }>>(
    entityType: T,
    id: string
  ): Promise<InstanceType<T> | undefined> {
    const entities = await this.listEntities(entityType);
    return entities.find(entity => String(entity.id) === id);
  }

  async createArticle(input: {
    title: string;
    body: string;
    category: Article['category'];
    tags: readonly string[];
    authorId: string;
    viewCount: number;
  }): Promise<string> {
    return this.runMutation(async () => {
      const article = new Article({
        title: input.title,
        body: input.body,
        category: input.category,
        tags: [...input.tags],
        authorId: input.authorId,
        viewCount: input.viewCount
      });
      await this.rxdb.entityManager.getRepository(Article).create(article);
      await this.refreshCounts();
      this.mutationMessage.set(`已创建文章 ${article.id}`);
      return String(article.id);
    });
  }

  async createComment(input: { articleId: string; content: string; authorName: string }): Promise<string> {
    return this.runMutation(async () => {
      const comment = new Comment({
        articleId: input.articleId,
        content: input.content,
        authorName: input.authorName
      });
      await this.rxdb.entityManager.getRepository(Comment).create(comment);
      await this.refreshCounts();
      this.mutationMessage.set(`已创建评论 ${comment.id}`);
      return String(comment.id);
    });
  }

  async updateArticle(id: string, token: string): Promise<void> {
    await this.runMutation(async () => {
      const article = await this.findEntityById(Article, id);
      if (!article) {
        this.mutationMessage.set(`未找到文章: ${id}`);
        return;
      }
      article.title = `${article.title} [updated]`;
      article.body = `${article.body} Updated with token ${token}.`;
      article.tags = [...new Set([...(article.tags ?? []), 'updated', token])];
      article.viewCount += 1;
      await article.save();
      await this.refreshCounts();
      this.mutationMessage.set(`已更新文章 ${id}`);
    });
  }

  async updateComment(id: string, token: string): Promise<void> {
    await this.runMutation(async () => {
      const comment = await this.findEntityById(Comment, id);
      if (!comment) {
        this.mutationMessage.set(`未找到评论: ${id}`);
        return;
      }
      comment.content = `${comment.content} Updated with token ${token}.`;
      comment.authorName = `${comment.authorName}-updated`;
      await comment.save();
      await this.refreshCounts();
      this.mutationMessage.set(`已更新评论 ${id}`);
    });
  }

  async removeArticle(id: string): Promise<void> {
    await this.runMutation(async () => {
      const article = await this.findEntityById(Article, id);
      if (!article) {
        this.mutationMessage.set(`未找到文章: ${id}`);
        return;
      }
      await article.remove();
      await this.refreshCounts();
      this.mutationMessage.set(`已删除文章 ${id}`);
    });
  }

  async removeComment(id: string): Promise<void> {
    await this.runMutation(async () => {
      const comment = await this.findEntityById(Comment, id);
      if (!comment) {
        this.mutationMessage.set(`未找到评论: ${id}`);
        return;
      }
      await comment.remove();
      await this.refreshCounts();
      this.mutationMessage.set(`已删除评论 ${id}`);
    });
  }

  resetMessage(): void {
    this.mutationMessage.set(null);
  }

  private async runMutation<T>(action: () => Promise<T>): Promise<T> {
    if (this.mutationBusy()) return undefined as T;
    this.mutationBusy.set(true);
    try {
      return await action();
    } finally {
      this.mutationBusy.set(false);
    }
  }
}
