/**
 * 变更通知的事件驱动桥（US-216 B1）。
 *
 * @remarks
 * 把 RxDB 的 `ENTITY_LOCAL_CREATE / UPDATE / REMOVE` 三个实体事件翻译成 SSE 广播，
 * 替代此前在写端点里**手动**调 `broadcastChange` 的做法（阶段 A）。结构收益在
 * D8：core 的 `dispatchEvent` 把事务内的实体事件缓冲到 `TRANSACTION_COMMIT` 才派发，
 * 「写入落库之后广播」这条协议语义由核心机制保证，不靠端点调用点再判一次。
 *
 * 载荷 `{ entity, clientId }`：`entity` 取事件里的实体名（过滤到 `Recipe`），
 * `clientId` 回显的是发起方请求头里的 `x-client-id`。后者是**每请求**值、不是事件值，
 * 事件本身不带它，因此写端点成功后才 {@link ChangeBroadcaster.recordWrite}，
 * 事件派发时把「最近一次写入」的 clientId 回显出去。
 * 写失败不 recordWrite，也就不广播、不泄漏 clientId 给下一条写。
 *
 * 内部写入（种子、reset 重建）同样产生 Recipe 事件、同样广播——这正是 B1 的判据：
 * 「库里的行变没变」，不是「这条路径属不属于协议」。
 */

import {
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_REMOVE_EVENT,
  ENTITY_LOCAL_UPDATE_EVENT,
  type EntityLocalCreatedEvent,
  type EntityLocalRemovedEvent,
  type EntityLocalUpdatedEvent,
  type RxDB
} from '@aiao/rxdb';

import { broadcastChange } from './change-feed.ts';
import type { ChangeSubscribers } from './change-subscribers.ts';
import { CLIENT_ENTITY_NAME } from './config.ts';

/** 三条实体事件里带 `.entities` 的那一类。 */
type EntityEvent = EntityLocalCreatedEvent | EntityLocalUpdatedEvent | EntityLocalRemovedEvent;

/** 变更广播桥。写端点与 `__control` 在写成功后调用它登记 clientId。 */
export interface ChangeBroadcaster {
  /** 一次写入**成功后**调用：登记本次写入的 `x-client-id`（可缺省）。 */
  recordWrite(clientId: string | undefined): void;
  /** 把实体事件监听器挂到给定的 RxDB 实例上。`reset` 换实例后须重新挂。 */
  attach(rxdb: RxDB): void;
}

/** 建桥。`subscribers` 是 SSE 连接名册（见 `change-subscribers.ts`）。 */
export const createChangeBroadcaster = (subscribers: ChangeSubscribers): ChangeBroadcaster => {
  // 「最近一次写入」的 clientId + 有没有对应写入。这里**不能**用 FIFO 队列：
  // pglite 的 NOTIFY 批量窗口会把时间上相邻的多次写入（如 reset 的种子 + 下一条
  // create）聚合成**一条**实体事件，写与事件不再是 1:1。队列会在「两次写、一条事件」
  // 时留下一条陈旧 clientId，被更晚的事件错拿（e2e 里表现为「抑制回声」计数为 0）。
  // 单槽位只要被后续 recordWrite 覆盖，聚合事件广播的就是「当前」这次写的 clientId，
  // 而 demo 的写入是串行的（单进程 + pglite 队列），单槽位足够。
  let pendingClientId: string | undefined;
  let hasPendingWrite = false;

  const onEntityEvent = (event: EntityEvent): void => {
    if (!event.entities.some(item => item.entity === CLIENT_ENTITY_NAME)) return;
    // 只有「有对应写入」才广播：槽位空意味着这条事件不是任何一次写端点产生的——
    // 典型的例子是 `createDemoServer` 的启动种子（它在任何 `recordWrite` 之前落库）。
    if (!hasPendingWrite) return;
    hasPendingWrite = false;
    broadcastChange(subscribers, CLIENT_ENTITY_NAME, pendingClientId);
  };

  return {
    recordWrite: clientId => {
      pendingClientId = clientId;
      hasPendingWrite = true;
    },
    attach: rxdb => {
      rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, onEntityEvent);
      rxdb.addEventListener(ENTITY_LOCAL_UPDATE_EVENT, onEntityEvent);
      rxdb.addEventListener(ENTITY_LOCAL_REMOVE_EVENT, onEntityEvent);
    }
  };
};
