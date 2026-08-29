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
            if (listeners.size === 0) {
              broadcastTopics.delete(name);
            }
          }
        };
      }
    },
    emit: (message: unknown) => {
      const listeners = broadcastTopics.get(name);
      if (!listeners) return;
      for (const listener of [...listeners]) {
        listener(message);
      }
    },
    // UTL-009：topic 现在是显式所有权，destroy() 会调 close()。
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

import {
  GATEWAY_MESSAGE_ENTITY_EVENT,
  GATEWAY_MESSAGE_FIRST_CONNECTED_AT,
  GATEWAY_MESSAGE_HELLO,
  GatewayMessage
} from '../../gateway/gateway.interface.js';
import { RxDBTabsGateway } from '../../gateway/RxDBTabsGateway.js';
import {
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_REMOVE_EVENT,
  ENTITY_LOCAL_UPDATE_EVENT,
  EntityLocalCreatedEvent,
  REMOTE_ENTITY_INVALIDATED_EVENT,
  RxDBEvent
} from '../../rxdb-events.js';

describe('RxDBTabsGateway', () => {
  beforeEach(() => {
    broadcastTopics.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    broadcastTopics.clear();
    vi.useRealTimers();
  });

  it('应该创建网关实例', () => {
    const gateway = new RxDBTabsGateway({
      dbName: 'test-db',
      clientId: 'client-1'
    });

    expect(gateway).toBeDefined();
    expect(gateway.firstConnectedAt).toBeUndefined();
    expect(gateway.isLeader).toBe(false);

    gateway.destroy();
  });

  it('应该注册三种本地事件监听器', () => {
    const dispatchEvent = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    const gateway = new RxDBTabsGateway({ dbName: 'test-db', clientId: 'client-1' });
    gateway.init(dispatchEvent, addEventListener, removeEventListener);

    // 应该注册三种事件
    const registeredEvents = addEventListener.mock.calls.map(call => call[0]);
    expect(registeredEvents).toContain(ENTITY_LOCAL_CREATE_EVENT);
    expect(registeredEvents).toContain(ENTITY_LOCAL_UPDATE_EVENT);
    expect(registeredEvents).toContain(ENTITY_LOCAL_REMOVE_EVENT);

    gateway.destroy();
  });

  // US-023 AC#9 / D10：失效上报不跨标签页。
  // 转发白名单是显式的，新事件默认就在外面 —— 这条锁的是「不许有人顺手加进去」。
  it('不应该转发远端失效事件到其他标签页', () => {
    const dispatchEvent = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    const gateway = new RxDBTabsGateway({ dbName: 'test-db', clientId: 'client-1' });
    gateway.init(dispatchEvent, addEventListener, removeEventListener);

    const registeredEvents = addEventListener.mock.calls.map(call => call[0]);
    expect(registeredEvents).not.toContain(REMOTE_ENTITY_INVALIDATED_EVENT);

    gateway.destroy();
  });

  it('事件处理器应该调用广播方法', () => {
    const dispatchEvent = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    const gateway = new RxDBTabsGateway({ dbName: 'test-db', clientId: 'client-1' });
    gateway.init(dispatchEvent, addEventListener, removeEventListener);

    // 获取注册的 CREATE 事件处理器
    const createHandler = addEventListener.mock.calls.find(call => call[0] === ENTITY_LOCAL_CREATE_EVENT)?.[1];

    expect(createHandler).toBeDefined();

    // 验证处理器是函数
    expect(typeof createHandler).toBe('function');

    gateway.destroy();
  });

  it('destroy 后 subscriptions 应该被清理', () => {
    const dispatchEvent = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    const gateway = new RxDBTabsGateway({ dbName: 'test-db', clientId: 'client-1' });
    gateway.init(dispatchEvent, addEventListener, removeEventListener);

    // destroy 不应该抛错
    expect(() => gateway.destroy()).not.toThrow();

    // 重复 destroy 也不应该抛错（幂等）
    expect(() => gateway.destroy()).not.toThrow();
  });

  it('destroy() 应该摘除三种本地事件转发监听器（RXD-006）', () => {
    const dispatchEvent = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    const gateway = new RxDBTabsGateway({ dbName: 'test-db-remove-listener', clientId: 'client-1' });
    gateway.init(dispatchEvent, addEventListener, removeEventListener);

    gateway.destroy();

    const removedEvents = removeEventListener.mock.calls.map(call => call[0]);
    expect(removedEvents).toContain(ENTITY_LOCAL_CREATE_EVENT);
    expect(removedEvents).toContain(ENTITY_LOCAL_UPDATE_EVENT);
    expect(removedEvents).toContain(ENTITY_LOCAL_REMOVE_EVENT);
  });

  it('二次调用 init() 应该 fail-fast 抛错，而不是静默重复注册订阅和监听器（RXD-006）', () => {
    const dispatchEvent = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    const gateway = new RxDBTabsGateway({ dbName: 'test-db-double-init', clientId: 'client-1' });
    gateway.init(dispatchEvent, addEventListener, removeEventListener);

    expect(() => gateway.init(dispatchEvent, addEventListener, removeEventListener)).toThrow();

    gateway.destroy();
  });

  it('destroy() 后不能重新调用 init() 复活实例，应该 fail-fast 抛错（RXD-006）', () => {
    const dispatchEvent = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    const gateway = new RxDBTabsGateway({ dbName: 'test-db-reinit-after-destroy', clientId: 'client-1' });
    gateway.init(dispatchEvent, addEventListener, removeEventListener);
    gateway.destroy();

    expect(() => gateway.init(dispatchEvent, addEventListener, removeEventListener)).toThrow();
  });

  it('init() 缺少 removeEventListener 应该立刻报错，而不是让 destroy() 静默漏摘监听器（RXD-006）', () => {
    const dispatchEvent = vi.fn();
    const addEventListener = vi.fn();

    const gateway = new RxDBTabsGateway({ dbName: 'test-db-missing-remover', clientId: 'client-1' });

    expect(() => gateway.init(dispatchEvent, addEventListener, undefined as never)).toThrow();
  });

  it('跨 tab 事件应派发副本而不污染原始事件对象', async () => {
    const dispatchEventA = vi.fn();
    const dispatchEventB = vi.fn();
    const addEventListenerA = vi.fn();
    const addEventListenerB = vi.fn();
    const removeEventListenerA = vi.fn();
    const removeEventListenerB = vi.fn();

    const gatewayA = new RxDBTabsGateway({ dbName: 'test-db-cross-tab', clientId: 'client-a' });
    const gatewayB = new RxDBTabsGateway({ dbName: 'test-db-cross-tab', clientId: 'client-b' });

    gatewayA.init(dispatchEventA, addEventListenerA, removeEventListenerA);
    gatewayB.init(dispatchEventB, addEventListenerB, removeEventListenerB);

    const createHandler = addEventListenerA.mock.calls.find(call => call[0] === ENTITY_LOCAL_CREATE_EVENT)?.[1];
    expect(createHandler).toBeDefined();

    const event = new EntityLocalCreatedEvent([
      {
        type: 'INSERT',
        namespace: 'default',
        entity: 'User',
        id: '1',
        patch: { id: '1', name: 'Alice' },
        inversePatch: null,
        recordAt: new Date()
      }
    ]);

    createHandler!(event);
    vi.runAllTimers();
    await Promise.resolve();

    expect(dispatchEventB).toHaveBeenCalledTimes(1);
    const dispatchedEvent = dispatchEventB.mock.calls[0][0] as EntityLocalCreatedEvent;
    expect(dispatchedEvent).not.toBe(event);
    expect(dispatchedEvent.entities[0].origin).toBe('cross-tab');
    expect(event.entities[0].origin).toBeUndefined();

    gatewayA.destroy();
    gatewayB.destroy();
  });

  it('跨 tab 事件应无损保留异构 ID、bigint 和 binary 快照', async () => {
    const dispatchEventA = vi.fn();
    const dispatchEventB = vi.fn();
    const addEventListenerA = vi.fn();
    const addEventListenerB = vi.fn();
    const removeEventListenerA = vi.fn();
    const removeEventListenerB = vi.fn();
    const source = new Uint8Array([9, 1, 2, 8]);
    const binaryView = source.subarray(1, 3);
    const jsonEnvelope = {
      $rxdbChangeValue: {
        codecVersion: 99,
        schemaVersion: 99,
        type: 'bigint',
        value: '7'
      }
    };

    const gatewayA = new RxDBTabsGateway({ dbName: 'test-db-cross-tab-types', clientId: 'client-a' });
    const gatewayB = new RxDBTabsGateway({ dbName: 'test-db-cross-tab-types', clientId: 'client-b' });
    gatewayA.init(dispatchEventA, addEventListenerA, removeEventListenerA);
    gatewayB.init(dispatchEventB, addEventListenerB, removeEventListenerB);

    const createHandler = addEventListenerA.mock.calls.find(call => call[0] === ENTITY_LOCAL_CREATE_EVENT)?.[1];
    expect(createHandler).toBeDefined();

    createHandler!(
      new EntityLocalCreatedEvent([
        {
          type: 'INSERT',
          namespace: 'default',
          entity: 'Metric',
          id: 1,
          patch: { id: 1 },
          inversePatch: null,
          recordAt: new Date()
        },
        {
          type: 'INSERT',
          namespace: 'default',
          entity: 'Metric',
          id: 1n,
          patch: { id: 1n, amount: 9007199254740993n, payload: binaryView, metadata: jsonEnvelope },
          inversePatch: null,
          recordAt: new Date()
        },
        {
          type: 'INSERT',
          namespace: 'default',
          entity: 'Metric',
          id: '1',
          patch: { id: '1' },
          inversePatch: null,
          recordAt: new Date()
        }
      ])
    );
    vi.runAllTimers();
    await Promise.resolve();

    expect(dispatchEventB).toHaveBeenCalledTimes(1);
    const dispatchedEvent = dispatchEventB.mock.calls[0][0] as EntityLocalCreatedEvent;
    expect(dispatchedEvent.entities.map(entity => [typeof entity.id, entity.id])).toEqual([
      ['number', 1],
      ['bigint', 1n],
      ['string', '1']
    ]);

    const patch = dispatchedEvent.entities[1].patch as Record<string, unknown>;
    expect(patch['amount']).toBe(9007199254740993n);
    expect(patch['metadata']).toEqual(jsonEnvelope);
    expect(patch['metadata']).not.toBe(jsonEnvelope);

    const receivedBinary = patch['payload'] as Uint8Array;
    expect(receivedBinary).toEqual(new Uint8Array([1, 2]));
    expect(receivedBinary).not.toBe(binaryView);
    expect(receivedBinary.buffer.byteLength).toBe(2);

    source[1] = 7;
    expect(receivedBinary).toEqual(new Uint8Array([1, 2]));
    receivedBinary[0] = 6;
    expect(binaryView).toEqual(new Uint8Array([7, 2]));

    gatewayA.destroy();
    gatewayB.destroy();
  });

  it('事务期间入队的跨 tab 事件，提交重放时不会被回灌回源 tab', async () => {
    // 模拟宿主处于事务中：dispatchEvent 只入队，监听器（含网关的 forward）要等 COMMIT 才跑
    const queued: RxDBEvent[] = [];
    const dispatchEventA = vi.fn();
    const dispatchEventB = vi.fn((event: RxDBEvent) => void queued.push(event));
    const addEventListenerA = vi.fn();
    const addEventListenerB = vi.fn();
    const removeEventListenerA = vi.fn();
    const removeEventListenerB = vi.fn();

    const gatewayA = new RxDBTabsGateway({ dbName: 'test-db-txn-echo', clientId: 'client-a' });
    const gatewayB = new RxDBTabsGateway({ dbName: 'test-db-txn-echo', clientId: 'client-b' });
    gatewayA.init(dispatchEventA, addEventListenerA, removeEventListenerA);
    gatewayB.init(dispatchEventB, addEventListenerB, removeEventListenerB);

    const forwardB = addEventListenerB.mock.calls.find(call => call[0] === ENTITY_LOCAL_CREATE_EVENT)?.[1];
    const forwardA = addEventListenerA.mock.calls.find(call => call[0] === ENTITY_LOCAL_CREATE_EVENT)?.[1];
    expect(forwardA).toBeDefined();
    expect(forwardB).toBeDefined();

    // A 本地写入 → 广播给 B；B 在事务中，事件被挂起
    forwardA!(
      new EntityLocalCreatedEvent([
        {
          type: 'INSERT',
          namespace: 'default',
          entity: 'User',
          id: 1n,
          patch: { id: 1n, amount: 9007199254740993n, payload: new Uint8Array([1, 2]) },
          inversePatch: null,
          recordAt: new Date()
        }
      ])
    );
    vi.runAllTimers();
    await Promise.resolve();

    expect(queued).toHaveLength(1);
    expect(dispatchEventA).not.toHaveBeenCalled();

    // B 事务提交，重放挂起事件 —— 此刻 #processingRemoteEvent 早已复位，
    // 只有事件自身携带的 cross-tab 标记能证明它不是本地写入
    forwardB!(queued[0]);
    vi.runAllTimers();
    await Promise.resolve();

    // A 不该收到自己那条写入的回灌
    expect(dispatchEventA).not.toHaveBeenCalled();

    gatewayA.destroy();
    gatewayB.destroy();
  });

  it('相同 messageId 重复投递应该被去重，不重复 dispatchEvent（RXD-007）', () => {
    const dispatchEvent = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const dbName = 'test-db-dedup';

    const gateway = new RxDBTabsGateway({ dbName, clientId: 'client-self' });
    gateway.init(dispatchEvent, addEventListener, removeEventListener);

    const listeners = broadcastTopics.get(`${dbName}_gateway`);
    expect(listeners).toBeDefined();

    const message = {
      type: GATEWAY_MESSAGE_ENTITY_EVENT,
      messageId: 'dup-1',
      clientId: 'client-remote',
      event: new EntityLocalCreatedEvent([
        {
          type: 'INSERT',
          namespace: 'default',
          entity: 'User',
          id: 1n,
          patch: { id: 1n, amount: 9007199254740993n, payload: new Uint8Array([1, 2]) },
          inversePatch: null,
          recordAt: new Date()
        }
      ])
    };

    // 同一条 messageId 被投递两次（模拟重叠订阅窗口或上游重放）
    listeners?.forEach(listener => listener(message));
    listeners?.forEach(listener => listener(message));

    expect(dispatchEvent).toHaveBeenCalledTimes(1);

    gateway.destroy();
  });

  it('应保留最早收到的 firstConnectedAt', () => {
    const dispatchEvent = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const dbName = 'test-db-first-connected-at';
    const gateway = new RxDBTabsGateway({ dbName, clientId: 'client-self' });

    gateway.init(dispatchEvent, addEventListener, removeEventListener);

    const listeners = broadcastTopics.get(`${dbName}_gateway`);
    expect(listeners).toBeDefined();

    const later = '2026-04-11T10:00:00.000Z';
    const earlier = '2026-04-11T09:00:00.000Z';

    listeners?.forEach(listener =>
      listener({
        type: GATEWAY_MESSAGE_FIRST_CONNECTED_AT,
        messageId: 'remote-1',
        clientId: 'client-remote-1',
        firstConnectedAt: later
      })
    );
    listeners?.forEach(listener =>
      listener({
        type: GATEWAY_MESSAGE_FIRST_CONNECTED_AT,
        messageId: 'remote-2',
        clientId: 'client-remote-2',
        firstConnectedAt: earlier
      })
    );

    expect(gateway.firstConnectedAt?.toISOString()).toBe(earlier);

    gateway.destroy();
  });
});

