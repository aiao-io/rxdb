import type { RxDB } from '@aiao/rxdb';
import { sqliteWasmFactory } from '@aiao/rxdb-adapter-sqlite-wasm/testing';
import {
  rxDBPluginSearch,
  type RxDBPluginSearch,
  type SearchHandle,
  type SearchResult
} from '@aiao/rxdb-plugin-search';
import { filter, firstValueFrom, take, type Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Board, BoardLabel, Column, Task, TaskLabel } from '../entities/index.js';
import { BoardSearchSource } from '../search/board-search-source.js';
import { ISOLATION_BOARD_ID, RELEASE_BOARD_ID, seedReleaseBoardDataset } from '../testing/index.js';

/**
 * 板内搜索的真实 FTS 组合（US-538）：sqlite-wasm FTS5 中日韩单双字索引。
 *
 * 索引侧同时写单字与双字，查询侧两字以上编译成双字的 AND 链，所以「登录」
 * 能命中「修复登录 bug」这类词中位置（US-538 技术笔记「中文搜索沿用实际后端契约」）。
 * 领域源的过滤 / 分页 / 失效逻辑在 node 趟（桩上游）验收，本趟只验真实引擎组合。
 */
describe('BoardSearchSource 真实 sqlite-wasm FTS5（US-538）', () => {
  const adapters: { disconnect(): Promise<void> }[] = [];
  let rxdb: RxDB;
  let ctx: { boardId: string | null; restoring: boolean };
  let plugin: RxDBPluginSearch;

  beforeEach(async () => {
    const adapter = await sqliteWasmFactory.createAdapter({
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      plugins: [rxDBPluginSearch]
    });
    adapters.push(adapter);
    rxdb = adapter.rxdb;
    await seedReleaseBoardDataset(rxdb);
    ctx = { boardId: RELEASE_BOARD_ID, restoring: false };
    const installed = rxdb.getPlugins('search');
    if (installed.length === 0) throw new Error('搜索插件未安装');
    plugin = installed[0] as RxDBPluginSearch;
  });

  afterEach(async () => {
    for (const adapter of adapters.splice(0)) {
      await adapter.disconnect().catch(() => undefined);
    }
  });

  const searchBoard = (query: string) => {
    const source = new BoardSearchSource(rxdb, () => ctx, plugin, { debounceMs: 0 });
    return source.search(query);
  };

  /** 等句柄离开 loading / idle 后读取结果快照。 */
  const settled = async (handle: SearchHandle): Promise<readonly SearchResult[]> => {
    await firstValueFrom(
      handle.state$.pipe(
        filter(s => s === 'success' || s === 'empty' || s === 'error'),
        take(1)
      )
    );
    return firstValueFrom(handle.results$ as Observable<readonly SearchResult[]>);
  };

  it('「登录」词中命中「修复登录 bug」（双字 AND 链）', async () => {
    const handle = searchBoard('登录');
    const results = await settled(handle);
    expect(results.map(r => r.id)).toEqual(['e0000000-0000-4000-8000-000000000000']);
    handle.destroy();
  });

  it('描述命中「回归」（标题与描述均进索引）', async () => {
    const handle = searchBoard('回归测试');
    const results = await settled(handle);
    expect(results.map(r => r.id)).toEqual(['e0000000-0000-4000-8000-000000000003']);
    handle.destroy();
  });

  it('「同步」：异板短标题高排位在前，领域源过滤后只留当前板且分页无遗漏', async () => {
    // 隔离板任务 id 集合（与主板区分，避免 id 前缀歧义）
    const { readFirst, whereEq } = await import('../query.js');
    const isolationColumns = await readFirst(
      rxdb.entityManager.getRepository(Column).find({ where: whereEq('boardId', ISOLATION_BOARD_ID) })
    );
    const isolationIds = new Set(
      (
        await readFirst(
          rxdb.entityManager.getRepository(Task).find({ where: whereEq('columnId', isolationColumns[0].id) })
        )
      ).map(task => task.id)
    );

    // 上游原始顺序：隔离板短标题 bm25 高排位（第 0 步实测的排位断言）
    const upstream = plugin.searchCollection('Task', '同步', { pageSize: 30 });
    const upstreamHits = await firstValueFrom(
      upstream.results$.pipe(
        filter(list => list.length > 0),
        take(1)
      )
    );
    const firstHitId = upstreamHits[0].id;
    const isolationFirst = upstreamHits.findIndex(hit => isolationIds.has(hit.id));
    const mainFirst = upstreamHits.findIndex(hit => !isolationIds.has(hit.id));
    expect(isolationIds.has(firstHitId)).toBe(true);
    expect(isolationFirst).toBeLessThan(mainFirst);
    upstream.destroy();

    // 领域源：当前板过滤 + 分页
    const handle = searchBoard('同步');
    const page1 = await settled(handle);
    expect(page1.length).toBeLessThanOrEqual(5);
    expect(page1.every(r => !isolationIds.has(r.id))).toBe(true);
    await handle.loadMore();
    const accumulated = await settled(handle);
    expect(accumulated.length).toBe(6);
    expect(new Set(accumulated.map(r => r.id)).size).toBe(6);
    handle.destroy();
  });

  it('切到隔离板后搜索同词只返回隔离板命中', async () => {
    const { readFirst, whereEq } = await import('../query.js');
    const isolationColumns = await readFirst(
      rxdb.entityManager.getRepository(Column).find({ where: whereEq('boardId', ISOLATION_BOARD_ID) })
    );
    const isolationIds = new Set(
      (
        await readFirst(
          rxdb.entityManager.getRepository(Task).find({ where: whereEq('columnId', isolationColumns[0].id) })
        )
      ).map(task => task.id)
    );
    ctx.boardId = ISOLATION_BOARD_ID;
    const handle = searchBoard('同步');
    const page1 = await settled(handle);
    expect(page1.length).toBe(5);
    expect(page1.every(r => isolationIds.has(r.id))).toBe(true);
    await handle.loadMore();
    const accumulated = await settled(handle);
    expect(accumulated.length).toBe(8);
    handle.destroy();
  });
});
