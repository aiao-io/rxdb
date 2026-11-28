/**
 * @fileoverview 租户内成员权限（US-234 AC#2～#9、#18、#19）—— 真实 Supabase 栈
 *
 * @remarks
 * 成员权限存在 `demo_tenant_members.permissions`：管理员 `read + edit + manage`，员工 `read`。商品的三条写策略、
 * 远端变更历史的可见性与 `rxdb_caller_grants()` 都经 `rxdb_caller_scopes` 读同一份授权（`catalog-demo.sql`），
 * 用例以普通 authenticated 身份经 REST、RPC 与推送验收，不用 mock。
 *
 * 商品声明了同口径的作用域与所需权限（阶段 B）：公开写入口按 Supabase 适配器读回的授权快照在本机先判一次，
 * 员工在本机写当场被拒（AC#18）；服务端的裁决另用绕过本机判定的写来验（AC#4）。
 *
 * 每轮用带 runId 的租户与用户：租户、管理员的成员关系与种子行经 service_role 直写，员工 X 自己经 REST 加入
 * （成员表只按列放行 `tenant_id`，自助加入拿到的只有 read）；结束时按 id 清理，不碰演示租户（星河零售、极光百货）。
 */
import {
  getEntityStatus,
  PermissionDeniedError,
  RxDB,
  RxDBChange,
  SyncType,
  type EntityBase,
  type EntityType,
  type RuleGroup
} from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { CatalogItem } from '@aiao/rxdb-test/entities';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { getSupabaseServiceRoleClient, signTestAccessToken } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

const ADMIN = ['read', 'edit', 'manage'];
const STAFF = ['read'];

interface Grant {
  scope: string;
  permissions: string[];
}

interface SeedRow {
  id: ReturnType<typeof crypto.randomUUID>;
  name: string;
  category: string;
  price: number;
  cost: number;
  visibility: 'public' | 'tenant';
  tenantId: string;
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('租户内成员权限（US-234）', () => {
  const runId = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const tenant = `us234-${runId}`;
  const otherTenant = `us234-${runId}-b`;
  const category = `us234-${runId}`;
  /** 本轮租户唯一的管理员（AC 里的 Bob） */
  const admin = crypto.randomUUID();
  /** 自助加入本轮租户的员工（AC 里的 X） */
  const staff = crypto.randomUUID();
  /** 不在任何租户里的登录用户 */
  const outsider = crypto.randomUUID();
  /** 先被管理员升为管理员、断网期间又被降为员工（AC#19 的 X） */
  const promoted = crypto.randomUUID();
  const service = getSupabaseServiceRoleClient();
  const databases: RxDB[] = [];
  const entityIds: string[] = [];
  const accounts: string[] = [];

  /** 带签发令牌的登录用户；`null` 是只有 anon key 的访客 */
  function client(user: string | null): SupabaseClient {
    return createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(user ? { accessToken: () => signTestAccessToken(user) } : {})
    });
  }

