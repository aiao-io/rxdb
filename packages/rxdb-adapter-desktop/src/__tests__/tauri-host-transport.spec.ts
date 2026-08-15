/**
 * US-210：Tauri 传输层的编码与订阅语义。
 *
 * @module __tests__/tauri-host-transport
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createTauriHostTransport,
  TAURI_DESKTOP_CHANGE_EVENT,
  TAURI_DESKTOP_REQUEST_COMMAND,
  type TauriHostTransportOptions
} from '../tauri-host-transport.js';

/** 立即落定的 `listen` 替身，记录注册与解除。 */
const createListen = (): {
  listen: TauriHostTransportOptions['listen'];
  emit: (payload: unknown) => void;
  unlistenCount: () => number;
  listenCount: () => number;
} => {
  const handlers = new Set<(event: { payload: unknown }) => void>();
  let listenCount = 0;
  let unlistenCount = 0;
  return {
    listen: (_event, handler) => {
      listenCount++;
      handlers.add(handler);
      return Promise.resolve(() => {
        unlistenCount++;
        handlers.delete(handler);
      });
    },
    emit: payload => {
      for (const handler of handlers) handler({ payload });
    },
    unlistenCount: () => unlistenCount,
    listenCount: () => listenCount
  };
};

describe('createTauriHostTransport', () => {
  it('encodes the request and decodes the response across the JSON boundary', async () => {
    const invoke = vi.fn().mockResolvedValue({
      kind: 'execute',
      result: { sql: 'SELECT 1', rowsAffected: 0, elapsed: 0.5, results: [{ columns: ['id'], rows: [[{ $bigint: '9007199254740993' }]] }] }
    });
    const transport = createTauriHostTransport({ invoke, listen: createListen().listen });

    const response = (await transport.request({
      kind: 'execute',
      sessionId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      sql: 'SELECT ?',
      bindings: [new Uint8Array([102, 111, 111])]
    })) as { result: { results: { rows: unknown[][] }[] } };

    expect(invoke).toHaveBeenCalledWith(TAURI_DESKTOP_REQUEST_COMMAND, {
      payload: {
        kind: 'execute',
        sessionId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
        sql: 'SELECT ?',
        bindings: [{ $u8: 'Zm9v' }]
      }
    });
    expect(response.result.results[0].rows[0][0]).toBe(9007199254740993n);
  });

  /**
   * 错误是**普通返回值**而不是 reject，与 host 契约一致；传输层不得把它变成异常，
   * 否则 renderer 侧的 `assertDesktopHostResponse` 就拿不到 `code` 了。
   */
  it('passes a host error response through as a value', async () => {
    const invoke = vi.fn().mockResolvedValue({ kind: 'error', code: 'database_busy', message: 'locked' });
    const transport = createTauriHostTransport({ invoke, listen: createListen().listen });

    await expect(transport.request({ kind: 'version', sessionId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' })).resolves.toEqual({
      kind: 'error',
      code: 'database_busy',
      message: 'locked'
    });
  });

  it('fans one tauri event channel out to every subscriber and decodes the payload', async () => {
    const { listen, emit, listenCount } = createListen();
    const transport = createTauriHostTransport({ invoke: vi.fn(), listen });
    const first = vi.fn();
    const second = vi.fn();

    transport.subscribe(first);
    transport.subscribe(second);
    await vi.waitFor(() => expect(listenCount()).toBe(1));

    emit({ kind: 'change', sessionId: 's', event: { rowIds: [{ $bigint: '7' }], recordAt: { $date: 1_700_000_000_000 } } });

    const expected = { kind: 'change', sessionId: 's', event: { rowIds: [7n], recordAt: new Date(1_700_000_000_000) } };
    expect(first).toHaveBeenCalledWith(expected);
    expect(second).toHaveBeenCalledWith(expected);
  });

  it('releases the tauri channel once the last subscriber leaves and re-registers for the next one', async () => {
    const { listen, listenCount, unlistenCount } = createListen();
    const transport = createTauriHostTransport({ invoke: vi.fn(), listen });

    const stopFirst = transport.subscribe(vi.fn());
    const stopSecond = transport.subscribe(vi.fn());
    await vi.waitFor(() => expect(listenCount()).toBe(1));

    stopFirst();
    expect(unlistenCount()).toBe(0);
    stopSecond();
    expect(unlistenCount()).toBe(1);

    transport.subscribe(vi.fn());
    await vi.waitFor(() => expect(listenCount()).toBe(2));
  });

  /**
   * 退订可能发生在 `listen` 落定之前——它是异步的，而 `subscribe` 必须同步返回。
   * 落定时若已经没人在听，就不能把那条通道留在那里。
   */
  it('closes a channel that finished registering after the last subscriber left', async () => {
    const { listen, unlistenCount } = createListen();
    const transport = createTauriHostTransport({ invoke: vi.fn(), listen });

    transport.subscribe(vi.fn())();

    await vi.waitFor(() => expect(unlistenCount()).toBe(1));
  });

  it('reports a failed registration instead of swallowing it', async () => {
    const onListenError = vi.fn();
    const failure = new Error('event system unavailable');
    const listen = vi.fn<TauriHostTransportOptions['listen']>().mockRejectedValue(failure);
    const transport = createTauriHostTransport({ invoke: vi.fn(), listen, onListenError });

    transport.subscribe(vi.fn());
    await vi.waitFor(() => expect(onListenError).toHaveBeenCalledWith(failure));
    expect(listen).toHaveBeenCalledWith(TAURI_DESKTOP_CHANGE_EVENT, expect.any(Function));

    // 失败不能把传输层钉死：下一个订阅者要能重新尝试注册。
    transport.subscribe(vi.fn());
    await vi.waitFor(() => expect(listen).toHaveBeenCalledTimes(2));
  });

  /**
   * `deliver` 跑在 Tauri 的事件回调里，抛出去无人接管，故障彻底无痕。
   * host 发来不合协议的负载是真会发生的（版本不齐、序列化缺陷），必须走上报口。
   */
  it('reports a payload it cannot decode instead of throwing into the tauri callback', async () => {
    const { listen, emit, listenCount } = createListen();
    const onListenError = vi.fn();
    const transport = createTauriHostTransport({ invoke: vi.fn(), listen, onListenError });
    const subscriber = vi.fn();

    transport.subscribe(subscriber);
    await vi.waitFor(() => expect(listenCount()).toBe(1));

    expect(() => emit({ kind: 'change', sessionId: 's', event: { rowIds: [{ $u8: '不是 base64' }] } })).not.toThrow();
    expect(onListenError).toHaveBeenCalledTimes(1);
    expect(subscriber).not.toHaveBeenCalled();

    // 一条坏负载不能把通道废掉，后面的正常事件照送。
    emit({ kind: 'change', sessionId: 's', event: { rowIds: [{ $bigint: '7' }] } });
    expect(subscriber).toHaveBeenCalledWith({ kind: 'change', sessionId: 's', event: { rowIds: [7n] } });
  });

  /**
   * 多个 `DesktopSqliteClient` 共享一条通道。一个客户端的 handler 抛出，
   * 若让它中断循环，排在后面的客户端就再也收不到变更——表现为「某个库不刷新」。
   */
  it('keeps fanning out after a subscriber throws, and reports the failure', async () => {
    const { listen, emit, listenCount } = createListen();
    const onListenError = vi.fn();
    const transport = createTauriHostTransport({ invoke: vi.fn(), listen, onListenError });
    const failure = new Error('handler blew up');
    const healthy = vi.fn();

    transport.subscribe(() => {
      throw failure;
    });
    transport.subscribe(healthy);
    await vi.waitFor(() => expect(listenCount()).toBe(1));

    expect(() => emit({ kind: 'change', sessionId: 's', event: { rowIds: [] } })).not.toThrow();
    expect(onListenError).toHaveBeenCalledWith(failure);
    expect(healthy).toHaveBeenCalledTimes(1);
  });
});
