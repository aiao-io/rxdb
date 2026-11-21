import type { RxDB } from '@aiao/rxdb';
import type { PaletteItem, PaletteSource } from '@aiao/rxdb-admin';
import { I18n } from '@aiao/rxdb-i18n';
import type { SearchResult } from '@aiao/rxdb-plugin-search';
import { BehaviorSubject, distinctUntilChanged, map, of, Subject, type Observable } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ENTITIES } from '../entities/asset-entities';
import { domainModelEnMessages, domainModelZhMessages } from '../i18n/domain-messages';
import { createRecordSearchSource } from './record-search';

type FakeState = 'idle' | 'loading' | 'success' | 'empty' | 'error';

interface FakeSnapshot {
  readonly state: FakeState;
  readonly results: readonly SearchResult[];
}

const hit = (id: string, entity: string, snippet: string): SearchResult =>
  ({ collection: entity.toLowerCase(), id, entity, matchedField: 'name', snippet }) as unknown as SearchResult;

/**
 * 和真实搜索状态机同构的假句柄：`state$` / `results$` 派生自同一个 BehaviorSubject。
 * 结算时一次 emit 先后经过两条派生流——把两条流 `combineLatest` 会在状态已变、结果还是旧值的瞬间取到快照。
 * `settle` 返回 `undefined` 表示这次查询一直在途，不会结算；
 * `completeOnDestroy` 让销毁像真实句柄那样完成状态流，在途的结算等待随之以 EmptyError 收场。
 */
function createHandle(
  settle: (query: string) => FakeSnapshot | undefined,
  { completeOnDestroy = false }: { completeOnDestroy?: boolean } = {}
) {
  const subject = new BehaviorSubject<FakeSnapshot>({ state: 'idle', results: [] });
  const destroy = vi.fn(() => {
    if (completeOnDestroy) subject.complete();
  });
  return {
    destroy,
    handle: {
      state$: subject.pipe(
        map(snapshot => snapshot.state),
        distinctUntilChanged()
      ),
      results$: subject.pipe(
        map(snapshot => snapshot.results),
        distinctUntilChanged()
      ),
      setQuery(query: string): void {
        subject.next({ state: 'loading', results: subject.value.results });
        queueMicrotask(() => {
          const snapshot = settle(query);
          if (snapshot) subject.next(snapshot);
        });
      },
      destroy
    }
  };
}

function createRxdb(
  connected: boolean | Observable<boolean>,
  handle: unknown
): { rxdb: RxDB; search: ReturnType<typeof vi.fn> } {
  const search = vi.fn(() => handle);
  const rxdb = {
    config: { entities: ENTITIES },
    adapterConnected$: () => (typeof connected === 'boolean' ? of(connected) : connected),
    search
  } as unknown as RxDB;
  return { rxdb, search };
}

const controller = (): AbortSignal => new AbortController().signal;

/** 来源按约定是异步的（带 `search`）；用 helper 收窄可选方法，避免测试里到处断言非空。 */
function runSearch(
  source: PaletteSource,
  query: string,
  signal: AbortSignal = controller()
): Promise<readonly PaletteItem[]> {
  if (!source.search) throw new Error('record source must define search');
  return Promise.resolve(source.search(query, signal));
}

