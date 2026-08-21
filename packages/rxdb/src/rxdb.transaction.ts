import {
  isCrossTabEvent,
  RxDBEvent,
  RxDBEventMap,
  type TransactionBeginEvent,
  type TransactionCommitEvent,
  type TransactionRollbackEvent
} from './rxdb-events.js';
import { EventListener, TransactionContext } from './rxdb.types.js';

/**
 * 取与该身份匹配、最内层的打开中事务。
 *
 * @remarks
 * 从栈顶往下找：同一身份可能因 savepoint 嵌套出现多次，最内层的那个才是当前上下文。
 */
export function findTransactionContext(
  stack: TransactionContext[],
  transactionId: string | undefined
): TransactionContext | undefined {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index].id === transactionId) return stack[index];
  }
  return undefined;
}

/** 把事务上下文从栈里摘掉——它可能不在栈顶（并发事务先提交内层之外的那个） */
export function closeTransactionContext(stack: TransactionContext[], context: TransactionContext): void {
  const index = stack.indexOf(context);
  if (index >= 0) stack.splice(index, 1);
}

/**
 * 逐项调用 fn，任一项抛错都不阻断其余项——收集首个异常，全部跑完后重抛。
 * 用于「批量」语义的场景（事务事件的监听器列表、事务提交/回滚排空的队列事件）：
 * 单项失败不应该让同批次里排在它后面的项被静默跳过。
 */
export function runIsolated<T>(items: Iterable<T>, fn: (item: T) => void): void {
  let failed = false;
  let firstError: unknown;
  for (const item of items) {
    try {
      fn(item);
    } catch (error) {
      if (!failed) {
        failed = true;
        firstError = error;
      }
    }
  }
  if (failed) throw firstError;
}

/**
 * 直接把事件交给监听器，跳过事务排队。
 *
 * @remarks
 * 排空某个事务的队列时必须走这里而不是 `dispatchEvent`：并发事务下另一个上下文
 * 可能还开着，走 `dispatchEvent` 会把刚放行的事件重新塞进它的队列。
 */
export function emitEvent(
  event_map: Map<keyof RxDBEventMap, Set<EventListener<RxDBEvent>>>,
  listenerThis: unknown,
  event: RxDBEvent
): void {
  // 快照理由同 dispatchEvent
  const listeners = event_map.get(event.type as keyof RxDBEventMap) ?? new Set<EventListener<RxDBEvent>>();
  Array.from(listeners).forEach(listener => listener.call(listenerThis, event));
}

/** 事务开始：同身份的再次 BEGIN 是 savepoint 嵌套，不同身份另起一个上下文 */
export function handleTransactionBegin(stack: TransactionContext[], event: TransactionBeginEvent): void {
  const top = stack.at(-1);
  if (top !== undefined && top.id === event.transactionId) {
    top.depth += 1;
    return;
  }
  stack.push({ id: event.transactionId, depth: 1, events: [] });
}

/** 事务结束，发送**本事务**期间记录的实体事件 */
export function handleTransactionCommit(
  stack: TransactionContext[],
  event_map: Map<keyof RxDBEventMap, Set<EventListener<RxDBEvent>>>,
  listenerThis: unknown,
  event: TransactionCommitEvent
): void {
  const context = findTransactionContext(stack, event.transactionId);
  // 没有匹配的打开中事务：迟到或重复的 COMMIT，不能把其他事务的队列当作当前队列
  if (context === undefined) return;
  if (context.depth > 1) {
    context.depth -= 1;
    return;
  }

  closeTransactionContext(stack, context);
  // 队列已清空，无法重放：某个事件的监听器抛错不能中止排空循环，否则它之后的
  // 队列事件永久丢失。逐个隔离，全部排空后再重抛首个异常。
  runIsolated(context.events, queued => emitEvent(event_map, listenerThis, queued));
}

/**
 * 事务回滚：回滚中止**本事务**的整个嵌套栈（无 savepoint 语义），不管深度直接摘掉。
 *
 * 但只丢弃**本 tab 本次事务**产生的事件：队列里还可能躺着他 tab 的变更，
 * 那是别处已经成功提交的写入，与本地回滚没有因果关系。一并丢掉会让本 tab 的 UI
 * 与其他 tab 永久不一致，直到下次全量刷新。跨 tab 事件照常派发。
 */
export function handleTransactionRollback(
  stack: TransactionContext[],
  event_map: Map<keyof RxDBEventMap, Set<EventListener<RxDBEvent>>>,
  listenerThis: unknown,
  event: TransactionRollbackEvent
): void {
  const context = findTransactionContext(stack, event.transactionId);
  if (context === undefined) return;
  closeTransactionContext(stack, context);
  runIsolated(context.events.filter(isCrossTabEvent), queued => emitEvent(event_map, listenerThis, queued));
}
