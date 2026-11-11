import type { ModelSnapshot, SnapshotEntity, SnapshotProperty, SnapshotRelation } from './types';

/** 测试与示例用：带默认值的属性。 */
export function sampleProperty(id: string, name: string, overrides: Partial<SnapshotProperty> = {}): SnapshotProperty {
  return {
    id,
    name,
    propertyType: 'string',
    displayName: null,
    isRequired: false,
    isNullable: false,
    isUnique: false,
    defaultValue: null,
    enumValues: null,
    ...overrides
  };
}

/** 测试与示例用：带默认值的关系。 */
export function sampleRelation(id: string, name: string, overrides: Partial<SnapshotRelation> = {}): SnapshotRelation {
  return {
    id,
    name,
    relationKind: 'ONE_TO_MANY',
    mappedEntityId: '',
    mappedPropertyId: null,
    onDeleteAction: null,
    ...overrides
  };
}

/** 测试与示例用：带默认值的实体。 */
export function sampleEntity(id: string, name: string, overrides: Partial<SnapshotEntity> = {}): SnapshotEntity {
  return { id, name, displayName: null, entityNamespace: null, properties: [], relations: [], indexes: [], ...overrides };
}

/** Customer 1:N Order 两端成对，Order.total 上有索引，Order.status 是枚举。 */
export function sampleShop(): ModelSnapshot {
  return {
    entities: [
      sampleEntity('e-customer', 'Customer', {
        displayName: '客户',
        entityNamespace: 'crm',
        properties: [sampleProperty('p-name', 'name', { isRequired: true, displayName: '姓名' })],
        relations: [
          sampleRelation('r-orders', 'orders', { mappedEntityId: 'e-order', mappedPropertyId: 'r-customer' })
        ]
      }),
      sampleEntity('e-order', 'Order', {
        displayName: '订单',
        properties: [
          sampleProperty('p-total', 'total', { propertyType: 'number', isUnique: true }),
          sampleProperty('p-status', 'status', {
            propertyType: 'enum',
            enumValues: ['open', 'paid'],
            defaultValue: 'open'
          })
        ],
        relations: [
          sampleRelation('r-customer', 'customer', {
            relationKind: 'MANY_TO_ONE',
            mappedEntityId: 'e-customer',
            mappedPropertyId: 'r-orders',
            onDeleteAction: 'CASCADE'
          })
        ],
        indexes: [{ id: 'i-total', propertyIds: ['p-total'], isUnique: false }]
      })
    ]
  };
}
