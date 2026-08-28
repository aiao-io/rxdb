/**
 * @fileoverview W9：Supabase 适配器的可达性上报
 *
 * core 侧的上报是适配器无关的，但只覆盖 QueryCache 的写与重放
 * （`query-cache-primary.ts#tryRemote`、`query-cache-outbox.ts`）。Supabase 真正的主场
 * 是版本管理同步（它有 changelog，HTTP 适配器没有），而那条路径上一次上报都没有：
 * `resumeSync()` 里的 `syncBranches()` 断网时抛 `NetworkOfflineError`，没人接，
 * 于是 `reachability` 永远停在「在线」，面板显示一堆待推变更却说网是通的。
 * 只读页面同样中招 —— 一次 `fetchMetadata` 失败之后没有任何东西会把状态翻回来。
 *
 * 判据全部落在**适配器真正跑完一次往返后 monitor 的状态**上，不测 helper 的内部形状：
 * 换一种上报实现只要语义没变，这套就该继续绿。
 *
 * 上报与判定分开：适配器**每次结算都报**（含 403 这种带状态码的失败），
 * 由 `ReachabilityMonitor.report` / `isNetworkError` 一处定夺翻不翻。
 * 在适配器里先筛一遍等于养出第二份「什么算离线」的定义。
 */

import {
  Entity,
  EntityBase,
  getEntityMetadata,
  NetworkOfflineError,
  ReachabilityMonitor,
  type EntityType,
  type RuleGroup,
  type RxDB
} from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';

@Entity({ name: 'Probe', namespace: 'public', tableName: 'probe', properties: [] })
class Probe extends EntityBase {}

const ALL: RuleGroup<unknown> = { combinator: 'and', rules: [] };

/** postgrest 传输失败的形状：postgrest-js 不 reject，它把 fetch 的 TypeError 换成 `status: 0` */
const TRANSPORT_FAILURE = {
  data: null,
  error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' },
  status: 0,
  statusText: ''
};

/** postgrest 业务错误的形状：拿到了真实 HTTP 状态码，说明连接是通的 */
const BUSINESS_FAILURE = {
  data: null,
  error: { message: 'permission denied for table probe', details: '', hint: '', code: '42501' },
  status: 403,
  statusText: 'Forbidden'
};

/** 成功响应；`data` 给数组是为了同时喂饱 `select_all_pages` 与单行读取 */
const SUCCESS = { data: [], error: null, status: 200, statusText: 'OK' };

/** 永远解析到同一个响应的链式 query builder 替身 */
function alwaysResolves(response: unknown) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'symbol' || prop === '@@observable') return undefined;
        if (prop === 'then') {
          return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve(response).then(resolve, reject);
        }
        return () => proxy;
      }
    }
  );
  return proxy;
}

// 每个用例自带一个 monitor：判离线会排真实的退避 setTimeout，不 destroy 会把定时器
// 漏进下一个用例（`#scheduleWakeup` 在仍判离线时会一直续排）
const monitors: ReachabilityMonitor[] = [];
afterEach(() => {
  while (monitors.length) monitors.pop()?.destroy();
});

interface Harness {
  readonly adapter: RxDBAdapterSupabase;
  readonly reachability: ReachabilityMonitor;
}

function createHarness(response: unknown): Harness {
  // 事件源与 navigator 都显式给出：Node 下探测到的全局会让初值随宿主漂移
  const reachability = new ReachabilityMonitor({
    navigatorOnLine: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  });
  monitors.push(reachability);

  const metadata = [getEntityMetadata(Probe)];
  const rxdb = {
    context: { userId: 'test-user', clientId: 'local-client' },
    config: { entities: [Probe] },
    schemaManager: {
      getEntityMetadata: vi.fn((name: string, namespace: string) =>
        metadata.find(item => item.name === name && (!namespace || item.namespace === namespace))
      )
    },
    dispatchEvent: vi.fn(),
    reachability
  } as unknown as RxDB;

  const from = vi.fn(() => alwaysResolves(response));
  const client = {
    from,
    schema: vi.fn(() => ({ from })),
    rpc: vi.fn(() => alwaysResolves(response))
  };

  return { adapter: new RxDBAdapterSupabase(rxdb, { client: client as never }), reachability };
}

