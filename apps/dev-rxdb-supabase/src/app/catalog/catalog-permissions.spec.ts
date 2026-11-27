import type { RxDBGrant } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_PERMISSIONS,
  roleLabel,
  samePermissions,
  STAFF_PERMISSIONS,
  tenantGrants,
  tenantsWith
} from './catalog-permissions';

/** Alice：星河零售的管理员，加入了极光百货当员工；另有自己的 user 区 */
const alice: RxDBGrant[] = [
  { scope: 'tenant:jiguang', permissions: ['read'] },
  { scope: 'tenant:xinghe', permissions: ['read', 'edit', 'manage'] },
  { scope: 'user:00c00da3', permissions: ['read', 'edit'] }
];

describe('成员权限的预设与名字（US-234）', () => {
  it('管理员是 read + edit + manage，员工是 read', () => {
    expect(ADMIN_PERMISSIONS).toEqual(['read', 'edit', 'manage']);
    expect(STAFF_PERMISSIONS).toEqual(['read']);
  });

  it('两个预设显示成「管理员」「员工」，不看顺序', () => {
    expect(roleLabel(['manage', 'read', 'edit'])).toBe('管理员');
    expect(roleLabel(['read'])).toBe('员工');
  });

  it('不是两个预设之一时原样列出权限', () => {
    expect(roleLabel(['read', 'edit'])).toBe('read、edit');
    expect(roleLabel(['read', 'comment', 'review'])).toBe('read、comment、review');
  });

  it('两组权限相同与否不看顺序', () => {
    expect(samePermissions(['edit', 'read'], ['read', 'edit'])).toBe(true);
    expect(samePermissions(['read'], ['read', 'edit'])).toBe(false);
    expect(samePermissions(['read', 'edit'], ['read', 'manage'])).toBe(false);
  });
});

describe('从授权快照（rxdb.grants，来自 rxdb_caller_grants()）读出租户上的权限', () => {
  it('只取租户作用域，保持服务端的顺序；user 区不算租户', () => {
    expect(tenantGrants(alice)).toEqual([
      { tenantId: 'jiguang', permissions: ['read'] },
      { tenantId: 'xinghe', permissions: ['read', 'edit', 'manage'] }
    ]);
  });

  it('有某项权限的租户：员工所在的租户没有 edit，也没有 manage', () => {
    expect(tenantsWith(alice, 'read')).toEqual(['jiguang', 'xinghe']);
    expect(tenantsWith(alice, 'edit')).toEqual(['xinghe']);
    expect(tenantsWith(alice, 'manage')).toEqual(['xinghe']);
  });

  it('访客没有任何作用域', () => {
    expect(tenantGrants([])).toEqual([]);
    expect(tenantsWith([], 'edit')).toEqual([]);
  });
});
