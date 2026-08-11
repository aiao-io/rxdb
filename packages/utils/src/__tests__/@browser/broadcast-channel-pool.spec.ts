import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBroadcastTopic, pool } from '../../@browser/broadcast-channel-pool.js';

type BroadcastMessageListener = (event: { data: unknown }) => void;

const globalChannels = new Map<string, Set<BroadcastChannel>>();
class BroadcastChannel {
  _listeners: BroadcastMessageListener[] = [];
  constructor(public name: string) {
    if (!globalChannels.has(name)) globalChannels.set(name, new Set());
    globalChannels.get(name)!.add(this);
  }

  addEventListener(_event: string, fn: BroadcastMessageListener) {
    this._listeners.push(fn);
  }
  removeEventListener(_event: string, fn: BroadcastMessageListener) {
    this._listeners = this._listeners.filter(f => f !== fn);
  }
  postMessage(data: unknown) {
    // UTL-009：**只投递给同名的其他实例**。
    // 原实现是 `this._listeners.forEach(...)` —— 向自己投递，
    // 而标准 BroadcastChannel **从不向发送它的 channel 对象自投递**。
    // 那个自回环让所有用例假绿：真实浏览器里收不到的消息，在测试里都收得到。
    for (const channel of globalChannels.get(this.name) ?? []) {
      if (channel === this) continue;
      channel._listeners.forEach(fn => fn({ data }));
    }
  }
  close() {
    globalChannels.get(this.name)!.delete(this);
  }
}
Object.defineProperty(window, 'BroadcastChannel', { writable: true, value: BroadcastChannel });

describe('broadcast-channel-pool', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('throws a clear error when BroadcastChannel is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    expect(() => createBroadcastTopic('unsupported')).toThrow('BroadcastChannel is not available in this environment');
  });

  it('should emit and receive message', async () => {
    vi.useFakeTimers();
    const { emit } = createBroadcastTopic('test');
    let received: unknown;
    const { message$ } = createBroadcastTopic('test');
    const sub = message$.subscribe(d => {
      received = d;
    });
    emit('hello world');
    vi.runAllTimers();
    // 等待微任务队列
    await Promise.resolve();
    expect(received).toBe('hello world');
    sub.unsubscribe();
    vi.useRealTimers();
  });

  /**
   * UTL-009：原用例锁定的是 `emit` 在无人订阅时**抛错** ——
   * 而那正是被修掉的缺陷（发送方被迫依赖「必须先有人订阅」这个隐式顺序）。
   * 现在按需创建 channel，emit 先于 on 是完全正常的用法。
   */
  it('emit 先于 on 不再抛错，且消息能被其他参与者收到', () => {
    const receiver = createBroadcastTopic<string>('emit-before-on');
    let received: string | undefined;
    const sub = receiver.message$.subscribe(message => {
      received = message;
    });

    expect(() => pool.emit('emit-before-on', 'data')).not.toThrow();

    expect(received).toBe('data');
    sub.unsubscribe();
    receiver.close();
    pool.close('emit-before-on');
  });

  it('should isolate different topics', () => {
    // 同 realm 下发送者与接收者必须是两个独立 topic（原生不自投递）
    const sender1 = createBroadcastTopic<string>('topic1');
    const sender2 = createBroadcastTopic<string>('topic2');
    const receiver1 = createBroadcastTopic<string>('topic1');
    const receiver2 = createBroadcastTopic<string>('topic2');
    const seen1: string[] = [];
    const seen2: string[] = [];
    const sub1 = receiver1.message$.subscribe(d => seen1.push(d));
    const sub2 = receiver2.message$.subscribe(d => seen2.push(d));

    sender1.emit('a');
    sender2.emit('b');

    expect(seen1).toEqual(['a']);
    expect(seen2).toEqual(['b']);

    sub1.unsubscribe();
    sub2.unsubscribe();
    [sender1, sender2, receiver1, receiver2].forEach(t => t.close());
  });

  it('should call removeEventListener on unsubscribe', () => {
    const topic = createBroadcastTopic<string>('remove-listener');
    const channel = [...(globalChannels.get('remove-listener') ?? [])].at(-1) as BroadcastChannel;
    const removeListener = vi.spyOn(channel, 'removeEventListener');

    const sub = topic.message$.subscribe();
    sub.unsubscribe();

    expect(removeListener).toHaveBeenCalledOnce();
    topic.close();
  });

  it('退订后重新订阅仍能收到消息', () => {
    const name = 'resubscribe-topic';
    const sender = createBroadcastTopic<string>(name);
    const receiver = createBroadcastTopic<string>(name);
    receiver.message$.subscribe().unsubscribe();

    let received: string | undefined;
    const second = receiver.message$.subscribe(message => {
      received = message;
    });
    sender.emit('after-resubscribe');

    expect(received).toBe('after-resubscribe');
    second.unsubscribe();
    sender.close();
    receiver.close();
  });

  /**
   * UTL-009：原用例锁定的是「channel 生命周期跟着 observer 计数走」——
   * 一个订阅者退订不能关掉另一个订阅者的 channel。
   * 新语义下 channel 由 topic 显式持有，退订只摘监听器，所以这条改为
   * 断言**退订一个订阅者不影响另一个继续收消息**。
   */
  it('一个订阅者退订不影响其他订阅者', () => {
    const name = 'shared-subscribers';
    const sender = createBroadcastTopic<string>(name);
    const receiver = createBroadcastTopic<string>(name);
    const seen: string[] = [];
    const keep = receiver.message$.subscribe(message => seen.push(message));
    const drop = receiver.message$.subscribe();

    drop.unsubscribe();
    sender.emit('still-open');

    expect(seen).toEqual(['still-open']);
    keep.unsubscribe();
    sender.close();
    receiver.close();
  });

  /**
   * UTL-009：原用例是 `closes the channel after the last subscriber unsubscribes`，
   * 并断言此后 `emit` 抛 `BroadcastChannel "x" not found`——
   * **那两件事都是被修掉的缺陷**（隐式所有权 + 抛错）。
   * 资源回收改由显式 `close()` 负责，这条随之改写。
   */
  it('close() 关闭 channel 且此后不再投递', () => {
    const name = 'cleanup-topic';
    const sender = createBroadcastTopic<string>(name);
    const receiver = createBroadcastTopic<string>(name);
    const receiverChannel = [...(globalChannels.get(name) ?? [])].at(-1) as BroadcastChannel;
    const close = vi.spyOn(receiverChannel, 'close');
    const seen: string[] = [];
    const sub = receiver.message$.subscribe(message => seen.push(message));

    sender.emit('before-close');
    expect(seen).toEqual(['before-close']);

    receiver.close();
    expect(close).toHaveBeenCalledOnce();
    sender.emit('after-close');
    expect(seen).toEqual(['before-close']);

    sub.unsubscribe();
    sender.close();
  });
});

