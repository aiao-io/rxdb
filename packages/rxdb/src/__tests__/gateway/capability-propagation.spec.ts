/**
 * @fileoverview 红测试：能力启用的跨连接传播通道（顺延 1 / D-1，FR-037）。
 *
 * @remarks
 * 被测的是网关这一半——**把「某个能力刚被启用」这件事送到同源的其他连接**。
 * 收到之后装钩子那一半在 `@aiao/rxdb-plugin-working-tree`，理由见
 * `specs/001-working-tree-commits/threat-model.md` §6。
 *
 * 为什么这几组断言值得写：
 *
 * 1. **这条消息最容易被写成「跟实体事件一起转发」**。实体事件走的是
 *    `addEventListener` → `#broadcastEntityEvent` 那条链，而那条链的防回声靠
 *    `#processingRemoteEvent` 这个**瞬时**标志加事件自身的 `origin: 'cross-tab'` 标记。
 *    能力事件没有 `entities` 数组，{@link isCrossTabEvent} 对它恒为 `false`——一旦它被
 *    事务队列缓到 COMMIT 才重放，瞬时标志早已复位，两个 tab 会开始互相回声，
 *    而每次回声都换一个 `messageId`，去重窗口拦不住。所以广播必须是**显式单向**的：
 *    只有 `broadcastCapabilityEnabled()` 会发，收端一条都不发。
 * 2. **载荷是不可信输入**。`capability` 不是字符串时必须整条丢掉，而不是派发一个
 *    `capability: undefined` 的事件——下游拿它去比对能力名，比中 `undefined` 的那天
 *    会给一个根本没启用的能力装上捕获。
 * 3. **自己发的消息不能派发回自己**。发起 `enable()` 的那一端已经在
 *    `enable()` 里同步装好了钩子，再收一次只会多一次先卸后装。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { broadcastTopics } = vi.hoisted(() => ({
  broadcastTopics: new Map<string, Set<(message: unknown) => void>>()
}));

vi.mock('@aiao/utils', () => ({
  createBroadcastTopic: (name: string) => ({
    message$: {
      subscribe: (listener: (message: unknown) => void) => {
        let listeners = broadcastTopics.get(name);
        if (!listeners) {
          listeners = new Set();
          broadcastTopics.set(name, listeners);
        }
        listeners.add(listener);
        return {
          unsubscribe: () => {
            listeners.delete(listener);
            if (listeners.size === 0) broadcastTopics.delete(name);
          }
        };
      }
    },
    emit: (message: unknown) => {
      const listeners = broadcastTopics.get(name);
      if (!listeners) return;
      for (const listener of [...listeners]) listener(message);
    },
    close: () => {
      broadcastTopics.delete(name);
    }
  }),
  LeaderElection: class {
    elect() {
      return () => {
        // 无操作。
      };
    }

    dispose() {
      // 无操作。
    }
  }
}));

import { GATEWAY_MESSAGE_CAPABILITY_ENABLED, type GatewayMessage } from '../../gateway/gateway.interface.js';
import { RxDBTabsGateway } from '../../gateway/RxDBTabsGateway.js';
import { CAPABILITY_ENABLED_EVENT, type CapabilityEnabledEvent } from '../../rxdb-events.js';

/** 直接往某个频道里灌一条消息，模拟「另一个 tab 发来的」。 */
const deliver = (dbName: string, message: unknown): void => {
  const listeners = broadcastTopics.get(`${dbName}_gateway`);
  if (!listeners) throw new Error(`没有订阅者：${dbName}_gateway`);
  for (const listener of [...listeners]) listener(message);
};

/** 起一个已 init 的网关，并把它的三个回调交出去。 */
const startGateway = (dbName: string, clientId: string) => {
  const dispatchEvent = vi.fn();
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const gateway = new RxDBTabsGateway({ dbName, clientId });
  gateway.init(dispatchEvent, addEventListener, removeEventListener);
  return { gateway, dispatchEvent, addEventListener, removeEventListener };
};

