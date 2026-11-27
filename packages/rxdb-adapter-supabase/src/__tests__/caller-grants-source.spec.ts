/**
 * @fileoverview 授权快照的 Supabase 来源（US-029 AC#14～#16）—— 真实 Supabase 栈
 *
 * @remarks
 * 共享夹具 `CatalogItem`（US-234 阶段 B 起声明了 `tenant:` 作用域与增删改所需的 `edit`）连上 Supabase 之后，快照来自
 * `rxdb_caller_grants()`：连接时、同步每一轮进门时各读一次。用例以普通 authenticated 身份运行，权限只经成员表与
 * US-234 的 RPC 改，不用 mock。AC#16 不改共享栈：客户端外面套一层，把 `rxdb_caller_grants` 换成一个不存在的函数名，
 * 拿到的是真栈对「没有这个函数」的真实应答（PGRST202），适配器自己的映射与核心的连接处置照常走一遍。
 *
 * 每轮用带 runId 的租户与用户，结束时按 id 清理，不碰演示租户。
 */
import {
  getEntityStatus,
  PermissionDeniedError,
  RxDB,
  RxDBChange,
  RxDBGrantSnapshot,
  SyncType,
  type EntityType,
  type RuleGroup
} from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { CatalogItem, Todo } from '@aiao/rxdb-test/entities';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SupabaseConfigError } from '../errors.js';
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

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('授权快照的 Supabase 来源（US-029 阶段 C）', () => {
  const runId = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const tenant = `us029-${runId}`;
  const category = `us029-${runId}`;
  /** 一直是管理员：负责把 manager 降为员工 */
  const owner = crypto.randomUUID();
  /** 先是管理员、用例中途被 owner 降为员工 */
  const manager = crypto.randomUUID();
  /** 自助加入的员工 */
  const staff = crypto.randomUUID();
  const service = getSupabaseServiceRoleClient();
  const databases: RxDB[] = [];
  const entityIds: string[] = [];

  function client(user: string): SupabaseClient {
    return createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      accessToken: () => signTestAccessToken(user)
    });
  }

  /** 同一个客户端，但服务端「没有」`rxdb_caller_grants()`：调用换成一个不存在的函数名 */
  function withoutGrantsFunction(remote: SupabaseClient): SupabaseClient {
    const missing = `rxdb_caller_grants_absent_${runId}`;
    return new Proxy(remote, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property, target);
        if (property === 'rpc') {
          return (name: string, ...rest: unknown[]) =>
            (target.rpc as (fn: string, ...args: unknown[]) => unknown)(
              name === 'rxdb_caller_grants' ? missing : name,
              ...rest
            );
        }
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  }

  async function grantsOf(user: string): Promise<Grant[]> {
    const { data, error } = await client(user).rpc('rxdb_caller_grants');
    expect(error).toBeNull();
    return data as Grant[];
  }

  async function seed(name: string): Promise<string> {
    const id = crypto.randomUUID();
    entityIds.push(id);
    const { error } = await service.from('catalog_items').insert({
      id,
      name: `${runId}/${name}`,
      category,
      price: 100,
      cost: 60,
      visibility: 'tenant',
      tenantId: tenant
    });
    expect(error).toBeNull();
    return id;
  }

  /** 与 demo 同一条规则：租户内部商品全量，公开商品只取本轮的分类 */
  const rule = (): RuleGroup => ({
    combinator: 'or',
    rules: [
      { field: 'visibility', operator: '=', value: 'tenant' },
      { field: 'category', operator: 'in', value: [category] }
    ]
  });

  function create(remote: SupabaseClient, entities: EntityType[] = [CatalogItem]): RxDB {
    const rxdb = new RxDB({
      dbName: `us029-${runId}-${databases.length}`,
      context: { userId: crypto.randomUUID() },
      entities,
      sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } },
      syncOverrides:
        entities.includes(CatalogItem) ?
          [
            {
              entity: CatalogItem,
              sync: {
                type: SyncType.Filter,
                local: { adapter: 'wa-sqlite' },
                remote: { adapter: 'supabase', filter: rule }
              }
            }
          ]
        : []
    });
    databases.push(rxdb);
    rxdb.use(rxDBPluginHistory);
    rxdb.use(rxDBPluginSync);
    rxdb.adapter(
      'wa-sqlite',
      db => new RxDBAdapterWaSqlite(db, { vfs: 'MemoryAsyncVFS', async: true, worker: false, wasmPath: asyncWasmPath })
    );
    rxdb.adapter('supabase', db => new RxDBAdapterSupabase(db, { client: remote }));
    return rxdb;
  }

  async function open(remote: SupabaseClient) {
    const rxdb = create(remote);
    const local = (await rxdb.connect('wa-sqlite')) as RxDBAdapterWaSqlite;
    await rxdb.connect('supabase');
    return { rxdb, local };
  }

  const pull = (rxdb: RxDB) => rxdb.syncManager.pullRepository('public', 'CatalogItem', { fetchAll: true });
  const push = (rxdb: RxDB) => rxdb.syncManager.pushRepository('public', 'CatalogItem');
  const item = (rxdb: RxDB, id: string) =>
    firstValueFrom(rxdb.entityManager.getRepository(CatalogItem).get(id as never));

  async function localRow(local: RxDBAdapterWaSqlite, id: string): Promise<CatalogItem | undefined> {
    const rows = await local.getRepository(CatalogItem).find({ where: { combinator: 'and', rules: [] } });
    return rows.find(row => row.id === id);
  }

  /** 本地变更日志的行数：被拒的写不能留下待推修改 */
  const localChanges = (local: RxDBAdapterWaSqlite) =>
    local.getRepository(RxDBChange).count({ where: { combinator: 'and', rules: [] } });

  beforeAll(async () => {
    const { error: tenantError } = await service.from('demo_tenants').insert({ id: tenant, name: `US-029 ${runId}` });
    expect(tenantError, 'demo_tenants 缺失：先用 nx run rxdb-adapter-supabase:test-env 初始化测试栈').toBeNull();
    const { error: adminError } = await service.from('demo_tenant_members').insert([
      { user_id: owner, tenant_id: tenant, permissions: ADMIN },
      { user_id: manager, tenant_id: tenant, permissions: ADMIN }
    ]);
    expect(adminError).toBeNull();
    // 员工自己加入：与演示的「加入」按钮发同一个请求，只写 tenant_id，拿到的只有 read
    const { error: joinError } = await client(staff).from('demo_tenant_members').insert({ tenant_id: tenant });
    expect(joinError).toBeNull();
  });

  afterAll(async () => {
    await Promise.all(databases.map(rxdb => rxdb.disconnectAll().catch(() => undefined)));
    const { error: itemError } = await service.from('catalog_items').delete().eq('tenantId', tenant);
    expect(itemError).toBeNull();
    const { error: logError } = await service.from('rxdb_change').delete().in('entityId', entityIds);
    expect(logError).toBeNull();
    const { error: historyError } = await service.from('rxdb_change_history').delete().in('entityId', entityIds);
    expect(historyError).toBeNull();
    const { error: memberError } = await service.from('demo_tenant_members').delete().eq('tenant_id', tenant);
    expect(memberError).toBeNull();
    const { error: deleteError } = await service.from('demo_tenants').delete().eq('id', tenant);
    expect(deleteError).toBeNull();
  });

  it('AC#14：员工连接后快照与 rxdb_caller_grants() 一致；本机改本租户的商品当场被拒，没有待推修改', async () => {
    const id = await seed('staff-local');
    const { rxdb, local } = await open(client(staff));

    expect(rxdb.grants.snapshot.status).toBe('known');
    expect(rxdb.grants.snapshot.source).toBe('remote');
    expect(rxdb.grants.snapshot.grants).toEqual(
      RxDBGrantSnapshot.known(await grantsOf(staff), 'remote', new Date()).grants
    );
    expect(rxdb.grants.snapshot.has(`tenant:${tenant}`, 'edit')).toBe(false);

    await pull(rxdb);
    const before = await localChanges(local);
    const row = await item(rxdb, id);
    row.price = 1;
    const error = await row.save().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect((error as PermissionDeniedError).violations).toEqual([
      expect.objectContaining({ entity: 'CatalogItem', id, scope: `tenant:${tenant}`, requires: 'edit' })
    ]);
    // 被拒的写一条都没发出：变更日志没多一行，落库值仍是原价；未保存的编辑留在实例上，由用户决定丢不丢
    expect(await localChanges(local)).toBe(before);
    expect(getEntityStatus(row).origin).toMatchObject({ price: 100 });
    await expect(rxdb.grants.set([])).rejects.toThrow(/refresh\(\)/);
  });

  it('AC#15：管理员本机改了、未推送，期间被降为员工：推送被拒、本机对齐、进被拒清单；同步后快照刷新，之后本机写当场被拒', async () => {
    const id = await seed('demoted');
    const { rxdb, local } = await open(client(manager));
    expect(rxdb.grants.snapshot.has(`tenant:${tenant}`, 'edit')).toBe(true);
    await pull(rxdb);
    const edited = await item(rxdb, id);
    edited.price = 1;
    await edited.save();

    const { error: demoteError } = await client(owner).rpc('demo_set_member_permissions', {
      p_tenant_id: tenant,
      p_user_id: manager,
      p_permissions: STAFF
    });
    expect(demoteError).toBeNull();

    const result = await push(rxdb);

    expect(result).toMatchObject({ pushed: 0, rejected: 1 });
    expect(rxdb.syncState.snapshot.lastRejections).toEqual([
      expect.objectContaining({ entity: 'CatalogItem', entityId: id, reason: 'denied' })
    ]);
    expect(await localRow(local, id)).toMatchObject({ price: 100 });
    expect(rxdb.grants.snapshot.has(`tenant:${tenant}`, 'edit')).toBe(false);

    await pull(rxdb);
    const before = await localChanges(local);
    const again = await item(rxdb, id);
    again.price = 2;
    await expect(again.save()).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(await localChanges(local)).toBe(before);
    expect(getEntityStatus(again).origin).toMatchObject({ price: 100 });
  });

  it('AC#16：实体声明了作用域、远端没有 rxdb_caller_grants()：连接报错，点名函数与部署文档，快照不当成空的', async () => {
    const rxdb = create(withoutGrantsFunction(client(staff)));
    await rxdb.connect('wa-sqlite');

    const error = await rxdb.connect('supabase').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SupabaseConfigError);
    expect((error as Error).message).toMatch(
      /rxdb_caller_grants\(\)[\s\S]*website\/docs\/migration\/supabase-member-permissions\.md/
    );
    expect(rxdb.grants.snapshot).toBe(RxDBGrantSnapshot.UNKNOWN);
  });

  it('AC#16 对照：没有实体声明作用域时远端一次都不问，没有这个函数也照常连接', async () => {
    const rxdb = create(withoutGrantsFunction(client(staff)), [Todo]);
    await rxdb.connect('wa-sqlite');

    await expect(rxdb.connect('supabase')).resolves.toBeDefined();
    expect(rxdb.grants.snapshot).toBe(RxDBGrantSnapshot.UNKNOWN);
  });
});
