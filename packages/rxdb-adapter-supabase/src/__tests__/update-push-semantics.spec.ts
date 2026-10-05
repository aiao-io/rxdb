/**
 * UPDATE 推送语义（US-220 AC#6）
 *
 * 连真实 Supabase，经常规推送路径（syncManager.push → mergeChanges → rxdb_mutations.p_updates）：
 * 客户端 A 只改一条 todo 的 `completed` 并推送；客户端 B 用独立连接读远端。
 * 期望 A 推送成功、水位线推进，B 看到 `completed` 已变而 `title` 不变。
 *
 * 客户端 B 用独立的 supabase-js 连接而不是第二个 RxDB 实例：实体 `save()` 绑定在全局 RxDB 上，
 * 同一页面并存两个已连接实例会互相干扰；B 读到的远端行与变更日志就是它拉取时会收到的内容。
 */
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { Todo } from '@aiao/rxdb-test/entities';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { LOCAL_RXDB_SYNC_TABLE } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000220';
/** 宪法 IV 数据库操作预算（SC-006） */
const PUSH_BUDGET_MS = 100;

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('UPDATE 推送语义（US-220）', () => {
  const testPrefix = `update-push-${Date.now()}`;
  let rxdb: RxDB;
  let remoteAdapter: RxDBAdapterSupabase;
  let localAdapter: RxDBAdapterWaSqlite;
  let clientB: SupabaseClient;
  const mergeDurations: number[] = [];

  async function readLastPushedChangeId(): Promise<number> {
    const branch = await rxdb.versionManager.getCurrentBranch();
    const result = await localAdapter.internalQuery(
      `SELECT lastPushedChangeId FROM ${LOCAL_RXDB_SYNC_TABLE} WHERE id = 'public:Todo:${branch.id}'`
    );
    const value = result?.results?.[0]?.rows?.[0]?.[0];
    return typeof value === 'number' ? value : 0;
  }

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `update-push-test-${Date.now()}`,
      context: { userId: TEST_USER_ID },
      entities: [Todo],
      sync: {
        local: { adapter: 'wa-sqlite' },
        remote: { adapter: 'supabase' },
        type: SyncType.None
      }
    });
    rxdb.adapter(
      'wa-sqlite',
      db => new RxDBAdapterWaSqlite(db, { vfs: 'MemoryAsyncVFS', async: true, worker: false, wasmPath: asyncWasmPath })
    );
    rxdb.adapter(
      'supabase',
      async db => new RxDBAdapterSupabase(db, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY })
    );
    rxdb.use(rxDBPluginHistory);
    rxdb.use(rxDBPluginSync);

    await rxdb.connect('wa-sqlite');
    remoteAdapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    localAdapter = (await rxdb.getAdapter('wa-sqlite')) as RxDBAdapterWaSqlite;

    // 只计 mergeChanges 这一次 RPC 往返，排除本地 SQLite 的读写
    const mergeChanges = remoteAdapter.mergeChanges.bind(remoteAdapter);
    remoteAdapter.mergeChanges = async (...args: Parameters<typeof mergeChanges>) => {
      const startedAt = performance.now();
      try {
        return await mergeChanges(...args);
      } finally {
        mergeDurations.push(performance.now() - startedAt);
      }
    };

    clientB = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    await clientB?.from('todos').delete().like('title', `${testPrefix}%`);
  });

  it('只改 completed 的推送成功，远端 title 不变，水位线推进', async () => {
    const todo = new Todo();
    todo.title = `${testPrefix}-toggle`;
    todo.completed = false;
    await todo.save();
    await rxdb.syncManager.push();
    const watermarkAfterInsert = await readLastPushedChangeId();

    todo.completed = true;
    await todo.save();
    mergeDurations.length = 0;
    await rxdb.syncManager.push();

    const pushDuration = mergeDurations.at(-1);
    console.info(`[US-220 SC-006] 单条修改推送耗时 ${pushDuration?.toFixed(1)} ms`);

    expect(await readLastPushedChangeId()).toBeGreaterThan(watermarkAfterInsert);

    const { data: rows, error } = await clientB.from('todos').select('title, completed').eq('id', todo.id);
    expect(error).toBeNull();
    expect(rows).toEqual([{ title: `${testPrefix}-toggle`, completed: true }]);

    const { data: updates } = await clientB
      .from('rxdb_change')
      .select('patch')
      .eq('entityId', todo.id)
      .eq('type', 'UPDATE');
    expect(updates?.some(change => (change.patch as { completed?: boolean } | null)?.completed === true)).toBe(true);

    expect(pushDuration).toBeDefined();
    expect(pushDuration).toBeLessThan(PUSH_BUDGET_MS);
  });
});
