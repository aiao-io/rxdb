import {
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_UPDATE_EVENT,
  ENTITY_LOCAL_REMOVE_EVENT,
  type RxDB,
  type UUID
} from '@aiao/rxdb';
import {
  createSearchHandle,
  type SearchExecutionError,
  type SearchHandle,
  type SearchOptions,
  type SearchResult,
  type SearchSourceLike
} from '@aiao/rxdb-plugin-search';
import { filter, firstValueFrom, take } from 'rxjs';

import { Column } from '../entities/column.entity.js';
import { Task } from '../entities/task.entity.js';
import { BoardHostContext } from '../host-context.js';
import { matchAll, readFirst, whereEq } from '../query.js';

/**
 * @fileoverview 板级搜索源（US-530）
 *
 * 现有 scope 只到实体、不到行：`SearchOptions.collections` 是实体名 / 表名 allowlist，
 * `SearchResult` 没有板或列字段。所以板内搜索由领域源完成：
 * 一次查询取全上游命中（`pageSize` = 全部任务数，全部命中在第 0 页一次返回），
 * 与当前板任务求交后在本地分页；上游未返回前保持加载态，不显示「无匹配」，
 * 也不把上游的 `hasMore` 当成当前板的 `hasMore`。
 *
 * 插件的翻页不是同一查询的连续切片（第 0 页取 `pageSize + 1` 条，`loadMore()`
 * 另发池查询，集合内缺少确定次序）——页边界上可能重复也可能漏项，本地去重补不回
 * 漏项。所以本源**不调用 `loadMore()`**。
 */

/** 上游全文源：取全部命中所需的单 collection 检索（插件实例或测试替身）。 */
export interface BoardSearchUpstream {
  searchCollection(collection: string, query: string, options?: SearchOptions): SearchHandle;
}

export interface BoardSearchSourceOptions {
  /** 查询防抖（默认沿用引擎 300ms）。 */
  readonly debounceMs?: number;
  /** 板内页大小（固定，三端对拍同值）。 */
  readonly pageSize?: number;
  /** 变更重查合并窗口（默认沿用引擎 80ms）。 */
  readonly refreshAuditMs?: number;
}

/** 板内页大小的默认值：隔离板与主板命中各超过一页的搜索分页验收依据。 */
export const DEFAULT_BOARD_SEARCH_PAGE_SIZE = 5;

/** 等上游句柄离开 loading（success / empty / error）；error 时抛出执行错误。 */
const waitUpstreamSettled = async (handle: SearchHandle): Promise<void> => {
  const state = await firstValueFrom(handle.state$.pipe(filter(s => s !== 'loading'), take(1)));
  if (state === 'error') {
    const error = await firstValueFrom(handle.error$);
    throw error ?? new Error('搜索执行失败');
  }
};

/**
 * 板级搜索源：符合 {@link SearchSourceLike}，三端绑定消费同一实现。
 * 上游全文源由宿主注入（插件实例），未安装或 adapter 不支持由宿主在入口禁用
 * （US-530 AC#5），本类在 `search()` 前不做能力预检。
 */
export class BoardSearchSource implements SearchSourceLike {
  constructor(
    private readonly rxdb: RxDB,
    private readonly ctx: () => BoardHostContext,
    private readonly upstream: BoardSearchUpstream,
    private readonly options: BoardSearchSourceOptions = {}
  ) {}

  search(query: string, _options?: SearchOptions): SearchHandle {
    const handle = createSearchHandle({
      performSearch: (q, page, signal) => this.performBoardSearch(q, page, signal),
      isSearchableQuery: q => q.trim().length > 0,
      debounceMs: this.options.debounceMs ?? 300,
      subscribeDataChanges: onChange => this.subscribeBoardChanges(onChange),
      refreshAuditMs: this.options.refreshAuditMs ?? 80
    });
    // SearchSourceLike 契约：search() 返回已执行查询的句柄
    handle.setQuery(query);
    return handle;
  }

  private async performBoardSearch(
    query: string,
    page: number,
    signal?: AbortSignal
  ): Promise<{ readonly results: readonly SearchResult[]; readonly hasMore: boolean }> {
    const boardId = this.ctx().boardId;
    if (boardId === null) return { results: [], hasMore: false };

    // 一次取全：pageSize = 全部任务数，全部命中在第 0 页一次返回
    const taskCount = await this.countAllTasks();
    const upstream = this.upstream.searchCollection('Task', query, { pageSize: Math.max(taskCount, 1) });
    try {
      await waitUpstreamSettled(upstream);
      const hits = await firstValueFrom(upstream.results$);

      // 请求已过期（切板 / 换词 / 恢复切库）时丢弃结果，不回填旧板
      if (signal?.aborted || this.ctx().boardId !== boardId) return { results: [], hasMore: false };

      const boardTaskIds = new Set(await this.currentBoardTaskIds(boardId));
      const filtered = hits
        .filter(hit => boardTaskIds.has(hit.id))
        .sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

      const pageSize = this.options.pageSize ?? DEFAULT_BOARD_SEARCH_PAGE_SIZE;
      const slice = filtered.slice(page * pageSize, (page + 1) * pageSize);
      return { results: slice, hasMore: (page + 1) * pageSize < filtered.length };
    } finally {
      upstream.destroy();
    }
  }

  private async countAllTasks(): Promise<number> {
    return firstValueFrom(this.rxdb.entityManager.getRepository(Task).count({ where: matchAll() }));
  }

  /** 当前板全部任务 id（板由列推导，命中 id 与视图已加载的任务求交）。 */
  private async currentBoardTaskIds(boardId: UUID): Promise<readonly string[]> {
    const columns = await readFirst(this.rxdb.entityManager.getRepository(Column).find({ where: whereEq('boardId', boardId) }));
    const columnIds = columns.map(column => column.id);
    if (columnIds.length === 0) return [];
    const tasks = await readFirst(
      this.rxdb.entityManager
        .getRepository(Task)
        .find({ where: { combinator: 'and', rules: [{ field: 'columnId', operator: 'in', value: columnIds }] } })
    );
    return tasks.map(task => task.id);
  }

  /** 任务 / 列的数据变更使本次请求失效并重查（事务内的事件在 COMMIT 后派发）。 */
  private subscribeBoardChanges(onChange: () => void): () => void {
    const listener = (event: { readonly type: string; readonly entities?: readonly { namespace?: string; entity?: string }[] }): void => {
      const relevant = event.entities?.some(data => data.namespace === 'board' && (data.entity === 'Task' || data.entity === 'Column'));
      if (relevant) onChange();
    };
    this.rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
    this.rxdb.addEventListener(ENTITY_LOCAL_UPDATE_EVENT, listener);
    this.rxdb.addEventListener(ENTITY_LOCAL_REMOVE_EVENT, listener);
    return () => {
      this.rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
      this.rxdb.removeEventListener(ENTITY_LOCAL_UPDATE_EVENT, listener);
      this.rxdb.removeEventListener(ENTITY_LOCAL_REMOVE_EVENT, listener);
    };
  }
}

export type BoardSearchExecutionError = SearchExecutionError;
