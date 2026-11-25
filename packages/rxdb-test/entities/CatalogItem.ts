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
 * 按 RLS 裁决能不能写。实体权限是静态的、分不出身份，访客的写入口由应用禁用，即使在本地写了也推不上去。
 */
@Entity({
  name: 'CatalogItem',
  tableName: 'catalog_items',
  displayName: '商品',
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
