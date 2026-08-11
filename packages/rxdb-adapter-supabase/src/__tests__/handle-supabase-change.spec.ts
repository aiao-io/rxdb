import { EntityRemoteCreatedEvent, EntityRemoteRemovedEvent, EntityRemoteUpdatedEvent } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { handleSupabaseChange } from '../handle_supabase_change.js';
import type { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';

type SupabasePayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

type AdapterMock = RxDBAdapterSupabase & {
  rxdb: {
    context: { clientId?: string };
    config: { entities: [typeof Todo] };
    dispatchEvent: ReturnType<typeof vi.fn>;
  };
};

const BASE_CHANGE = {
  namespace: 'public',
  entity: 'Todo',
  entityId: 'entity-id-1',
  type: 'INSERT',
  branchId: 'main',
  patch: { title: 'test' },
  clientId: 'remote-client',
  createdAt: new Date().toISOString()
} satisfies Record<string, unknown>;

function makePayload(overrides: Record<string, unknown> = {}): SupabasePayload {
  return {
    table: 'rxdb_change',
    eventType: 'INSERT',
    new: BASE_CHANGE,
    ...overrides
  } as unknown as SupabasePayload;
}

function makeChange(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...BASE_CHANGE, ...overrides };
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

describe('handleSupabaseChange', () => {
  describe('前置守卫（Guard）', () => {
    it('table 不是 rxdb_change 时不分发事件', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload({ table: 'other_table' }));
      expect(adapter.rxdb.dispatchEvent).not.toHaveBeenCalled();
    });

    it('eventType 不是 INSERT 时不分发事件', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload({ eventType: 'UPDATE' }));
      expect(adapter.rxdb.dispatchEvent).not.toHaveBeenCalled();
    });

    it('eventType 为 DELETE 时不分发事件', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload({ eventType: 'DELETE' }));
      expect(adapter.rxdb.dispatchEvent).not.toHaveBeenCalled();
    });

    it('record.new 为 undefined 时不分发事件', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload({ new: undefined }));
      expect(adapter.rxdb.dispatchEvent).not.toHaveBeenCalled();
    });

    it('entityId 缺失时不分发事件', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload({ new: makeChange({ entityId: undefined }) }));
      expect(adapter.rxdb.dispatchEvent).not.toHaveBeenCalled();
    });

    it('type 缺失时不分发事件', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload({ new: makeChange({ type: undefined }) }));
      expect(adapter.rxdb.dispatchEvent).not.toHaveBeenCalled();
    });

    it('type 为未知值时不分发事件', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload({ new: makeChange({ type: 'UNKNOWN_OP' }) }));
      expect(adapter.rxdb.dispatchEvent).not.toHaveBeenCalled();
    });
  });

  describe('自身 clientId 过滤', () => {
    it('clientId 与 myClientId 相同时过滤，不分发', () => {
      const adapter = makeAdapter('my-client-id');
      handleSupabaseChange(adapter, makePayload({ new: makeChange({ clientId: 'my-client-id' }) }));
      expect(adapter.rxdb.dispatchEvent).not.toHaveBeenCalled();
    });

    it('clientId 为 null 时不过滤（仍然分发）', () => {
      const adapter = makeAdapter('my-client-id');
      handleSupabaseChange(adapter, makePayload({ new: makeChange({ clientId: null }) }));
      expect(adapter.rxdb.dispatchEvent).toHaveBeenCalledOnce();
    });

    it('adapter 没有 clientId 时不过滤（仍然分发）', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload());
      expect(adapter.rxdb.dispatchEvent).toHaveBeenCalledOnce();
    });

    it('不同 clientId 不过滤（仍然分发）', () => {
      const adapter = makeAdapter('client-A');
      handleSupabaseChange(adapter, makePayload({ new: makeChange({ clientId: 'client-B' }) }));
      expect(adapter.rxdb.dispatchEvent).toHaveBeenCalledOnce();
    });
  });

  describe('事件类型路由', () => {
    it('type=INSERT → 分发 EntityRemoteCreatedEvent', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload({ new: makeChange({ type: 'INSERT' }) }));

      expect(adapter.rxdb.dispatchEvent).toHaveBeenCalledOnce();
      expect(adapter.rxdb.dispatchEvent.mock.calls[0][0]).toBeInstanceOf(EntityRemoteCreatedEvent);
    });

    it('type=UPDATE → 分发 EntityRemoteUpdatedEvent', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload({ new: makeChange({ type: 'UPDATE' }) }));

      expect(adapter.rxdb.dispatchEvent.mock.calls[0][0]).toBeInstanceOf(EntityRemoteUpdatedEvent);
    });

    it('type=DELETE → 分发 EntityRemoteRemovedEvent', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload({ new: makeChange({ type: 'DELETE' }) }));

      expect(adapter.rxdb.dispatchEvent.mock.calls[0][0]).toBeInstanceOf(EntityRemoteRemovedEvent);
    });
  });

  describe('事件数据字段', () => {
    it('entities[0].id 等于 entityId', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload());

      const event = adapter.rxdb.dispatchEvent.mock.calls[0][0] as EntityRemoteCreatedEvent;
      expect(event.entities[0].id).toBe('entity-id-1');
    });

    it('entities[0].entity 等于实体名称', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload());

      const event = adapter.rxdb.dispatchEvent.mock.calls[0][0] as EntityRemoteCreatedEvent;
      expect(event.entities[0].entity).toBe('Todo');
    });

    it('entities[0].namespace 等于 namespace', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload());

      const event = adapter.rxdb.dispatchEvent.mock.calls[0][0] as EntityRemoteCreatedEvent;
      expect(event.entities[0].namespace).toBe('public');
    });

    it('entities[0].data 包含 patch 数据', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload());

      const event = adapter.rxdb.dispatchEvent.mock.calls[0][0] as EntityRemoteCreatedEvent;
      expect((event.entities[0].data as Record<string, unknown>)['title']).toBe('test');
    });

    it('namespace 缺失时默认为 public', () => {
      const adapter = makeAdapter();
      handleSupabaseChange(adapter, makePayload({ new: makeChange({ namespace: undefined }) }));

      const event = adapter.rxdb.dispatchEvent.mock.calls[0][0] as EntityRemoteCreatedEvent;
      expect(event.entities[0].namespace).toBe('public');
    });

    it('createdAt 缺失时 recordAt 使用 Date（不抛错）', () => {
      const adapter = makeAdapter();
      const payload = makePayload({ new: makeChange({ createdAt: undefined }) });
      expect(() => handleSupabaseChange(adapter, payload)).not.toThrow();

      const event = adapter.rxdb.dispatchEvent.mock.calls[0][0] as EntityRemoteCreatedEvent;
      expect(event.entities[0].recordAt).toBeInstanceOf(Date);
    });
  });
});
