import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * CatalogItem — 按授权分区同步的商品目录（US-033 / US-036 夹具，表 `public.catalog_items`）。
 *
 * 公开商品在 `public` 区，租户内部商品在 `tenant:<tenantId>` 区；区由业务表的生成列 `rxdb_bucket` 算，
 * 谁能读哪些区由 RLS 按 `rxdb_caller_buckets()` 裁决。`cost`（成本价）对 anon 没有列权限，
 * anon 同步下来的行里它为空。
 *
 * 不在装饰器里声明 `sync`：同步规则（`remote.filter`）随使用方而变，由 `syncOverrides` 给出。
 * 本地可以增删改（US-034）：写入留下可撤销的变更，推送经 `rxdb_mutations`，服务端按写后的行算区、
 * 按 RLS 裁决能不能写。
 *
 * 按作用域的成员写权限（US-029 / US-234 阶段 B）：一行属于 `tenant:<tenantId>`，增删改都要该租户的 `edit`，
 * 与 `catalog-demo.sql` 的三条商品写策略同口径。公开写入口按授权快照（Supabase 适配器读 `rxdb_caller_grants()`）
 * 逐行判定：访客、员工在本机写当场 `PermissionDeniedError`，不留待推修改。这只是快速失败，安全边界仍是 RLS。
 */
@Entity({
  name: 'CatalogItem',
  tableName: 'catalog_items',
  displayName: '商品',
  access: { scope: { property: 'tenantId', prefix: 'tenant:' } },
  permissions: {
    create: { requires: 'edit' },
    update: { requires: 'edit' },
    delete: { requires: 'edit' }
  },
  properties: [
    { name: 'name', type: PropertyType.string, displayName: '名称' },
    { name: 'category', type: PropertyType.string, displayName: '分类' },
    { name: 'price', type: PropertyType.number, displayName: '售价', default: 0 },
    { name: 'cost', type: PropertyType.number, displayName: '成本价', nullable: true },
    {
      name: 'visibility',
      type: PropertyType.enum,
      enum: ['public', 'tenant'],
      displayName: '可见范围',
      default: 'public'
    },
    { name: 'tenantId', type: PropertyType.string, displayName: '所属租户' }
  ]
})
export class CatalogItem extends EntityBase {
  declare name: string;
  declare category: string;
  declare price: number;
  declare cost: number | null;
  declare visibility: 'public' | 'tenant';
  declare tenantId: string;
}
