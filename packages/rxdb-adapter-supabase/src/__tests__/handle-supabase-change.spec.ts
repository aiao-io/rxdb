import { EntityRemoteCreatedEvent, EntityRemoteRemovedEvent, EntityRemoteUpdatedEvent } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { describe, expect, it, vi } from 'vitest';
import { handleSupabaseChanges, RXDB_CHANGES_EVENT, RXDB_CHANGES_TOPIC } from '../handle_supabase_change.js';
import type { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';

type AdapterMock = RxDBAdapterSupabase & {
  rxdb: {
    context: { clientId?: string };
    config: { entities: [typeof Todo] };
    dispatchEvent: ReturnType<typeof vi.fn>;
  };
};

/** 参考 SQL 的 rxdb_change_broadcast 发出的一条变更：只有元数据 */
const BASE_CHANGE = {
  namespace: 'public',
  entity: 'Todo',
  entityId: 'entity-id-1',
  type: 'INSERT',
  branchId: 'main',
  clientId: 'remote-client',
  createdAt: new Date().toISOString()
} satisfies Record<string, unknown>;

function makeChange(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...BASE_CHANGE, ...overrides };
}

function makePayload(changes: unknown[] = [makeChange()]): unknown {
  return { changes, id: 'realtime-generated-id' };
}

function makeAdapter(clientId?: string): AdapterMock {
  return {
    rxdb: {
      context: { clientId },
      config: { entities: [Todo] },
      dispatchEvent: vi.fn()
    }
  } as unknown as AdapterMock;
}

function dispatched(adapter: AdapterMock) {
  return adapter.rxdb.dispatchEvent.mock.calls.map(
    call => call[0] as EntityRemoteCreatedEvent | EntityRemoteUpdatedEvent | EntityRemoteRemovedEvent
  );
}

describe('handleSupabaseChanges', () => {
  it('频道与事件名与参考 SQL 的 realtime.send 一致', () => {
    expect(RXDB_CHANGES_TOPIC).toBe('rxdb:changes');
    expect(RXDB_CHANGES_EVENT).toBe('changes');
  });

  describe('前置守卫（Guard）', () => {
    it.each([
      ['载荷不是对象', null],
      ['载荷是字符串', 'changes'],
      ['没有 changes 数组', { id: 'x' }],
      ['changes 不是数组', { changes: makeChange() }]
    ])('%s时不分发事件', (_label, payload) => {
      const adapter = makeAdapter();
      handleSupabaseChanges(adapter, payload);
      expect(adapter.rxdb.dispatchEvent).not.toHaveBeenCalled();
    });

    it.each([
      ['条目不是对象', 'not-a-change'],
      ['entityId 缺失', makeChange({ entityId: undefined })],
      ['entityId 为空串', makeChange({ entityId: '' })],
      ['type 缺失', makeChange({ type: undefined })],
      ['type 为未知值', makeChange({ type: 'UNKNOWN_OP' })],
      ['type 是原型链上的键', makeChange({ type: 'toString' })],
      ['实体不在本库配置里', makeChange({ entity: 'NotConfigured' })]
    ])('%s时跳过该条', (_label, change) => {
      const adapter = makeAdapter();
      handleSupabaseChanges(adapter, makePayload([change]));
      expect(adapter.rxdb.dispatchEvent).not.toHaveBeenCalled();
    });
  });

  describe('自身 clientId 过滤', () => {
    it('clientId 与本端相同时过滤，不分发', () => {
      const adapter = makeAdapter('my-client-id');
      handleSupabaseChanges(adapter, makePayload([makeChange({ clientId: 'my-client-id' })]));
      expect(adapter.rxdb.dispatchEvent).not.toHaveBeenCalled();
    });

    it.each([
      ['clientId 为 null', 'my-client-id', makeChange({ clientId: null })],
      ['本端没有 clientId', undefined, makeChange()],
      ['clientId 不同', 'client-A', makeChange({ clientId: 'client-B' })]
    ])('%s时照常分发', (_label, myClientId, change) => {
      const adapter = makeAdapter(myClientId);
      handleSupabaseChanges(adapter, makePayload([change]));
      expect(adapter.rxdb.dispatchEvent).toHaveBeenCalledOnce();
    });
  });

  describe('事件类型路由', () => {
    it.each([
      ['INSERT', EntityRemoteCreatedEvent],
      ['UPDATE', EntityRemoteUpdatedEvent],
      ['DELETE', EntityRemoteRemovedEvent]
    ])('type=%s → 对应的 Remote 事件', (type, EventClass) => {
      const adapter = makeAdapter();
      handleSupabaseChanges(adapter, makePayload([makeChange({ type })]));
      expect(dispatched(adapter)).toHaveLength(1);
      expect(dispatched(adapter)[0]).toBeInstanceOf(EventClass);
    });
  });

  describe('事件数据字段', () => {
    it('只带元数据：data 只有 id，没有任何行内容', () => {
      const adapter = makeAdapter();
      handleSupabaseChanges(adapter, makePayload([makeChange({ patch: { title: 'leaked' } })]));

      const [entity] = dispatched(adapter)[0].entities;
      expect(entity).toMatchObject({ id: 'entity-id-1', entity: 'Todo', namespace: 'public', branchId: 'main' });
      expect(entity.data).toEqual({ id: 'entity-id-1' });
    });

    it('namespace 缺失时默认为 public', () => {
      const adapter = makeAdapter();
      handleSupabaseChanges(adapter, makePayload([makeChange({ namespace: undefined })]));
      expect(dispatched(adapter)[0].entities[0].namespace).toBe('public');
    });

    it('recordAt 取 createdAt；缺失时用当前时间', () => {
      const createdAt = '2026-11-19T08:00:00.000Z';
      const withTime = makeAdapter();
      handleSupabaseChanges(withTime, makePayload([makeChange({ createdAt })]));
      expect(dispatched(withTime)[0].entities[0].recordAt).toEqual(new Date(createdAt));

      const withoutTime = makeAdapter();
      handleSupabaseChanges(withoutTime, makePayload([makeChange({ createdAt: undefined })]));
      expect(dispatched(withoutTime)[0].entities[0].recordAt).toBeInstanceOf(Date);
    });
  });

  describe('一条通知里的多条变更', () => {
    it('相邻同类型合成一个事件，类型切换时另起一个，顺序不变', () => {
      const adapter = makeAdapter('my-client-id');
      handleSupabaseChanges(
        adapter,
        makePayload([
          makeChange({ entityId: 'a', type: 'INSERT' }),
          makeChange({ entityId: 'b', type: 'INSERT' }),
          makeChange({ entityId: 'mine', type: 'INSERT', clientId: 'my-client-id' }),
          makeChange({ entityId: 'c', type: 'UPDATE' }),
          makeChange({ entityId: 'd', type: 'INSERT', branchId: 'feature' })
        ])
      );

      const events = dispatched(adapter);
      expect(events.map(event => event.constructor)).toEqual([
        EntityRemoteCreatedEvent,
        EntityRemoteUpdatedEvent,
        EntityRemoteCreatedEvent
      ]);
      expect(events.map(event => event.entities.map(entity => entity.id))).toEqual([['a', 'b'], ['c'], ['d']]);
      expect(events[2].entities[0].branchId).toBe('feature');
    });

    it('全部被过滤时不分发', () => {
      const adapter = makeAdapter('my-client-id');
      handleSupabaseChanges(
        adapter,
        makePayload([makeChange({ clientId: 'my-client-id' }), makeChange({ entity: 'NotConfigured' })])
      );
      expect(adapter.rxdb.dispatchEvent).not.toHaveBeenCalled();
    });
  });
});
