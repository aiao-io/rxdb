import { encodeRxDBChangeEntityId, RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import { chunk_values } from '../pagination.js';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';

interface RequestMeasurement {
  method: string;
  urlLength: number;
  status: number;
  transportError?: string;
}

const requests: RequestMeasurement[] = [];
const client = createClient(import.meta.env['VITE_SUPABASE_URL'], import.meta.env['VITE_SUPABASE_KEY'], {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input, init) => {
      try {
        const response = await fetch(input, init);
        requests.push({ method: init?.method ?? 'GET', urlLength: String(input).length, status: response.status });
        return response;
      } catch (error) {
        requests.push({
          method: init?.method ?? 'GET',
          urlLength: String(input).length,
          status: 0,
          transportError: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }
  }
});
const database = new RxDB({
  dbName: `review-large-rest-writes-${crypto.randomUUID()}`,
  entities: [Todo],
  context: { userId: `review-${crypto.randomUUID()}` },
  sync: { type: SyncType.None, remote: { adapter: 'supabase' } }
});
database.init();
const adapter = new RxDBAdapterSupabase(database, { client, rlsCheck: false });

function createTodos(count: number): Todo[] {
  const prefix = `review-large-rest-${crypto.randomUUID()}`;
  return Array.from({ length: count }, (_, index) => {
    const todo = new Todo();
    todo.title = `${prefix}-${index}`;
    return todo;
  });
}

async function countTodos(todos: Todo[]): Promise<number> {
  let total = 0;
  for (const chunk of chunk_values(todos.map(todo => todo.id))) {
    const response = await client.from('todos').select('id', { count: 'exact', head: true }).in('id', chunk);
    expect(response.error).toBeNull();
    total += response.count ?? 0;
  }
  return total;
}

async function cleanupTodos(todos: Todo[]): Promise<void> {
  for (const chunk of chunk_values(
    todos.map(todo => todo.id),
    25
  )) {
    const rows = await client.from('todos').delete().in('id', chunk);
    expect(rows.error).toBeNull();
    const changes = await client
      .from('rxdb_change')
      .delete()
      .eq('entity', 'Todo')
      .in(
        'entityId',
        chunk.flatMap(id => [id, encodeRxDBChangeEntityId(id)])
      );
    expect(changes.error).toBeNull();
  }
  expect(await countTodos(todos)).toBe(0);
}

afterAll(async () => {
  await database.destroy();
});

describe('深审：真实 SDK / Kong / PostgREST 大批量写入', () => {
  it.each([80, 400])('removeMany 应删除全部 %i 个 UUID 实体', async count => {
    const todos = createTodos(count);
    try {
      for (const chunk of chunk_values(todos)) expect(await adapter.saveMany(chunk)).toHaveLength(chunk.length);
      expect(await countTodos(todos)).toBe(count);
      requests.length = 0;
      const result = await adapter.removeMany(todos).then(
        rows => ({ rows, error: null }),
        (error: unknown) => ({ rows: [] as Todo[], error })
      );
      const deletionRequests = requests.filter(request => request.method === 'DELETE');
      const remaining = await countTodos(todos);
      console.info(
        'REVIEW_LARGE_DELETE',
        JSON.stringify({ count, deletionRequests, remaining, returned: result.rows.length })
      );
      expect(result.error).toBeNull();
      expect(result.rows).toHaveLength(count);
      expect(remaining).toBe(0);
    } finally {
      await cleanupTodos(todos);
    }
  });

  it('saveMany 单次写入 1100 行应返回完整的已写实体', async () => {
    const todos = createTodos(1100);
    try {
      const rows = await adapter.saveMany(todos);
      const persisted = await countTodos(todos);
      console.info(
        'REVIEW_LARGE_UPSERT',
        JSON.stringify({ submitted: todos.length, returned: rows.length, persisted })
      );
      expect(persisted).toBe(todos.length);
      expect(rows).toHaveLength(todos.length);
    } finally {
      await cleanupTodos(todos);
    }
  });
});
