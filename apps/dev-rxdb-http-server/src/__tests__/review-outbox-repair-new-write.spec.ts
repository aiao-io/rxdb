import { countQueryCacheOutbox, flushQueryCacheOutbox, pendingQueryCacheWriteIds } from '@aiao/rxdb-plugin-sync';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { createReviewHttpSqlite, META, ONE, ORIGINAL, TARGET_ID } from './fixtures/review-http-sqlite-harness.ts';

const setupConflict = async () => {
  const ctx = await createReviewHttpSqlite();
  try {
    await firstValueFrom(ctx.local.upsertMany(META.name, [ORIGINAL]));
    ctx.goOffline();
    await ctx.repository.update(ctx.toEntity(ORIGINAL), { title: 'offline-A' });
    const [localChange] = await ctx.pendingChanges();
    const remoteWinner = await ctx.patchRemote('remote-winner');
    expect(new Date(remoteWinner.updatedAt).getTime()).toBeGreaterThan(localChange.createdAt.getTime());
    const gate = ctx.proxy.holdNextByIds();
    const flushing = flushQueryCacheOutbox(ctx.rxdb, META.namespace, META.name);
    return { ctx, gate, flushing };
  } catch (error) {
    await ctx.close();
    throw error;
  }
};

const addNewWrite = async (ctx: Awaited<ReturnType<typeof createReviewHttpSqlite>>) => {
  ctx.goOffline();
  await ctx.repository.update(ctx.toEntity(ORIGINAL), { title: 'offline-B' });
  expect(ctx.readSqliteTitle()).toBe('offline-B');
};

describe('评审复验：outbox 接受远端旧判决不能覆盖本轮之后的新离线写', () => {
  it('KEEP_REMOTE 修复响应迟到时，保留新离线写与原生 SQLite 的对应投影', async () => {
    const { ctx, gate, flushing } = await setupConflict();
    try {
      await gate.started;
      await addNewWrite(ctx);
      const changes = await ctx.pendingChanges();
      expect(changes).toHaveLength(2);
      gate.release();
      const result = await flushing;
      expect(result.failures).toEqual([]);
      expect(result.discarded).toBe(1);
      expect(result.watermark).toBe(changes[0].id);
      const pending = await pendingQueryCacheWriteIds(ctx.rxdb, META.namespace, META.name);
      expect(pending.has(TARGET_ID)).toBe(true);
      expect(await countQueryCacheOutbox(ctx.rxdb)).toBe(1);
      const title = ctx.readSqliteTitle();
      const [presented] = await firstValueFrom(ctx.repository.find({ where: ONE, offlineFallback: true }));
      console.info(
        'REVIEW_HTTP_SQLITE',
        JSON.stringify({
          scenario: 'outbox-late-repair',
          result,
          changes: changes.map(row => ({ id: row.id, patch: row.patch, createdAt: row.createdAt })),
          pending: [...pending],
          sqliteTitle: title,
          presentedTitle: presented?.title,
          remoteRows: await ctx.remoteRows()
        })
      );
      expect.soft(title).toBe('offline-B');
      expect.soft(presented?.title).toBe('offline-B');
    } finally {
      gate.release();
      await flushing;
      await ctx.close();
    }
  }, 30000);

  it('对照：旧修复已落地后再写 B，本地 B 和待推记录保持一致', async () => {
    const { ctx, gate, flushing } = await setupConflict();
    try {
      await gate.started;
      gate.release();
      await flushing;
      expect(ctx.readSqliteTitle()).toBe('remote-winner');
      await addNewWrite(ctx);
      expect(await countQueryCacheOutbox(ctx.rxdb)).toBe(1);
      expect(ctx.readSqliteTitle()).toBe('offline-B');
      expect(ctx.proxy.errors).toEqual([]);
    } finally {
      gate.release();
      await flushing;
      await ctx.close();
    }
  }, 30000);
});