describe('record-search', () => {
  it('命令搜索的实体和字段标签随语言变化，用户记录原样保留', async () => {
    const { handle } = createHandle(() => ({ state: 'success', results: [hit('1', 'AssetCategory', '办公设备')] }));
    const runtime = new I18n({
      locale: 'en',
      catalogs: [
        { locale: 'en', namespace: 'rxdb-model', messages: domainModelEnMessages },
        { locale: 'zh-Hans', namespace: 'rxdb-model', messages: domainModelZhMessages }
      ]
    });
    const source = createRecordSearchSource(createRxdb(true, handle).rxdb, () => undefined, runtime.t);
    const english = await runSearch(source, '办公');
    expect(english[0]).toMatchObject({ label: '办公设备', sublabel: 'Asset categories · Category name' });
    await runtime.setLocale('zh-Hans');
    expect((await runSearch(source, '办公'))[0]?.sublabel).toBe('资产分类 · 分类名');
    runtime.destroy();
  });
  it('来源声明：数据记录分组、至少 1 个字符才触发', () => {
    const { handle } = createHandle(() => ({ state: 'empty', results: [] }));
    const source = createRecordSearchSource(createRxdb(true, handle).rxdb, () => undefined);
    expect(source).toMatchObject({ id: 'records', groupLabelKey: 'palette.group.records', minQueryLength: 1 });
  });

  it('适配器未连接时不搜索（搜索会触发自动连接，破坏空库恢复前置）', async () => {
    const { handle } = createHandle(() => ({ state: 'empty', results: [] }));
    const { rxdb, search } = createRxdb(false, handle);
    const items = await runSearch(
      createRecordSearchSource(rxdb, () => undefined),
      '分类'
    );
    expect(items).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it('结算后返回命中的记录（状态先于结果到达的瞬间不能取到旧结果），并销毁句柄', async () => {
    const { handle, destroy } = createHandle(() => ({
      state: 'success',
      results: [hit('1', 'AssetCategory', '办公设备'), hit('2', 'Asset', '笔记本')]
    }));
    const navigate = vi.fn();
    const source = createRecordSearchSource(createRxdb(true, handle).rxdb, navigate);

    const items = await runSearch(source, '办公');

    expect(items.map(item => item.label)).toEqual(['办公设备', '笔记本']);
    expect(items.map(item => item.sublabel)).toEqual(['资产分类 · name', '资产 · name']);
    expect(destroy).toHaveBeenCalledTimes(1);

    await items[0]?.run();
    expect(navigate).toHaveBeenCalledWith('/entities/assets/AssetCategory');
  });

  it('没有命中时返回空数组', async () => {
    const { handle } = createHandle(() => ({ state: 'empty', results: [] }));
    const items = await runSearch(
      createRecordSearchSource(createRxdb(true, handle).rxdb, () => undefined),
      '不存在'
    );
    expect(items).toEqual([]);
  });

  it('查询失败时抛错（面板据此显示「部分结果加载失败」），句柄仍被销毁', async () => {
    const { handle, destroy } = createHandle(() => ({ state: 'error', results: [] }));
    const source = createRecordSearchSource(createRxdb(true, handle).rxdb, () => undefined);
    await expect(runSearch(source, 'x')).rejects.toThrow('Record search failed');
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('命中的实体不在可见清单里时，选中不导航', async () => {
    const { handle } = createHandle(() => ({ state: 'success', results: [hit('9', 'Secret', '隐藏实体')] }));
    const navigate = vi.fn();
    const items = await runSearch(createRecordSearchSource(createRxdb(true, handle).rxdb, navigate), '隐');
    await items[0]?.run();
    expect(items[0]?.sublabel).toBe('Secret · name');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('等待连接期间被中止则不调用 rxdb.search，直接返回空结果', async () => {
    const connection = new Subject<boolean>();
    const { handle, destroy } = createHandle(() => ({ state: 'success', results: [hit('1', 'Asset', '笔记本')] }));
    const { rxdb, search } = createRxdb(connection, handle);
    const abort = new AbortController();
    const pending = runSearch(
      createRecordSearchSource(rxdb, () => undefined),
      '笔记',
      abort.signal
    );
    abort.abort();
    connection.next(true);

    expect(await pending).toEqual([]);
    expect(search).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it('查询在途时被中止，立即销毁句柄而不等结算', async () => {
    const { handle, destroy } = createHandle(() => undefined, { completeOnDestroy: true });
    const { rxdb, search } = createRxdb(true, handle);
    const abort = new AbortController();
    const pending = runSearch(
      createRecordSearchSource(rxdb, () => undefined),
      'x',
      abort.signal
    );
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(destroy).not.toHaveBeenCalled();

    abort.abort();

    expect(destroy).toHaveBeenCalledTimes(1);
    await expect(pending).rejects.toThrow();
  });

  it('中止监听只登记一次，查询结算后移除，之后再中止不会重复销毁', async () => {
    const { handle, destroy } = createHandle(() => ({ state: 'success', results: [] }));
    const abort = new AbortController();
    const add = vi.spyOn(abort.signal, 'addEventListener');
    const remove = vi.spyOn(abort.signal, 'removeEventListener');

    await runSearch(
      createRecordSearchSource(createRxdb(true, handle).rxdb, () => undefined),
      'x',
      abort.signal
    );

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1]);
    expect(destroy).toHaveBeenCalledTimes(1);
    abort.abort();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
