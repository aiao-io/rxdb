import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ALL, createReviewQueryCache, holdReviewPull, NEW_ROW, OLD_ROW } from './fixtures/review-querycache-harness.js';

const staleLocal = { ...OLD_ROW, title: 'local-stale', updatedAt: '2026-10-01T00:00:00.000Z' };

describe('评审复验：旧响应不能回滚已经确认的 QueryCache 写', () => {
  it('远端与本地 update 已确认后，迟到的旧 pull 不应覆盖新投影', async () => {
    const ctx = createReviewQueryCache(staleLocal);
    const gate = holdReviewPull(ctx);
    const reading = firstValueFrom(ctx.repository.find({ where: ALL }));
    try {
      await gate.started;
      await ctx.repository.update(ctx.toEntity(staleLocal), { title: NEW_ROW.title });
      expect(ctx.remoteRows.get('a')?.title).toBe(NEW_ROW.title);
      expect(ctx.localRows.get('a')?.title).toBe(NEW_ROW.title);
      gate.release();
      await reading;
      expect(ctx.remoteRows.get('a')?.title).toBe(NEW_ROW.title);
      expect(ctx.localRows.get('a')?.title).toBe(NEW_ROW.title);
    } finally {
      gate.release();
      await reading;
      await ctx.rxdb.destroy();
    }
  });

  it('远端与本地 remove 已确认后，迟到的旧 pull 不应复活已删行', async () => {
    const ctx = createReviewQueryCache(staleLocal);
    const gate = holdReviewPull(ctx);
    const reading = firstValueFrom(ctx.repository.find({ where: ALL }));
    try {
      await gate.started;
      await ctx.repository.remove(ctx.toEntity(staleLocal));
      expect(ctx.remoteRows.has('a')).toBe(false);
      expect(ctx.localRows.has('a')).toBe(false);
      gate.release();
      await reading;
      expect(ctx.remoteRows.has('a')).toBe(false);
      expect(ctx.localRows.has('a')).toBe(false);
    } finally {
      gate.release();
      await reading;
      await ctx.rxdb.destroy();
    }
  });

  it('对照：先让 pull 完成，再 update，不会回滚已确认新投影', async () => {
    const ctx = createReviewQueryCache(staleLocal);
    const gate = holdReviewPull(ctx);
    const reading = firstValueFrom(ctx.repository.find({ where: ALL }));
    try {
      await gate.started;
      gate.release();
      await reading;
      await ctx.repository.update(ctx.toEntity(OLD_ROW), { title: NEW_ROW.title });
      expect(ctx.remoteRows.get('a')?.title).toBe(NEW_ROW.title);
      expect(ctx.localRows.get('a')?.title).toBe(NEW_ROW.title);
    } finally {
      await ctx.rxdb.destroy();
    }
  });
});
