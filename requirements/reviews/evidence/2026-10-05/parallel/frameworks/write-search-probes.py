import pathlib,json,hashlib
root=pathlib.Path('/Users/jimmy/Documents/aiao/rxdb');base=root/'requirements/reviews/evidence/2026-10-05/parallel/frameworks'
common="""import { createSearchHandle, SearchExecutionError, type SearchResult } from '@aiao/rxdb-plugin-search';
import { afterEach, describe, expect, it, vi } from 'vitest';
"""
harness={
'angular':"""import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { useSearch, type SearchSourceLike } from '../index.js';

afterEach(() => TestBed.resetTestingModule());

const bind = (source: SearchSourceLike) => {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const search = TestBed.runInInjectionContext(() => useSearch(source));
  return {
    read: () => ({ query: search.query(), results: search.results(), state: search.state(), error: search.error(), hasMore: search.hasMore() }),
    setQuery: (query: string) => search.query.set(query),
    retry: search.retry,
    clear: search.clear,
    loadMore: search.loadMore,
    change: async (action: () => void) => { action(); TestBed.flushEffects(); await Promise.resolve(); },
    dispose: () => TestBed.resetTestingModule()
  };
};
""",
'react':"""import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, StrictMode, type PropsWithChildren } from 'react';
import { useSearch, type SearchSourceLike } from '../index.js';

afterEach(cleanup);

const bind = (source: SearchSourceLike) => {
  const rendered = renderHook(() => useSearch(source), {
    wrapper: ({ children }: PropsWithChildren) => createElement(StrictMode, null, children)
  });
  return {
    read: () => rendered.result.current,
    setQuery: (query: string) => rendered.result.current.setQuery(query),
    retry: () => rendered.result.current.retry(),
    clear: () => rendered.result.current.clear(),
    loadMore: () => act(async () => { await rendered.result.current.loadMore(); }),
    change: async (action: () => void) => { await act(async () => action()); },
    dispose: rendered.unmount
  };
};
""",
'vue':"""import { effectScope, nextTick } from 'vue';
import { useSearch, type SearchSourceLike } from '../index.js';

const activeScopes: Array<ReturnType<typeof effectScope>> = [];
afterEach(() => { activeScopes.splice(0).forEach(scope => scope.stop()); });

const bind = (source: SearchSourceLike) => {
  const scope = effectScope();
  activeScopes.push(scope);
  const search = scope.run(() => useSearch(source));
  if (!search) throw new Error('绑定必须在真实 effectScope 中创建');
  return {
    read: () => ({ query: search.query.value, results: search.results.value, state: search.state.value, error: search.error.value, hasMore: search.hasMore.value }),
    setQuery: (query: string) => { search.query.value = query; },
    retry: search.retry,
    clear: search.clear,
    loadMore: search.loadMore,
    change: async (action: () => void) => { action(); await nextTick(); },
    dispose: () => scope.stop()
  };
};
"""}
body="""
const row = (page: number): SearchResult => ({
  entity: 'Article', collection: 'article', id: String(page), rank: -page, matchedField: 'title', snippet: `page-${page}`
});

describe('并行评审：真实核心 SearchHandle 的完整 C1 状态映射', () => {
  it('空词、无结果、失败与重试、分页末页、清空均保留核心语义', async () => {
    const failure = new SearchExecutionError('可恢复的执行失败');
    let fail = true;
    const performSearch = vi.fn(async (query: string, page: number) => {
      if (query === 'broken' && fail) throw failure;
      if (query === 'none') return { results: [], hasMore: false };
      return { results: [row(page)], hasMore: page === 0 };
    });
    const source: SearchSourceLike = {
      search: initialQuery => createSearchHandle({ performSearch, initialQuery, debounceMs: 0 })
    };
    const binding = bind(source);
    try {
      expect(binding.read()).toMatchObject({ query: '', results: [], state: 'idle', error: undefined, hasMore: false });
      await binding.loadMore();
      expect(performSearch).not.toHaveBeenCalled();

      await binding.change(() => binding.setQuery('none'));
      await vi.waitFor(() => expect(binding.read()).toMatchObject({ results: [], state: 'empty', error: undefined, hasMore: false }));

      await binding.change(() => binding.setQuery('broken'));
      await vi.waitFor(() => expect(binding.read().state).toBe('error'));
      expect(binding.read().error).toBe(failure);
      fail = false;
      await binding.change(binding.retry);
      await vi.waitFor(() => expect(binding.read()).toMatchObject({ state: 'success', error: undefined, hasMore: true }));
      expect(binding.read().results.map(result => result.id)).toEqual(['0']);

      await binding.loadMore();
      await vi.waitFor(() => expect(binding.read().hasMore).toBe(false));
      expect(binding.read().results.map(result => result.id)).toEqual(['0', '1']);
      const callsAtEnd = performSearch.mock.calls.length;
      await binding.loadMore();
      expect(performSearch).toHaveBeenCalledTimes(callsAtEnd);

      await binding.change(binding.clear);
      expect(binding.read()).toMatchObject({ query: '', results: [], state: 'idle', error: undefined, hasMore: false });
    } finally {
      binding.dispose();
    }
  });
});
"""
new=json.loads((base/'new-specs.json').read_text()); req=json.loads((base/'validation-requests.json').read_text())
for fw in harness:
 name=f'packages/rxdb-plugin-search-{fw}/src/__tests__/review-parallel-real-handle.spec.ts'; path=root/name
 if path.exists(): raise RuntimeError('不得覆盖已有 spec: '+name)
 path.write_text(common+harness[fw]+body)
 new.append({'path':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'kind':'expected-green C1 public wrapper + real core handle; performSearch IO stub only','execution':'not-run-by-subtask','owner':'frameworks','productionModified':False})
 req.insert(0,{'project':f'rxdb-plugin-search-{fw}','target':'test','args':['--skipRemoteCache','--skipNxCache','--coverage'],'reason':'新增 '+name+'：同一完整 C1 场景三端，直接创建真实 createSearchHandle，非五个 BehaviorSubject 模拟；需主控串行补跑。React harness 包含 StrictMode。','criticalForC':['C1']})
for n in ['rxdb-plugin-working-tree-react']+[f'rxdb-plugin-search-{x}' for x in harness]:
 for t in ['typecheck','lint']:
  req.insert(0,{'project':n,'target':t,'args':['--skipRemoteCache','--skipNxCache'],'reason':'基线验证之后新增 review-parallel spec：需补做该新增测试的类型/零警告验证。','criticalForC':['C1','C5']})
(base/'new-specs.json').write_text(json.dumps(new,ensure_ascii=False,indent=2)+'\n');(base/'validation-requests.json').write_text(json.dumps(req,ensure_ascii=False,indent=2)+'\n')
print('\n'.join(x['path'] for x in new));print('总请求',len(req))
