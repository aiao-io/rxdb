import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const handleRxdbChange = vi.fn(async () => undefined);

  /**
   * `flushPendingChangePipeline` 只对 `instanceof PGliteClient` 的客户端冲刷驱动侧队列，
   * 所以这里必须连类一起替换，而不是塞一个鸭子类型的对象。
   */
  class MockPGliteClient {
    readonly flushPendingNotifications = vi.fn(async () => false);
    pendingNotificationCount = 0;
  }

  return { handleRxdbChange, MockPGliteClient };
});

vi.mock('../handle_rxdb_change.js', () => ({ handle_rxdb_change: state.handleRxdbChange }));
vi.mock('../PGliteClient.js', () => ({ PGliteClient: state.MockPGliteClient }));

import type { IPGliteClient } from '../PGliteClient.js';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { flushPendingChangePipeline, trackChangeHandler, type ChangePipelineHost } from '../change-pipeline.js';
import { PGliteChangeType, type PGliteChangeEvent } from '../pglite.interface.js';

const changeEvent = (tableName: string): PGliteChangeEvent => ({
  type: PGliteChangeType.INSERT,
  dbName: 'test-db',
  tableName,
  rowIds: ['1'],
  recordAt: new Date()
});

/**
 * 变更管道的宿主契约只有这几个可变字段；适配器把自己的 `#` 状态按这个形状交出来。
 * 直接构造宿主而不是绕适配器的公开方法，是为了让「冲刷了几轮」这个断言只反映管道本身。
 */
const createHost = (client: InstanceType<typeof state.MockPGliteClient>): ChangePipelineHost => ({
  adapter: {} as RxDBAdapterPGlite,
  suppressedChangeTables: new Set<string>(),
  pendingChangeHandlers: new Set<Promise<void>>(),
  pendingChangeQueues: new Map<string, Promise<void>>(),
  changeErrors: new Subject<Error>(),
  changePipelineGeneration: 0,
  // 替身只实现了驱动侧冲刷那两个成员：管道对客户端的**唯一**要求是 `instanceof PGliteClient`
  // 加这两个成员，把 `IPGliteClient` 的另外八个补全只会让替身看起来比它承担的多。
  cachedClient: client as unknown as IPGliteClient,
  clientPromise: undefined
});

describe('flushPendingChangePipeline', () => {
  let client: InstanceType<typeof state.MockPGliteClient>;
  let host: ChangePipelineHost;

  beforeEach(() => {
    state.handleRxdbChange.mockClear();
    state.handleRxdbChange.mockImplementation(async () => undefined);
    client = new state.MockPGliteClient();
    host = createHost(client);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('generation 变化后必须再经过一轮 idle barrier', async () => {
    // 第一轮冲刷期间又登记了一条变更：generation 推进，这一轮就不算空闲，必须再走一轮。
    client.flushPendingNotifications.mockImplementationOnce(async () => {
      trackChangeHandler(host, changeEvent('rxdb_change'));
      return false;
    });

    await flushPendingChangePipeline(host);

    expect(client.flushPendingNotifications).toHaveBeenCalledTimes(2);
  });

  it('不再用固定五轮截断链式通知', async () => {
    // 连续 6 轮都报「还有未派发的通知」——超过历史上的 5 轮硬上限，仍必须跟到底。
    for (let index = 0; index < 6; index += 1) {
      client.flushPendingNotifications.mockResolvedValueOnce(true);
    }
    client.flushPendingNotifications.mockResolvedValue(false);

    await flushPendingChangePipeline(host);

    expect(client.flushPendingNotifications).toHaveBeenCalledTimes(7);
  });

  it('deadline 到期时抛结构化错误并保留超时 cause 与诊断', async () => {
    client.pendingNotificationCount = 7;
    client.flushPendingNotifications.mockResolvedValue(true);
    // 第一次取时间用来算 deadline，之后一律已经越过它。
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValue(3_001);

    const result = await flushPendingChangePipeline(host).then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: 'CHANGE_PIPELINE_TIMEOUT',
      diagnostics: { pendingEvents: 7, pendingHandlers: 0, attempts: 1 },
      cause: { name: 'TimeoutError' }
    });
  });

  it('deadline 能打断永不结束的 notification flush', async () => {
    vi.useFakeTimers();
    client.pendingNotificationCount = 4;
    client.flushPendingNotifications.mockImplementation(() => new Promise<boolean>(() => undefined));

    const resultPromise = flushPendingChangePipeline(host).then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error })
    );
    await vi.advanceTimersByTimeAsync(2_000);

    expect(await resultPromise).toMatchObject({
      ok: false,
      error: {
        code: 'CHANGE_PIPELINE_TIMEOUT',
        diagnostics: { pendingEvents: 4, pendingHandlers: 0, attempts: 1 },
        cause: { name: 'TimeoutError' }
      }
    });
  });
});
