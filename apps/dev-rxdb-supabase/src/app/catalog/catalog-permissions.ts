import type { CallerGrant } from './catalog-remote';

/** 管理员：能改本租户的商品，也能调整成员的权限（epic-015 六项权限里的 read + edit + manage） */
export const ADMIN_PERMISSIONS: readonly string[] = ['read', 'edit', 'manage'];

/** 员工：能同步、浏览本租户的全部商品，不能改，也看不到远端变更历史 */
export const STAFF_PERMISSIONS: readonly string[] = ['read'];

const TENANT_SCOPE = 'tenant:';

/** 当前身份在一个租户上的权限。 */
export interface TenantGrant {
  readonly tenantId: string;
  readonly permissions: readonly string[];
}

/**
 * `rxdb_caller_grants()` 里的租户作用域。
 *
 * @remarks
 * 演示的覆盖给每个成员关系一行 `tenant:<租户 id>`，所以这也是当前身份所在的租户；顺序沿用服务端的（按作用域键排序）。
 * 自己的 `user:<id>` 区不是租户，不在这里。
 */
export function tenantGrants(grants: readonly CallerGrant[]): TenantGrant[] {
  return grants
    .filter(grant => grant.scope.startsWith(TENANT_SCOPE))
    .map(grant => ({ tenantId: grant.scope.slice(TENANT_SCOPE.length), permissions: grant.permissions }));
}

/** 当前身份带有某项权限的租户。 */
export function tenantsWith(grants: readonly CallerGrant[], permission: string): string[] {
  return tenantGrants(grants)
    .filter(grant => grant.permissions.includes(permission))
    .map(grant => grant.tenantId);
}

/** 两组权限是否相同，不看顺序。 */
export function samePermissions(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && b.every(permission => a.includes(permission));
}

/** 角色在界面上的名字：两个预设显示「管理员」「员工」，别的组合原样列出权限。 */
export function roleLabel(permissions: readonly string[]): string {
  if (samePermissions(permissions, ADMIN_PERMISSIONS)) return '管理员';
  if (samePermissions(permissions, STAFF_PERMISSIONS)) return '员工';
  return permissions.join('、');
}