/**
 * 把 monitor 预置成离线，用于验证「一次成功往返能把它翻回来」
 *
 * @remarks
 * 直接喂一个 `NetworkOfflineError` 而不是跑一次失败请求：这里是在**布置前置状态**，
 * 借另一个被测方法来布置会让用例在那个方法坏掉时也跟着红，指错地方。
 */
function seedOffline(reachability: ReachabilityMonitor): void {
  reachability.report(new NetworkOfflineError(new Error('seed')));
}

describe('Supabase 可达性上报 — 读路径', () => {
  it('fetchMetadata 传输失败 → 判为离线', async () => {
    const { adapter, reachability } = createHarness(TRANSPORT_FAILURE);

    await expect(firstValueFrom(adapter.fetchMetadata('Probe', ALL))).rejects.toThrow();

    expect(reachability.online).toBe(false);
  });

  it('fetchMetadata 成功 → 把离线判回在线', async () => {
    const { adapter, reachability } = createHarness(SUCCESS);
    seedOffline(reachability);
    expect(reachability.online).toBe(false);

    await firstValueFrom(adapter.fetchMetadata('Probe', ALL));

    expect(reachability.online).toBe(true);
  });

  it('findByIds 传输失败 → 判为离线', async () => {
    const { adapter, reachability } = createHarness(TRANSPORT_FAILURE);

    await expect(firstValueFrom(adapter.findByIds('Probe', ['a']))).rejects.toThrow();

    expect(reachability.online).toBe(false);
  });

  it('业务错误（403）照样上报，但判不出离线 —— 拿到状态码说明连接是通的', async () => {
    const { adapter, reachability } = createHarness(BUSINESS_FAILURE);

    await expect(firstValueFrom(adapter.fetchMetadata('Probe', ALL))).rejects.toThrow();

    expect(reachability.online).toBe(true);
  });

  it('业务错误不会把已判离线的状态翻回在线', async () => {
    const { adapter, reachability } = createHarness(BUSINESS_FAILURE);
    seedOffline(reachability);

    await expect(firstValueFrom(adapter.fetchMetadata('Probe', ALL))).rejects.toThrow();

    // 403 既不是在线证据也不是离线证据：report 应当原地不动
    expect(reachability.online).toBe(false);
  });
});

describe('Supabase 可达性上报 — 版本管理路径（HTTP 适配器没有的那半）', () => {
  it('version() 传输失败 → 判为离线', async () => {
    const { adapter, reachability } = createHarness(TRANSPORT_FAILURE);

    await expect(adapter.version()).rejects.toThrow();

    expect(reachability.online).toBe(false);
  });

  it('branchExists 传输失败 → 判为离线（resumeSync 第一步 syncBranches 走的就是这类调用）', async () => {
    const { adapter, reachability } = createHarness(TRANSPORT_FAILURE);

    await expect(adapter.branchExists('main')).rejects.toThrow();

    expect(reachability.online).toBe(false);
  });
});

describe('Supabase 可达性上报 — isTableExisted 的状态码形状', () => {
  it('404 是远端给出的回答 → 判为在线', async () => {
    const { adapter, reachability } = createHarness({ ...BUSINESS_FAILURE, status: 404 });
    seedOffline(reachability);

    await expect(adapter.isTableExisted(Probe as unknown as EntityType)).resolves.toBe(false);

    expect(reachability.online).toBe(true);
  });

  it('传输失败 → 判为离线（不能因为「没抛 error」就当成表不存在）', async () => {
    const { adapter, reachability } = createHarness(TRANSPORT_FAILURE);

    await expect(adapter.isTableExisted(Probe as unknown as EntityType)).rejects.toThrow();

    expect(reachability.online).toBe(false);
  });
});

describe('Supabase 可达性上报 — repository 路径', () => {
  it('find 传输失败 → 判为离线', async () => {
    const { adapter, reachability } = createHarness(TRANSPORT_FAILURE);
    const repository = adapter.getRepository(Probe as unknown as EntityType);

    await expect(repository.find({ where: ALL as never })).rejects.toThrow();

    expect(reachability.online).toBe(false);
  });
});
