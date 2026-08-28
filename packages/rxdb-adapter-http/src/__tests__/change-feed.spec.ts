import {
  Entity,
  EntityBase,
  isNetworkError,
  PropertyType,
  RxDB,
  SyncType,
  type EntityType,
  type RuleGroup,
  type SyncOptions
} from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpConfigError, HttpDisconnectedError, HttpUnsupportedOperationError } from '../errors.js';
import type {
  HttpAdapterOptions,
  HttpChangeFeedNotificationReport,
  HttpChangeFeedUnavailableReport,
  HttpHandlers
} from '../http.interface.js';
import { RxDBAdapterHttp } from '../RxDBAdapterHttp.js';

/**
 * US-023 阶段 B：HTTP 适配器的变更通知通道（AC#12～#18）。
 *
 * 这套用例的主题是**通道死活与查询路径互不相干**：通道连不上、连上又断、载荷读不懂，
 * 三种情形下 `fetchMetadata` 都必须逐字照旧——一条断掉的通知连接不代表离线
 * （可能只是后端没实现该端点），把它翻译成 `NetworkOfflineError` 会顺着
 * `offlineFallback` 把查询降级掉，而降级看的本该是**查询请求**的失败。
 */

const HTTP_REMOTE = {
  type: SyncType.QueryCache,
  local: { adapter: 'sqlite' },
  remote: { adapter: 'http' }
} satisfies SyncOptions;

const LOCAL_ONLY = { type: SyncType.None, local: { adapter: 'sqlite' } } satisfies SyncOptions;

const ALL: RuleGroup<unknown> = { combinator: 'and', rules: [] };

const BASE_URL = 'https://api.example.com';
const FEED_URL = 'https://api.example.com/changes';

@Entity({ name: 'FeedRecipe', properties: [{ name: 'title', type: PropertyType.string }] })
class FeedRecipe extends EntityBase {
  declare title: string;
}

@Entity({ name: 'FeedTag', properties: [{ name: 'label', type: PropertyType.string }] })
class FeedTag extends EntityBase {
  declare label: string;
}

/** 实体级 sync 覆盖成 `None`：它不走本适配器的 remote 槽位，因此不在「已订阅实体」里 */
@Entity({ name: 'FeedLocalNote', sync: LOCAL_ONLY, properties: [{ name: 'text', type: PropertyType.string }] })
class FeedLocalNote extends EntityBase {
  declare text: string;
}

/**
 * `EventSource` 的替身。
 *
 * @remarks
 * Node 没有原生 `EventSource`（`typeof globalThis.EventSource === 'undefined'`），而变更通知
 * 按 D5 就是走它。所以本包的用例只能自带一个替身，并把它 stub 进 `globalThis`——这与浏览器
 * 里发生的事同形：实现从 `globalThis` 取构造器，取到什么就用什么。
 *
 * 替身只实现被使用的那 5 个成员，多一个都不实现：实现得越全，越容易让用例在一个
 * 「浏览器里其实不成立」的行为上绿。
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static throwOnConstruct = false;

  readyState = 0;
  closeCount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(
    readonly url: string,
    readonly init?: { withCredentials?: boolean }
  ) {
    if (FakeEventSource.throwOnConstruct) {
      throw new SyntaxError('bad change feed url');
    }
    FakeEventSource.instances.push(this);
  }

  /** 连接建立 */
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  /** 服务端推一条通知 */
  push(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  /** 服务端推一条读不懂的通知 */
  pushRaw(data: unknown): void {
    this.onmessage?.({ data });
  }

  /**
   * 连接出错。
   *
   * @param readyState - `2`（CLOSED）表示浏览器已放弃，重连归实现；
   *   `0`（CONNECTING）表示原生重连正在进行
   */
  fail(readyState = 2): void {
    this.readyState = readyState;
    this.onerror?.();
  }

  close(): void {
    this.closeCount++;
    this.readyState = 2;
  }
}

/** 当前活着的（未被 close 的）替身连接 */
const liveSources = (): FakeEventSource[] => FakeEventSource.instances.filter(source => source.closeCount === 0);

/** 最后一条被创建的替身连接 */
const lastSource = (): FakeEventSource => {
  const source = FakeEventSource.instances.at(-1);
  if (source === undefined) {
    throw new Error('用例期望已经建立过连接');
  }
  return source;
};

