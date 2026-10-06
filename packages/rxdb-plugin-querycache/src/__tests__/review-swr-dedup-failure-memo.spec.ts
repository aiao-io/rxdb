import type { QueryCacheEntityMetadata } from '@aiao/rxdb';
import { firstValueFrom, of, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ALL, createReviewQueryCache, OLD_ROW } from './fixtures/review-querycache-harness.js';

const nextTurn = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const metadata = (): QueryCacheEntityMetadata[] => [{ id: OLD_ROW.id, updatedAt: OLD_ROW.updatedAt }];

const runSWR = (ctx: ReturnType<typeof createReviewQueryCache>, limit: number) =>
  firstValueFrom(ctx.repository.find({ where: ALL, localCacheFirst: true, limit }));

describe('评审复验：SWR 去重不能把失败同步记成已校验', () => {
  it('两个不同分页查询共用一次失败回源，随后查询必须重新校验远端', async () => {
    const ctx = createReviewQueryCache();
    const reply = new Subject<QueryCacheEntityMetadata[]>();
    ctx.remote.fetchMetadata.mockReturnValueOnce(reply.asObservable());
    try {
      await Promise.all([runSWR(ctx, 1), runSWR(ctx, 2)]);
      expect(ctx.remote.fetchMetadata).toHaveBeenCalledTimes(1);
      reply.error(Object.assign(new Error('Unauthorized'), { status: 401 }));
      await nextTurn();
      ctx.remote.fetchMetadata.mockReturnValue(of(metadata()));
      await runSWR(ctx, 3);
      expect(ctx.remote.fetchMetadata).toHaveBeenCalledTimes(2);
    } finally {
      reply.complete();
      await ctx.rxdb.destroy();
    }
  });

  it('对照：单个 SWR 查询回源失败后，不留下已校验记忆', async () => {
    const ctx = createReviewQueryCache();
    const reply = new Subject<QueryCacheEntityMetadata[]>();
    ctx.remote.fetchMetadata.mockReturnValueOnce(reply.asObservable());
    try {
      await runSWR(ctx, 1);
      reply.error(Object.assign(new Error('Unauthorized'), { status: 401 }));
      await nextTurn();
      ctx.remote.fetchMetadata.mockReturnValue(of(metadata()));
      await runSWR(ctx, 3);
      expect(ctx.remote.fetchMetadata).toHaveBeenCalledTimes(2);
    } finally {
      reply.complete();
      await ctx.rxdb.destroy();
    }
  });

  it('对照：共享回源成功后，窗口内后续分页查询可以复用已校验记忆', async () => {
    const ctx = createReviewQueryCache();
    const reply = new Subject<QueryCacheEntityMetadata[]>();
    ctx.remote.fetchMetadata.mockReturnValueOnce(reply.asObservable());
    try {
      await Promise.all([runSWR(ctx, 1), runSWR(ctx, 2)]);
      reply.next(metadata());
      reply.complete();
      await nextTurn();
      await runSWR(ctx, 3);
      expect(ctx.remote.fetchMetadata).toHaveBeenCalledTimes(1);
    } finally {
      reply.complete();
      await ctx.rxdb.destroy();
    }
  });
});