  /** 能断网的登录用户：断网时每个请求都像浏览器离线那样失败，`requests` 记下断网期间想发的请求 */
  function switchableClient(user: string) {
    const network = { online: true, requests: [] as string[] };
    const remote = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      accessToken: () => signTestAccessToken(user),
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          if (network.online) return fetch(input, init);
          network.requests.push(String(input instanceof Request ? input.url : input));
          return Promise.reject(new TypeError('Failed to fetch'));
        }
      }
    });
    return { remote, network };
  }

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

  async function grantsOf(remote: SupabaseClient): Promise<Grant[]> {
    const { data, error } = await remote.rpc('rxdb_caller_grants');
    expect(error).toBeNull();
    return data as Grant[];
  }

  /** 用户在本轮租户上的权限；不是成员为 `undefined` */
  async function tenantPermissions(user: string): Promise<string[] | undefined> {
    return (await grantsOf(client(user))).find(grant => grant.scope === `tenant:${tenant}`)?.permissions;
  }

  /** 退出本轮租户：成员表不授 DELETE，退出只经 RPC（与改权限同一把租户锁、同一个「至少留一个管理员」） */
  function leave(remote: SupabaseClient) {
    return remote.rpc('demo_leave_tenant', { p_tenant_id: tenant });
  }

  function setPermissions(caller: string, target: string, permissions: string[]) {
    return client(caller).rpc('demo_set_member_permissions', {
      p_tenant_id: tenant,
      p_user_id: target,
      p_permissions: permissions
    });
  }

  /** 远端这一行、它的同步日志与变更历史各有多少条：被拒的写入前后取一次，断言什么都没变 */
  async function remoteTrail(id: string) {
    const [item, logs, history] = await Promise.all([
      service.from('catalog_items').select('name, price, cost, visibility, "tenantId"').eq('id', id).maybeSingle(),
      service.from('rxdb_change').select('id', { count: 'exact', head: true }).eq('entityId', id),
      service.from('rxdb_change_history').select('id', { count: 'exact', head: true }).eq('entityId', id)
    ]);
    expect([item.error, logs.error, history.error]).toEqual([null, null, null]);
    return { item: item.data, logs: logs.count, history: history.count };
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
      dbName: `us234-${runId}-${databases.length}`,
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

  async function localRow(local: RxDBAdapterWaSqlite, id: string): Promise<CatalogItem | undefined> {
    const rows = await local.getRepository(CatalogItem).find({ where: { combinator: 'and', rules: [] } });
    return rows.find(item => item.id === id);
  }

  /** 本机变更日志的条数：被拒的写一条都不该留下 */
  const localChanges = (local: RxDBAdapterWaSqlite) =>
    local.getRepository(RxDBChange).count({ where: { combinator: 'and', rules: [] } });

  const getItem = (rxdb: RxDB, id: SeedRow['id']) =>
    firstValueFrom(rxdb.entityManager.getRepository(CatalogItem).get(id));

  beforeAll(async () => {
    const { error: tenantError } = await service.from('demo_tenants').insert([
      { id: tenant, name: `US-234 ${runId}` },
      { id: otherTenant, name: `US-234 ${runId} B` }
    ]);
    expect(tenantError, 'demo_tenants 缺失：先用 nx run rxdb-adapter-supabase:test-env 初始化测试栈').toBeNull();
    const { error: adminError } = await service
      .from('demo_tenant_members')
      .insert({ user_id: admin, tenant_id: tenant, permissions: ADMIN });
    expect(adminError).toBeNull();
    // X 自己加入：与演示的「加入」按钮发同一个请求，只写 tenant_id
    const { error: joinError } = await client(staff).from('demo_tenant_members').insert({ tenant_id: tenant });
    expect(joinError).toBeNull();
  });

  afterAll(async () => {
    await Promise.all(databases.map(rxdb => rxdb.disconnectAll().catch(() => undefined)));
    const tenants = [tenant, otherTenant];
    const { error: itemError } = await service.from('catalog_items').delete().in('tenantId', tenants);
    expect(itemError).toBeNull();
    const { error: logError } = await service.from('rxdb_change').delete().in('entityId', entityIds);
    expect(logError).toBeNull();
    const { error: historyError } = await service.from('rxdb_change_history').delete().in('entityId', entityIds);
    expect(historyError).toBeNull();
    const { error: memberError } = await service.from('demo_tenant_members').delete().in('tenant_id', tenants);
    expect(memberError).toBeNull();
    const { error: deleteError } = await service.from('demo_tenants').delete().in('id', tenants);
    expect(deleteError).toBeNull();
    for (const id of accounts) {
      const { error } = await service.auth.admin.deleteUser(id);
      expect(error).toBeNull();
    }
  });

  it('AC#2：自助加入的员工只有 read，管理员有 read + edit + manage；anon 没有任何作用域', async () => {
    expect(await grantsOf(client(staff))).toEqual([
      { scope: `tenant:${tenant}`, permissions: STAFF },
      { scope: `user:${staff}`, permissions: ['read', 'edit'] }
    ]);
    expect(await grantsOf(client(admin))).toEqual([
      { scope: `tenant:${tenant}`, permissions: ADMIN },
      { scope: `user:${admin}`, permissions: ['read', 'edit'] }
    ]);
    expect(await grantsOf(client(outsider))).toEqual([{ scope: `user:${outsider}`, permissions: ['read', 'edit'] }]);
    expect(await grantsOf(client(null))).toEqual([]);
  });

  it('AC#2：演示账号加入为它登记的租户时由服务端授予管理员，加入别的租户仍是员工', async () => {
    const email = `us234-${runId}@example.com`;
    const password = `us234-${runId}-password`;
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    expect(createError).toBeNull();
    accounts.push(created.user?.id ?? '');
    const { error: registerError } = await service
      .from('demo_tenant_initial_admins')
      .insert({ tenant_id: otherTenant, email });
    expect(registerError).toBeNull();

    const account = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    expect((await account.auth.signInWithPassword({ email, password })).error).toBeNull();
    expect((await account.from('demo_tenant_members').insert({ tenant_id: otherTenant })).error).toBeNull();
    expect((await account.from('demo_tenant_members').insert({ tenant_id: tenant })).error).toBeNull();

    const grants = await grantsOf(account);
    expect(grants).toContainEqual({ scope: `tenant:${otherTenant}`, permissions: ADMIN });
    expect(grants).toContainEqual({ scope: `tenant:${tenant}`, permissions: STAFF });
    expect((await leave(account)).error).toBeNull();
  });

  it('AC#3：员工与非成员经 REST 新建本租户商品报 42501，修改、删除零行、远端不变；anon 没有写权限；管理员全部成功', async () => {
    const [shown, internal] = await seed(row('rest-public', 'public'), row('rest-internal', 'tenant'));
    const before = await Promise.all([remoteTrail(shown.id), remoteTrail(internal.id)]);

    for (const user of [staff, outsider]) {
      const remote = client(user);
      for (const visibility of ['public', 'tenant'] as const) {
        const { error } = await remote.from('catalog_items').insert(row(`denied-${visibility}`, visibility));
        expect(error?.code).toBe('42501');
      }
      for (const item of [shown, internal]) {
        expect(await remote.from('catalog_items').update({ price: 1 }).eq('id', item.id).select('id')).toMatchObject({
          error: null,
          data: []
        });
        expect(await remote.from('catalog_items').delete().eq('id', item.id).select('id')).toMatchObject({
          error: null,
          data: []
        });
      }
    }
    const visitor = client(null);
    expect((await visitor.from('catalog_items').insert(row('anon', 'public'))).error?.code).toBe('42501');
    expect((await visitor.from('catalog_items').update({ price: 1 }).eq('id', shown.id)).error?.code).toBe('42501');
    expect((await visitor.from('catalog_items').delete().eq('id', shown.id)).error?.code).toBe('42501');
    expect(await Promise.all([remoteTrail(shown.id), remoteTrail(internal.id)])).toEqual(before);

    const manager = client(admin);
    for (const visibility of ['public', 'tenant'] as const) {
      expect((await manager.from('catalog_items').insert(row(`admin-${visibility}`, visibility))).error).toBeNull();
    }
    for (const item of [shown, internal]) {
      expect((await manager.from('catalog_items').update({ price: 2 }).eq('id', item.id).select('id')).data).toEqual([
        { id: item.id }
      ]);
      expect((await manager.from('catalog_items').delete().eq('id', item.id).select('id')).data).toEqual([
        { id: item.id }
      ]);
    }
  });

  it('AC#4：员工绕过本机判定在本机改了本租户的商品，推送被拒（denied），本机对齐远端；远端行、同步日志与变更历史都不变', async () => {
    const [kept] = await seed(row('staff-local', 'tenant'));
    const { rxdb, local } = await open(client(staff));
    await sync(rxdb);
    const before = await remoteTrail(kept.id);
    const item = await getItem(rxdb, kept.id);
    item.price = 1;
    // 公开写入口在本机就拒绝员工（AC#18）；经本地适配器写是系统写、不判定，代表本机判定没拦住的修改
    //（没装声明的旧客户端、直接改了本地库）：服务端照样拒绝
    await local.mutations({
      create: new Map(),
      update: new Map<EntityType, Set<EntityBase>>([[CatalogItem as unknown as EntityType, new Set([item])]]),
      remove: new Map()
    });

    const result = await push(rxdb);

    expect(result).toMatchObject({ pushed: 0, rejected: 1 });
    expect(rxdb.syncState.snapshot.lastRejections).toEqual([
      expect.objectContaining({ entity: 'CatalogItem', entityId: kept.id, reason: 'denied' })
    ]);
    expect(await localRow(local, kept.id)).toMatchObject({ price: 100, cost: 60 });
    expect(await remoteTrail(kept.id)).toEqual(before);
  });

  it('AC#5：员工同步拉取并直接查询本租户的公开与内部商品，都读得到、含成本价，与管理员相同；访客读不到成本价', async () => {
    const [shown, internal] = await seed(row('read-public', 'public'), row('read-internal', 'tenant'));
    const ids = [shown.id, internal.id].sort();
    const member = await open(client(staff));
    await sync(member.rxdb);
    expect(await localRow(member.local, shown.id)).toMatchObject({ cost: 60 });
    expect(await localRow(member.local, internal.id)).toMatchObject({ cost: 60 });

    const read = (user: string) => client(user).from('catalog_items').select('id, cost').in('id', ids).order('id');
    const [asStaff, asAdmin] = await Promise.all([read(staff), read(admin)]);
    expect(asStaff).toMatchObject({ error: null, data: ids.map(id => ({ id, cost: 60 })) });
    expect(asStaff.data).toEqual(asAdmin.data);

    const visitor = await open(client(null));
    await sync(visitor.rxdb);
    expect(await localRow(visitor.local, shown.id)).toMatchObject({ cost: null });
    expect(await localRow(visitor.local, internal.id)).toBeUndefined();
    expect((await client(null).from('catalog_items').select('id, cost').eq('id', shown.id)).error?.code).toBe('42501');
  });

  it('AC#18：员工经公开写入口在本机新建、修改、删除本租户的商品，当场 PermissionDeniedError；行不变，变更日志不多一条', async () => {
    const [kept] = await seed(row('staff-entry', 'tenant'));
    const { rxdb, local } = await open(client(staff));
    await sync(rxdb);
    expect(rxdb.grants.snapshot.has(`tenant:${tenant}`, 'read')).toBe(true);
    expect(rxdb.grants.snapshot.has(`tenant:${tenant}`, 'edit')).toBe(false);
    const before = await localChanges(local);

    const item = await getItem(rxdb, kept.id);
    item.price = 1;
    await expect(item.save()).rejects.toBeInstanceOf(PermissionDeniedError);
    item.reset();
    await expect(item.remove()).rejects.toBeInstanceOf(PermissionDeniedError);
    const created = rxdb.entityManager.instantiate(CatalogItem, {
      name: `${runId}/staff-new`,
      category,
      price: 1,
      cost: 1,
      visibility: 'tenant',
      tenantId: tenant
    });
    const error = await created.save().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect((error as PermissionDeniedError).violations).toEqual([
      expect.objectContaining({ entity: 'CatalogItem', scope: `tenant:${tenant}`, requires: 'edit' })
    ]);
    expect(await localChanges(local)).toBe(before);
    expect(getEntityStatus(item).origin).toMatchObject({ price: 100 });
    expect(await localRow(local, kept.id)).toMatchObject({ price: 100 });
    expect(await localRow(local, created.id)).toBeUndefined();
  });

  it('AC#19：管理员同步过一次后断网，沿用上次的快照在本机改；断网期间被降为员工，联网推送被拒、本机对齐，拉取后本机写当场被拒', async () => {
    const { error: joinError } = await client(promoted).from('demo_tenant_members').insert({ tenant_id: tenant });
    expect(joinError).toBeNull();
    // 用完退出：后面的用例按「本租户只有管理员与员工 X」断言成员列表
    onTestFinished(async () => {
      expect((await leave(client(promoted))).error).toBeNull();
    });
    expect((await setPermissions(admin, promoted, ADMIN)).error).toBeNull();
    const [kept] = await seed(row('offline-demoted', 'tenant'));
    const { remote, network } = switchableClient(promoted);
    const { rxdb, local } = await open(remote);
    await sync(rxdb);
    expect(rxdb.grants.snapshot.has(`tenant:${tenant}`, 'edit')).toBe(true);

    // 断网：本机写只看内存里的快照与本地库里的前像，一个请求都不发
    network.online = false;
    const offlineEdit = await getItem(rxdb, kept.id);
    offlineEdit.price = 1;
    await offlineEdit.save();
    expect(network.requests).toEqual([]);
    expect((await setPermissions(admin, promoted, STAFF)).error).toBeNull();

    // 联网：推送进门时先刷新快照（已是员工），服务端拒收这条修改，本机对齐远端
    network.online = true;
    const result = await push(rxdb);

    expect(result).toMatchObject({ pushed: 0, rejected: 1 });
    expect(rxdb.syncState.snapshot.lastRejections).toEqual([
      expect.objectContaining({ entity: 'CatalogItem', entityId: kept.id, reason: 'denied' })
    ]);
    expect(await localRow(local, kept.id)).toMatchObject({ price: 100 });

    await sync(rxdb);
    expect(rxdb.grants.snapshot.has(`tenant:${tenant}`, 'edit')).toBe(false);
    const before = await localChanges(local);
    const again = await getItem(rxdb, kept.id);
    again.price = 2;
    await expect(again.save()).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(await localChanges(local)).toBe(before);
  });

  it('AC#6：员工与非成员读本租户商品的远端变更历史得零条、不报错，管理员读得到；anon 没有执行权', async () => {
    const [item] = await seed(row('history', 'tenant'));
    const history = (remote: SupabaseClient) =>
      remote.rpc('rxdb_entity_history', { p_namespace: 'public', p_entity: 'CatalogItem', p_entity_id: item.id });

    expect(await history(client(staff))).toMatchObject({ error: null, data: [] });
    expect(await history(client(outsider))).toMatchObject({ error: null, data: [] });
    const asAdmin = await history(client(admin));
    expect(asAdmin.error).toBeNull();
    expect(asAdmin.data).toEqual([expect.objectContaining({ entityId: item.id, type: 'INSERT' })]);
    expect((await history(client(null))).error?.code).toBe('42501');
  });

  it('AC#7：员工插带权限的成员行、改自己的成员行、调改权限的 RPC 都被拒，权限仍是 read', async () => {
    const remote = client(staff);
    const inserted = await remote
      .from('demo_tenant_members')
      .insert({ tenant_id: otherTenant, permissions: ['read', 'edit', 'manage'] });
    expect(inserted.error?.code).toBe('42501');
    const updated = await remote.from('demo_tenant_members').update({ permissions: ADMIN }).eq('tenant_id', tenant);
    expect(updated.error?.code).toBe('42501');
    expect((await setPermissions(staff, staff, ['read', 'edit'])).error?.code).toBe('42501');

    expect(await tenantPermissions(staff)).toEqual(STAFF);
    expect((await grantsOf(remote)).map(grant => grant.scope)).not.toContain(`tenant:${otherTenant}`);
  });

  it('成员列表只对管理员开放：列出本租户全部成员与权限，员工调用被拒', async () => {
    const { data, error } = await client(admin).rpc('demo_tenant_member_list', { p_tenant_id: tenant });
    expect(error).toBeNull();
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: admin, email: null, permissions: ADMIN }),
        expect.objectContaining({ user_id: staff, email: null, permissions: STAFF })
      ])
    );
    expect(data).toHaveLength(2);
    expect((await client(staff).rpc('demo_tenant_member_list', { p_tenant_id: tenant })).error?.code).toBe('42501');
  });

  it('AC#9：管理员写入六项以外的权限、或不含 read 的权限都被拒，员工的权限不变', async () => {
    for (const permissions of [['read', 'owner'], ['edit'], []]) {
      const { error } = await setPermissions(admin, staff, permissions);
      expect(error, JSON.stringify(permissions)).not.toBeNull();
    }
    expect(await tenantPermissions(staff)).toEqual(STAFF);
  });

  it('AC#8：唯一的管理员把员工升为管理员，对方再把他降为员工；最后一个管理员撤不掉自己的 manage', async () => {
    expect((await setPermissions(admin, staff, ADMIN)).error).toBeNull();
    expect(await tenantPermissions(staff)).toEqual(ADMIN);
    expect((await setPermissions(staff, admin, STAFF)).error).toBeNull();
    expect(await tenantPermissions(admin)).toEqual(STAFF);

    const { error } = await setPermissions(staff, staff, STAFF);

    expect(error?.message).toContain('最后一个管理员');
    expect(await tenantPermissions(staff)).toEqual(ADMIN);
  });

  // 评审 F7：退出与改权限守同一个不变量。接着上一条：X 是唯一的管理员，Bob 已是员工
  it('AC#8：最后一个管理员也不能退出租户，员工照常退出；成员表不能直接删行', async () => {
    const direct = await client(staff).from('demo_tenant_members').delete().eq('tenant_id', tenant);
    expect(direct.error?.code).toBe('42501');

    const { error } = await leave(client(staff));

    expect(error?.message).toContain('最后一个管理员');
    expect(await tenantPermissions(staff)).toEqual(ADMIN);
    expect((await leave(client(admin))).error).toBeNull();
    expect(await tenantPermissions(admin)).toBeUndefined();
  });
});
