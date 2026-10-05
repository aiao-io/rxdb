import { EntityLocalUpdatedEvent, RxDB } from '@aiao/rxdb';
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
  const database = new RxDB({ dbName: 'review-parallel-broadcast', entities: [] });
  const broadcaster = createChangeBroadcaster(subscribers);
  broadcaster.attach(database);
  return { database, broadcaster, broadcast };
}

describe('并行评审：批量变更通知不能把其他写入者的变更当作自回声', () => {
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
});