const handlers: HttpHandlers = {
  onFetchMetadata: {
    request: ctx => ({ url: 'metadata', method: 'POST', body: { where: ctx.where, offset: ctx.offset } }),
    parse: body => body as never
  },
  onFindByIds: {
    request: ctx => ({ url: 'rows', method: 'POST', body: { ids: ctx.ids } }),
    parse: body => body as unknown[]
  }
};

const createRxdb = (entities: EntityType[] = [FeedRecipe, FeedTag, FeedLocalNote]): RxDB =>
  new RxDB({ dbName: 'rxdb-adapter-http-change-feed-spec', entities, sync: HTTP_REMOTE });

const createAdapter = (
  options: Partial<HttpAdapterOptions> = {},
  rxdb: RxDB = createRxdb()
): { adapter: RxDBAdapterHttp; rxdb: RxDB } => ({
  adapter: new RxDBAdapterHttp(rxdb, { baseUrl: BASE_URL, handlers, ...options }),
  rxdb
});

/** 开着通知通道的适配器，并把失效上报口换成 spy */
const createConnectedFeed = async (
  options: Partial<HttpAdapterOptions['changeFeed']> = {}
): Promise<{
  adapter: RxDBAdapterHttp;
  rxdb: RxDB;
  invalidate: ReturnType<typeof vi.fn>;
  reports: HttpChangeFeedUnavailableReport[];
  notifications: HttpChangeFeedNotificationReport[];
}> => {
  const reports: HttpChangeFeedUnavailableReport[] = [];
  const notifications: HttpChangeFeedNotificationReport[] = [];
  const { adapter, rxdb } = createAdapter({
    changeFeed: {
      url: 'changes',
      onUnavailable: report => reports.push(report),
      onNotification: report => notifications.push(report),
      ...options
    }
  });
  const invalidate = vi.fn();
  vi.spyOn(rxdb, 'invalidateRemoteEntity').mockImplementation(invalidate);
  await adapter.connect();
  return { adapter, rxdb, invalidate, reports, notifications };
};

