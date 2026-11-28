/** 实体在界面上的叫法与它所在的页面 */
interface EntityLabel {
  /** 实体的叫法 */
  readonly name: string;
  /** 它所在的页面 */
  readonly page: string;
}

const ENTITY_LABELS: Readonly<Record<string, EntityLabel>> = {
  Todo: { name: 'Todo', page: 'Todo' },
  CatalogItem: { name: '商品', page: '商品目录' },
  PublicCatalogItem: { name: '公开商品（在线浏览）', page: '商品目录' },
  DemoCustomer: { name: '客户', page: '订单' },
  DemoIdCard: { name: '证件', page: '订单' },
  DemoOrder: { name: '订单', page: '订单' },
  DemoOrderItem: { name: '订单项', page: '订单' },
  DemoCategory: { name: '分类', page: '订单' },
  DemoCategory_DemoOrderItem: { name: '订单项的分类', page: '订单' }
};

/**
 * 实体在界面上的叫法与所在页面
 *
 * @param entity - 实体名
 * @returns 演示里登记过的实体给出中文叫法；没登记的（系统实体等）原样用实体名，页面记为「其他」
 */
export function entityLabelOf(entity: string): EntityLabel {
  return ENTITY_LABELS[entity] ?? { name: entity, page: '其他' };
}
