export const domainZhMessages = {
  'nav.entities': '实体',
  'nav.data': '数据',
  'nav.search': '搜索',
  'nav.backup': '备份 / 恢复',
  'search.recordFailed': '数据记录搜索失败'
};

export const domainEnMessages: Record<keyof typeof domainZhMessages, string> = {
  'nav.entities': 'Entities',
  'nav.data': 'Data',
  'nav.search': 'Search',
  'nav.backup': 'Backup / Restore',
  'search.recordFailed': 'Record search failed'
};

export const domainModelZhMessages = {
  'entity.assets.AssetCategory.displayName': '资产分类',
  'entity.assets.AssetCategory.property.name': '分类名',
  'entity.assets.AssetCategory.property.description': '说明',
  'entity.assets.AssetCategory.relation.assets': '资产',
  'entity.assets.Asset.displayName': '资产',
  'entity.assets.Asset.property.name': '名称',
  'entity.assets.Asset.property.status': '状态',
  'entity.assets.Asset.property.purchasePrice': '购入价',
  'entity.assets.Asset.property.purchaseDate': '购入日期',
  'entity.assets.Asset.relation.category': '分类',
  'entity.assets.Asset.relation.events': '维护记录',
  'entity.assets.AssetEvent.displayName': '维护记录',
  'entity.assets.AssetEvent.property.summary': '事项',
  'entity.assets.AssetEvent.property.cost': '费用',
  'entity.assets.AssetEvent.property.happenedAt': '日期',
  'entity.assets.AssetEvent.relation.asset': '所属资产'
};

export const domainModelEnMessages: Record<keyof typeof domainModelZhMessages, string> = {
  'entity.assets.AssetCategory.displayName': 'Asset categories',
  'entity.assets.AssetCategory.property.name': 'Category name',
  'entity.assets.AssetCategory.property.description': 'Description',
  'entity.assets.AssetCategory.relation.assets': 'Assets',
  'entity.assets.Asset.displayName': 'Assets',
  'entity.assets.Asset.property.name': 'Name',
  'entity.assets.Asset.property.status': 'Status',
  'entity.assets.Asset.property.purchasePrice': 'Purchase price',
  'entity.assets.Asset.property.purchaseDate': 'Purchase date',
  'entity.assets.Asset.relation.category': 'Category',
  'entity.assets.Asset.relation.events': 'Maintenance records',
  'entity.assets.AssetEvent.displayName': 'Maintenance records',
  'entity.assets.AssetEvent.property.summary': 'Summary',
  'entity.assets.AssetEvent.property.cost': 'Cost',
  'entity.assets.AssetEvent.property.happenedAt': 'Date',
  'entity.assets.AssetEvent.relation.asset': 'Asset'
};
