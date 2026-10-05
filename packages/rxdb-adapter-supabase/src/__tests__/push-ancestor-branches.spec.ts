/**
 * 祖先分支未推送变更的推送（review 007 R3）
 *
 * 连真实 Supabase，经常规推送路径（syncManager.push → mergeChanges → rxdb_mutations）：
 * `planRepositoryPush` 会把祖先分支上未推送的变更一并带上。按目标分支统一发一次
 * `mergeChanges(…, featureId)` 时，main 名下的变更只剩日志、没有业务写入，
 * 被服务端 `rxdb_assert_push_integrity` 以 RX002 `unpaired_change` 拒绝。
 *
 * 期望：每条变更按它**自己的** branchId 推送——main 名下的变更带业务写入，
 * 非 main 名下的只写日志；main 的配对校验不放宽，祖先变更的 branchId 不被改写。
 *
 * 远端用独立的 supabase-js 连接读，理由同 update-push-semantics.spec.ts。
 */
import { MAIN_BRANCH_ID, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { Todo } from '@aiao/rxdb-test/entities';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000218';

interface RemoteChangeRow {
  type: string;
  branchId: string;
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('祖先分支未推送变更的推送（review 007 R3）', () => {
  const runId = Date.now();
  const testPrefix = `ancestor-push-${runId}`;
  let rxdb: RxDB;
  let remote: SupabaseClient;

  const createTodo = async (title: string): Promise<Todo> => {
    const todo = new Todo();
    todo.title = title;
    todo.completed = false;
    await todo.save();
    return todo;
  };

  const forkAndSwitch = async (branchId: string): Promise<void> => {
    await rxdb.versionManager.createBranch(branchId);
    await rxdb.versionManager.switchBranch(branchId);
  };

  const readRemoteTitles = async (id: string): Promise<string[]> => {
    const { data, error } = await remote.from('todos').select('title').eq('id', id);
    expect(error).toBeNull();
    return (data ?? []).map(row => row.title as string);
  };

  const readRemoteChanges = async (id: string): Promise<RemoteChangeRow[]> => {
    const { data, error } = await remote
      .from('rxdb_change')
      .select('type, branchId')
      .eq('entityId', id)
      .order('id', { ascending: true });
    expect(error).toBeNull();
    return (data ?? []) as RemoteChangeRow[];
  };

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `ancestor-push-test-${runId}`,
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

    remote = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    await remote?.from('todos').delete().like('title', `${testPrefix}%`);
  });

  it('纯 feature 变更（main 已推送）：只写日志，远端行保持 main 的值', async () => {
    const todo = await createTodo(`${testPrefix}-pure-main`);
    await rxdb.syncManager.push();

    const featureId = `${testPrefix}-pure-feature`;
    await forkAndSwitch(featureId);
    todo.title = `${testPrefix}-pure-feature-edit`;
    await todo.save();
    const result = await rxdb.syncManager.push();

    expect(result.failures).toEqual([]);
    expect(await readRemoteTitles(todo.id)).toEqual([`${testPrefix}-pure-main`]);
    expect(await readRemoteChanges(todo.id)).toEqual([
      { type: 'INSERT', branchId: MAIN_BRANCH_ID },
      { type: 'UPDATE', branchId: featureId }
    ]);
  });

  it('从未推送的 main 分叉：main 的变更带业务写入，feature 的只写日志', async () => {
    await rxdb.versionManager.switchBranch(MAIN_BRANCH_ID);
    const todo = await createTodo(`${testPrefix}-fork-main`);

    const featureId = `${testPrefix}-fork-feature`;
    await forkAndSwitch(featureId);
    todo.title = `${testPrefix}-fork-feature-edit`;
    await todo.save();
    const result = await rxdb.syncManager.push();

    expect(result.failures).toEqual([]);
    expect(await readRemoteTitles(todo.id)).toEqual([`${testPrefix}-fork-main`]);
    expect(await readRemoteChanges(todo.id)).toEqual([
      { type: 'INSERT', branchId: MAIN_BRANCH_ID },
      { type: 'UPDATE', branchId: featureId }
    ]);
  });

  it('main → release → feature：各层变更按自己的分支推送', async () => {
    await rxdb.versionManager.switchBranch(MAIN_BRANCH_ID);
    const mainTodo = await createTodo(`${testPrefix}-chain-main`);

    const releaseId = `${testPrefix}-chain-release`;
    await forkAndSwitch(releaseId);
    const releaseTodo = await createTodo(`${testPrefix}-chain-release`);

    const featureId = `${testPrefix}-chain-feature`;
    await forkAndSwitch(featureId);
    mainTodo.title = `${testPrefix}-chain-feature-edit`;
    await mainTodo.save();
    const result = await rxdb.syncManager.push();

    expect(result.failures).toEqual([]);
    expect(await readRemoteTitles(mainTodo.id)).toEqual([`${testPrefix}-chain-main`]);
    expect(await readRemoteChanges(mainTodo.id)).toEqual([
      { type: 'INSERT', branchId: MAIN_BRANCH_ID },
      { type: 'UPDATE', branchId: featureId }
    ]);
    // release 名下的新建只进日志，不落到 main 的业务表
    expect(await readRemoteTitles(releaseTodo.id)).toEqual([]);
    expect(await readRemoteChanges(releaseTodo.id)).toEqual([{ type: 'INSERT', branchId: releaseId }]);
  });
});
