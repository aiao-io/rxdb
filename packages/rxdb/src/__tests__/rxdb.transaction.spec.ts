import { describe, expect, it, vi } from 'vitest';

import { EntityLocalCreatedEvent, RxDBEvent, RxDBEventMap } from '../rxdb-events.js';
import {
  closeTransactionContext,
  emitEvent,
  findTransactionContext,
  handleTransactionBegin,
  handleTransactionCommit,
  runIsolated
} from '../rxdb.transaction.js';
import type { EventListener, TransactionContext } from '../rxdb.types.js';

type EventMap = Map<keyof RxDBEventMap, Set<EventListener<RxDBEvent>>>;

/** 造一个只挂了 `entity:local:create` 监听器的事件表 */
function createEventMap(...listeners: EventListener<RxDBEvent>[]): EventMap {
  const map: EventMap = new Map();
  map.set(new EntityLocalCreatedEvent([]).type as keyof RxDBEventMap, new Set(listeners));
  return map;
}

describe('runIsolated', () => {
  it('单项抛错不阻断其余项，跑完后重抛首个异常', () => {
    const seen: number[] = [];
    const boom = new Error('第二项炸了');

    expect(() =>
      runIsolated([1, 2, 3], item => {
        seen.push(item);
        if (item === 2) throw boom;
      })
    ).toThrow(boom);

    expect(seen).toEqual([1, 2, 3]);
  });

  it('多项抛错时只重抛第一个', () => {
    const first = new Error('first');
    expect(() =>
      runIsolated([first, new Error('second')], error => {
        throw error;
      })
    ).toThrow(first);
  });
});

describe('emitEvent', () => {
  it('同一事件内 fail-fast：一个监听器抛错，后面的不再调用', () => {
    const boom = new Error('监听器炸了');
    const first = vi.fn(() => {
      throw boom;
    });
    const second = vi.fn();
    const event = new EntityLocalCreatedEvent([]);

    expect(() => emitEvent(createEventMap(first, second), undefined, event)).toThrow(boom);

    // 这是**有意**的契约，不是漏隔离：继续调用后续监听器等于替出错方兜底，
    // 与「暴露问题而不是兜底」相悖。跨项隔离只用于批量语义（事务事件的监听器列表、
    // 提交/回滚排空队列时的事件之间），由调用点自己包 runIsolated。
    // 对应契约测试见 `RxDB.spec.ts`「普通事件监听器抛错时应该保持 fail-fast」。
    expect(first).toHaveBeenCalledWith(event);
    expect(second).not.toHaveBeenCalled();
  });

  it('没有该类型的监听器时静默返回', () => {
    expect(() => emitEvent(new Map(), undefined, new EntityLocalCreatedEvent([]))).not.toThrow();
  });

  it('监听器以 listenerThis 为 this 调用', () => {
    const owner = { tag: 'rxdb' };
    const listener = vi.fn();

    emitEvent(createEventMap(listener), owner, new EntityLocalCreatedEvent([]));

    expect(listener.mock.contexts[0]).toBe(owner);
  });
});

describe('事务上下文栈', () => {
  it('同身份再次 BEGIN 记为 savepoint 嵌套，不同身份另起上下文', () => {
    const stack: TransactionContext[] = [];
    handleTransactionBegin(stack, { transactionId: 'tx-a' } as never);
    handleTransactionBegin(stack, { transactionId: 'tx-a' } as never);
    expect(stack).toHaveLength(1);
    expect(stack[0].depth).toBe(2);

    handleTransactionBegin(stack, { transactionId: 'tx-b' } as never);
    expect(stack.map(context => context.id)).toEqual(['tx-a', 'tx-b']);
  });

  it('findTransactionContext 从栈顶往下取最内层的同身份上下文', () => {
    const outer: TransactionContext = { id: 'tx', depth: 1, events: [] };
    const inner: TransactionContext = { id: 'tx', depth: 1, events: [] };
    expect(findTransactionContext([outer, inner], 'tx')).toBe(inner);
    expect(findTransactionContext([outer, inner], 'missing')).toBeUndefined();
  });

  it('closeTransactionContext 摘掉的是指定上下文，不是栈顶', () => {
    const target: TransactionContext = { id: 'tx-a', depth: 1, events: [] };
    const top: TransactionContext = { id: 'tx-b', depth: 1, events: [] };
    const stack = [target, top];
    closeTransactionContext(stack, target);
    expect(stack).toEqual([top]);
  });

  it('排空队列时一个事件的监听器抛错不影响后续事件', () => {
    const boom = new Error('第一个事件的监听器炸了');
    const firstEvent = new EntityLocalCreatedEvent([]);
    const secondEvent = new EntityLocalCreatedEvent([]);
    const listener = vi.fn((event: RxDBEvent) => {
      if (event === firstEvent) throw boom;
    });

    const stack: TransactionContext[] = [];
    handleTransactionBegin(stack, { transactionId: 'tx' } as never);
    stack[0].events.push(firstEvent, secondEvent);

    expect(() =>
      handleTransactionCommit(stack, createEventMap(listener as EventListener<RxDBEvent>), undefined, {
        transactionId: 'tx'
      } as never)
    ).toThrow(boom);

    expect(listener).toHaveBeenCalledTimes(2);
    // 抛错也要把上下文摘掉，否则这个事务永远留在栈上
    expect(stack).toEqual([]);
  });
});
