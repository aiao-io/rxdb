import { HttpResponseError } from '@aiao/rxdb-adapter-http';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { createReviewHttpSqlite, META, ONE, ORIGINAL } from './fixtures/review-http-sqlite-harness.ts';

const nextTurn = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const probe = async (consumers: number, denyAuth: boolean) => {
  const ctx = await createReviewHttpSqlite();
  let reported!: () => void;
  const responseReported = new Promise<void>(resolve => {
    reported = resolve;
  });
  const originalReport = ctx.rxdb.reachability.report.bind(ctx.rxdb.reachability);
  const reportSpy = vi.spyOn(ctx.rxdb.reachability, 'report').mockImplementation(error => {
    originalReport(error);
    if (error instanceof HttpResponseError && error.status === 401) reported();
  });
  const query = (limit: number) => firstValueFrom(ctx.repository.find({ where: ONE, localCacheFirst: true, limit }));
  try {
    await firstValueFrom(ctx.local.upsertMany(META.name, [ORIGINAL]));
    ctx.setDenyAuth(denyAuth);
    await Promise.all(Array.from({ length: consumers }, (_, index) => query(index + 1)));
    if (denyAuth) await responseReported;
    else
      await vi.waitFor(() =>
        expect(ctx.proxy.exchanges.some(row => row.path.endsWith('/recipes/metadata'))).toBe(true)
      );
    await nextTurn();
    const firstCount = ctx.proxy.exchanges.filter(row => row.path.endsWith('/recipes/metadata')).length;
    expect(firstCount).toBe(1);
    ctx.setDenyAuth(false);
    await query(3);
    const requestCount = () => ctx.proxy.exchanges.filter(row => row.path.endsWith('/recipes/metadata')).length;
    try {
      await vi.waitFor(() => expect(requestCount()).toBe(denyAuth ? 2 : 1), { timeout: 500, interval: 10 });
    } finally {
      console.info(
        'REVIEW_HTTP_SQLITE',
        JSON.stringify({
          scenario: `swr-${consumers}-${denyAuth ? '401' : 'success'}`,
          metadataRequests: requestCount(),
          exchanges: ctx.proxy.exchanges
        })
      );
    }
    expect(ctx.proxy.errors).toEqual([]);
  } finally {
    reportSpy.mockRestore();
    await ctx.close();
  }
};

describe('RV-054：实际 HTTP 401 的共享 SWR 结算', () => {
  it('两个分页消费者共享失败回源后，下一分页不能命中成功记忆', () => probe(2, true), 30000);
  it('对照：单消费者失败后下一分页重新回源', () => probe(1, true), 30000);
  it('对照：共享回源成功时下一分页允许复用记忆', () => probe(2, false), 30000);
});
