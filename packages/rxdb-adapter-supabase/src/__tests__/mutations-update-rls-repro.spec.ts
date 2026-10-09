/**
 * @fileoverview 零散收尾项第 8 条【复现：待评估】—— `mutations()` 直写路径的 UPDATE 语义
 *
 * US-220 只改了推送路径（mergeChanges → `p_updates`，普通 UPDATE 落库），
 * `RxDBAdapterSupabase.mutations()`（仓库 `save()` 直写）仍把 `options.update` 的整实体
 * 放进 `p_upserts`，走 `INSERT … ON CONFLICT DO UPDATE`。这里按 US-220 症状 2、3 的
 * 形状（见 supabase-sql-security-regressions.sql 的 update-owner-rls / update-shared-edit
 * 夹具，那些是推送路径的），对 mutations() 直写路径各写一条真实链路复现：
 *
 * - 症状 2（owner 型）：`FOR ALL USING/WITH CHECK ("createdBy" = auth.uid())` 的表
 *   `rls_mutations_owner`（docker/sql/03-business-tables.sql 第 11 节），改自己的行。
 *   归属列必须是 `createdBy`：mutations() 的 update 载荷是「整实体去掉 createdBy」
 *   （build_upsert_params mode='update'），与推送路径的部分列载荷同构。
 * - 症状 3（共享编辑型）：SELECT 全放行、INSERT 限本人、UPDATE 不设限的表
 *   `rls_mutations_shared`，改他人的行。
 *
 * 每条复现都真实调用 `adapter.mutations()`（authenticated 会话，`auth.uid()` 生效），
 * 断言是否被 RLS 误拒（42501）以及行是否未变。结论写回 requirements/roadmap.md
 * 零散收尾项第 8 条，由主会话回写，本文件只负责把行为钉住。
 */
import { Entity, EntityBase, PropertyType, RxDB, SyncType, type UUID } from '@aiao/rxdb';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SupabaseDataError } from '../errors.js';
import { RxDBAdapterSupabase } from '../index.js';
import { getSupabaseServiceRoleClient } from './test-utils.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

/**
 * 症状 2 夹具实体：`rls_mutations_owner`，策略
 * `FOR ALL USING ("createdBy" = auth.uid()::text) WITH CHECK ("createdBy" = auth.uid()::text)`。
 */
