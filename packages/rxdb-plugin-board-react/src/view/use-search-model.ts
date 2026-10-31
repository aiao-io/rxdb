import type { UUID } from '@aiao/rxdb';
import type { BoardSearchUnavailableReason, SearchHandle, SearchResult } from '@aiao/rxdb-plugin-board';
import { useEffect, useRef, useState } from 'react';
import { Subscription } from 'rxjs';

import type { ModelGetter } from './model.js';
import type { SearchState } from './types.js';
import type { BoardData } from './use-board-data.js';
import { useStateRef } from './use-state-ref.js';
import type { ViewCore } from './use-view-core.js';

/** 板内全文搜索（US-539 阶段 B，收在搜索对话框里）。 */
export interface SearchModel {
  readonly searchQuery: string;
  readonly searchState: SearchState;
  readonly searchResults: readonly SearchResult[];
  readonly searchHasMore: boolean;
  readonly searchErrorText: string | null;
  readonly searchHighlightId: UUID | null;
  /** 输入变化：空查询销毁句柄退出搜索态；否则复用同一句柄。 */
  readonly onSearchInput: (value: string) => void;
  readonly onSearchMore: () => void;
  /** 点结果：关闭对话框、滚动到目标卡片、聚焦并短暂高亮（更新中不可点）。 */
  readonly onSearchResultClick: (result: SearchResult) => void;
  /** 切板：销毁旧句柄，按原查询词重建。 */
  readonly rebuildSearch: () => void;
  readonly searchResultTitle: (result: SearchResult) => string;
  readonly searchColumnTitle: (result: SearchResult) => string;
  readonly searchUnavailableText: (reason: BoardSearchUnavailableReason | null) => string;
}

const UNAVAILABLE_TEXT: Readonly<Record<BoardSearchUnavailableReason, string>> = {
  plugin_not_installed: '搜索插件未安装',
  adapter_unsupported: '当前适配器不支持搜索',
  query_failed: '搜索查询失败'
};

/** 板内搜索。 */
export const useSearchModel = (core: ViewCore, data: BoardData, model: ModelGetter): SearchModel => {
  const [searchQuery, setSearchQuery, searchQueryRef] = useStateRef('');
  const [searchState, setSearchState, searchStateRef] = useStateRef<SearchState>('idle');
  const [searchResults, setSearchResults] = useState<readonly SearchResult[]>([]);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchErrorText, setSearchErrorText] = useState<string | null>(null);
  const [searchHighlightId, setSearchHighlightId, searchHighlightIdRef] = useStateRef<UUID | null>(null);
  const handleRef = useRef<SearchHandle | null>(null);
  const subsRef = useRef(new Subscription());
  const highlightTimerRef = useRef<number | null>(null);

  const destroySearch = (): void => {
    subsRef.current.unsubscribe();
    subsRef.current = new Subscription();
    handleRef.current?.destroy();
    handleRef.current = null;
    setSearchState('idle');
    setSearchResults([]);
    setSearchHasMore(false);
    setSearchErrorText(null);
  };

  useEffect(
    () => () => {
      subsRef.current.unsubscribe();
      handleRef.current?.destroy();
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    },
    []
  );

  const onSearchInput = (value: string): void => {
    setSearchQuery(value);
    const query = value.trim();
    if (query === '') {
      destroySearch();
      return;
    }
    const source = core.boardRef.current.searchSource;
    if (!source) return;
    if (handleRef.current !== null) {
      handleRef.current.setQuery(query);
      return;
    }
    const handle = source.search(query);
    handleRef.current = handle;
    // 上一组句柄订阅先退订（destroy 不保证上游 observable 不再发射）
    subsRef.current.unsubscribe();
    const subs = new Subscription();
    subs.add(handle.state$.subscribe(state => setSearchState(state)));
    subs.add(handle.results$.subscribe(results => setSearchResults(results)));
    subs.add(handle.hasMore$.subscribe(more => setSearchHasMore(more)));
    subs.add(handle.error$.subscribe(error => setSearchErrorText(String(error))));
    subsRef.current = subs;
  };

  return {
    searchQuery,
    searchState,
    searchResults,
    searchHasMore,
    searchErrorText,
    searchHighlightId,
    onSearchInput,
    onSearchMore: () => {
      if (searchStateRef.current === 'loading') return;
      void handleRef.current?.loadMore();
    },
    onSearchResultClick: result => {
      if (searchStateRef.current === 'loading') return;
      const targetId = result.id as UUID;
      model().dialog.closeDialog(false);
      core.areaRef.current
        ?.querySelector<HTMLElement>(`[data-task-id="${targetId}"]`)
        ?.scrollIntoView({ block: 'center', inline: 'center' });
      core.focusTaskSoon(targetId);
      setSearchHighlightId(targetId);
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = window.setTimeout(() => {
        if (searchHighlightIdRef.current === targetId) setSearchHighlightId(null);
      }, 2000);
    },
    rebuildSearch: () => {
      const query = searchQueryRef.current.trim();
      destroySearch();
      if (query !== '') onSearchInput(query);
    },
    searchResultTitle: result => data.taskById(result.id as UUID)?.title ?? '',
    searchColumnTitle: result => data.columnTitleOf(data.taskById(result.id as UUID)?.columnId ?? null),
    searchUnavailableText: reason => (reason === null ? '' : UNAVAILABLE_TEXT[reason])
  };
};
