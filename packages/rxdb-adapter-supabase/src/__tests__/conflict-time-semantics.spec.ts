/**
 * 冲突裁决的时间语义（requirements/livestore-research.md「P0：核实现行冲突裁决的时间语义」）
 *
 * 连真实 Supabase，A、B 是两个独立的 RxDB 实例（各自一份内存 wa-sqlite）：
 * A 离线编辑、稍后推送，B 在两者之间编辑同一条 todo 且未推送，B 再拉取。
 *
 * 实体经各自实例的 `entityManager` 读写：`new Todo()` 绑定全局实例，两个实例并存时会写错库。
 */
import { getRxDBChangeEntityIdQueryValues, RxDB, RxDBChange, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { getSupabaseServiceRoleClient } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

interface SyncClient {
  rxdb: RxDB;
  local: RxDBAdapterWaSqlite;
  remote: RxDBAdapterSupabase;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('冲突裁决的时间语义（双客户端）', () => {
  const runId = crypto.randomUUID().replaceAll('-', '');
  const databases: RxDB[] = [];
  const todoIds: string[] = [];
  let clientA: SyncClient;
  let clientB: SyncClient;

  async function createClient(name: string): Promise<SyncClient> {
    const rxdb = new RxDB({
      dbName: `lww-${runId}-${name}`,
      context: { userId: crypto.randomUUID() },
      entities: [Todo],
      sync: {
        type: SyncType.Full,
        local: { adapter: 'wa-sqlite' },
        remote: { adapter: 'supabase' }
      }
    });
    databases.push(rxdb);
    rxdb.adapter(
      'wa-sqlite',
      db => new RxDBAdapterWaSqlite(db, { vfs: 'MemoryAsyncVFS', async: true, worker: false, wasmPath: asyncWasmPath })
    );
    rxdb.adapter(
      'supabase',
      db => new RxDBAdapterSupabase(db, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY })
    );
    rxdb.use(rxDBPluginHistory);
    rxdb.use(rxDBPluginSync);
    await rxdb.connect('wa-sqlite');
    return {
      rxdb,
      local: (await rxdb.getAdapter('wa-sqlite')) as RxDBAdapterWaSqlite,
      remote: (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase
    };
  }

  async function findTodo(client: SyncClient, id: Todo['id']): Promise<Todo> {
    const [todo] = await client.local.getRepository(Todo).find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] },
      limit: 1
    });
    if (!todo) throw new Error(`todo ${id} 不在 ${client.rxdb.config.dbName}`);
    return todo;
  }

  async function lastLocalChange(client: SyncClient, entityId: string): Promise<RxDBChange> {
    const changes = await client.local.getRepository(RxDBChange).find({
      where: {
        combinator: 'and',
        rules: [{ field: 'entityId', operator: 'in', value: getRxDBChangeEntityIdQueryValues([entityId]) }]
      },
      orderBy: [{ field: 'id', sort: 'asc' }]
    });
    const last = changes.at(-1);
    if (!last) throw new Error(`${client.rxdb.config.dbName} 没有 ${entityId} 的本地变更`);
    return last;
  }

  beforeAll(async () => {
    clientA = await createClient('a');
    clientB = await createClient('b');
  });

  afterAll(async () => {
    try {
      if (todoIds.length > 0) {
        const serviceRole = getSupabaseServiceRoleClient();
        const { error: entityError } = await serviceRole.from('todos').delete().in('id', todoIds);
        if (entityError) throw entityError;
        const { error: logError } = await serviceRole.from('rxdb_change').delete().in('entityId', todoIds);
        if (logError) throw logError;
      }
    } finally {
      for (const database of databases) await database.disconnectAll();
    }
  });

  it('A 离线编辑后晚推送，B 在两者之间的未推送编辑更新，两端收敛到 B', async () => {
    const todo = clientA.rxdb.entityManager.instantiate(Todo, { title: `${runId}-original`, completed: false });
    await todo.save();
    todoIds.push(todo.id);
    await clientA.rxdb.syncManager.pushRepository('public', 'Todo');
    await clientB.rxdb.syncManager.pullRepository('public', 'Todo');
    expect((await findTodo(clientB, todo.id)).title).toBe(`${runId}-original`);

    todo.title = `${runId}-edited-by-a-offline`;
    await todo.save();
    const aEdit = await lastLocalChange(clientA, todo.id);
    await wait(50);

    const todoOnB = await findTodo(clientB, todo.id);
    todoOnB.title = `${runId}-edited-by-b-later`;
    await todoOnB.save();
    const bEdit = await lastLocalChange(clientB, todo.id);
    expect(bEdit.createdAt.getTime()).toBeGreaterThan(aEdit.createdAt.getTime());
    await wait(50);

    const aPushStartedAt = Date.now();
    await clientA.rxdb.syncManager.pushRepository('public', 'Todo');

    const { data: remoteUpdates, error } = await clientA.remote.client
      .from('rxdb_change')
      .select('createdAt, updatedAt')
      .eq('entityId', todo.id)
      .eq('type', 'UPDATE');
    if (error) throw error;
    expect(remoteUpdates).toHaveLength(1);
    expect(new Date(remoteUpdates[0].createdAt).getTime()).toBe(aEdit.createdAt.getTime());
    expect(new Date(remoteUpdates[0].updatedAt).getTime()).toBeGreaterThanOrEqual(aPushStartedAt);

    const pullB = await clientB.rxdb.syncManager.pullRepository('public', 'Todo');
    expect(pullB.conflictsResolved).toBe(1);
    expect((await findTodo(clientB, todo.id)).title).toBe(`${runId}-edited-by-b-later`);

    const pushB = await clientB.rxdb.syncManager.pushRepository('public', 'Todo');
    expect(pushB).toMatchObject({ pushed: 1, failed: 0 });
    await clientA.rxdb.syncManager.pullRepository('public', 'Todo');
    expect((await findTodo(clientA, todo.id)).title).toBe(`${runId}-edited-by-b-later`);

    const { data: remoteRows, error: rowError } = await clientA.remote.client
      .from('todos')
      .select('title')
      .eq('id', todo.id);
    if (rowError) throw rowError;
    expect(remoteRows).toEqual([{ title: `${runId}-edited-by-b-later` }]);
  });
});
