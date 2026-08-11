import { RxDB, SyncType, type IRxDBChange, type SwitchVersionActions } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

describe('Supabase filter sync snapshots', () => {
  let adapter: RxDBAdapterSupabase;
  const entityIds: string[] = [];
  const incompleteFilter = {
    combinator: 'and' as const,
    rules: [{ field: 'completed', operator: '=' as const, value: false }]
  };

  beforeAll(async () => {
    const rxdb = new RxDB({
      dbName: `filter-sync-snapshots-${Date.now()}`,
      entities: [Todo],
      sync: { remote: { adapter: 'supabase' }, type: SyncType.None }
    });
    rxdb.adapter(
      'supabase',
      async db => new RxDBAdapterSupabase(db, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY })
    );
    rxdb.init();
    adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    await adapter.connect();
  });

  afterEach(async () => {
    if (entityIds.length === 0) return;
    await adapter.client.from('todos').delete().in('id', entityIds);
    await adapter.client.from('rxdb_change').delete().in('entityId', entityIds);
    entityIds.length = 0;
  });

  async function latestChangeId(): Promise<number> {
    const { data, error } = await adapter.client
      .from('rxdb_change')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    return (data?.[0]?.id as number | undefined) ?? 0;
  }

  it('pulls matching-to-nonmatching updates and deletion from persisted snapshots', async () => {
    const entityId = crypto.randomUUID();
    entityIds.push(entityId);
    const sinceId = await latestChangeId();

    const { error: insertError } = await adapter.client
      .from('todos')
      .insert({ id: entityId, title: 'snapshot-lifecycle', completed: false });
    if (insertError) throw new Error(insertError.message);
    const inserted = await adapter.pullChanges(sinceId, 1, ['Todo'], incompleteFilter);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.type).toBe('INSERT');

    const { error: updateError } = await adapter.client.from('todos').update({ completed: true }).eq('id', entityId);
    if (updateError) throw new Error(updateError.message);
    const movedOut = await adapter.pullChanges(inserted[0].id, 1, ['Todo'], incompleteFilter);
    expect(movedOut).toHaveLength(1);
    expect(movedOut[0]?.type).toBe('UPDATE');

    const { error: moveBackError } = await adapter.client.from('todos').update({ completed: false }).eq('id', entityId);
    if (moveBackError) throw new Error(moveBackError.message);
    const movedIn = await adapter.pullChanges(movedOut[0].id, 1, ['Todo'], incompleteFilter);
    expect(movedIn).toHaveLength(1);
    expect(movedIn[0]?.type).toBe('UPDATE');

    const { error: deleteError } = await adapter.client.from('todos').delete().eq('id', entityId);
    if (deleteError) throw new Error(deleteError.message);
    const removed = await adapter.pullChanges(movedIn[0].id, 1, ['Todo'], incompleteFilter);
    expect(removed).toHaveLength(1);
    expect(removed[0]?.type).toBe('DELETE');
    expect(removed[0].id).toBeGreaterThan(movedIn[0].id);
  });

  it('reconstructs complete snapshots for mergeChanges partial updates', async () => {
    const entityId = crypto.randomUUID();
    entityIds.push(entityId);
    const { error: insertError } = await adapter.client
      .from('todos')
      .insert({ id: entityId, title: 'snapshot-merge', completed: false });
    if (insertError) throw new Error(insertError.message);
    const sinceId = await latestChangeId();
    const actions: SwitchVersionActions = {
      inserts: new Map(),
      updates: new Map([
        [
          `public:Todo:${entityId}`,
          {
            patch: { title: 'snapshot-merge', completed: true },
            inversePatch: { completed: false }
          }
        ]
      ]),
      deletes: new Map()
    };
    const now = new Date();
    const changes: IRxDBChange[] = [
      {
        id: 1,
        namespace: 'public',
        entity: 'Todo',
        entityId,
        branchId: 'main',
        type: 'UPDATE',
        patch: { completed: true },
        inversePatch: { completed: false },
        createdAt: now,
        updatedAt: now
      }
    ];

    await adapter.mergeChanges(actions, 'main', changes);
    const pulled = await adapter.pullChanges(sinceId, 10, ['Todo'], incompleteFilter);

    expect(pulled).toHaveLength(1);
    expect(pulled[0]?.type).toBe('UPDATE');
    expect(pulled[0]?.entityId).toBe(entityId);
  });

  it('evaluates nested scalar RuleGroup operators against persisted snapshots', async () => {
    const entityId = crypto.randomUUID();
    entityIds.push(entityId);
    const sinceId = await latestChangeId();
    const { error } = await adapter.client.from('todos').insert({ id: entityId, title: 'AlphaBeta', completed: false });
    if (error) throw new Error(error.message);

    const changes = await adapter.pullChanges(sinceId, 10, ['Todo'], {
      combinator: 'and',
      rules: [
        {
          combinator: 'or',
          rules: [
            { field: 'title', operator: 'contains', value: 'alpha' },
            { field: 'title', operator: '=', value: 'no-match' }
          ]
        },
        { field: 'completed', operator: 'notIn', value: [true] },
        { field: 'title', operator: 'between', value: ['A', 'Z'] },
        { field: 'updatedBy', operator: 'null' }
      ]
    } as never);

    expect(changes).toHaveLength(1);
    expect(changes[0]?.entityId).toBe(entityId);
  });
});