describe('GatewayMessage 类型', () => {
  it('应该正确定义实体事件消息类型', () => {
    const message: GatewayMessage = {
      type: GATEWAY_MESSAGE_ENTITY_EVENT,
      messageId: 'client-1:12345:0',
      clientId: 'client-1',
      event: new EntityLocalCreatedEvent([
        {
          type: 'INSERT',
          namespace: 'default',
          entity: 'User',
          id: '1',
          patch: { id: '1', name: 'Test' },
          inversePatch: null,
          recordAt: new Date()
        }
      ])
    };

    expect(message.type).toBe(GATEWAY_MESSAGE_ENTITY_EVENT);
    expect(message.clientId).toBe('client-1');
    expect(message.event).toBeInstanceOf(EntityLocalCreatedEvent);
  });

  it('应该正确定义 Hello 消息类型', () => {
    const message: GatewayMessage = {
      type: GATEWAY_MESSAGE_HELLO,
      messageId: 'client-1:12345:0',
      clientId: 'client-1'
    };

    expect(message.type).toBe(GATEWAY_MESSAGE_HELLO);
  });

  it('应该正确定义 FirstConnectedAt 消息类型', () => {
    const message: GatewayMessage = {
      type: GATEWAY_MESSAGE_FIRST_CONNECTED_AT,
      messageId: 'client-1:12345:0',
      clientId: 'client-1',
      firstConnectedAt: new Date().toISOString()
    };

    expect(message.type).toBe(GATEWAY_MESSAGE_FIRST_CONNECTED_AT);
    expect(typeof message.firstConnectedAt).toBe('string');
  });
});
