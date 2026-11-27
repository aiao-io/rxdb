/**
 * @fileoverview 分区实体的本地写入（US-034 AC#4～#8）—— 真实 Supabase 栈
 *
 * @remarks
 * 商品（`catalog_items`）按授权分区同步：公开商品在 `public` 区，租户内部商品在 `tenant:<租户>` 区。
 * 成员在本地改商品、推送经 `rxdb_mutations`：服务端按写后的行算区、分区日志不带正文、换区时旧区记移除，
 * 写不写得进去由 `catalog-demo.sql` 的写策略按成员在该租户的权限裁决：本文件的成员都有 `edit`（US-234）。
 *
 * 每轮用带 runId 的租户、分类与用户：租户、成员关系与种子行经 service_role 直写，结束时按 id 清理，
 * 不碰演示租户（星河零售、极光百货）与其他用例的数据。
 */
import { RxDB, SyncType, type RuleGroup } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { CatalogItem } from '@aiao/rxdb-test/entities';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { getSupabaseServiceRoleClient, signTestAccessToken } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
/** 能改本租户商品的成员权限（US-234：自助加入只有 read） */
const EDITOR = ['read', 'edit'];

interface SeedRow {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  visibility: 'public' | 'tenant';
  tenantId: string;
}

interface RecordedRequest {
  method: string;
  url: string;
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('分区实体的本地写入（US-034）', () => {
  const runId = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const tenant = `us034-${runId}`;
  const category = `us034-${runId}`;
  const alice = crypto.randomUUID();
  const service = getSupabaseServiceRoleClient();
  const databases: RxDB[] = [];
  const entityIds: string[] = [];

  function row(name: string, visibility: SeedRow['visibility']): SeedRow {
    const id = crypto.randomUUID();
    entityIds.push(id);
    return { id, name: `${runId}/${name}`, category, price: 100, cost: 60, visibility, tenantId: tenant };
  }

  async function seed(...rows: SeedRow[]): Promise<SeedRow[]> {
    const { error } = await service.from('catalog_items').insert(rows);
    expect(error).toBeNull();
    return rows;
  }

  /** `requests` 记下经它发出的每个请求；Alice 签发令牌，访客只有 anon key */
  function client(user: string | null, requests?: RecordedRequest[]): SupabaseClient {
    return createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(user ? { accessToken: () => signTestAccessToken(user) } : {}),
      global: {
        fetch: (input, init) => {
          requests?.push({ method: init?.method ?? 'GET', url: String(input) });
          return fetch(input, init);
        }
      }
    });
  }

  /** 与 demo 同一条规则：租户内部商品全量，公开商品只取本轮的分类 */
  const rule = (): RuleGroup => ({
    combinator: 'or',
    rules: [
      { field: 'visibility', operator: '=', value: 'tenant' },
      { field: 'category', operator: 'in', value: [category] }
    ]
  });

