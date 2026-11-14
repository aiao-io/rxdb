import { Mock, vi } from 'vitest';

import type { ChannelLike, LifecycleListener, LifecycleSource, LocksLike } from '../data/tab-sync';

/** 同一个来源下的一组标签页共用的广播台：消息发给除发送者之外的所有通道（与 BroadcastChannel 一致）。 */
export class FakeChannelHub {
  private readonly channels = new Set<FakeChannel>();

  /** 给一个标签页开一条通道。 */
  open(): FakeChannel {
    const channel = new FakeChannel(this);
    this.channels.add(channel);
    return channel;
  }

  /** 把 `data` 发给除 `from` 之外所有没关闭的通道。 */
  deliver(from: FakeChannel | null, data: unknown): void {
    for (const channel of this.channels) if (channel !== from && !channel.closed) channel.receive(data);
  }
}

/** 内存里的广播通道。 */
export class FakeChannel implements ChannelLike {
  private readonly listeners = new Set<(event: { data: unknown }) => void>();

  closed = false;

  constructor(private readonly hub: FakeChannelHub) {}

  postMessage(message: unknown): void {
    this.hub.deliver(this, message);
  }

  addEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
    this.listeners.add(listener);
  }

  close(): void {
    this.closed = true;
  }

  /** 收到一条消息（来自广播台）。 */
  receive(data: unknown): void {
    for (const listener of this.listeners) listener({ data });
  }
}

/** 没人在听的通道：只有一个标签页的用例用它，发出去的通知哪儿也不去。 */
export class SilentChannel implements ChannelLike {
  postMessage(): void {
    /* 没人在听。 */
  }

  addEventListener(): void {
    /* 没人会发消息过来。 */
  }

  close(): void {
    /* 没有要释放的东西。 */
  }
}

/** 假 Web Locks：满足 {@link LocksLike}，`request` 同时是个 spy。 */
export type FakeLocks = LocksLike & { readonly request: Mock };

/** 按名字排队的假 Web Locks：同一个名字同一时刻只放一个任务进去，与浏览器的独占锁一致。 */
export function fakeLocks(): FakeLocks {
  const tails = new Map<string, Promise<unknown>>();
  const request = vi.fn((name: string, task: () => Promise<unknown>): Promise<unknown> => {
    const run = (tails.get(name) ?? Promise.resolve()).then(task);
    tails.set(
      name,
      run.catch(() => undefined)
    );
    return run;
  });
  return { request } as unknown as FakeLocks;
}

/** 页面生命周期的替身：`fire` 触发已登记的监听，`visibilityState` 可改。 */
export class FakeLifecycle implements LifecycleSource {
  private readonly listeners = new Map<string, Set<LifecycleListener>>();

  visibilityState: 'visible' | 'hidden' = 'visible';

  addEventListener(type: string, listener: LifecycleListener): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: LifecycleListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  fire(type: string, event: { persisted?: boolean } = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  /** 某类事件现在挂着几个监听。 */
  count(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}
