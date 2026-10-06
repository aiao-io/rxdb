import { EntityLocalCreatedEvent, EntityLocalRemovedEvent, EntityLocalUpdatedEvent, RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { createChangeBroadcaster } from '../change-broadcaster.ts';
import type { ChangeSubscribers } from '../change-subscribers.ts';
import { CLIENT_ENTITY_NAME } from '../config.ts';

function aggregatedUpdate(ids: string[]): EntityLocalUpdatedEvent {
  return new EntityLocalUpdatedEvent(
    ids.map(id => ({
      type: 'UPDATE',
      namespace: 'public',
      entity: CLIENT_ENTITY_NAME,
      id,
      patch: {},
      inversePatch: {},
      recordAt: new Date()
    }))
  );
}

function setup() {
  const broadcast = vi.fn<(frame: string) => void>();
  const subscribers: ChangeSubscribers = {
    add: () => undefined,
    size: () => 0,
    broadcast,
    closeAll: () => undefined
  };
  const database = new RxDB({ dbName: 'change-broadcaster-test', entities: [], sync: { type: SyncType.None } });
  const broadcaster = createChangeBroadcaster(subscribers);
  broadcaster.attach(database);
  return { database, broadcaster, broadcast };
}

describe('批量变更通知不能把其他写入者的变更当作自回声（RV-074）', () => {
  it('单写入者仍回显自己的 clientId', () => {
    const { database, broadcaster, broadcast } = setup();
    broadcaster.recordWrite('client-a');
    database.dispatchEvent(aggregatedUpdate(['row-a']));
    expect(broadcast.mock.calls.map(([frame]) => frame)).toEqual([
      `data:${JSON.stringify({ entity: CLIENT_ENTITY_NAME, clientId: 'client-a' })}\n\n`
    ]);
  });

  it('两名写入者合成一个事件时，不把整个批次归给最后一名写入者', () => {
    const { database, broadcaster, broadcast } = setup();
    broadcaster.recordWrite('client-a');
    broadcaster.recordWrite('client-b');
    database.dispatchEvent(aggregatedUpdate(['row-a', 'row-b']));
    expect(broadcast.mock.calls.map(([frame]) => frame)).toEqual([
      `data:${JSON.stringify({ entity: CLIENT_ENTITY_NAME })}\n\n`
    ]);
  });

  it('同一 client 的两次写入聚合为一个事件，仍归给该 client（回归：去重不误伤单作者）', () => {
    const { database, broadcaster, broadcast } = setup();
    broadcaster.recordWrite('client-a');
    broadcaster.recordWrite('client-a');
    database.dispatchEvent(aggregatedUpdate(['row-a', 'row-b']));
    expect(broadcast.mock.calls.map(([frame]) => frame)).toEqual([
      `data:${JSON.stringify({ entity: CLIENT_ENTITY_NAME, clientId: 'client-a' })}\n\n`
    ]);
  });

  it('一次写入缺失 clientId 与另一次带 clientId 混合时，不标任何 clientId（回归：作者缺失按混合处理）', () => {
    const { database, broadcaster, broadcast } = setup();
    broadcaster.recordWrite(undefined);
    broadcaster.recordWrite('client-a');
    database.dispatchEvent(aggregatedUpdate(['row-a', 'row-b']));
    expect(broadcast.mock.calls.map(([frame]) => frame)).toEqual([
      `data:${JSON.stringify({ entity: CLIENT_ENTITY_NAME })}\n\n`
    ]);
  });

  it('内部 seed 产生的事件（未调用 recordWrite）不广播，不与随后的外部写混淆（回归）', () => {
    const { database, broadcaster, broadcast } = setup();
    // 内部种子：先落库事件，期间没有任何 recordWrite
    database.dispatchEvent(aggregatedUpdate(['seed-a']));
    broadcaster.recordWrite('client-a');
    database.dispatchEvent(aggregatedUpdate(['row-a']));
    expect(broadcast.mock.calls.map(([frame]) => frame)).toEqual([
      `data:${JSON.stringify({ entity: CLIENT_ENTITY_NAME, clientId: 'client-a' })}\n\n`
    ]);
  });

  it('消费后的来源集合会清空，不泄漏给下一批事件（回归：并发连续两批不互相污染）', () => {
    const { database, broadcaster, broadcast } = setup();
    broadcaster.recordWrite('client-a');
    broadcaster.recordWrite('client-b');
    database.dispatchEvent(aggregatedUpdate(['row-a', 'row-b']));
    broadcaster.recordWrite('client-c');
    database.dispatchEvent(aggregatedUpdate(['row-c']));
    expect(broadcast.mock.calls.map(([frame]) => frame)).toEqual([
      `data:${JSON.stringify({ entity: CLIENT_ENTITY_NAME })}\n\n`,
      `data:${JSON.stringify({ entity: CLIENT_ENTITY_NAME, clientId: 'client-c' })}\n\n`
    ]);
  });

  /**
   * 一次写入（如 `__control` 的 reset：先删后种）在同一批里同时产出 REMOVE 与 CREATE。
   * core 在 TRANSACTION_COMMIT 时同步排空整批事件，中间插不进别的 `recordWrite`，
   * 所以首条事件消费的写入者集合已覆盖整批；载荷只有实体名，同批后续事件再广播只是重复帧。
   * 这条锁住「同批只发一帧、归属不丢、不串到下一次写」，防止有人把去重误当成丢事件去「修」。
   */
  it('同一批里多种事件类型只广播一帧，且不把来源串给下一次写入', () => {
    const { database, broadcaster, broadcast } = setup();
    broadcaster.recordWrite('client-a');
    database.dispatchEvent(
      new EntityLocalRemovedEvent([
        {
          type: 'DELETE',
          namespace: 'public',
          entity: CLIENT_ENTITY_NAME,
          id: 'old',
          patch: null,
          inversePatch: {},
          recordAt: new Date()
        }
      ])
    );
    database.dispatchEvent(
      new EntityLocalCreatedEvent([
        {
          type: 'INSERT',
          namespace: 'public',
          entity: CLIENT_ENTITY_NAME,
          id: 'new',
          patch: {},
          inversePatch: null,
          recordAt: new Date()
        }
      ])
    );
    database.dispatchEvent(aggregatedUpdate(['new']));
    broadcaster.recordWrite('client-b');
    database.dispatchEvent(aggregatedUpdate(['row-b']));
    expect(broadcast.mock.calls.map(([frame]) => frame)).toEqual([
      `data:${JSON.stringify({ entity: CLIENT_ENTITY_NAME, clientId: 'client-a' })}\n\n`,
      `data:${JSON.stringify({ entity: CLIENT_ENTITY_NAME, clientId: 'client-b' })}\n\n`
    ]);
  });
});
