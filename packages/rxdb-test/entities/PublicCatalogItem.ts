import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * PublicCatalogItem — 规则之外的公开商品在线浏览（US-036 夹具，视图 `public.catalog_items_public`）。
 *
 * 映射服务端的公开视图：只含公开行，不含成本价。用 `syncOverrides` 声明为 `SyncType.QueryCache`，
 * 以调用者身份直读远端，anon 不需要登录；与按规则同步的 {@link CatalogItem} 是两个实体、两张本地表，
 * 同步的清理删不到浏览缓存。（装饰器里不写 `sync`：实体代码生成只能静态求值属性与关系的枚举。）
 *
 * 只读：三项写权限都只许系统写，创建、修改、删除在本地入口被拒，不发远端请求。
 * 按有界条件查（例如按分类）：QueryCache 每次同步都取该 `where` 命中的全部 `{ id, updatedAt }`。
 */
@Entity({
  name: 'PublicCatalogItem',
  tableName: 'catalog_items_public',
  displayName: '公开商品',
  permissions: { create: 'system', update: 'system', delete: 'system' },
  properties: [
    { name: 'name', type: PropertyType.string, displayName: '名称' },
    { name: 'category', type: PropertyType.string, displayName: '分类' },
    { name: 'price', type: PropertyType.number, displayName: '售价', default: 0 },
    { name: 'tenantId', type: PropertyType.string, displayName: '所属租户' }
  ]
})
export class PublicCatalogItem extends EntityBase {
  declare name: string;
  declare category: string;
  declare price: number;
  declare tenantId: string;
}
