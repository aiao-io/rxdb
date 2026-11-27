import type { SupabaseClient } from '@supabase/supabase-js';

/** 远端读写用到的客户端能力子集。 */
export type CatalogRemoteClient = Pick<SupabaseClient, 'from' | 'rpc'>;

/** 演示租户（`public.demo_tenants`）。 */
export interface DemoTenant {
  readonly id: string;
  readonly name: string;
}

/** 远端的一行商品：在「模拟服务端」面板里列出与修改。 */
export interface CatalogRemoteItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly price: number;
  /** 业务表允许不填 */
  readonly cost: number | null;
  readonly visibility: 'public' | 'tenant';
  readonly tenantId: string;
}

/** 新增商品的输入。 */
export interface CatalogItemDraft {
  readonly name: string;
  readonly category: string;
  readonly price: number;
  readonly cost: number;
  readonly visibility: 'public' | 'tenant';
  readonly tenantId: string;
}

/** 编辑商品能改的内容：可见范围另由「公开 / 收回为内部」切换，所属租户不变，行留在原来的区。 */
export type CatalogItemChanges = Pick<CatalogItemDraft, 'name' | 'category' | 'price' | 'cost'>;

interface Result<T> {
  readonly data: T | null;
  readonly error: { message: string } | null;
}

function unwrap<T>(result: Result<T>): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error('Supabase 没有返回数据');
  return result.data;
}

function check(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}

/** RLS 拦下的修改与删除不报错、只是零行：当成失败报出来，免得界面上像什么都没发生 */
function expectAffected(result: Result<unknown[]>, action: string): void {
  if (unwrap(result).length === 0) throw new Error(`${action}失败：没有权限，或这一行已经不在了`);
}

/** 全部演示租户。 */
export async function fetchTenants(client: CatalogRemoteClient): Promise<DemoTenant[]> {
  return unwrap(await client.from('demo_tenants').select('id, name').order('id'));
}

/** 当前身份能读的区：服务端 `rxdb_caller_buckets()` 的结果，同步与 RLS 都按它裁决。 */
export async function fetchCallerBuckets(client: CatalogRemoteClient): Promise<string[]> {
  return unwrap<string[]>(await client.rpc('rxdb_caller_buckets'));
}

/** 当前身份在一个作用域上的成员权限：服务端 `rxdb_caller_grants()` 的一行（US-234）。 */
export interface CallerGrant {
  /** 作用域键：`user:<用户 id>` 或 `tenant:<租户 id>` */
  readonly scope: string;
  /** 在这个作用域上的权限，如 `['read', 'edit', 'manage']` */
  readonly permissions: readonly string[];
}

/**
 * 当前身份在各作用域上的成员权限。
 *
 * @remarks
 * 商品的写策略与远端变更历史按同一份成员权限裁决（`catalog-demo.sql`）；界面用它决定写入口给不给，
 * 能不能写以推送时服务端的裁决为准。访客得到空数组。
 */
export async function fetchCallerGrants(client: CatalogRemoteClient): Promise<CallerGrant[]> {
  return unwrap<CallerGrant[]>(await client.rpc('rxdb_caller_grants'));
}

/** 租户里的一个成员：只有这个租户的管理员列得出来（`demo_tenant_member_list`）。 */
export interface TenantMember {
  readonly userId: string;
  /** 账号的邮箱；匿名用户没有 */
  readonly email: string | null;
  readonly permissions: readonly string[];
}

/** 一个租户的全部成员与权限；调用者不是这个租户的管理员时服务端拒绝（42501）。 */
export async function fetchTenantMembers(client: CatalogRemoteClient, tenantId: string): Promise<TenantMember[]> {
  const rows = unwrap<{ user_id: string; email: string | null; permissions: string[] }[]>(
    await client.rpc('demo_tenant_member_list', { p_tenant_id: tenantId })
  );
  return rows.map(row => ({ userId: row.user_id, email: row.email, permissions: row.permissions }));
}

/**
 * 调整一个成员的权限。
 *
 * @remarks
 * 只经服务端的 `demo_set_member_permissions`：调用者要有这个租户的 manage，最后一个管理员撤不掉，
 * 权限只能取六项且必须含 read。成员表不授 UPDATE，客户端改不了自己的成员行。
 */
export async function setMemberPermissions(
  client: CatalogRemoteClient,
  tenantId: string,
  userId: string,
  permissions: readonly string[]
): Promise<void> {
  check(
    await client.rpc('demo_set_member_permissions', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_permissions: [...permissions]
    })
  );
}

/**
 * 加入租户（演示用的自助成员关系，模拟管理员把你加进去）。
 *
 * @remarks
 * 只写 `tenant_id`：成员表的 INSERT 只按这一列授权，加入之后是员工（只有 read）。
 * 演示账号加入为它登记的租户时，服务端授予管理员（Alice 管星河零售，Bob 管极光百货）。
 */
export async function joinTenant(client: CatalogRemoteClient, tenantId: string): Promise<void> {
  check(await client.from('demo_tenant_members').insert({ tenant_id: tenantId }));
}

/** 退出租户。 */
export async function leaveTenant(client: CatalogRemoteClient, tenantId: string): Promise<void> {
  check(await client.from('demo_tenant_members').delete().eq('tenant_id', tenantId));
}

/** 所在租户的商品（公开的与内部的），直接查业务表，按 RLS 只拿到能读的行。 */
export async function fetchTenantItems(
  client: CatalogRemoteClient,
  tenantIds: readonly string[]
): Promise<CatalogRemoteItem[]> {
  if (tenantIds.length === 0) return [];
  return unwrap(
    await client
      .from('catalog_items')
      .select('id, name, category, price, cost, visibility, tenantId')
      .in('tenantId', [...tenantIds])
      .order('tenantId')
      .order('category')
      .order('name')
  );
}

/** 公开或收回一件商品：行在 public 区与租户区之间移动。 */
export async function setItemVisibility(
  client: CatalogRemoteClient,
  id: string,
  visibility: CatalogRemoteItem['visibility']
): Promise<void> {
  expectAffected(await client.from('catalog_items').update({ visibility }).eq('id', id).select('id'), '修改可见范围');
}

/** 改一件商品的名称、分类、售价与成本价。 */
export async function updateItem(client: CatalogRemoteClient, id: string, changes: CatalogItemChanges): Promise<void> {
  expectAffected(await client.from('catalog_items').update(changes).eq('id', id).select('id'), '编辑');
}

/** 删除一件商品。 */
export async function deleteItem(client: CatalogRemoteClient, id: string): Promise<void> {
  expectAffected(await client.from('catalog_items').delete().eq('id', id).select('id'), '删除');
}

/** 新增一件商品。 */
export async function createItem(client: CatalogRemoteClient, draft: CatalogItemDraft): Promise<void> {
  check(await client.from('catalog_items').insert(draft));
}
