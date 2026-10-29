import { Entity, EntityBase, PropertyType, RxDB, SyncType, type UUID } from '@aiao/rxdb';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { getSupabaseServiceRoleClient } from './test-utils.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
type FixtureTable = 'rls_mutations_owner' | 'rls_mutations_shared';
type AuthenticatedUser = { client: SupabaseClient; userId: string };

@Entity({
  name: 'RlsMutationsOwner',
  namespace: 'public',
  tableName: 'rls_mutations_owner',
  sync: { type: SyncType.None },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
class RlsMutationsOwner extends EntityBase {
  title!: string;
  completed!: boolean;
}

@Entity({
  name: 'RlsMutationsShared',
  namespace: 'public',
  tableName: 'rls_mutations_shared',
  sync: { type: SyncType.None },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
class RlsMutationsShared extends EntityBase {
  title!: string;
  completed!: boolean;
}

async function signUpRandomUser(): Promise<AuthenticatedUser> {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, storageKey: crypto.randomUUID() }
  });
  const email = `mutations-update-${crypto.randomUUID()}@test.local`;
  const { data, error } = await client.auth.signUp({ email, password: 'mutations-update-password' });
  if (error || !data.user) throw new Error(`注册失败：${error?.message ?? '无 user'}`);
  return { client, userId: data.user.id };
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('US-223 mutations() 的 UPDATE 与 RLS 语义', () => {
  const fixtureRows: Array<{ table: FixtureTable; id: UUID }> = [];
  const rxdbInstances: RxDB[] = [];

  async function createAdapter(user: AuthenticatedUser): Promise<RxDBAdapterSupabase> {
    const rxdb = new RxDB({
      dbName: `mutations-update-${crypto.randomUUID()}`,
      context: { userId: user.userId },
      entities: [RlsMutationsOwner, RlsMutationsShared],
      sync: { remote: { adapter: 'supabase' }, type: SyncType.None }
    });
    rxdbInstances.push(rxdb);
    rxdb.adapter('supabase', async db => new RxDBAdapterSupabase(db, { client: user.client }));
    rxdb.init();
    return (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
  }

  async function seedRow(user: AuthenticatedUser, table: FixtureTable): Promise<UUID> {
    const id = crypto.randomUUID();
    fixtureRows.push({ table, id });
    const { error } = await user.client.from(table).insert({
      id,
      title: 'original',
      completed: false,
      createdBy: user.userId,
      updatedBy: user.userId
    });
    if (error) throw new Error(`夹具写入失败：${error.message}`);
    return id;
  }

  async function readRow(client: SupabaseClient, table: FixtureTable, id: UUID) {
    const { data, error } = await client.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`夹具读取失败：${error.message}`);
    return data;
  }

  afterEach(async () => {
    for (const rxdb of rxdbInstances.splice(0)) await rxdb.destroy();
  });

  afterAll(async () => {
    const service = getSupabaseServiceRoleClient();
    for (const row of fixtureRows) await service.from(row.table).delete().eq('id', row.id);
    // 两张夹具表挂着同步触发器，夹具写入、修改与上面的删除都记了日志；业务行删完再清，只清本 spec 的两个实体
    const { error } = await service
      .from('rxdb_change')
      .delete()
      .eq('namespace', 'public')
      .in('entity', ['RlsMutationsOwner', 'RlsMutationsShared']);
    if (error) throw new Error(`日志清理失败：${error.message}`);
  });

  it('owner 型 RLS 下更新自己的行，保留作者并返回数据库最终行', async () => {
    const user = await signUpRandomUser();
    const rowId = await seedRow(user, 'rls_mutations_owner');
    const adapter = await createAdapter(user);
    const entity = new RlsMutationsOwner({ id: rowId, title: 'changed', completed: true });

    const result = await adapter.mutations({
      create: new Map(),
      update: new Map([[RlsMutationsOwner, new Set([entity])]]),
      remove: new Map()
    });

    const row = await readRow(user.client, 'rls_mutations_owner', rowId);
    expect(row).toMatchObject({ title: 'changed', completed: true, createdBy: user.userId, updatedBy: user.userId });
    expect(result).toEqual([row]);
  });

  it('共享编辑型 RLS 下更新别人的行，不受 INSERT 策略限制且不转移所有权', async () => {
    const owner = await signUpRandomUser();
    const editor = await signUpRandomUser();
    const rowId = await seedRow(owner, 'rls_mutations_shared');
    const adapter = await createAdapter(editor);
    const entity = new RlsMutationsShared({ id: rowId, title: 'changed', completed: true });

    const result = await adapter.mutations({
      create: new Map(),
      update: new Map([[RlsMutationsShared, new Set([entity])]]),
      remove: new Map()
    });

    const row = await readRow(editor.client, 'rls_mutations_shared', rowId);
    expect(row).toMatchObject({ title: 'changed', completed: true, createdBy: owner.userId, updatedBy: editor.userId });
    expect(result).toEqual([row]);
  });

  it('UPDATE 策略拒绝时抛 42501，原行不变', async () => {
    const owner = await signUpRandomUser();
    const editor = await signUpRandomUser();
    const rowId = await seedRow(owner, 'rls_mutations_owner');
    const adapter = await createAdapter(editor);
    const entity = new RlsMutationsOwner({ id: rowId, title: 'forbidden', completed: true });

    await expect(
      adapter.mutations({
        create: new Map(),
        update: new Map([[RlsMutationsOwner, new Set([entity])]]),
        remove: new Map()
      })
    ).rejects.toMatchObject({ name: 'SupabaseDataError', code: '42501' });
    expect(await readRow(owner.client, 'rls_mutations_owner', rowId)).toMatchObject({
      title: 'original',
      completed: false,
      createdBy: owner.userId,
      updatedBy: owner.userId
    });
  });

  it('目标行已删除时抛 RX001，不重新插入', async () => {
    const user = await signUpRandomUser();
    const rowId = await seedRow(user, 'rls_mutations_owner');
    const { error } = await user.client.from('rls_mutations_owner').delete().eq('id', rowId);
    if (error) throw new Error(`夹具删除失败：${error.message}`);
    const adapter = await createAdapter(user);
    const entity = new RlsMutationsOwner({ id: rowId, title: 'resurrected', completed: true });

    await expect(
      adapter.mutations({
        create: new Map(),
        update: new Map([[RlsMutationsOwner, new Set([entity])]]),
        remove: new Map()
      })
    ).rejects.toMatchObject({ name: 'SupabaseDataError', code: 'RX001' });
    expect(await readRow(user.client, 'rls_mutations_owner', rowId)).toBeNull();
  });

  it('混合新增和修改走各自的策略，统一返回最终行', async () => {
    const user = await signUpRandomUser();
    const rowId = await seedRow(user, 'rls_mutations_owner');
    const adapter = await createAdapter(user);
    const created = new RlsMutationsOwner({ title: 'created', completed: false });
    const updated = new RlsMutationsOwner({ id: rowId, title: 'changed', completed: true });
    fixtureRows.push({ table: 'rls_mutations_owner', id: created.id });

    const result = await adapter.mutations({
      create: new Map([[RlsMutationsOwner, new Set([created])]]),
      update: new Map([[RlsMutationsOwner, new Set([updated])]]),
      remove: new Map()
    });

    const createdRow = await readRow(user.client, 'rls_mutations_owner', created.id);
    const updatedRow = await readRow(user.client, 'rls_mutations_owner', rowId);
    expect(createdRow).toMatchObject({ title: 'created', createdBy: user.userId, updatedBy: user.userId });
    expect(updatedRow).toMatchObject({ title: 'changed', completed: true, createdBy: user.userId });
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([createdRow, updatedRow]));
  });

  it('混合批次的更新被拒绝时，新增、修改与删除都不生效', async () => {
    const owner = await signUpRandomUser();
    const editor = await signUpRandomUser();
    const rowId = await seedRow(owner, 'rls_mutations_owner');
    const removedId = await seedRow(editor, 'rls_mutations_owner');
    const adapter = await createAdapter(editor);
    const created = new RlsMutationsOwner({ title: 'rolled-back', completed: false });
    const updated = new RlsMutationsOwner({ id: rowId, title: 'forbidden', completed: true });
    const removed = new RlsMutationsOwner({ id: removedId });
    fixtureRows.push({ table: 'rls_mutations_owner', id: created.id });

    await expect(
      adapter.mutations({
        create: new Map([[RlsMutationsOwner, new Set([created])]]),
        update: new Map([[RlsMutationsOwner, new Set([updated])]]),
        remove: new Map([[RlsMutationsOwner, new Set([removed])]])
      })
    ).rejects.toMatchObject({ name: 'SupabaseDataError', code: '42501' });
    expect(await readRow(editor.client, 'rls_mutations_owner', created.id)).toBeNull();
    expect(await readRow(editor.client, 'rls_mutations_owner', removedId)).toMatchObject({ title: 'original' });
    expect(await readRow(owner.client, 'rls_mutations_owner', rowId)).toMatchObject({ title: 'original' });
  });
});
