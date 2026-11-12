/**
 * 拉取游标与日志提交顺序（RV-01a1c49dee517814adf2e68788ad084e）
 *
 * `rxdb_change.id` 是 serial，拉取条件是 `id > 游标`。日志 id 在写入时分配、提交时才可见：
 * 先拿到 id 却晚提交的事务，曾被已经越过它的拉取方永久漏掉，而且不报错。
 * 本套件走真实链路：慢事务是直写业务表（同步触发器记日志），快事务是另一个客户端的推送（rxdb_mutations）。
 */
import { RxDB, SyncType, type SwitchVersionActions } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { getSupabaseServiceRoleClient } from './test-utils.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000091';

/** 慢事务写下日志后拖住提交的秒数；anon 的 statement_timeout 是 3 秒，留出余量 */
const SLOW_HOLD_SECONDS = 1.5;
/** 推送在这段时间里提交不了，就当它在等慢事务 */
const PUSH_SETTLE_MS = 500;

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const insertTodoActions = (id: string, title: string): SwitchVersionActions => ({
  inserts: new Map([[`public:Todo:${id}`, { patch: { id, title, completed: false }, inversePatch: null }]]),
  updates: new Map(),
  deletes: new Map()
});

describe('RxDBAdapterSupabase 拉取游标与日志提交顺序', () => {
  let adapter: RxDBAdapterSupabase;
  const createdTodoIds: string[] = [];

  const changeIdSeqLastValue = async (): Promise<number> => {
    const { data, error } = await adapter.client.rpc('rxdb_test_change_id_seq_last_value');
    if (error) throw new Error(`读日志序列失败：${error.message}`);
    return Number(data);
  };

  const latestVisibleChangeId = async (): Promise<number> => {
    const { data, error } = await getSupabaseServiceRoleClient()
      .from('rxdb_change')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);
    if (error) throw new Error(`读最新日志 id 失败：${error.message}`);
    return data[0]?.id ?? 0;
  };

  const startSlowDirectWrite = (id: string): Promise<void> =>
    Promise.resolve(
      adapter.client.rpc('rxdb_test_slow_todo_insert', {
        p_id: id,
        p_title: 'slow direct write',
        p_hold_seconds: SLOW_HOLD_SECONDS
      })
    ).then(({ error }) => {
      if (error) throw new Error(`慢事务失败：${error.message}`);
    });

  beforeAll(async () => {
    const rxdb = new RxDB({
      context: { userId: TEST_USER_ID },
      dbName: 'test-pull-commit-order',
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
    const ids = createdTodoIds.splice(0);
    const serviceRole = getSupabaseServiceRoleClient();
    await serviceRole.from('todos').delete().in('id', ids);
    await serviceRole.from('rxdb_change').delete().in('entityId', ids);
  });

  it('先拿到日志 id、晚提交的直写事务，不会被已越过它的拉取跳过', async () => {
    const slowTodoId = crypto.randomUUID();
    const pushedTodoId = crypto.randomUUID();
    createdTodoIds.push(slowTodoId, pushedTodoId);

    const cursorBefore = await latestVisibleChangeId();
    const seqBefore = await changeIdSeqLastValue();

    const slowWrite = startSlowDirectWrite(slowTodoId);
    await vi.waitFor(async () => expect(await changeIdSeqLastValue()).toBeGreaterThan(seqBefore), {
      timeout: 1000,
      interval: 20
    });

    const push = adapter.mergeChanges(insertTodoActions(pushedTodoId, 'concurrent push'));
    await Promise.race([push, delay(PUSH_SETTLE_MS)]);

    const firstPage = await adapter.pullChanges(cursorBefore);
    const cursorAfterFirstPull = Math.max(cursorBefore, ...firstPage.map(change => change.id));

    await Promise.all([slowWrite, push]);
    const secondPage = await adapter.pullChanges(cursorAfterFirstPull);

    const { data: logged, error } = await getSupabaseServiceRoleClient()
      .from('rxdb_change')
      .select('id, entityId')
      .in('entityId', [slowTodoId, pushedTodoId])
      .order('id', { ascending: true });
    if (error) throw new Error(`读日志失败：${error.message}`);
    // 前提：慢事务先拿到日志 id。不成立说明时序没对上，本用例没有测到它要测的东西
    expect(logged.map(row => row.entityId)).toEqual([slowTodoId, pushedTodoId]);

    const pulledEntityIds = [...firstPage, ...secondPage].map(change => change.entityId);
    expect(pulledEntityIds).toContain(pushedTodoId);
    expect(pulledEntityIds).toContain(slowTodoId);
  });
});
