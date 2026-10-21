import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { createSearchHandle, type SearchHandle, type SearchResult } from '@aiao/rxdb-plugin-search';
import { filter, firstValueFrom, take } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BoardDomain } from '../board-domain.js';
import { Board, BoardLabel, Column, Task, TaskLabel } from '../entities/index.js';
import { readFirst, whereEq } from '../query.js';
import { BoardSearchSource, type BoardSearchUpstream } from '../search/board-search-source.js';
import { ISOLATION_BOARD_ID, RELEASE_BOARD_ID, seedReleaseBoardDataset } from '../testing/index.js';

/**
 * 板级搜索源（US-538 服务层）：真实 PGlite 上的板数据 + 桩上游全文源。
 * 上游是引擎（FTS5 / pg-tsvector），本套用例钉住领域源的过滤、分页、
 * 请求失效与失败三来源的区分；真实 FTS 组合在浏览器趟与 demo e2e 验收。
 */

const hit = (id: string, rank: number, snippet = `片段-${id}`): SearchResult => ({
  entity: 'Task',
  collection: 'task',
  id,
  rank,
  matchedField: 'title',
  snippet
});

/** 桩上游：返回固定命中；可选延迟与失败注入；计数每次检索。 */
const stubUpstream = (hits: SearchResult[], options: { delayMs?: number; fail?: boolean } = {}) => {
  let calls = 0;
  const upstream: BoardSearchUpstream = {
    searchCollection: (_collection, query, _options) => {
      calls++;
      const handle = createSearchHandle({
        performSearch: async () => {
          if (options.delayMs) await new Promise(resolve => setTimeout(resolve, options.delayMs));
          if (options.fail) throw new Error('搜索执行失败');
          return { results: hits, hasMore: false };
        },
        isSearchableQuery: q => q.trim().length > 0,
        debounceMs: 0
      });
      handle.setQuery(query);
      return handle;
    }
  };
  return { upstream, calls: () => calls };
};

