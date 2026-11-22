/**
 * 实时变更通知（US-225 AC#10～#12），连本地真实 Supabase（`VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` 缺一即跳过）。
 *
 * 日志落库后，参考 SQL 的 `rxdb_change_broadcast` 触发器经 `realtime.send` 把元数据广播到私有频道
 * 未分区旧日志广播到 `rxdb:changes`，分区日志广播到 `rxdb:changes:bucket:<bucket>`；频道的接收权由生产权限脚本里
 * `realtime.messages` 的策略决定，只对 authenticated 开放，分区频道还要匹配 caller buckets。
 * 这里走真实 websocket 验证三件事：已登录的订阅者收到的通知不带行内容；anon 订阅被拒；
 * 适配器订阅之后，另一台设备推送当前分支的变更，本端可拉取计数增加，拉取后数据一致。
 */
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { Todo } from '@aiao/rxdb-test/entities';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RXDB_CHANGES_EVENT, RXDB_CHANGES_TOPIC } from '../handle_supabase_change.js';
import { RxDBAdapterSupabase } from '../index.js';
import { createAuthenticatedTestClient, getSupabaseServiceRoleClient } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

/** 通知里的一条变更 */
type Notice = Record<string, unknown>;

interface Subscription {
  /** 第一次不是 CLOSED 的订阅状态，出错时带上错误信息 */
  status: Promise<string>;
  /** 收到的每条通知里的变更，按到达顺序 */
  notices: Notice[];
  close: () => Promise<unknown>;
}

async function subscribe(client: SupabaseClient): Promise<Subscription> {
  const notices: Notice[] = [];
  // 私有频道要先把令牌交给 Realtime 客户端，否则带着 apikey（anon 的令牌）加入
  await client.realtime.setAuth();
  const channel = client
    .channel(RXDB_CHANGES_TOPIC, { config: { private: true } })
    .on('broadcast', { event: RXDB_CHANGES_EVENT }, message => {
      const changes: unknown = message['payload']?.changes;
      if (Array.isArray(changes)) notices.push(...(changes as Notice[]));
    });
  const status = new Promise<string>(resolve => {
    channel.subscribe((state, error) => {
      if (state === 'CLOSED') return;
      resolve(error ? `${state}: ${error.message}` : state);
    });
  });
  return { status, notices, close: () => client.removeChannel(channel) };
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('实时变更通知（US-225）', () => {
  const runId = crypto.randomUUID().replaceAll('-', '');
  const todoIds: string[] = [];
  const subscriptions: Subscription[] = [];
  let writer: SupabaseClient;

  const insertRemoteTodo = async (title: string): Promise<string> => {
    const id = crypto.randomUUID();
    todoIds.push(id);
    const { error } = await writer.from('todos').insert({ id, title: `${runId}-${title}`, completed: false });
    expect(error).toBeNull();
    return id;
  };

  beforeAll(() => {
    writer = createAuthenticatedTestClient();
  });

  afterAll(async () => {
    await Promise.all(subscriptions.map(subscription => subscription.close()));
    if (todoIds.length === 0) return;
    const serviceRole = getSupabaseServiceRoleClient();
    const { error: entityError } = await serviceRole.from('todos').delete().in('id', todoIds);
    if (entityError) throw entityError;
    const { error: logError } = await serviceRole.from('rxdb_change').delete().in('entityId', todoIds);
    if (logError) throw logError;
  });

  it('已登录的订阅者收到只带元数据的通知；anon 订阅被拒、收不到', async () => {
    const member = await subscribe(createAuthenticatedTestClient());
    const anonymous = await subscribe(createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }));
    subscriptions.push(member, anonymous);
    expect(await member.status).toBe('SUBSCRIBED');
    expect(await anonymous.status).not.toBe('SUBSCRIBED');

    const id = await insertRemoteTodo('broadcast');
    await vi.waitFor(() => expect(member.notices.some(notice => notice['entityId'] === id)).toBe(true), {
      timeout: 10_000,
      interval: 100
    });

    const notice = member.notices.find(candidate => candidate['entityId'] === id);
    expect(Object.keys(notice ?? {}).sort()).toEqual([
      'branchId',
      'bucket',
      'clientId',
      'createdAt',
      'entity',
      'entityId',
      'namespace',
      'type'
    ]);
    expect(notice).toMatchObject({ entity: 'Todo', type: 'INSERT', branchId: 'main' });
    expect(JSON.stringify(member.notices)).not.toContain(`${runId}-broadcast`);
    expect(anonymous.notices).toEqual([]);
  });

  describe('适配器订阅通知', () => {
    let rxdb: RxDB;
    let remote: RxDBAdapterSupabase;

    beforeAll(async () => {
      rxdb = new RxDB({
        dbName: `realtime-${runId.slice(0, 12)}`,
        context: { userId: crypto.randomUUID() },
        entities: [Todo],
        sync: { type: SyncType.Full, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } }
      });
      rxdb.adapter(
        'wa-sqlite',
        db =>
          new RxDBAdapterWaSqlite(db, { vfs: 'MemoryAsyncVFS', async: true, worker: false, wasmPath: asyncWasmPath })
      );
      rxdb.adapter('supabase', db => new RxDBAdapterSupabase(db, { client: createAuthenticatedTestClient() }));
      rxdb.use(rxDBPluginHistory);
      rxdb.use(rxDBPluginSync);
      await rxdb.connect('wa-sqlite');
      // 远端适配器要显式连接才会订阅通知（拉取只走 RPC，不需要连接）
      remote = (await rxdb.connect('supabase')) as RxDBAdapterSupabase;
      await rxdb.syncManager.pull();
      await vi.waitFor(
        () =>
          expect(remote.client.getChannels().map(channel => `${channel.subTopic}:${channel.state}`)).toContain(
            `${RXDB_CHANGES_TOPIC}:joined`
          ),
        { timeout: 20_000, interval: 100 }
      );
    }, 30_000);

    afterAll(async () => {
      await rxdb?.destroy();
    });

    it('另一台设备推送后可拉取计数增加，拉取后本地数据一致', async () => {
      const before = await firstValueFrom(rxdb.versionManager.pullableCount$);
      const id = await insertRemoteTodo('adapter');

      await vi.waitFor(
        async () => expect(await firstValueFrom(rxdb.versionManager.pullableCount$)).toBeGreaterThan(before),
        { timeout: 10_000, interval: 100 }
      );

      await rxdb.syncManager.pull();
      const local = await (await rxdb.getAdapter('wa-sqlite')).getRepository(Todo).find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] },
        limit: 1
      });
      expect(local.map(todo => todo.title)).toEqual([`${runId}-adapter`]);
    });
  });

  it('只拿 anon key 的适配器连接时不订阅通知，也不反复重试', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error');
    const rxdb = new RxDB({
      dbName: `realtime-anon-${runId.slice(0, 8)}`,
      entities: [Todo],
      sync: { type: SyncType.None, remote: { adapter: 'supabase' } }
    });
    const anonClient = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    rxdb.adapter('supabase', db => new RxDBAdapterSupabase(db, { client: anonClient }));

    try {
      await rxdb.connect('supabase');
      // 给重连退避留出足够时间：之前这里会每隔最多 5 秒被拒一次、一直重试
      await new Promise(resolve => setTimeout(resolve, 1_500));

      expect(anonClient.getChannels()).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('signed-in session'));
      expect(error).not.toHaveBeenCalledWith('Supabase Realtime subscription failed:', expect.anything());
    } finally {
      await rxdb.destroy();
      warn.mockRestore();
      error.mockRestore();
    }
  });
});
