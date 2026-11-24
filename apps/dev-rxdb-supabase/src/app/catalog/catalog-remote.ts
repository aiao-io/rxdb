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

/** 当前登录身份所在的租户（RLS 只放行自己的成员行）。 */
export async function fetchMyTenantIds(client: CatalogRemoteClient): Promise<string[]> {
  const rows = unwrap<{ tenant_id: string }[]>(await client.from('demo_tenant_members').select('tenant_id'));
  return rows.map(row => row.tenant_id).sort();
}

/** 加入租户（演示用的自助成员关系，模拟管理员把你加进去）。 */
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
      .select('id, name, category, price, visibility, tenantId')
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

/** 删除一件商品。 */
export async function deleteItem(client: CatalogRemoteClient, id: string): Promise<void> {
  expectAffected(await client.from('catalog_items').delete().eq('id', id).select('id'), '删除');
}

/** 新增一件商品。 */
export async function createItem(client: CatalogRemoteClient, draft: CatalogItemDraft): Promise<void> {
  check(await client.from('catalog_items').insert(draft));
}