describe('broadcast-channel-pool —— 同 realm 投递（UTL-009）', () => {
  /**
   * UTL-009：pool 按**频道名**复用同一个原生 BroadcastChannel 实例，
   * 于是同一 realm 里两个 `createBroadcastTopic('x')` 共享同一个发送对象 ——
   * 而标准 BroadcastChannel 不向发送它的对象自投递，**A 永远收不到 B 的消息**。
   *
   * 修法不是「加本地 fan-out」（那会引入自回声这个语义变更），
   * 而是**别再共享发送对象**：每个 topic 各自持有一个 channel，
   * 于是行为与原生完全一致 —— 同 realm 的其他参与者收得到，发送者自己收不到。
   */
  it('同 realm 的两个 topic 能互相收到消息', () => {
    const sender = createBroadcastTopic<string>('same-realm');
    const receiver = createBroadcastTopic<string>('same-realm');
    let received: string | undefined;
    const sub = receiver.message$.subscribe(message => {
      received = message;
    });

    sender.emit('from-sender');

    expect(received).toBe('from-sender');
    sub.unsubscribe();
    sender.close();
    receiver.close();
  });

  it('发送者不会收到自己发的消息（与原生语义一致）', () => {
    const topic = createBroadcastTopic<string>('no-self-echo');
    const seen: string[] = [];
    const sub = topic.message$.subscribe(message => seen.push(message));

    topic.emit('mine');

    expect(seen).toEqual([]);
    sub.unsubscribe();
    topic.close();
  });

  /**
   * UTL-009：原实现把 channel 所有权绑在 RxJS observer 计数上 ——
   * 最后一次退订就 `close()` 并删缓存，此后同 topic `emit()` 会**同步抛错**。
   *
   * 这不是假设性风险：`RxDBTabsGateway.init()` 的 `removeEventListener` 参数
   * 之所以是必填，注释里写的理由正是
   * 「残留监听器在 topic 被回收后再 emit 会抛错并冒泡到保存路径」——
   * **下游已经为这个缺陷加过一道防御性耦合。**
   */
  it('退订之后 emit 不再抛错', () => {
    const topic = createBroadcastTopic<string>('emit-after-unsubscribe');
    const sub = topic.message$.subscribe();
    sub.unsubscribe();

    expect(() => topic.emit('still-fine')).not.toThrow();
    topic.close();
  });

  it('close() 之后 emit 是空操作而不是抛错', () => {
    const topic = createBroadcastTopic<string>('emit-after-close');
    topic.close();

    expect(() => topic.emit('ignored')).not.toThrow();
  });

  it('close() 幂等', () => {
    const topic = createBroadcastTopic<string>('idempotent-close');
    topic.close();
    expect(() => topic.close()).not.toThrow();
  });
});