  async function open(remote: SupabaseClient) {
    const rxdb = new RxDB({
      dbName: `us034-${runId}-${databases.length}`,
      context: { userId: crypto.randomUUID() },
      entities: [CatalogItem],
      sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } },
      syncOverrides: [
        {
          entity: CatalogItem,
          sync: {
            type: SyncType.Filter,
            local: { adapter: 'wa-sqlite' },
            remote: { adapter: 'supabase', filter: rule }
          }
        }
      ]
    });
    databases.push(rxdb);
    rxdb.use(rxDBPluginHistory);
    rxdb.use(rxDBPluginSync);
    rxdb.adapter(
      'wa-sqlite',
      db => new RxDBAdapterWaSqlite(db, { vfs: 'MemoryAsyncVFS', async: true, worker: false, wasmPath: asyncWasmPath })
    );
    rxdb.adapter('supabase', db => new RxDBAdapterSupabase(db, { client: remote }));
    const local = (await rxdb.connect('wa-sqlite')) as RxDBAdapterWaSqlite;
    await rxdb.connect('supabase');
    return { rxdb, local };
  }

  const sync = (rxdb: RxDB) => rxdb.syncManager.pullRepository('public', 'CatalogItem', { fetchAll: true });
  const push = (rxdb: RxDB) => rxdb.syncManager.pushRepository('public', 'CatalogItem');

  async function localIds(local: RxDBAdapterWaSqlite): Promise<string[]> {
    const rows = await local.getRepository(CatalogItem).find({ where: { combinator: 'and', rules: [] } });
    return rows.map(item => item.id).sort();
  }

  async function localRow(local: RxDBAdapterWaSqlite, id: string): Promise<CatalogItem | undefined> {
    const rows = await local.getRepository(CatalogItem).find({ where: { combinator: 'and', rules: [] } });
    return rows.find(item => item.id === id);
  }

  /** 实体经门面取出来，改动才会被追踪、留下变更 */
  const entity = (rxdb: RxDB, id: string) => firstValueFrom(rxdb.entityManager.getRepository(CatalogItem).get(id));

  async function remoteRow(id: string) {
    const { data, error } = await service
      .from('catalog_items')
      .select('id, name, price, cost, visibility, "tenantId", rxdb_bucket')
      .eq('id', id)
      .maybeSingle();
    expect(error).toBeNull();
    return data as (Omit<SeedRow, 'category'> & { rxdb_bucket: string }) | null;
  }

  async function latestLog(id: string) {
    const { data, error } = await service
      .from('rxdb_change')
      .select('type, bucket, patch, "inversePatch", "beforeData", "afterData"')
      .eq('entityId', id)
      .order('id', { ascending: false });
    expect(error).toBeNull();
    return (data ?? []) as Record<string, unknown>[];
  }

  const undoCount = (rxdb: RxDB) => {
    let latest: number | undefined;
    const subscription = rxdb.versionManager.history(CatalogItem).undoCount$.subscribe(value => (latest = value));
    onTestFinished(() => subscription.unsubscribe());
    return () => latest;
  };

  beforeAll(async () => {
    const { error: tenantError } = await service.from('demo_tenants').insert({ id: tenant, name: `US-034 ${runId}` });
    expect(tenantError, 'demo_tenants 缺失：先用 nx run rxdb-adapter-supabase:test-env 初始化测试栈').toBeNull();
    const { error: memberError } = await service
      .from('demo_tenant_members')
      .insert({ user_id: alice, tenant_id: tenant, permissions: EDITOR });
    expect(memberError).toBeNull();
  });

  afterAll(async () => {
    await Promise.all(databases.map(rxdb => rxdb.disconnectAll().catch(() => undefined)));
    const { error: itemError } = await service.from('catalog_items').delete().eq('tenantId', tenant);
    expect(itemError).toBeNull();
    const { error: logError } = await service.from('rxdb_change').delete().in('entityId', entityIds);
    expect(logError).toBeNull();
    const { error: memberError } = await service.from('demo_tenant_members').delete().eq('tenant_id', tenant);
    expect(memberError).toBeNull();
    const { error: tenantError } = await service.from('demo_tenants').delete().eq('id', tenant);
    expect(tenantError).toBeNull();
  });

  it('AC#4：成员改了租户内部商品并推送，远端行更新，分区日志落在租户区、不带正文，撤销栈清空', async () => {
    const [internal] = await seed(row('internal', 'tenant'));
    const { rxdb, local } = await open(client(alice));
    const undo = undoCount(rxdb);
    await sync(rxdb);

    const item = await entity(rxdb, internal.id);
    item.price = 188;
    await item.save();
    await vi.waitFor(() => expect(undo()).toBe(1));

    const result = await push(rxdb);

    expect(result).toMatchObject({ pushed: 1, rejected: 0, failures: [] });
    expect(await remoteRow(internal.id)).toMatchObject({ price: 188, rxdb_bucket: `tenant:${tenant}` });
    const [log] = await latestLog(internal.id);
    expect(log).toEqual({
      type: 'UPDATE',
      bucket: `tenant:${tenant}`,
      patch: null,
      inversePatch: null,
      beforeData: null,
      afterData: null
    });
    await vi.waitFor(() => expect(undo()).toBe(0));
    await rxdb.versionManager.history(CatalogItem).undo();
    expect((await localRow(local, internal.id))?.price).toBe(188);
  });

  it('AC#1、#4：本机新建的商品推送之后远端有这一行，区由服务端按行算（生成列不随推送写入）', async () => {
    const { rxdb } = await open(client(alice));
    const id = crypto.randomUUID();
    entityIds.push(id);
    const created = rxdb.entityManager.instantiate(CatalogItem, {
      id,
      name: `${runId}/created`,
      category,
      price: 66,
      cost: 30,
      visibility: 'tenant',
      tenantId: tenant
    });
    await created.save();

    const result = await push(rxdb);

    expect(result).toMatchObject({ pushed: 1, rejected: 0, failures: [] });
    expect(await remoteRow(id)).toMatchObject({ price: 66, rxdb_bucket: `tenant:${tenant}` });
    const [log] = await latestLog(id);
    expect(log).toMatchObject({ type: 'INSERT', bucket: `tenant:${tenant}`, patch: null, afterData: null });
  });

  it('AC#5：成员把公开商品改成租户内部并推送，访客下次同步时这件商品从本机移除', async () => {
    const [shared] = await seed(row('shared', 'public'));
    const visitor = await open(client(null));
    await sync(visitor.rxdb);
    expect(await localIds(visitor.local)).toEqual([shared.id]);

    const member = await open(client(alice));
    await sync(member.rxdb);
    const item = await entity(member.rxdb, shared.id);
    item.visibility = 'tenant';
    await item.save();
    expect(await push(member.rxdb)).toMatchObject({ pushed: 1, rejected: 0 });

    await sync(visitor.rxdb);

    expect(await localIds(visitor.local)).toEqual([]);
    expect(await remoteRow(shared.id)).toMatchObject({ visibility: 'tenant', rxdb_bucket: `tenant:${tenant}` });
    expect((await latestLog(shared.id)).slice(0, 2).map(log => [log['type'], log['bucket']])).toEqual(
      expect.arrayContaining([
        ['DELETE', 'public'],
        ['INSERT', `tenant:${tenant}`]
      ])
    );
  });

  it('AC#6：离线改两件商品（改的时候一个请求都不发），恢复连接后推送，两条都被接受、远端一致', async () => {
    const [first, second] = await seed(row('offline-1', 'tenant'), row('offline-2', 'public'));
    const requests: RecordedRequest[] = [];
    const { rxdb, local } = await open(client(alice, requests));
    await sync(rxdb);
    requests.length = 0;

    const a = await entity(rxdb, first.id);
    a.price = 111;
    await a.save();
    const b = await entity(rxdb, second.id);
    b.name = `${runId}/offline-2-renamed`;
    await b.save();
    expect(requests).toEqual([]);

    const result = await push(rxdb);

    expect(result).toMatchObject({ pushed: 2, rejected: 0, failures: [] });
    expect(await remoteRow(first.id)).toMatchObject({ price: 111 });
    expect(await remoteRow(second.id)).toMatchObject({ name: `${runId}/offline-2-renamed` });
    expect(await localRow(local, first.id)).toMatchObject({ price: 111 });
  });

  it('AC#7：本地未推送的售价修改与远端更晚的修改冲突，先同步再推送，本地与远端收敛成同一行', async () => {
    const [contested] = await seed(row('contested', 'tenant'));
    const { rxdb, local } = await open(client(alice));
    await sync(rxdb);
    const item = await entity(rxdb, contested.id);
    item.price = 150;
    await item.save();
    const { error } = await service.from('catalog_items').update({ price: 175, cost: 70 }).eq('id', contested.id);
    expect(error).toBeNull();

    const pulled = await sync(rxdb);
    await push(rxdb);

    expect(pulled.conflictsResolved).toBe(1);
    const remote = await remoteRow(contested.id);
    const mine = await localRow(local, contested.id);
    expect(remote).toMatchObject({ price: 175, cost: 70 });
    expect(mine).toMatchObject({ price: remote?.price, cost: remote?.cost, name: remote?.name });
    expect((await rxdb.syncManager.getRepositorySyncStatus('public', 'CatalogItem')).pushableCount).toBe(0);
  });

  it('AC#8：有未推送的修改时被移出租户，推送以 denied 被拒，本地对齐、被拒清单显示这件商品', async () => {
    const outsider = crypto.randomUUID();
    const { error: joinError } = await service
      .from('demo_tenant_members')
      .insert({ user_id: outsider, tenant_id: tenant, permissions: EDITOR });
    expect(joinError).toBeNull();
    const [kept] = await seed(row('kicked', 'tenant'));
    const { rxdb, local } = await open(client(outsider));
    await sync(rxdb);
    const item = await entity(rxdb, kept.id);
    item.price = 1;
    await item.save();
    const { error: leaveError } = await service
      .from('demo_tenant_members')
      .delete()
      .eq('tenant_id', tenant)
      .eq('user_id', outsider);
    expect(leaveError).toBeNull();

    const result = await push(rxdb);

    expect(result).toMatchObject({ pushed: 0, rejected: 1 });
    expect(rxdb.syncState.snapshot.lastRejections).toEqual([
      expect.objectContaining({ entity: 'CatalogItem', entityId: kept.id, reason: 'denied' })
    ]);
    expect(await localRow(local, kept.id)).toBeUndefined();
    expect(await remoteRow(kept.id)).toMatchObject({ price: 100 });
  });
});
