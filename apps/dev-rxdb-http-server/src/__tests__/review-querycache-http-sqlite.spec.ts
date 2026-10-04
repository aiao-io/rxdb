import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { createReviewHttpSqlite, META, ONE, ORIGINAL } from './fixtures/review-http-sqlite-harness.ts';

const STALE = { ...ORIGINAL, title: 'local-stale', updatedAt: '2024-01-01T00:00:00.000Z' };

const probe = async (operation: 'update' | 'remove') => {
  const ctx = await createReviewHttpSqlite();
  const gate = ctx.proxy.holdNextByIds();
  let reading: Promise<unknown> | undefined;
  try {
    await firstValueFrom(ctx.local.upsertMany(META.name, [STALE]));
    reading = firstValueFrom(ctx.repository.find({ where: ONE }));
    const captured = await gate.started;
    expect(captured.status).toBe(200);
    expect(JSON.parse(captured.body)[0].title).toBe(ORIGINAL.title);
    const entity = ctx.toEntity(STALE);
    if (operation === 'update') await ctx.repository.update(entity, { title: 'confirmed-new' });
    else await ctx.repository.remove(entity);
    const expected = operation === 'update' ? 'confirmed-new' : undefined;
    expect(ctx.readSqliteTitle()).toBe(expected);
    gate.release();
    await reading;
    const afterOriginalRead = ctx.readSqliteTitle();
    await firstValueFrom(ctx.repository.find({ where: ONE, offlineFallback: true }));
    const actual = ctx.readSqliteTitle();
    const remoteRows = await ctx.remoteRows();
    console.info(
      'REVIEW_HTTP_SQLITE',
      JSON.stringify({
        scenario: operation,
        captured: JSON.parse(captured.body),
        cacheCommits: ctx.cacheCommits,
        afterOriginalRead: afterOriginalRead ?? null,
        sqliteTitle: actual ?? null,
        remoteRows
      })
    );
    expect(operation === 'update' ? remoteRows[0]?.title : remoteRows.length).toBe(
      operation === 'update' ? 'confirmed-new' : 0
    );
    expect(actual).toBe(expected);
  } finally {
    gate.release();
    if (reading) await reading;
    await ctx.close();
  }
};

describe('RV-053：实际 HTTP/PGlite 服务与文件 SQLite 的迟到响应', () => {
  it('在线对照：旧 update 响应之后新查询能够重新收敛 SQLite 行', () => probe('update'), 30000);
  it('在线对照：旧 remove 响应之后新查询能够再次清理 SQLite 行', () => probe('remove'), 30000);
  it('对照：先完成实际查询再写入，新值保留在服务端与 SQLite', async () => {
    const ctx = await createReviewHttpSqlite();
    try {
      await firstValueFrom(ctx.local.upsertMany(META.name, [STALE]));
      const [entity] = await firstValueFrom(ctx.repository.find({ where: ONE }));
      await ctx.repository.update(entity, { title: 'confirmed-new' });
      expect(ctx.readSqliteTitle()).toBe('confirmed-new');
      expect((await ctx.remoteRows())[0].title).toBe('confirmed-new');
      expect(ctx.proxy.errors).toEqual([]);
    } finally {
      await ctx.close();
    }
  }, 30000);
});

const offlineProbe = async (operation: 'update' | 'remove') => {
  const ctx = await createReviewHttpSqlite();
  const gate = ctx.proxy.holdNextByIds();
  let reading: Promise<unknown> | undefined;
  try {
    await firstValueFrom(ctx.local.upsertMany(META.name, [STALE]));
    reading = firstValueFrom(ctx.repository.find({ where: ONE })).then(
      rows => ({ rows }),
      error => ({ error: String(error) })
    );
    await gate.started;
    if (operation === 'update') await ctx.repository.update(ctx.toEntity(STALE), { title: 'confirmed-new' });
    else await ctx.repository.remove(ctx.toEntity(STALE));
    const expected = operation === 'update' ? 'confirmed-new' : undefined;
    expect(ctx.readSqliteTitle()).toBe(expected);
    const confirmedRemoteRows = await ctx.remoteRows();
    await ctx.stopOrigin();
    gate.release();
    const readOutcome = await reading;
    const offlineRows = await firstValueFrom(ctx.repository.find({ where: ONE, offlineFallback: true }));
    const actual = ctx.readSqliteTitle();
    console.info(
      'REVIEW_HTTP_SQLITE',
      JSON.stringify({
        scenario: `${operation}-origin-down`,
        confirmedRemoteRows,
        cacheCommits: ctx.cacheCommits,
        readOutcome,
        sqliteTitle: actual ?? null,
        offlineTitles: offlineRows.map(row => row.title)
      })
    );
    expect(actual).toBe(expected);
  } finally {
    gate.release();
    if (reading) await reading;
    await ctx.close();
  }
};

describe('RV-053 补证：写确认后 origin 停止，旧响应仍在代理缓冲区', () => {
  it('update 后网络中断仍应保留确认的新 SQLite 值', () => offlineProbe('update'), 30000);
  it('remove 后网络中断仍不能从旧响应复活 SQLite 行', () => offlineProbe('remove'), 30000);
});
