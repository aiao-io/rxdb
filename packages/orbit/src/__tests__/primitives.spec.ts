import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../bus.js';
import { connectOrbitClient } from '../client.js';
import { copyProps, copyValue } from '../payload.js';
import type { Message } from '../protocol.js';
import { readContext, readMessage } from '../protocol.js';
import { Rpc } from '../rpc.js';

afterEach(() => vi.useRealTimers());

describe('JSON 消息边界', () => {
  it('复制可序列化值，包括重复引用，不污染调用方', () => {
    const shared = { text: 'ok' };
    const original = { a: shared, b: shared };
    const copy = copyValue(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(Object.isFrozen(copyProps(original))).toBe(true);
    expect(copyValue([null, true, 1, 'value'])).toEqual([null, true, 1, 'value']);
  });
  it.each([undefined, NaN, Infinity, () => 1, Symbol('x'), 1n, new Date(), new Map(), new Set()])(
    '拒绝非 JSON 值 %s',
    value => {
      expect(() => copyValue(value)).toThrow(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
    }
  );
  it('拒绝循环引用、过深和过大消息以及非对象 props', () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    let deep: unknown = 1;
    for (let index = 0; index < 34; index++) deep = [deep];
    for (const value of [cyclic, deep, '中'.repeat(400_000)]) expect(() => copyValue(value)).toThrow();
    expect(() => copyProps([])).toThrow();
  });
});

describe('事件总线', () => {
  it('去重、单次订阅、取消、清理和同步派发', () => {
    const send = vi.fn();
    const bus = new EventBus(send);
    const handler = vi.fn();
    const once = vi.fn();
    bus.$on('a', handler).$on('a', handler).$once('a', once);
    expect(bus.listenerCount).toBe(2);
    bus.$emit('a', { n: 1 });
    bus.$emit('a', 2);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(once).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
    bus.$off('a', handler).$off('absent', handler);
    expect(bus.listenerCount).toBe(0);
    bus.$on('b', handler).$off('b');
    bus.$on('c', handler);
    bus.$clear();
    expect(bus.listenerCount).toBe(0);
  });
  it('全部通知后聚合报告处理错误；非法事件和值明确失败', () => {
    const bus = new EventBus(() => undefined);
    const ok = vi.fn();
    bus
      .$on('x', () => {
        throw new Error('x');
      })
      .$on('x', ok);
    expect(() => bus.$emit('x')).toThrow(AggregateError);
    expect(ok).toHaveBeenCalled();
    expect(() => bus.$on('', ok)).toThrow();
    expect(() => bus.$emit('x', undefined)).toThrow();
  });
});

describe('协议校验', () => {
  it('只接受有完整字段的消息', () => {
    const valid: Message[] = [
      { type: 'ready' },
      { type: 'disposed' },
      { type: 'error', message: 'x' },
      { type: 'visibility', visible: false },
      { type: 'props', props: {} },
      { type: 'event', event: 'x', args: [1] },
      { type: 'request', id: '1', method: 'echo', payload: 1 },
      { type: 'response', id: '1', value: true },
      { type: 'reject', id: '1', code: 'UNKNOWN_METHOD', message: 'x' },
      { type: 'cancel', id: '1' }
    ];
    for (const message of valid) expect(readMessage(message)).toEqual(message);
    for (const data of [
      null,
      [],
      {},
      { type: 'wrong' },
      { type: 'error' },
      { type: 'visibility' },
      { type: 'props', props: [] },
      { type: 'event', event: '', args: [] },
      { type: 'event', event: 'x', args: {} },
      { type: 'request', id: '1' },
      { type: 'response' },
      { type: 'reject', id: '1' },
      { type: 'cancel' }
    ])
      expect(readMessage(data)).toBeUndefined();
    expect(
      readContext({ appId: 'x', instanceId: 'y', version: '1', url: 'https://a.test', visible: true, props: {} })
    ).toBeDefined();
    for (const context of [null, {}, { appId: 'x', instanceId: 'y', version: '1' }])
      expect(readContext(context)).toBeUndefined();
  });
});

function pair() {
  const messages: Message[] = [];
  const left = new Rpc(message => {
    messages.push(message);
    queueMicrotask(() => right.receive(message));
  });
  const right = new Rpc(message => queueMicrotask(() => left.receive(message)));
  return {
    left,
    right,
    messages,
    dispose: () => {
      left.dispose();
      right.dispose();
    }
  };
}
describe('可取消请求', () => {
  it('双向请求、取消注册、重复注册、未知方法、异常与非法返回', async () => {
    const { left, right, dispose } = pair();
    const off = right.onRequest('echo', value => value);
    expect(() => right.onRequest('echo', value => value)).toThrow();
    expect(await left.request('echo', { x: 1 })).toEqual({ x: 1 });
    off();
    off();
    await expect(left.request('echo')).rejects.toMatchObject({ code: 'UNKNOWN_METHOD' });
    right.onRequest('throw', () => {
      throw 'bad';
    });
    await expect(left.request('throw')).rejects.toMatchObject({ code: 'HANDLER_ERROR' });
    right.onRequest('invalid', () => undefined as never);
    await expect(left.request('invalid')).rejects.toMatchObject({ code: 'HANDLER_ERROR' });
    dispose();
    dispose();
    await expect(left.request('x')).rejects.toMatchObject({ code: 'DESTROYED' });
    expect(() => right.onRequest('x', () => null)).toThrow();
  });
  it('取消与超时会 abort 对端，迟到结果不再发送', async () => {
    vi.useFakeTimers();
    const { left, right, messages, dispose } = pair();
    const aborted = vi.fn();
    right.onRequest(
      'wait',
      (_payload, signal) =>
        new Promise(resolve =>
          signal.addEventListener('abort', () => {
            aborted();
            resolve(null);
          })
        )
    );
    const controller = new AbortController();
    const pending = left.request('wait', null, { signal: controller.signal });
    await vi.runAllTicks();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    await vi.runAllTicks();
    expect(aborted).toHaveBeenCalledTimes(1);
    const timeout = expect(left.request('wait', null, { timeout: 10 })).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(10);
    await timeout;
    expect(messages.filter(message => message.type === 'cancel')).toHaveLength(2);
    const before = messages.length;
    await expect(left.request('wait', null, { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(messages.length).toBe(before);
    dispose();
  });
  it('销毁拒绝 pending 并终止执行；发送失败和无关响应均可回收', async () => {
    const { left, right, dispose } = pair();
    let signal: AbortSignal | undefined;
    right.onRequest('wait', (_value, current) => {
      signal = current;
      return new Promise(() => undefined);
    });
    const pending = left.request('wait');
    await Promise.resolve();
    dispose();
    await expect(pending).rejects.toMatchObject({ code: 'DESTROYED' });
    expect(signal?.aborted).toBe(true);
    left.receive({ type: 'response', id: 'missing', value: null });
    const rpc = new Rpc(() => {
      throw new Error('closed');
    });
    await expect(rpc.request('x')).rejects.toThrow('closed');
    rpc.receive({ type: 'response', id: 'unknown', value: null });
    rpc.receive({ type: 'cancel', id: 'unknown' });
    rpc.receive({ type: 'ready' });
    expect(() => rpc.request('')).toThrow();
    rpc.dispose();
  });
  it('独立或 SSR 运行不等待宿主', async () => {
    expect(await connectOrbitClient()).toBeUndefined();
  });
});