@Entity({
  name: 'RlsMutationsOwner',
  namespace: 'public',
  tableName: 'rls_mutations_owner',
  sync: {
    type: SyncType.Full,
    local: { adapter: 'local' },
    remote: { adapter: 'remote' }
  },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
class RlsMutationsOwner extends EntityBase {
  title!: string;
  completed!: boolean;
}

/**
 * 症状 3 夹具实体：`rls_mutations_shared`，策略 SELECT 全放行、
 * `INSERT WITH CHECK ("createdBy" = auth.uid()::text)`、UPDATE/DELETE 不设限。
 */
@Entity({
  name: 'RlsMutationsShared',
  namespace: 'public',
  tableName: 'rls_mutations_shared',
  sync: {
    type: SyncType.Full,
    local: { adapter: 'local' },
    remote: { adapter: 'remote' }
  },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
class RlsMutationsShared extends EntityBase {
  title!: string;
  completed!: boolean;
}

/** 注册一个随机用户并返回已认证的独立 `supabase-js` 会话与其 `auth.uid()`（push-receipts 同款） */
async function signUpRandomUser(): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const email = `mutations-update-repro-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const { data, error } = await client.auth.signUp({ email, password: 'mutations-repro-password' });
  if (error || !data.user) {
    throw new Error(`signUp 失败：${error?.message ?? '无 user'}`);
  }
  return { client, userId: data.user.id };
}

/** 以给定身份直插夹具行（命中同步触发器，等价于「已经落库的远端行」） */
async function seedRow(
  client: SupabaseClient,
  table: 'rls_mutations_owner' | 'rls_mutations_shared',
  createdBy: string,
  title: string
): Promise<UUID> {
  const id = crypto.randomUUID();
  const { error } = await client.from(table).insert({
    id,
    title,
    completed: false,
    createdBy,
    updatedBy: createdBy
  });
  if (error) throw new Error(`夹具写入 ${table} 失败：${error.message}`);
  return id;
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('复现：mutations() 直写路径的 UPDATE 语义（零散收尾项第 8 条，待评估）', () => {
  const fixtureRows: Array<{ table: 'rls_mutations_owner' | 'rls_mutations_shared'; id: UUID }> = [];
  const rxdbInstances: RxDB[] = [];

  beforeAll(async () => {
    // 清场：先业务行，再日志表（顺序不能反，删除会再触发日志写入）
    const service = getSupabaseServiceRoleClient();
    await service.from('rls_mutations_owner').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await service.from('rls_mutations_shared').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await service.from('rxdb_change').delete().neq('id', 0);
  });

  afterAll(async () => {
    for (const rxdb of rxdbInstances) {
      try {
        await rxdb.destroy();
      } catch {
        // 复现用例失败路径上实例状态不定，销毁失败不影响断言结果
      }
    }
    const service = getSupabaseServiceRoleClient();
    for (const row of fixtureRows) {
      await service.from(row.table).delete().eq('id', row.id);
    }
    await service.from('rxdb_change').delete().neq('id', 0);
  });

  it('症状 2（owner 型 FOR ALL createdBy = uid）：mutations() 更新自己的行被 42501 误拒', async () => {
    const user = await signUpRandomUser();
    const rowId = await seedRow(user.client, 'rls_mutations_owner', user.userId, 'original');
    fixtureRows.push({ table: 'rls_mutations_owner', id: rowId });

    const rxdb = new RxDB({
      dbName: `mutations-repro-owner-${Date.now()}`,
      context: { userId: user.userId },
      entities: [RlsMutationsOwner],
      sync: { remote: { adapter: 'supabase' }, type: SyncType.None }
    });
    rxdbInstances.push(rxdb);
    rxdb.adapter('supabase', async db => new RxDBAdapterSupabase(db, { client: user.client }));
    rxdb.init();
    const adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    await adapter.connect();

    // 整实体载荷（title + completed），createdBy 被 build_upsert_params 的 update 模式剔除
    const entity = new RlsMutationsOwner({ id: rowId, title: 'changed', completed: true });

    const failure = await adapter
      .mutations({
        create: new Map(),
        update: new Map([[RlsMutationsOwner, new Set([entity])]]),
        remove: new Map()
      })
      .then(() => null, (error: unknown) => error);

    // 期望（按 US-220 症状 2 的机制）：拟插入行 createdBy = NULL，过不了 FOR ALL 的 WITH CHECK
    expect(failure).toBeInstanceOf(SupabaseDataError);
    expect((failure as InstanceType<typeof SupabaseDataError>).code).toBe('42501');
    expect((failure as InstanceType<typeof SupabaseDataError>).message).toContain('row-level security');

    // 行未变
    const { data } = await user.client
      .from('rls_mutations_owner')
      .select('title, completed')
      .eq('id', rowId)
      .single();
    expect(data?.title).toBe('original');
    expect(data?.completed).toBe(false);
  });

  it('症状 3（共享编辑型 INSERT 策略比 UPDATE 窄）：mutations() 更新他人的行被 42501 误拒', async () => {
    const userA = await signUpRandomUser();
    const userB = await signUpRandomUser();
    const rowId = await seedRow(userA.client, 'rls_mutations_shared', userA.userId, 'original');
    fixtureRows.push({ table: 'rls_mutations_shared', id: rowId });

    const rxdb = new RxDB({
      dbName: `mutations-repro-shared-${Date.now()}`,
      context: { userId: userB.userId },
      entities: [RlsMutationsShared],
      sync: { remote: { adapter: 'supabase' }, type: SyncType.None }
    });
    rxdbInstances.push(rxdb);
    rxdb.adapter('supabase', async db => new RxDBAdapterSupabase(db, { client: userB.client }));
    rxdb.init();
    const adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    await adapter.connect();

    // B 整实体更新 A 的行；UPDATE 策略全放行，但拟插入行要先过 INSERT 的 WITH CHECK（createdBy = B）
    const entity = new RlsMutationsShared({ id: rowId, title: 'changed', completed: true });

    const failure = await adapter
      .mutations({
        create: new Map(),
        update: new Map([[RlsMutationsShared, new Set([entity])]]),
        remove: new Map()
      })
      .then(() => null, (error: unknown) => error);

    // 期望（按 US-220 症状 3 的机制）：拟插入行 createdBy = NULL，过不了 INSERT 的 WITH CHECK
    expect(failure).toBeInstanceOf(SupabaseDataError);
    expect((failure as InstanceType<typeof SupabaseDataError>).code).toBe('42501');
    expect((failure as InstanceType<typeof SupabaseDataError>).message).toContain('row-level security');

    // 行未变（用 A 的会话读，SELECT 策略全放行）
    const { data } = await userB.client
      .from('rls_mutations_shared')
      .select('title, completed')
      .eq('id', rowId)
      .single();
    expect(data?.title).toBe('original');
    expect(data?.completed).toBe(false);
  });
});