describe('能力启用的跨连接传播（顺延 1 / FR-037）', () => {
  beforeEach(() => {
    broadcastTopics.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    broadcastTopics.clear();
    vi.useRealTimers();
  });

  it('broadcastCapabilityEnabled() 往频道里发一条 capability_enabled 消息', () => {
    const dbName = 'cap-broadcast';
    const a = startGateway(dbName, 'client-a');
    const received: unknown[] = [];
    broadcastTopics.get(`${dbName}_gateway`)!.add(message => received.push(message));

    a.gateway.broadcastCapabilityEnabled('workingTree');

    const message = received.at(-1) as GatewayMessage;
    expect(message.type).toBe(GATEWAY_MESSAGE_CAPABILITY_ENABLED);
    expect(message.clientId).toBe('client-a');
    expect(typeof message.messageId).toBe('string');
    expect((message as { capability?: unknown }).capability).toBe('workingTree');

    a.gateway.destroy();
  });

  it('另一端收到后派发 CapabilityEnabledEvent，带着能力名', () => {
    const dbName = 'cap-receive';
    const a = startGateway(dbName, 'client-a');
    const b = startGateway(dbName, 'client-b');

    a.gateway.broadcastCapabilityEnabled('workingTree');

    const dispatched = b.dispatchEvent.mock.calls.map(call => call[0] as CapabilityEnabledEvent);
    const capabilityEvents = dispatched.filter(event => event.type === CAPABILITY_ENABLED_EVENT);
    expect(capabilityEvents).toHaveLength(1);
    expect(capabilityEvents[0].capability).toBe('workingTree');

    a.gateway.destroy();
    b.gateway.destroy();
  });

  it('发起方自己不会收到回声——钩子在 enable() 里已经同步装好了', () => {
    const dbName = 'cap-self';
    const a = startGateway(dbName, 'client-a');

    a.gateway.broadcastCapabilityEnabled('workingTree');

    expect(a.dispatchEvent).not.toHaveBeenCalled();

    a.gateway.destroy();
  });

  it('收到 capability_enabled 不会再次广播——防回声靠单向，不靠瞬时标志', () => {
    const dbName = 'cap-no-echo';
    const a = startGateway(dbName, 'client-a');
    const b = startGateway(dbName, 'client-b');
    const seen: GatewayMessage[] = [];
    broadcastTopics.get(`${dbName}_gateway`)!.add(message => seen.push(message as GatewayMessage));

    deliver(dbName, {
      type: GATEWAY_MESSAGE_CAPABILITY_ENABLED,
      messageId: 'client-c:1:0',
      clientId: 'client-c',
      capability: 'workingTree'
    });

    // 只数**别人**发的：deliver() 会把注入的这条也送给探针（它订阅的是同一个频道），
    // 而要证的是「A/B 谁都没把它再发一遍」，按发送方 clientId 区分。
    const rebroadcast = seen.filter(
      message => message.type === GATEWAY_MESSAGE_CAPABILITY_ENABLED && message.clientId !== 'client-c'
    );
    expect(rebroadcast).toHaveLength(0);

    a.gateway.destroy();
    b.gateway.destroy();
  });

  it('capability 不是字符串时整条丢掉，不派发 capability 为 undefined 的事件', () => {
    const dbName = 'cap-malformed';
    const b = startGateway(dbName, 'client-b');

    deliver(dbName, {
      type: GATEWAY_MESSAGE_CAPABILITY_ENABLED,
      messageId: 'client-a:1:0',
      clientId: 'client-a'
    });
    deliver(dbName, {
      type: GATEWAY_MESSAGE_CAPABILITY_ENABLED,
      messageId: 'client-a:1:1',
      clientId: 'client-a',
      capability: { name: 'workingTree' }
    });

    expect(b.dispatchEvent).not.toHaveBeenCalled();

    b.gateway.destroy();
  });

  it('destroy() 之后不再派发——旧纪元的网关不该把事件送进已拆掉的连接', () => {
    const dbName = 'cap-destroyed';
    const b = startGateway(dbName, 'client-b');
    b.gateway.destroy();

    expect(broadcastTopics.get(`${dbName}_gateway`)).toBeUndefined();
    expect(b.dispatchEvent).not.toHaveBeenCalled();
  });
});
