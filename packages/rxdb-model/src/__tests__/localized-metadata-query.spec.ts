import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind } from '@aiao/rxdb';
import { I18n } from '@aiao/rxdb-i18n';
import { describe, expect, it } from 'vitest';
import { localizeEntityMetadata } from '../localized-metadata.js';
import { extractFieldsFromMetadata, type ModelInfo } from '../query-builder/utils/metadata-field-extractor.js';

@Entity({
  name: 'LocalizedQueryAsset',
  namespace: 'i18n-query',
  properties: [{ name: 'name', type: PropertyType.string, displayName: '名称' }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'LocalizedQueryAsset',
      mappedProperty: 'children',
      displayName: '上级'
    },
    {
      name: 'children',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'LocalizedQueryAsset',
      mappedProperty: 'parent',
      displayName: '下级'
    }
  ]
})
class LocalizedQueryAsset extends EntityBase {
  name!: string;
}

describe('本地化元数据的查询合同', () => {
  it('保留不可枚举的外键索引与方法，筛选字段可直接解析', () => {
    const runtime = new I18n({
      locale: 'en',
      catalogs: [
        {
          locale: 'en',
          namespace: 'rxdb-model',
          messages: {
            'entity.i18n-query.LocalizedQueryAsset.property.name': 'Name',
            'entity.i18n-query.LocalizedQueryAsset.relation.parent': 'Parent'
          }
        }
      ]
    });
    try {
      const metadata = getEntityMetadata(LocalizedQueryAsset);
      const localized = localizeEntityMetadata(metadata, runtime);
      const models = new Map<string, ModelInfo>([
        [
          metadata.name,
          {
            name: metadata.name,
            displayName: localized.displayName,
            entityClass: LocalizedQueryAsset,
            metadata: localized
          }
        ]
      ]);
      const fields = extractFieldsFromMetadata(localized, models);
      expect(fields).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'name', displayName: 'Name' })]));
      expect(fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'parentId', displayName: 'ParentID' })])
      );
      expect(fields.find(field => field.name === 'parent')?.relationFields).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'parentId', displayName: 'ParentID' })])
      );
      expect(localized.foreignKeyNames).toEqual(['parentId']);
      expect(localized.foreignKeyColumnNames).toEqual(metadata.foreignKeyColumnNames);
      expect(localized.isForeignKey('parentId')).toBe(true);
      expect(localized.columnNameToPropertyName).toBe(metadata.columnNameToPropertyName);
      expect(localized.checkMap).toBe(metadata.checkMap);
      expect(metadata.propertyMap.get('name')?.displayName).toBe('名称');
    } finally {
      runtime.destroy();
    }
  });
});
