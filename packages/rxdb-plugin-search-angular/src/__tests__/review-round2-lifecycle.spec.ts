import {
  createSearchHandle,
  type PerformSearch,
  type SearchHandle,
  type SearchOptions,
  type SearchPage,
  type SearchResult,
  type SearchState
} from '@aiao/rxdb-plugin-search';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ErrorHandler,
  InjectionToken,
  Input,
  inject,
  input,
  signal
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable } from 'rxjs';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useSearch, type SearchExecutionError, type SearchSourceLike } from '../index.js';

const SEARCH_SOURCE = new InjectionToken<SearchSourceLike>('评审搜索数据源');
const CHILD_SOURCE = new InjectionToken<SearchSourceLike>('评审子级数据源');

@Component({
  selector: 'review-search-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input [value]="search.query()" (input)="onInput($event)" />
    <span data-state>{{ search.state() }}</span>
    @if (search.error(); as error) {
      <p role="alert">{{ error.message }}</p>
    }
    @if (search.state() === 'empty') {
      <p data-empty>没有结果</p>
    }
    @for (result of search.results(); track result.id) {
      <p data-result>{{ result.snippet }}</p>
    }
    <button (click)="search.clear()" type="button">清空</button>
  `
})
class SearchHost {
  readonly sourceSignal = signal(inject(SEARCH_SOURCE));
  readonly optionsSignal = signal<SearchOptions | undefined>(undefined);
  readonly search = useSearch(this.sourceSignal, this.optionsSignal);

  @Input()
  set source(value: SearchSourceLike) {
    this.sourceSignal.set(value);
  }

  @Input()
  set options(value: SearchOptions | undefined) {
    this.optionsSignal.set(value);
  }

  onInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) throw new Error('搜索输入必须来自 input');
    this.search.query.set(target.value);
  }
}

@Component({
  selector: 'review-search-child',
  standalone: true,
  imports: [SearchHost],
  providers: [{ provide: SEARCH_SOURCE, useFactory: () => inject(CHILD_SOURCE) }],
  template: '<review-search-host />'
})
class ChildProviderHost {}

@Component({
  standalone: true,
  imports: [SearchHost, ChildProviderHost],
  template: '<review-search-host /><review-search-host /><review-search-child />'
})
class MultiInstanceHost {}

@Component({ standalone: true, template: '' })
class RequiredInputHost {
  readonly source = input.required<SearchSourceLike>();
  readonly search = useSearch(this.source);
}

@Component({ standalone: true, template: '' })
class RequiredSourcePlainOptionsHost {
  readonly source = input.required<SearchSourceLike>();
  readonly search = useSearch(this.source, { initialQuery: 'seed' });
}

@Component({ standalone: true, template: '' })
class RequiredOptionsHost {
  readonly source = input.required<SearchSourceLike>();
  readonly options = input.required<SearchOptions>();
  readonly search = useSearch(this.source, this.options);
}

const row = (id: string): SearchResult => ({
  entity: 'Article',
  collection: 'article',
  id,
  rank: -1,
  matchedField: 'title',
  snippet: id
});

const page = (id: string, hasMore = false): SearchPage => ({ results: [row(id)], hasMore });

interface RecordedHandle {
  handle: SearchHandle;
  destroy: Mock<() => void>;
  released: Mock<() => void>;
  subscriptions: () => number;
}

function makeSource(performSearch: PerformSearch) {
  const records: RecordedHandle[] = [];
  const search = vi.fn((query: string, options?: SearchOptions): SearchHandle => {
    let subscriptionCount = 0;
    const observe = <T>(stream: Observable<T>): Observable<T> =>
      new Observable<T>(subscriber => {
        subscriptionCount += 1;
        const subscription = stream.subscribe(subscriber);
        return () => {
          subscriptionCount -= 1;
          subscription.unsubscribe();
        };
      });
    const released = vi.fn<() => void>();
    const core = createSearchHandle({
      performSearch,
      initialQuery: query,
      refreshAuditMs: 0,
      debounceMs: options?.debounce ?? 0,
      subscribeDataChanges: () => released
    });
    const destroy = vi.fn(() => core.destroy());
    const handle: SearchHandle = {
      ...core,
      results$: observe(core.results$),
      state$: observe(core.state$),
      error$: observe(core.error$),
      hasMore$: observe(core.hasMore$),
      destroy
    };
    records.push({ handle, destroy, released, subscriptions: () => subscriptionCount });
    return handle;
  });
  const source: SearchSourceLike = { search };
  return { source, search, records };
}

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

function makeProtocol() {
  const results = new BehaviorSubject<readonly SearchResult[]>([]);
  const state = new BehaviorSubject<SearchState>('idle');
  const error = new BehaviorSubject<SearchExecutionError | undefined>(undefined);
  const hasMore = new BehaviorSubject(false);
  const destroy = vi.fn();
  const handle: SearchHandle = {
    results$: results.asObservable(),
    state$: state.asObservable(),
    error$: error.asObservable(),
    hasMore$: hasMore.asObservable(),
    setQuery: vi.fn(),
    loadMore: vi.fn(async () => undefined),
    clear: vi.fn(),
    retry: vi.fn(),
    destroy
  };
  return { results, state, error, hasMore, destroy, handle };
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
});

describe('第二轮评审：Angular 真实 SearchHandle 与生命周期', () => {
  it('快速输入只由核心防抖，连续分页不重复执行', async () => {
    vi.useFakeTimers();
    const perform = vi.fn<PerformSearch>(async (query, index) => page(`${query}:${index}`, index === 0));
    const source = makeSource(perform);
    const binding = TestBed.runInInjectionContext(() => useSearch(source.source, { debounce: 30 }));
    binding.query.set('A');
    TestBed.flushEffects();
    await vi.advanceTimersByTimeAsync(20);
    binding.query.set('B');
    TestBed.flushEffects();
    await vi.advanceTimersByTimeAsync(29);
    expect(perform).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(perform).toHaveBeenCalledTimes(1);
    expect(binding.results().map(result => result.id)).toEqual(['B:0']);
    await Promise.all([binding.loadMore(), binding.loadMore()]);
    expect(perform).toHaveBeenCalledTimes(2);
    expect(binding.results().map(result => result.id)).toEqual(['B:0', 'B:1']);
    expect(binding.hasMore()).toBe(false);
  });

  it('真实组件 inputs 等价不重建，换源中异步旧结果不回写', async () => {
    const pending = Promise.withResolvers<SearchPage>();
    const performOld = vi.fn<PerformSearch>(() => pending.promise);
    const first = makeSource(performOld);
    const second = makeSource(async query => page(`new:${query}`));
    TestBed.configureTestingModule({ providers: [{ provide: SEARCH_SOURCE, useValue: first.source }] });
    const fixture = TestBed.createComponent(SearchHost);
    fixture.componentRef.setInput('options', { collections: ['Article'], debounce: 0 });
    fixture.detectChanges();
    fixture.componentInstance.search.query.set('保留当前词');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(performOld).toHaveBeenCalledTimes(1);
    const creations = first.search.mock.calls.length;
    fixture.componentRef.setInput('options', { collections: ['Article'], debounce: 0, initialQuery: '不用这个种子' });
    fixture.detectChanges();
    expect(first.search).toHaveBeenCalledTimes(creations);
    fixture.componentRef.setInput('source', second.source);
    fixture.detectChanges();
    await settle();
    expect(performOld.mock.calls[0]?.[2]?.aborted).toBe(true);
    pending.resolve(page('旧源结果'));
    await settle();
    fixture.detectChanges();
    expect(fixture.componentInstance.search.query()).toBe('保留当前词');
    expect(fixture.componentInstance.search.results().map(result => result.id)).toEqual(['new:保留当前词']);
    expect(second.search).toHaveBeenCalledTimes(1);
    fixture.destroy();
    for (const record of [...first.records, ...second.records]) {
      expect(record.subscriptions()).toBe(0);
      expect(record.destroy).toHaveBeenCalledTimes(1);
      expect(record.released).toHaveBeenCalledTimes(1);
    }
  });

  it('在途分页换源后结算但不串页，清空恢复 idle', async () => {
    const nextPage = Promise.withResolvers<SearchPage>();
    const perform = vi.fn<PerformSearch>(async (query, index) =>
      index === 0 ? page(`${query}:0`, true) : nextPage.promise
    );
    const first = makeSource(perform);
    const second = makeSource(async query => page(`source-new:${query}`));
    const source = signal(first.source);
    const binding = TestBed.runInInjectionContext(() => useSearch(source, { initialQuery: 'source-old' }));
    await settle();
    const more = binding.loadMore();
    expect(perform).toHaveBeenCalledTimes(2);
    source.set(second.source);
    TestBed.flushEffects();
    await settle();
    expect(perform.mock.calls[1]?.[2]?.aborted).toBe(true);
    nextPage.resolve(page('source-old:1'));
    await more;
    expect(binding.results().map(result => result.id)).toEqual(['source-new:source-old']);
    binding.clear();
    TestBed.flushEffects();
    expect(binding.state()).toBe('idle');
    expect(binding.results()).toEqual([]);
    TestBed.resetTestingModule();
    for (const record of [...first.records, ...second.records]) expect(record.subscriptions()).toBe(0);
  });

  it('清空和销毁期间晚到成功或错误不更新框架信号', async () => {
    const pending = Promise.withResolvers<SearchPage>();
    const perform = vi.fn<PerformSearch>(() => pending.promise);
    const source = makeSource(perform);
    const binding = TestBed.runInInjectionContext(() => useSearch(source.source, { initialQuery: 'pending' }));
    binding.clear();
    expect(perform.mock.calls[0]?.[2]?.aborted).toBe(true);
    pending.reject(new Error('旧查询失败'));
    await settle();
    expect(binding.state()).toBe('idle');
    expect(binding.error()).toBeUndefined();
    TestBed.resetTestingModule();
    binding.query.set('late');
    binding.retry();
    binding.clear();
    await binding.loadMore();
    expect(perform).toHaveBeenCalledTimes(1);
    expect(source.records[0]?.subscriptions()).toBe(0);
    expect(source.records[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  it('组件销毁中晚到成功不回写，重新挂载不继承旧订阅', async () => {
    const pending = Promise.withResolvers<SearchPage>();
    const perform = vi.fn<PerformSearch>(() => pending.promise);
    const source = makeSource(perform);
    TestBed.configureTestingModule({ providers: [{ provide: SEARCH_SOURCE, useValue: source.source }] });
    const fixture = TestBed.createComponent(SearchHost);
    fixture.detectChanges();
    const binding = fixture.componentInstance.search;
    binding.query.set('destroy-pending');
    fixture.detectChanges();
    expect(perform).toHaveBeenCalledTimes(1);
    const beforeDestroy = {
      results: binding.results(),
      state: binding.state(),
      error: binding.error(),
      hasMore: binding.hasMore()
    };
    fixture.destroy();
    expect(perform.mock.calls[0]?.[2]?.aborted).toBe(true);
    pending.resolve(page('销毁后晚到结果'));
    await settle();
    expect({
      results: binding.results(),
      state: binding.state(),
      error: binding.error(),
      hasMore: binding.hasMore()
    }).toEqual(beforeDestroy);
    const nextFixture = TestBed.createComponent(SearchHost);
    nextFixture.detectChanges();
    expect(nextFixture.componentInstance.search.query()).toBe('');
    expect(nextFixture.componentInstance.search.state()).toBe('idle');
    expect(nextFixture.componentInstance.search.results()).toEqual([]);
    nextFixture.destroy();
    expect(source.records).toHaveLength(2);
    for (const record of source.records) {
      expect(record.subscriptions()).toBe(0);
      expect(record.destroy).toHaveBeenCalledTimes(1);
      expect(record.released).toHaveBeenCalledTimes(1);
    }
  });

  it('子 provider 覆盖与同组件多实例各自拥有 handle', async () => {
    const parent = makeSource(async query => page(`parent:${query}`));
    const child = makeSource(async query => page(`child:${query}`));
    TestBed.configureTestingModule({
      providers: [
        { provide: SEARCH_SOURCE, useValue: parent.source },
        { provide: CHILD_SOURCE, useValue: child.source }
      ]
    });
    const fixture = TestBed.createComponent(MultiInstanceHost);
    fixture.detectChanges();
    const hosts = fixture.debugElement.queryAll(node => node.providerTokens.includes(SearchHost));
    expect(hosts).toHaveLength(3);
    const bindings = hosts.map(node => node.injector.get(SearchHost).search);
    bindings.forEach((binding, index) => binding.query.set(String(index)));
    fixture.detectChanges();
    await settle();
    expect(bindings.map(binding => binding.results().map(result => result.id))).toEqual([
      ['parent:0'],
      ['parent:1'],
      ['child:2']
    ]);
    expect(parent.search).toHaveBeenCalledTimes(2);
    expect(child.search).toHaveBeenCalledTimes(1);
    fixture.destroy();
    for (const record of [...parent.records, ...child.records]) {
      expect(record.destroy).toHaveBeenCalledTimes(1);
      expect(record.subscriptions()).toBe(0);
    }
  });

  it.each(['results', 'state', 'error', 'hasMore'] as const)('%s 协议流损坏交给 ErrorHandler，并解绑所有流', key => {
    const protocol = makeProtocol();
    const handleError = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: ErrorHandler, useValue: { handleError } }] });
    TestBed.runInInjectionContext(() => useSearch({ search: () => protocol.handle }));
    const cause = new Error(`${key} 协议失败`);
    protocol[key].error(cause);
    expect(handleError).toHaveBeenCalledExactlyOnceWith(cause);
    for (const subject of [protocol.results, protocol.state, protocol.error, protocol.hasMore])
      expect(subject.observed).toBe(false);
    TestBed.resetTestingModule();
    expect(protocol.destroy).toHaveBeenCalledTimes(1);
  });

  it('loadMore 的拒绝原样传出，不伪造框架 error signal', async () => {
    const protocol = makeProtocol();
    const cause = new Error('分页命令拒绝');
    protocol.handle.loadMore = () => Promise.reject(cause);
    const binding = TestBed.runInInjectionContext(() => useSearch({ search: () => protocol.handle }));
    await expect(binding.loadMore()).rejects.toBe(cause);
    expect(binding.error()).toBeUndefined();
  });

  it('真实组件模板保留空态和错误，DOM 输入事件写回 query', async () => {
    const failure = new Error('可见错误');
    const source = makeSource(async query => {
      if (query === 'broken') throw failure;
      return { results: [], hasMore: false };
    });
    TestBed.configureTestingModule({ providers: [{ provide: SEARCH_SOURCE, useValue: source.source }] });
    const fixture = TestBed.createComponent(SearchHost);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const element = root.querySelector('input');
    if (!element) throw new Error('缺少真实模板 input');
    element.value = 'none';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    expect(fixture.componentInstance.search.query()).toBe('none');
    expect(root.querySelector('[data-empty]')?.textContent).toBe('没有结果');
    element.value = 'broken';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('search execution failed');
    expect(fixture.componentInstance.search.error()?.cause).toBe(failure);
    fixture.destroy();
  });

  it('README 的 required input 用法应能在 setInput 之前创建组件', () => {
    const source = makeSource(async query => page(query));
    expect(() => {
      const fixture = TestBed.createComponent(RequiredInputHost);
      fixture.componentRef.setInput('source', source.source);
      fixture.detectChanges();
    }).not.toThrow();
  });

  /**
   * RV-077 回归边界：必填 signal 输入「从未绑定就被销毁」。
   *
   * @remarks
   * 与上一个用例互补——上一个验证「先创建后 setInput」不炸；这一个验证
   * 反过来、整个生命周期都没有 setInput/detectChanges 时，`useSearch` 字段
   * 初始化器里的 `readUnlessUnbound()` 识别 NG0950 后不安装 handle，
   * `rebuildRef`/`queryEffectRef` 两个 `effect()` 的首次执行都排在下一次
   * CD flush 之后——创建到销毁之间若从未触发 CD，它们根本不会跑，
   * 不会在已销毁的注入上下文里读取信号，也没有 handle 可泄漏。
   */
  it('必填 source 推迟安装时，普通 options 的 initialQuery 仍作种子', () => {
    const source = makeSource(async query => page(query));
    const fixture = TestBed.createComponent(RequiredSourcePlainOptionsHost);
    expect(fixture.componentInstance.search.query()).toBe('seed');
    fixture.componentRef.setInput('source', source.source);
    fixture.detectChanges();

    expect(source.search).toHaveBeenCalledTimes(1);
    expect(source.search).toHaveBeenCalledWith('seed', { initialQuery: 'seed' });
    fixture.destroy();
  });

  it('必填 options 推迟安装时补种 initialQuery，但不覆盖安装前用户已写入的 query', () => {
    const seeded = makeSource(async query => page(query));
    const fixture = TestBed.createComponent(RequiredOptionsHost);
    fixture.componentRef.setInput('source', seeded.source);
    fixture.componentRef.setInput('options', { initialQuery: 'seed' });
    fixture.detectChanges();
    expect(fixture.componentInstance.search.query()).toBe('seed');
    expect(seeded.search).toHaveBeenCalledWith('seed', { initialQuery: 'seed' });
    fixture.destroy();

    const typed = makeSource(async query => page(query));
    const typedFixture = TestBed.createComponent(RequiredOptionsHost);
    typedFixture.componentInstance.search.query.set('typed');
    typedFixture.componentRef.setInput('source', typed.source);
    typedFixture.componentRef.setInput('options', { initialQuery: 'seed' });
    typedFixture.detectChanges();
    expect(typedFixture.componentInstance.search.query()).toBe('typed');
    expect(typed.search).toHaveBeenCalledWith('typed', { initialQuery: 'seed' });
    typedFixture.destroy();
  });

  it('读取 source signal 的非 NG0950 异常原样抛出，不当作「尚未绑定」吞掉', () => {
    const broken = computed<SearchSourceLike>(() => {
      throw new Error('source 计算失败');
    });
    expect(() => TestBed.runInInjectionContext(() => useSearch(broken))).toThrow('source 计算失败');
  });

  it('必填 source 从未绑定、组件创建后即销毁，不抛错也不残留 handle', () => {
    expect(() => {
      const fixture = TestBed.createComponent(RequiredInputHost);
      fixture.destroy();
    }).not.toThrow();
  });
});