beforeEach(() => {
  FakeEventSource.instances = [];
  FakeEventSource.throwOnConstruct = false;
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('缺省关闭（AC#12）', () => {
  it('不配 changeFeed 时 connect() 不建立任何连接', async () => {
    const { adapter } = createAdapter();
    await adapter.connect();
    expect(FakeEventSource.instances).toEqual([]);
  });

  it('不配 changeFeed 时 connect() 不发任何请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { adapter } = createAdapter();
    await adapter.connect();
    await adapter.disconnect();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('不配 changeFeed 时不上报任何失效', async () => {
    const { adapter, rxdb } = createAdapter();
    const invalidate = vi.spyOn(rxdb, 'invalidateRemoteEntity').mockImplementation(() => undefined);
    await adapter.connect();
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('连接生命周期（AC#13）', () => {
  it('connect() 用 baseUrl 拼出的绝对 URL 建立连接', async () => {
    await createConnectedFeed();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(lastSource().url).toBe(FEED_URL);
  });

  it('handler 给绝对 URL 时不再拼 baseUrl', async () => {
    await createConnectedFeed({ url: 'https://events.example.com/stream' });
    expect(lastSource().url).toBe('https://events.example.com/stream');
  });

  it('withCredentials 原样透传', async () => {
    await createConnectedFeed({ withCredentials: true });
    expect(lastSource().init).toEqual({ withCredentials: true });
  });

  it('disconnect() 关闭连接', async () => {
    const { adapter } = await createConnectedFeed();
    await adapter.disconnect();
    expect(lastSource().closeCount).toBe(1);
    expect(liveSources()).toEqual([]);
  });

  it('重复 connect() 先关旧连接，活着的连接始终只有一条', async () => {
    const { adapter } = await createConnectedFeed();
    await adapter.connect();
    await adapter.connect();
    expect(FakeEventSource.instances).toHaveLength(3);
    expect(liveSources()).toHaveLength(1);
  });

  it('重复 disconnect() 不抛错也不新建连接', async () => {
    const { adapter } = await createConnectedFeed();
    await adapter.disconnect();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('未 connect() 时不建立连接', () => {
    createAdapter({ changeFeed: { url: 'changes' } });
    expect(FakeEventSource.instances).toEqual([]);
  });

  it('changeFeed.url 为空串在构造期即抛 HttpConfigError', () => {
    expect(() => createAdapter({ changeFeed: { url: '  ' } })).toThrow(HttpConfigError);
  });

  // `joinUrl` 见到 `http(s)://` 开头就原样透出，所以这个值一路走到 `new EventSource()`
  // 才同步抛 SyntaxError。而 URL 在通道的一生里是常量：交给退避重连，换来的是一条每 30 秒
  // 报一次、永远好不了的连接 —— 与空串被拦在这里是同一个理由。
  it.each(['https://', 'http://:8080/changes'])('解析不出来的 changeFeed.url = %p 在构造期即抛 HttpConfigError', url => {
    expect(() => createAdapter({ changeFeed: { url } })).toThrow(HttpConfigError);
  });

  it.each([
    ['reconnectBaseDelayMs', 0],
    ['reconnectBaseDelayMs', 1.5],
    ['reconnectMaxDelayMs', Number.POSITIVE_INFINITY]
  ])('changeFeed.%s = %p 在构造期即抛 HttpConfigError', (field, value) => {
    expect(() => createAdapter({ changeFeed: { url: 'changes', [field]: value } })).toThrow(HttpConfigError);
  });

  it('退避上限小于起步值时构造期即抛错', () => {
    // 这个组合不会报错也不会崩，只会让「指数退避」静默退化成定长重试
    expect(() =>
      createAdapter({ changeFeed: { url: 'changes', reconnectBaseDelayMs: 5000, reconnectMaxDelayMs: 1000 } })
    ).toThrow(HttpConfigError);
  });
});

describe('推送 → 失效上报（AC#14 / AC#15）', () => {
  it('收到通知 → 失效上报口被调用一次，实体名原样透出', async () => {
    const { invalidate } = await createConnectedFeed();
    invalidate.mockClear();
    lastSource().push({ entity: 'FeedRecipe', namespace: 'public' });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith('FeedRecipe', 'public');
  });

  it('通知不带 namespace 时按 public 上报', async () => {
    const { invalidate } = await createConnectedFeed();
    invalidate.mockClear();
    lastSource().push({ entity: 'FeedRecipe' });
    expect(invalidate).toHaveBeenCalledWith('FeedRecipe', 'public');
  });

  it('本客户端没注册的实体名照常上报，由 core 判空（D9）', async () => {
    const { invalidate } = await createConnectedFeed();
    invalidate.mockClear();
    lastSource().push({ entity: 'SomeoneElsesEntity' });
    expect(invalidate).toHaveBeenCalledWith('SomeoneElsesEntity', 'public');
  });

  it('clientId 等于本机时不上报（自回声抑制，D6）', async () => {
    const { rxdb, invalidate } = await createConnectedFeed();
    rxdb.context = { clientId: 'me' };
    invalidate.mockClear();
    lastSource().push({ entity: 'FeedRecipe', clientId: 'me' });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('clientId 不同时照常上报', async () => {
    const { rxdb, invalidate } = await createConnectedFeed();
    rxdb.context = { clientId: 'me' };
    invalidate.mockClear();
    lastSource().push({ entity: 'FeedRecipe', clientId: 'someone-else' });
    expect(invalidate).toHaveBeenCalledWith('FeedRecipe', 'public');
  });

  it('本机没有 clientId 时，不把「两边都没有」当成自回声', async () => {
    // context.clientId 由 RxDB.init() 生成，直接 new 出来的实例上是 undefined。
    // 拿 undefined === undefined 当命中，会让没跑过 init() 的场景一条通知都收不到
    const { rxdb, invalidate } = await createConnectedFeed();
    expect(rxdb.context.clientId).toBeUndefined();
    invalidate.mockClear();
    lastSource().push({ entity: 'FeedRecipe' });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('断开后再收到消息不上报', async () => {
    const { adapter, invalidate } = await createConnectedFeed();
    const source = lastSource();
    await adapter.disconnect();
    invalidate.mockClear();
    source.push({ entity: 'FeedRecipe' });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it.each([
    ['非 JSON 文本', 'not json'],
    ['JSON 但不是对象', '"FeedRecipe"'],
    ['缺 entity 字段', JSON.stringify({ namespace: 'public' })],
    ['entity 不是字符串', JSON.stringify({ entity: 42 })]
  ])('读不懂的载荷（%s）→ 诊断且不上报，不抛', async (_case, data) => {
    const { invalidate, reports } = await createConnectedFeed();
    invalidate.mockClear();
    expect(() => lastSource().pushRaw(data)).not.toThrow();
    expect(invalidate).not.toHaveBeenCalled();
    expect(reports.map(report => report.reason)).toEqual(['malformed-message']);
  });
});

describe('通知诊断出口（AC#24 / D8）', () => {
  it('收到通知 → 诊断口拿到实体名、namespace 与 suppressed=false', async () => {
    const { notifications } = await createConnectedFeed();
    lastSource().push({ entity: 'FeedRecipe', namespace: 'public', clientId: 'someone-else' });
    expect(notifications).toEqual([
      { url: FEED_URL, entity: 'FeedRecipe', namespace: 'public', clientId: 'someone-else', suppressed: false }
    ]);
  });

  it('自回声被抑制时诊断口照样拿得到，标 suppressed=true', async () => {
    // 抑制发生在包内，包外只能从这个出口看见「收到了但没上报」——
    // 拿「后端广播条数 - core 失效条数」去倒推会把断线期间丢的通知也算成抑制
    const { rxdb, invalidate, notifications } = await createConnectedFeed();
    rxdb.context = { clientId: 'me' };
    invalidate.mockClear();
    notifications.length = 0;
    lastSource().push({ entity: 'FeedRecipe', clientId: 'me' });
    expect(invalidate).not.toHaveBeenCalled();
    expect(notifications).toEqual([
      { url: FEED_URL, entity: 'FeedRecipe', namespace: 'public', clientId: 'me', suppressed: true }
    ]);
  });

  it('载荷里多出来的字段进不了诊断报告（D8：报告结构上带不了行数据）', async () => {
    const { notifications } = await createConnectedFeed();
    lastSource().push({ entity: 'FeedRecipe', title: '偷渡的行数据', row: { id: 'r-1' } });
    expect(Object.keys(notifications[0]).sort()).toEqual(['clientId', 'entity', 'namespace', 'suppressed', 'url']);
  });

  it('连接成功的全量失效不是「收到的通知」，不进诊断口', async () => {
    const { notifications } = await createConnectedFeed();
    expect(notifications).toEqual([]);
    lastSource().open();
    expect(notifications).toEqual([]);
  });

  it('读不懂的载荷不进诊断口，只进 onUnavailable', async () => {
    const { notifications, reports } = await createConnectedFeed();
    lastSource().pushRaw('not json');
    expect(notifications).toEqual([]);
    expect(reports.map(report => report.reason)).toEqual(['malformed-message']);
  });

  it('断开后再收到消息不进诊断口', async () => {
    const { adapter, notifications } = await createConnectedFeed();
    const source = lastSource();
    await adapter.disconnect();
    source.push({ entity: 'FeedRecipe' });
    expect(notifications).toEqual([]);
  });

  it('不配 onNotification 时收通知照常上报失效，不抛', async () => {
    const { adapter, rxdb } = createAdapter({ changeFeed: { url: 'changes' } });
    const invalidate = vi.spyOn(rxdb, 'invalidateRemoteEntity').mockImplementation(() => undefined);
    await adapter.connect();
    invalidate.mockClear();
    expect(() => lastSource().push({ entity: 'FeedRecipe' })).not.toThrow();
    expect(invalidate).toHaveBeenCalledWith('FeedRecipe', 'public');
  });

  it('onNotification 抛错不影响失效上报', async () => {
    const { adapter, rxdb } = createAdapter({
      changeFeed: {
        url: 'changes',
        onNotification: () => {
          throw new Error('诊断面板炸了');
        }
      }
    });
    const invalidate = vi.spyOn(rxdb, 'invalidateRemoteEntity').mockImplementation(() => undefined);
    await adapter.connect();
    invalidate.mockClear();
    expect(() => lastSource().push({ entity: 'FeedRecipe' })).not.toThrow();
    expect(invalidate).toHaveBeenCalledWith('FeedRecipe', 'public');
  });
});

describe('连接成功即全量失效（AC#16 / D7）', () => {
  it('首次连接成功即对每个走本适配器的实体各上报一次', async () => {
    const { invalidate } = await createConnectedFeed();
    invalidate.mockClear();
    lastSource().open();
    expect(invalidate.mock.calls).toEqual([
      ['FeedRecipe', 'public'],
      ['FeedTag', 'public']
    ]);
  });

  it('不走本适配器 remote 槽位的实体不在内', async () => {
    const { invalidate } = await createConnectedFeed();
    invalidate.mockClear();
    lastSource().open();
    expect(invalidate.mock.calls.flat()).not.toContain('FeedLocalNote');
  });

  it('重连成功后再各上报一次——断开期间的变更没有人会补发', async () => {
    vi.useFakeTimers();
    const { invalidate } = await createConnectedFeed();
    lastSource().open();
    invalidate.mockClear();

    lastSource().fail();
    await vi.advanceTimersByTimeAsync(1000);
    lastSource().open();

    expect(invalidate.mock.calls).toEqual([
      ['FeedRecipe', 'public'],
      ['FeedTag', 'public']
    ]);
  });

  it('连接建立之前不上报——open 才是「拿得到后续变更」的那一刻', async () => {
    const { invalidate } = await createConnectedFeed();
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('连接失败（AC#17）', () => {
  it('浏览器放弃（CLOSED）时按退避重连，延迟指数增长并封顶', async () => {
    vi.useFakeTimers();
    await createConnectedFeed({ reconnectBaseDelayMs: 1000, reconnectMaxDelayMs: 4000 });

    for (const expected of [1000, 2000, 4000, 4000]) {
      lastSource().fail();
      await vi.advanceTimersByTimeAsync(expected - 1);
      const before = FakeEventSource.instances.length;
      await vi.advanceTimersByTimeAsync(1);
      expect(FakeEventSource.instances.length).toBe(before + 1);
    }
  });

  it('每次失败都给诊断信号，带 URL、失败次数与下次重连延迟', async () => {
    vi.useFakeTimers();
    const { reports } = await createConnectedFeed({ reconnectBaseDelayMs: 1000 });
    lastSource().fail();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ url: FEED_URL, reason: 'connection-error', attempt: 1, retryInMs: 1000 });
    expect(reports[0]?.message).toEqual(expect.any(String));
  });

  it('连接活过一个退避周期后，退避计数归零', async () => {
    vi.useFakeTimers();
    const { reports } = await createConnectedFeed({ reconnectBaseDelayMs: 1000 });
    lastSource().fail();
    await vi.advanceTimersByTimeAsync(1000);
    lastSource().open();
    // 活过一个退避周期才算「连上过」——归零的判据是连接稳定，不是 open 事件本身
    await vi.advanceTimersByTimeAsync(1000);
    lastSource().fail();
    expect(reports.at(-1)).toMatchObject({ attempt: 1, retryInMs: 1000 });
  });

  it('原生重连进行中（CONNECTING）时只诊断，不自建第二条连接', async () => {
    vi.useFakeTimers();
    const { reports } = await createConnectedFeed();
    lastSource().fail(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(reports.at(-1)).toMatchObject({ reason: 'connection-error', readyState: 0, retryInMs: undefined });
  });

  it('运行时没有 EventSource 时诊断一次，不抛错也不重连', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', undefined);
    const reports: HttpChangeFeedUnavailableReport[] = [];
    const { adapter } = createAdapter({
      changeFeed: { url: 'changes', onUnavailable: report => reports.push(report) }
    });

    await expect(adapter.connect()).resolves.toBe(adapter);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reports).toEqual([expect.objectContaining({ reason: 'unsupported-runtime', url: FEED_URL })]);
  });

  it('EventSource 构造抛错不外泄，按退避重连', async () => {
    vi.useFakeTimers();
    FakeEventSource.throwOnConstruct = true;
    const reports: HttpChangeFeedUnavailableReport[] = [];
    const { adapter } = createAdapter({
      changeFeed: { url: 'changes', onUnavailable: report => reports.push(report), reconnectBaseDelayMs: 1000 }
    });

    await expect(adapter.connect()).resolves.toBe(adapter);
    expect(reports.at(-1)).toMatchObject({ reason: 'connection-error', attempt: 1, retryInMs: 1000 });
    FakeEventSource.throwOnConstruct = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('重连时取消上一代排下的退避定时器，不把刚建好的连接拆掉重建', async () => {
    vi.useFakeTimers();
    const { adapter, invalidate } = await createConnectedFeed({ reconnectBaseDelayMs: 1000 });
    // 失败排下一个退避定时器，然后在它触发之前主动重连
    lastSource().fail();
    await adapter.connect();
    const rebuilt = lastSource();
    rebuilt.open();
    invalidate.mockClear();

    await vi.advanceTimersByTimeAsync(60_000);

    // 旧定时器若还活着，会 #close() 掉这条连接、再开第三条，并把 D7 全量失效重跑一遍
    expect(rebuilt.closeCount).toBe(0);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('disconnect() 之后不再重连', async () => {
    vi.useFakeTimers();
    const { adapter } = await createConnectedFeed({ reconnectBaseDelayMs: 1000 });
    lastSource().fail();
    await adapter.disconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('诊断回调自己抛错被丢弃', async () => {
    const { adapter } = createAdapter({
      changeFeed: {
        url: 'changes',
        onUnavailable: () => {
          throw new Error('日志系统挂了');
        }
      }
    });
    await adapter.connect();
    expect(() => lastSource().fail()).not.toThrow();
  });

  it('不配 onUnavailable 时失败路径照常静默重连', async () => {
    vi.useFakeTimers();
    const { adapter } = createAdapter({ changeFeed: { url: 'changes', reconnectBaseDelayMs: 1000 } });
    await adapter.connect();
    expect(() => lastSource().fail()).not.toThrow();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('通知连接挂掉不影响查询路径：fetchMetadata 照常成功', async () => {
    const row = { id: '1', updatedAt: '2026-08-27T10:00:00.000Z' };
    const { adapter } = await createConnectedFeed();
    lastSource().fail();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([row])))
    );

    await expect(firstValueFrom(adapter.fetchMetadata('FeedRecipe', ALL))).resolves.toEqual([row]);
  });

  it('通知连接的失败不是网络错误，不参与 offlineFallback 判定', async () => {
    const { reports } = await createConnectedFeed();
    lastSource().fail();
    // 诊断对象是普通数据，不是 Error：能被 isNetworkError 认出来的东西，
    // 迟早会有人把它塞进查询路径的 catch 里
    expect(isNetworkError(reports[0])).toBe(false);
  });
});

/**
 * 连接反复「开了就断」。
 *
 * @remarks
 * 后端接受连接后立刻关闭（端点半实现、反代掐流、鉴权在 open 之后才拒），会同时踩中
 * 两条本来各自正确的规则：`onopen` 归零退避计数（「连上了就重新开始数」）、
 * `readyState === CONNECTING` 时把重连让给浏览器（「别开出第二条连接」）。
 *
 * 合起来就是一个自锁的循环：open → 全量失效 → error(CONNECTING) → 浏览器按固定节奏重连
 * → open → …。退避计数每轮被归零，指数退避一次都轮不到；而每一轮 open 都按 D7 把所有
 * 已订阅实体重拉一遍。表现是一台稳定按秒级刷新的失效风暴，且没有任何机制让它收敛。
 *
 * 这一组钉住两条出路：**归零看的是连接活了多久，不是 open 事件本身**；
 * **让给浏览器是有次数上限的**，反复失败后由本类收走节拍器。
 */
describe('连接反复「开了就断」', () => {
  it('没活过一个退避周期的连接不让退避计数归零', async () => {
    vi.useFakeTimers();
    const { reports } = await createConnectedFeed({ reconnectBaseDelayMs: 1000 });
    lastSource().fail();
    await vi.advanceTimersByTimeAsync(1000);

    lastSource().open();
    lastSource().fail();

    expect(reports.at(-1)).toMatchObject({ attempt: 2, retryInMs: 2000 });
  });

  it('「开了就断」时退避照常增长——原生节奏不再是唯一的节拍器', async () => {
    vi.useFakeTimers();
    const { reports } = await createConnectedFeed({ reconnectBaseDelayMs: 1000 });

    // 后端接受连接后立刻关闭：每轮 open 都紧跟一次 CONNECTING 失败
    for (let round = 0; round < 4; round++) {
      lastSource().open();
      lastSource().fail(0);
    }

    // open 归零 attempt 的话这里恒为 { attempt: 1, retryInMs: undefined }，
    // 退避永不生效，全量失效按浏览器的固定节奏无限刷下去
    expect(reports.at(-1)).toMatchObject({ attempt: 4, retryInMs: 8000 });
  });

  it('原生重连连续失败到上限后由本类接管', async () => {
    vi.useFakeTimers();
    const { reports } = await createConnectedFeed({ reconnectBaseDelayMs: 1000 });

    for (let round = 0; round < 3; round++) {
      lastSource().fail(0);
      expect(reports.at(-1)).toMatchObject({ readyState: 0, retryInMs: undefined });
    }
    lastSource().fail(0);

    expect(reports.at(-1)).toMatchObject({ attempt: 4, retryInMs: 8000 });
  });

  it('接管时收走原生连接，不与浏览器的重连并存', async () => {
    vi.useFakeTimers();
    await createConnectedFeed({ reconnectBaseDelayMs: 1000 });

    for (let round = 0; round < 4; round++) {
      lastSource().fail(0);
    }
    // 浏览器那条还在自己重连，留着就是两条连接收同一份广播
    expect(liveSources()).toEqual([]);

    await vi.advanceTimersByTimeAsync(8000);
    expect(liveSources()).toHaveLength(1);
  });

  it('接管之后一条稳定的连接仍能让退避归零', async () => {
    vi.useFakeTimers();
    const { reports } = await createConnectedFeed({ reconnectBaseDelayMs: 1000 });
    for (let round = 0; round < 4; round++) {
      lastSource().fail(0);
    }
    await vi.advanceTimersByTimeAsync(8000);

    lastSource().open();
    await vi.advanceTimersByTimeAsync(1000);
    lastSource().fail();

    expect(reports.at(-1)).toMatchObject({ attempt: 1, retryInMs: 1000 });
  });

  it('startChangeFeed() 是显式意图，直接把退避计数清零', async () => {
    vi.useFakeTimers();
    const { adapter, reports } = await createConnectedFeed({ reconnectBaseDelayMs: 1000 });
    for (let round = 0; round < 4; round++) {
      lastSource().fail(0);
    }

    adapter.startChangeFeed();
    lastSource().fail();

    expect(reports.at(-1)).toMatchObject({ attempt: 1, retryInMs: 1000 });
  });
});

/**
 * 运行时开关。
 *
 * @remarks
 * 在此之前，通道的开关只在**构造期**读一次 `options.changeFeed`，包外没有任何入口——
 * 想在页面上放一个 checkbox，只能配 `location.reload()` 重建整个适配器。
 *
 * 这一组的主题是**「配置」与「意图」是两件事**：`options.changeFeed` 说的是这条通道
 * 存不存在，`changeFeedEnabled` 说的是它此刻要不要跑。分不开的话，用户手动停掉的通道
 * 会被下一次 `connect()`（重连、切换后端、纪元交替都会触发）悄悄复活。
 */
describe('运行时开关', () => {
  it('配了 changeFeed 就默认开着——connect() 照旧建连接', async () => {
    const { adapter } = await createConnectedFeed();
    expect(adapter.changeFeedEnabled).toBe(true);
    expect(liveSources()).toHaveLength(1);
  });

  it('构造完还没 connect() 时开关就已经是开的——它记的是意图，不是连接状态', () => {
    const { adapter } = createAdapter({ changeFeed: { url: 'changes' } });
    expect(adapter.changeFeedEnabled).toBe(true);
    expect(FakeEventSource.instances).toEqual([]);
  });

  it('没配 changeFeed 时开关恒为关', () => {
    const { adapter } = createAdapter();
    expect(adapter.changeFeedEnabled).toBe(false);
  });

  it.each(['startChangeFeed', 'stopChangeFeed'] as const)(
    '没配 changeFeed 时 %s() 抛 HttpUnsupportedOperationError，不静默 no-op',
    async method => {
      // 与 version() 未配 onVersion 同一条口径：配置缺失要吵。静默 no-op 会让
      // 「开关点了没反应」变成一个没有任何线索的现象
      const { adapter } = createAdapter();
      await adapter.connect();
      expect(() => adapter[method]()).toThrow(HttpUnsupportedOperationError);
    }
  );

  it('还没 connect() 时 startChangeFeed() 抛 HttpDisconnectedError', () => {
    // connect() 才跑实体线协议校验（bigint / binary 字段在这里被拒）。在它之前就能开出
    // 一条活着的 SSE 的话，「校验没过的 connect() 不留下活连接」这条保证从侧门被绕开了
    const { adapter } = createAdapter({ changeFeed: { url: 'changes' } });
    expect(() => adapter.startChangeFeed()).toThrow(HttpDisconnectedError);
    expect(FakeEventSource.instances).toEqual([]);
  });

  it('还没 connect() 时 stopChangeFeed() 不抛——它只翻意图位', () => {
    const { adapter } = createAdapter({ changeFeed: { url: 'changes' } });
    expect(() => adapter.stopChangeFeed()).not.toThrow();
    expect(adapter.changeFeedEnabled).toBe(false);
  });

  it('stopChangeFeed() 关掉活着的连接并翻转开关', async () => {
    const { adapter } = await createConnectedFeed();
    adapter.stopChangeFeed();
    expect(adapter.changeFeedEnabled).toBe(false);
    expect(lastSource().closeCount).toBe(1);
    expect(liveSources()).toEqual([]);
  });

  it('关掉之后再送进来的消息不上报失效', async () => {
    const { adapter, invalidate } = await createConnectedFeed();
    const source = lastSource();
    adapter.stopChangeFeed();
    invalidate.mockClear();
    source.push({ entity: 'FeedRecipe' });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('startChangeFeed() 重新建连，open 照旧触发全量失效（D7）', async () => {
    const { adapter, invalidate } = await createConnectedFeed();
    adapter.stopChangeFeed();
    adapter.startChangeFeed();

    expect(adapter.changeFeedEnabled).toBe(true);
    expect(liveSources()).toHaveLength(1);

    invalidate.mockClear();
    lastSource().open();
    expect(invalidate.mock.calls).toEqual([
      ['FeedRecipe', 'public'],
      ['FeedTag', 'public']
    ]);
  });

  it('重复 startChangeFeed() 活着的连接始终只有一条', async () => {
    const { adapter } = await createConnectedFeed();
    adapter.startChangeFeed();
    adapter.startChangeFeed();
    expect(liveSources()).toHaveLength(1);
  });

  it('重复 stopChangeFeed() 不抛错也不新建连接', async () => {
    const { adapter } = await createConnectedFeed();
    adapter.stopChangeFeed();
    expect(() => adapter.stopChangeFeed()).not.toThrow();
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('停掉时待执行的退避重连一并取消', async () => {
    vi.useFakeTimers();
    const { adapter } = await createConnectedFeed({ reconnectBaseDelayMs: 1000 });
    lastSource().fail();
    adapter.stopChangeFeed();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('停掉之后 connect() 不复活它——这才是「开关」而不是「一次性动作」', async () => {
    const { adapter } = await createConnectedFeed();
    adapter.stopChangeFeed();
    const before = FakeEventSource.instances.length;

    await adapter.connect();

    expect(adapter.changeFeedEnabled).toBe(false);
    expect(FakeEventSource.instances).toHaveLength(before);
    expect(liveSources()).toEqual([]);
  });

  it('disconnect() 不改开关，随后的 connect() 把通道接回来', async () => {
    // 生命周期事件不是用户意图：断开重连之后，用户上次留下的「我要收通知」仍然成立
    const { adapter } = await createConnectedFeed();
    await adapter.disconnect();
    expect(adapter.changeFeedEnabled).toBe(true);

    await adapter.connect();
    expect(liveSources()).toHaveLength(1);
  });

  it('已 disconnect() 时 startChangeFeed() 抛 HttpDisconnectedError', async () => {
    // 在一个已经关停的适配器上开出一条活着的 SSE，是实打实的 bug，不能让它悄悄发生
    const { adapter } = await createConnectedFeed();
    await adapter.disconnect();
    expect(() => adapter.startChangeFeed()).toThrow(HttpDisconnectedError);
  });

  it('已 disconnect() 时 stopChangeFeed() 不抛——两条路都通向同一个终点', async () => {
    const { adapter } = await createConnectedFeed();
    await adapter.disconnect();
    expect(() => adapter.stopChangeFeed()).not.toThrow();
    expect(adapter.changeFeedEnabled).toBe(false);
  });

  it('关掉通道不影响查询路径：fetchMetadata 照常成功', async () => {
    const row = { id: '1', updatedAt: '2026-08-27T10:00:00.000Z' };
    const { adapter } = await createConnectedFeed();
    adapter.stopChangeFeed();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([row])))
    );

    await expect(firstValueFrom(adapter.fetchMetadata('FeedRecipe', ALL))).resolves.toEqual([row]);
  });
});
