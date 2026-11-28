/**
 * @fileoverview 远端变更历史（US-229 AC#8、#9、#11、#12）—— 真实 Supabase 栈与 demo 的可见性判定
 *
 * @remarks
 * 商品的历史只对它所属租户里有 `edit` 的成员开放（`catalog-demo.sql` 覆盖的 `rxdb_caller_can_edit`，US-234），
 * 按每条历史记录时的行判定。
 * 写入点、列脱敏与授权由 SQL 回归 `change-history` 逐条断言；这里走适配器的 `getEntityHistory`，在真栈上复验可见性。
 *
 * 每轮自建两个租户与三个用户：租户、成员关系与种子行经 service_role 直写，结束时按 id 清理，不碰演示租户。
 */
import { RxDB, SyncType, type RuleGroup } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { CatalogItem } from '@aiao/rxdb-test/entities';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SupabaseDataError } from '../errors.js';
import { RxDBAdapterSupabase } from '../index.js';
import { getSupabaseServiceRoleClient, signTestAccessToken } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
/** 能改本租户商品的成员权限（US-234：员工只有 read，读不到历史） */
const EDITOR = ['read', 'edit'];

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('远端变更历史（US-229）', () => {
  const runId = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const tenantA = `us229-${runId}-a`;
  const tenantB = `us229-${runId}-b`;
  const alice = crypto.randomUUID();
  const bob = crypto.randomUUID();
  const carol = crypto.randomUUID();
  /** 两个租户都能编辑 */
  const dave = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const service = getSupabaseServiceRoleClient();
  const databases: RxDB[] = [];

  function client(user: string | null): SupabaseClient {
    return createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(user ? { accessToken: () => signTestAccessToken(user) } : {})
    });
  }

  const rule = (): RuleGroup => ({
    combinator: 'and',
    rules: [{ field: 'tenantId', operator: 'in', value: [tenantA, tenantB] }]
  });

  async function open(remote: SupabaseClient) {
    const rxdb = new RxDB({
      dbName: `us229-${runId}-${databases.length}`,
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
    await rxdb.connect('wa-sqlite');
    const adapter = (await rxdb.connect('supabase')) as RxDBAdapterSupabase;
    return { rxdb, adapter };
  }

  /** 这件商品的历史在调用者眼里是什么样：`来源:种类:当时的租户` */
  async function visible(adapter: RxDBAdapterSupabase): Promise<string[]> {
    const history = await adapter.getEntityHistory(CatalogItem, itemId);
    return history.map(entry => {
      const row = entry.afterData ?? entry.beforeData;
      return `${entry.source}:${entry.type}:${String(row?.['tenantId'])}`;
    });
  }

  beforeAll(async () => {
    const { error: tenantError } = await service.from('demo_tenants').insert([
      { id: tenantA, name: `US-229 ${runId} A` },
      { id: tenantB, name: `US-229 ${runId} B` }
    ]);
    expect(tenantError, 'demo_tenants 缺失：先用 nx run rxdb-adapter-supabase:test-env 初始化测试栈').toBeNull();
    const { error: memberError } = await service.from('demo_tenant_members').insert([
      { user_id: alice, tenant_id: tenantA, permissions: EDITOR },
      { user_id: bob, tenant_id: tenantB, permissions: EDITOR },
      { user_id: dave, tenant_id: tenantA, permissions: EDITOR },
      { user_id: dave, tenant_id: tenantB, permissions: EDITOR }
    ]);
    expect(memberError).toBeNull();
  });

  afterAll(async () => {
    await Promise.all(databases.map(rxdb => rxdb.disconnectAll().catch(() => undefined)));
    const { error: itemError } = await service.from('catalog_items').delete().eq('id', itemId);
    expect(itemError).toBeNull();
    const { error: logError } = await service.from('rxdb_change').delete().eq('entityId', itemId);
    expect(logError).toBeNull();
    const { error: historyError } = await service.from('rxdb_change_history').delete().eq('entityId', itemId);
    expect(historyError).toBeNull();
    const { error: memberError } = await service
      .from('demo_tenant_members')
      .delete()
      .in('tenant_id', [tenantA, tenantB]);
    expect(memberError).toBeNull();
    const { error: tenantError } = await service.from('demo_tenants').delete().in('id', [tenantA, tenantB]);
    expect(tenantError).toBeNull();
  });

  it('成员读得到本租户商品的全部历史（含它在公开区时的修改）；不是成员的读不到，anon 没有执行权', async () => {
    const { error } = await service.from('catalog_items').insert({
      id: itemId,
      name: `${runId}/history`,
      category: `us229-${runId}`,
      price: 100,
      cost: 60,
      visibility: 'public',
      tenantId: tenantA
    });
    expect(error).toBeNull();

    // Alice 在本机改售价并推送（push），再直接把它收回为租户内部（trigger，换区）
    const member = await open(client(alice));
    await member.rxdb.syncManager.pullRepository('public', 'CatalogItem', { fetchAll: true });
    const item = await firstValueFrom(member.rxdb.entityManager.getRepository(CatalogItem).get(itemId));
    item.price = 120;
    await item.save();
    expect(await member.rxdb.syncManager.pushRepository('public', 'CatalogItem')).toMatchObject({ pushed: 1 });
    const { error: moveError } = await member.adapter.client
      .from('catalog_items')
      .update({ visibility: 'tenant' })
      .eq('id', itemId);
    expect(moveError).toBeNull();

    expect(await visible(member.adapter)).toEqual([
      `trigger:INSERT:${tenantA}`,
      `push:UPDATE:${tenantA}`,
      `trigger:UPDATE:${tenantA}`
    ]);
    const [, pushed] = await member.adapter.getEntityHistory(CatalogItem, itemId);
    expect(pushed).toMatchObject({
      actor: alice,
      role: 'authenticated',
      bucket: 'public',
      patch: { price: 120 },
      beforeData: { price: 100 },
      afterData: { price: 120 }
    });
    expect(pushed.createdAt).toBeInstanceOf(Date);

    const outsider = await open(client(carol));
    expect(await visible(outsider.adapter)).toEqual([]);

    const visitor = await open(client(null));
    await expect(visitor.adapter.getEntityHistory(CatalogItem, itemId)).rejects.toBeInstanceOf(SupabaseDataError);
  });

  it('换了租户之后，改动前的历史只对旧租户的成员可见；删掉之后按删除前的行开放', async () => {
    const { error: moveError } = await service.from('catalog_items').update({ tenantId: tenantB }).eq('id', itemId);
    expect(moveError).toBeNull();
    const member = await open(client(alice));
    const newMember = await open(client(bob));

    expect(await visible(member.adapter)).toEqual([
      `trigger:INSERT:${tenantA}`,
      `push:UPDATE:${tenantA}`,
      `trigger:UPDATE:${tenantA}`
    ]);
    expect(await visible(newMember.adapter)).toEqual([`trigger:UPDATE:${tenantB}`]);
    // 换租户那一条记在新租户：它的前像与逆补丁是旧租户的内容，只给也能编辑旧租户的成员
    const [moved] = await newMember.adapter.getEntityHistory(CatalogItem, itemId);
    expect(moved).toMatchObject({
      beforeData: null,
      inversePatch: null,
      patch: { tenantId: tenantB },
      afterData: { tenantId: tenantB, price: 120 }
    });
    const bothSides = await open(client(dave));
    const fullHistory = await bothSides.adapter.getEntityHistory(CatalogItem, itemId);
    expect(fullHistory).toHaveLength(4);
    expect(fullHistory.at(-1)).toMatchObject({
      beforeData: { tenantId: tenantA, price: 120 },
      inversePatch: { tenantId: tenantA },
      patch: { tenantId: tenantB },
      afterData: { tenantId: tenantB }
    });

    const { error: deleteError } = await newMember.adapter.client.from('catalog_items').delete().eq('id', itemId);
    expect(deleteError).toBeNull();

    expect(await visible(newMember.adapter)).toEqual([`trigger:UPDATE:${tenantB}`, `trigger:DELETE:${tenantB}`]);
    const [, deleted] = await newMember.adapter.getEntityHistory(CatalogItem, itemId);
    expect(deleted).toMatchObject({ beforeData: { tenantId: tenantB, price: 120 }, afterData: null });
    expect(await visible(member.adapter)).toHaveLength(3);
  });
});
