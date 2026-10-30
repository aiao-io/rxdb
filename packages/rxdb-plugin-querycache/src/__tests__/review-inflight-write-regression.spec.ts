import { defer, firstValueFrom, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
  ALL,
  createReviewQueryCache,
  holdReviewPull,
  NEW_ROW,
  OLD_ROW,
  type ReviewCachedArticle,
  type ReviewRow
} from './fixtures/review-querycache-harness.js';

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

/**
 * 远端在请求到达时就提交了更新，回执压在路上，`deliver()` 才交付。
 * `sent` 兑现时请求已经发出、远端状态已经改了 —— 先后由用例显式安排，不靠睡眠猜。
 */
const holdUpdateReceipt = (ctx: ReturnType<typeof createReviewQueryCache>) => {
  const reply = new Subject<ReviewRow>();
  let receipt: ReviewRow | undefined;
  let delivered = false;
  let announce!: () => void;
  const sent = new Promise<void>(resolve => {
    announce = resolve;
  });
  ctx.remote.update.mockImplementationOnce((_entity: string, id: string, patch: Partial<ReviewRow>) =>
    defer(() => {
      receipt = { ...NEW_ROW, ...patch, id };
      ctx.remoteRows.set(id, { ...receipt });
      announce();
      return reply.asObservable();
    })
  );
  const deliver = (): void => {
    if (receipt === undefined || delivered) return;
    delivered = true;
    reply.next({ ...receipt });
    reply.complete();
  };
  return { sent, deliver };
};

describe('评审复验：反序到达的在线写回执不能覆盖更晚发出的写', () => {
  it('更新回执滞留、随后的删除已确认：迟到的更新回执不把已删行写回本地缓存', async () => {
    const ctx = createReviewQueryCache(OLD_ROW);
    const held = holdUpdateReceipt(ctx);
    const entity = ctx.toEntity(OLD_ROW);
    const updating = ctx.repository.update(entity, { title: 'late-update' });
    try {
      await held.sent;
      await ctx.repository.remove(entity);
      expect(ctx.remoteRows.has('a')).toBe(false);
      expect(ctx.localRows.has('a')).toBe(false);

      held.deliver();
      await updating;

      expect(ctx.remoteRows.has('a')).toBe(false);
      expect(ctx.localRows.has('a')).toBe(false);
    } finally {
      held.deliver();
      await updating.catch(() => undefined);
      await ctx.rxdb.destroy();
    }
  });

  it('更新回执滞留期间断网、删除改走离线落了本地：迟到的更新回执不覆盖这次本地写', async () => {
    const ctx = createReviewQueryCache(OLD_ROW);
    const held = holdUpdateReceipt(ctx);
    const localRepository = ctx.local.getRepository();
    localRepository.remove.mockImplementationOnce(async (entity: ReviewCachedArticle) => {
      ctx.localRows.delete(entity.id);
      return entity;
    });
    const entity = ctx.toEntity(OLD_ROW);
    const updating = ctx.repository.update(entity, { title: 'late-update' });
    try {
      await held.sent;
      ctx.rxdb.reachability.report(new TypeError('Failed to fetch'));
      await ctx.repository.remove(entity);
      expect(localRepository.remove).toHaveBeenCalledTimes(1);
      expect(ctx.localRows.has('a')).toBe(false);

      held.deliver();
      await updating;

      expect(ctx.localRows.has('a')).toBe(false);
    } finally {
      held.deliver();
      await updating.catch(() => undefined);
      await ctx.rxdb.destroy();
    }
  });

  it('与读侧作废同时在场：旧 pull 与旧更新回执都晚于删除确认到达，本地仍不存在这一行', async () => {
    const ctx = createReviewQueryCache(staleLocal);
    const pull = holdReviewPull(ctx);
    const reading = firstValueFrom(ctx.repository.find({ where: ALL }));
    const held = holdUpdateReceipt(ctx);
    const entity = ctx.toEntity(staleLocal);
    let updating: Promise<unknown> = Promise.resolve();
    try {
      await pull.started;
      updating = ctx.repository.update(entity, { title: 'late-update' });
      await held.sent;
      await ctx.repository.remove(entity);

      held.deliver();
      await updating;
      pull.release();
      await reading;

      expect(ctx.remoteRows.has('a')).toBe(false);
      expect(ctx.localRows.has('a')).toBe(false);
    } finally {
      held.deliver();
      pull.release();
      await updating.catch(() => undefined);
      await reading.catch(() => undefined);
      await ctx.rxdb.destroy();
    }
  });
});
