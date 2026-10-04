import { countQueryCacheOutbox } from '@aiao/rxdb-plugin-sync';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { createReviewHttpSqlite, META, ORIGINAL } from './fixtures/review-http-sqlite-harness.ts';

const run = async (denyAuth: boolean) => {
  const ctx = await createReviewHttpSqlite();
  const success = vi.spyOn(ctx.rxdb.syncState, 'reportSuccess');
  try {
    await firstValueFrom(ctx.local.upsertMany(META.name, [ORIGINAL]));
    ctx.goOffline();
    await ctx.repository.update(ctx.toEntity(ORIGINAL), { title: 'pending-offline-write' });
    expect(await countQueryCacheOutbox(ctx.rxdb)).toBe(1);
    ctx.setDenyAuth(denyAuth);
    ctx.rxdb.syncState.reportError(new Error('上一轮错误'));
    ctx.rxdb.reachability.report(null);
    await vi.waitFor(() => expect(ctx.proxy.exchanges.some(row => row.path.endsWith('/recipes/metadata'))).toBe(true), {
      timeout: 10000
    });
    await vi.waitFor(() => expect(ctx.rxdb.syncState.snapshot.syncing).toBe(false), { timeout: 10000 });
    const state = ctx.rxdb.syncState.snapshot;
    console.info(
      'REVIEW_HTTP_SQLITE',
      JSON.stringify({
        scenario: denyAuth ? 'resume-401' : 'resume-success',
        state,
        reportSuccessCalls: success.mock.calls.length,
        exchanges: ctx.proxy.exchanges,
        pendingCount: await countQueryCacheOutbox(ctx.rxdb)
      })
    );
    if (denyAuth) {
      expect(ctx.proxy.exchanges.some(row => row.status === 401)).toBe(true);
      expect(await countQueryCacheOutbox(ctx.rxdb)).toBe(1);
      expect.soft(state.lastError).toMatchObject({ status: 401 });
      expect.soft(success).not.toHaveBeenCalled();
    } else {
      expect(await countQueryCacheOutbox(ctx.rxdb)).toBe(0);
      expect(state.lastError).toBeNull();
      expect(success).toHaveBeenCalledTimes(1);
      expect((await ctx.remoteRows())[0].title).toBe('pending-offline-write');
    }
    expect(ctx.proxy.errors).toEqual([]);
  } finally {
    success.mockRestore();
    await ctx.close();
  }
};

describe('RV-052：实际参考服务拒绝鉴权后的自动恢复状态', () => {
  it('服务端 401 留下真实 SQLite 待推写，不能宣布本轮成功', () => run(true), 30000);
  it('对照：真实 HTTP 写入成功后才清除旧错及待推计数', () => run(false), 30000);
});