describe('BoardSearchSource 板级搜索源（US-538）', () => {
  /** 等句柄状态离开 loading / idle 后读取结果快照。 */
  const settledResults = async (handle: SearchHandle) => {
    await firstValueFrom(
      handle.state$.pipe(
        filter(s => s === 'success' || s === 'empty' || s === 'error'),
        take(1)
      )
    );
    return firstValueFrom(handle.results$);
  };

  let rxdb: RxDB;
  let domain: BoardDomain;
  let ctx: { boardId: string | null; restoring: boolean };
  let mainTaskIds: string[] = [];
  let isolationTaskIds: string[] = [];

  const taskRepo = () => rxdb.entityManager.getRepository(Task);

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: `board-search-${Math.random().toString(36).slice(2)}`,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');
    await seedReleaseBoardDataset(rxdb);
    ctx = { boardId: null, restoring: false };
    domain = new BoardDomain(rxdb, () => ctx);

    const mainColumns = await readFirst(
      rxdb.entityManager.getRepository(Column).find({ where: whereEq('boardId', RELEASE_BOARD_ID) })
    );
    const isolationColumns = await readFirst(
      rxdb.entityManager.getRepository(Column).find({ where: whereEq('boardId', ISOLATION_BOARD_ID) })
    );
    mainTaskIds = (
      await readFirst(
        taskRepo().find({
          where: {
            combinator: 'and',
            rules: [{ field: 'columnId', operator: 'in', value: mainColumns.map(c => c.id) }]
          }
        })
      )
    ).map(t => t.id);
    isolationTaskIds = (await readFirst(taskRepo().find({ where: whereEq('columnId', isolationColumns[0].id) }))).map(
      t => t.id
    );
  });

  afterEach(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('AC#1 / #7：只返回当前板命中，异板高排位命中不挤空；本地分页无遗漏无重复', async () => {
    ctx.boardId = RELEASE_BOARD_ID;
    // 上游：隔离板 8 条高排位（rank 0..7）+ 主板 6 条（rank 100..105），共 14 条 > 一页
    const hits = [
      ...isolationTaskIds.map((id, index) => hit(id, index)),
      ...mainTaskIds.slice(0, 6).map((id, index) => hit(id, 100 + index))
    ];
    const { upstream } = stubUpstream(hits);
    const source = new BoardSearchSource(rxdb, () => ctx, upstream, { debounceMs: 0 });
    const handle = source.search('同步');

    const first = await settledResults(handle);
    expect(first).toHaveLength(5);
    expect(first.every(r => mainTaskIds.includes(r.id))).toBe(true);
    expect(first.map(r => r.rank)).toEqual([100, 101, 102, 103, 104]);
    expect(await firstValueFrom(handle.hasMore$)).toBe(true);

    await handle.loadMore();
    // 句柄按页拼接结果：第二页追加到第一页
    const accumulated = await settledResults(handle);
    expect(accumulated.map(r => r.id)).toEqual(mainTaskIds.slice(0, 6));
    expect(await firstValueFrom(handle.hasMore$)).toBe(false);
    // 无遗漏无重复
    expect(new Set(accumulated.map(r => r.id)).size).toBe(6);
    handle.destroy();
  });

  it('已删除任务 / 已删除列的任务自然不在结果中（不复活）', async () => {
    ctx.boardId = RELEASE_BOARD_ID;
    const ghostId = 'e0000000-0000-4000-8000-999999999999';
    const { upstream } = stubUpstream([hit(ghostId, 1), hit(mainTaskIds[0], 10)]);
    const handle = new BoardSearchSource(rxdb, () => ctx, upstream, { debounceMs: 0 }).search('x');
    const results = await settledResults(handle);
    expect(results.map(r => r.id)).toEqual([mainTaskIds[0]]);
    handle.destroy();
  });

  it('AC#3：上游完成后无匹配才显示 empty；空输入回到 idle 不报空结果错误', async () => {
    ctx.boardId = RELEASE_BOARD_ID;
    const { upstream } = stubUpstream([]);
    const handle = new BoardSearchSource(rxdb, () => ctx, upstream, { debounceMs: 0 }).search('zzzz');
    await firstValueFrom(
      handle.state$.pipe(
        filter(s => s !== 'loading' && s !== 'idle'),
        take(1)
      )
    );
    expect(await firstValueFrom(handle.state$)).toBe('empty');

    const idleHandle = new BoardSearchSource(rxdb, () => ctx, upstream, { debounceMs: 0 }).search('');
    expect(await firstValueFrom(idleHandle.state$)).toBe('idle');
    idleHandle.destroy();
    handle.destroy();
  });

  it('AC#5：查询执行失败显示错误与重试，不伪装为无匹配', async () => {
    ctx.boardId = RELEASE_BOARD_ID;
    const { upstream } = stubUpstream([], { fail: true });
    const handle = new BoardSearchSource(rxdb, () => ctx, upstream, { debounceMs: 0 }).search('同步');
    await firstValueFrom(
      handle.state$.pipe(
        filter(s => s === 'error'),
        take(1)
      )
    );
    expect(await firstValueFrom(handle.state$)).toBe('error');
    expect(await firstValueFrom(handle.error$)).toBeInstanceOf(Error);
    handle.destroy();
  });

  it('AC#8：切板立即丢弃旧查询——上游未返回时切板，迟到结果不回填', async () => {
    ctx.boardId = RELEASE_BOARD_ID;
    const { upstream } = stubUpstream([hit(mainTaskIds[0], 1)], { delayMs: 120 });
    const handle = new BoardSearchSource(rxdb, () => ctx, upstream, { debounceMs: 0 }).search('同步');
    // 查询未返回时切到隔离板
    await new Promise(resolve => setTimeout(resolve, 30));
    ctx.boardId = ISOLATION_BOARD_ID;
    const results = await settledResults(handle);
    // 迟到结果被丢弃：旧板命中不回填
    expect(results).toHaveLength(0);
    handle.destroy();
  });

  it('AC#6：任务 / 列数据变更触发重查（事件订阅直通 pipeline）', async () => {
    ctx.boardId = RELEASE_BOARD_ID;
    const { upstream, calls } = stubUpstream([hit(mainTaskIds[0], 1)]);
    const handle = new BoardSearchSource(rxdb, () => ctx, upstream, { debounceMs: 0 }).search('同步');
    await settledResults(handle);
    const before = calls();

    // 建任务触发事件 → 变更绕过防抖直通重查
    const column = (
      await readFirst(rxdb.entityManager.getRepository(Column).find({ where: whereEq('boardId', RELEASE_BOARD_ID) }))
    )[0];
    await domain.createTask({ columnId: column.id, title: '同步新任务' });
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(calls()).toBeGreaterThan(before);
    handle.destroy();
  });

  it('无当前板时结果为空且不发起上游检索', async () => {
    ctx.boardId = null;
    const { upstream, calls } = stubUpstream([hit('x', 1)]);
    const handle = new BoardSearchSource(rxdb, () => ctx, upstream, { debounceMs: 0 }).search('同步');
    const results = await settledResults(handle);
    expect(results).toHaveLength(0);
    expect(calls()).toBe(0);
    handle.destroy();
  });
});
