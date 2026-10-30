import { type RxDB, type RxDBMutationsMap } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';

type RpcPayload = {
  p_upserts: Array<{ table: string; schema: string; data: unknown[] }>;
  p_updates?: Array<{ table: string; schema: string; data: Record<string, unknown>[] }>;
  p_deletes: Array<{ table: string; schema: string; ids: string[] }>;
};

function todo(data: Partial<Todo>): Todo {
  return { id: crypto.randomUUID(), ...data } as Todo;
}

function createAdapter(rows: unknown[], userId?: string) {
  const rpc = vi
    .fn<(name: string, payload: RpcPayload) => Promise<unknown>>()
    .mockResolvedValue({ data: { upserted: rows }, error: null });
  const client = { rpc } as unknown as SupabaseClient;
  const rxdb = {
    context: { userId },
    reachability: { report: () => undefined }
  } as unknown as RxDB;
  return { adapter: new RxDBAdapterSupabase(rxdb, { client }), rpc };
}

describe('US-223 mutations() 的更新载荷', () => {
  it('新增与更新分开发送，保留整实体列与现有审计字段语义', async () => {
    const created = todo({ title: 'created', completed: false });
    const updated = todo({ title: 'updated', completed: true, createdBy: '00000000-0000-4000-8000-000000000001' });
    const finalRows = [
      { ...created, createdBy: 'editor', updatedBy: 'editor' },
      { ...updated, createdBy: '00000000-0000-4000-8000-000000000001', updatedBy: 'editor', updatedAt: 'server-time' }
    ];
    const { adapter, rpc } = createAdapter(finalRows, 'editor');

    const result = await adapter.mutations({
      create: new Map([[Todo, new Set([created])]]),
      update: new Map([[Todo, new Set([updated])]]),
      remove: new Map()
    });

    expect(rpc).toHaveBeenCalledExactlyOnceWith('rxdb_mutations', {
      p_upserts: [
        { table: 'todos', schema: 'public', data: [{ ...created, createdBy: 'editor', updatedBy: 'editor' }] }
      ],
      p_updates: [
        {
          table: 'todos',
          schema: 'public',
          data: [
            expect.objectContaining({
              id: updated.id,
              title: 'updated',
              completed: true,
              updatedBy: 'editor'
            })
          ]
        }
      ],
      p_deletes: []
    });
    const payload = rpc.mock.calls[0][1];
    expect(payload.p_updates?.[0].data[0]).not.toHaveProperty('createdBy');
    expect(result).toEqual(finalRows);
    expect(updated.createdBy).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('只有更新时仍执行 RPC 并返回最终行', async () => {
    const updated = todo({ title: 'only-update' });
    const rows = [{ ...updated, updatedBy: 'editor' }];
    const { adapter, rpc } = createAdapter(rows, 'editor');

    await expect(
      adapter.mutations({
        create: new Map(),
        update: new Map([[Todo, new Set([updated])]]),
        remove: new Map()
      })
    ).resolves.toEqual(rows);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it('未设置身份时不注入审计字段，修改仍不下发 createdBy', async () => {
    const created = todo({ title: 'no-user-created', createdBy: '00000000-0000-4000-8000-000000000003' });
    const updated = todo({
      title: 'no-user',
      createdBy: '00000000-0000-4000-8000-000000000001',
      updatedBy: '00000000-0000-4000-8000-000000000002'
    });
    const { adapter, rpc } = createAdapter([{ ...created }, { ...updated }]);

    await adapter.mutations({
      create: new Map([[Todo, new Set([created])]]),
      update: new Map([[Todo, new Set([updated])]]),
      remove: new Map()
    });

    const updatedWithoutCreator: Record<string, unknown> = { ...updated };
    delete updatedWithoutCreator['createdBy'];
    expect(rpc).toHaveBeenCalledWith(
      'rxdb_mutations',
      expect.objectContaining({
        p_upserts: [{ table: 'todos', schema: 'public', data: [created] }],
        p_updates: [{ table: 'todos', schema: 'public', data: [updatedWithoutCreator] }]
      })
    );
    const payload = rpc.mock.calls[0][1];
    expect(payload.p_updates?.[0].data[0]).not.toHaveProperty('createdBy');
    expect(updated.createdBy).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('空批次不调用 RPC', async () => {
    const { adapter, rpc } = createAdapter([]);
    const options: RxDBMutationsMap<typeof Todo> = {
      create: new Map(),
      update: new Map(),
      remove: new Map()
    };

    await expect(adapter.mutations(options)).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
