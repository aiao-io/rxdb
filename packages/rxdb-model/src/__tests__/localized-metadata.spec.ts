import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind } from '@aiao/rxdb';
import { I18n } from '@aiao/rxdb-i18n';
import { describe, expect, it, vi } from 'vitest';
import { buildFormFields } from '../entity-form/form-fields.js';
import { buildEditableColumns } from '../entity-table/columns/build-editable-columns.js';
import { localizeEntityFormFields, localizeEntityMetadata } from '../localized-metadata.js';

@Entity({
  name: 'LocalizedAsset',
  namespace: 'localization-test',
  displayName: '资产',
  properties: [{ name: 'name', type: PropertyType.string, displayName: '名称', default: '在用' }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'LocalizedAsset',
      mappedProperty: 'children',
      displayName: '上级'
    },
    { name: 'children', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'LocalizedAsset', mappedProperty: 'parent' }
  ]
})
class LocalizedAsset extends EntityBase {
  name!: string;
}

const messages = {
  'entity.localization-test.LocalizedAsset.displayName': 'Assets',
  'entity.localization-test.LocalizedAsset.property.name': 'Name',
  'entity.localization-test.LocalizedAsset.relation.parent': 'Parent'
};

describe('显示元数据本地化', () => {
  it('表单与表格构建器直接消费显示目录', () => {
    const runtime = new I18n({ locale: 'en', catalogs: [{ locale: 'en', namespace: 'rxdb-model', messages }] });
    const metadata = getEntityMetadata(LocalizedAsset);
    expect(buildFormFields(metadata, 'create', runtime).map(field => field.displayName)).toEqual(['Name', 'Parent']);
    expect(buildEditableColumns(metadata, { i18n: runtime }).find(column => column.field === 'name')?.title).toBe(
      'Name'
    );
    runtime.destroy();
  });
  it('翻译实体、属性与关系的显示名，保留原 schema、默认值与映射的一致性', () => {
    const runtime = new I18n({ locale: 'en', catalogs: [{ locale: 'en', namespace: 'rxdb-model', messages }] });
    const metadata = getEntityMetadata(LocalizedAsset);
    const originalFields = buildFormFields(metadata, 'create');
    const translated = localizeEntityMetadata(metadata, runtime);
    expect(translated.displayName).toBe('Assets');
    expect(translated.propertyMap.get('name')?.displayName).toBe('Name');
    expect(translated.propertyMap.get('name')?.default).toBe('在用');
    expect(translated.properties.find(property => property.name === 'name')).toBe(translated.propertyMap.get('name'));
    expect(translated.relations.find(relation => relation.name === 'parent')).toBe(
      translated.relationMap.get('parent')
    );
    expect(translated.foreignKeyRelationMap.get('parentId')?.displayName).toBe('Parent');
    expect(buildFormFields(translated, 'create').map(field => field.displayName)).toEqual(['Name', 'Parent']);
    expect(metadata.displayName).toBe('资产');
    expect(metadata.propertyMap.get('name')?.displayName).toBe('名称');
    expect(buildFormFields(metadata, 'create')).toEqual(originalFields);
    expect(translated.tableName).toBe(metadata.tableName);
    expect(translated.indexes).toBe(metadata.indexes);
    runtime.destroy();
  });

  it('缺失目录保留声明显示名，不调用 t 或制造缺失诊断', () => {
    const metadata = getEntityMetadata(LocalizedAsset);
    const runtime = new I18n({ locale: 'en' });
    const translate = vi.spyOn(runtime, 't');
    expect(localizeEntityMetadata(metadata, runtime)).toBe(metadata);
    expect(translate).not.toHaveBeenCalled();
    expect(localizeEntityMetadata(metadata, { t: key => key })).toBe(metadata);
    runtime.destroy();
  });

  it('空字符串是有效标签，部分目录只替换命中的字段', () => {
    const runtime = new I18n({
      locale: 'en',
      catalogs: [
        {
          locale: 'en',
          namespace: 'rxdb-model',
          messages: { 'entity.localization-test.LocalizedAsset.property.name': '' }
        }
      ]
    });
    const translated = localizeEntityMetadata(getEntityMetadata(LocalizedAsset), runtime);
    expect(translated.displayName).toBe('资产');
    expect(translated.propertyMap.get('name')?.displayName).toBe('');
    expect(translated.relationMap.get('parent')?.displayName).toBe('上级');
    runtime.destroy();
  });

  it('已打开表单字段随语言切换更新标签，保留配置与草稿值', async () => {
    const metadata = getEntityMetadata(LocalizedAsset);
    const fields = buildFormFields(metadata, 'create').map(field => ({ ...field, readonly: true }));
    const runtime = new I18n({
      locale: 'en',
      defaultLocale: 'zh-Hans',
      catalogs: [
        { locale: 'en', namespace: 'rxdb-model', messages },
        {
          locale: 'zh-Hans',
          namespace: 'rxdb-model',
          messages: { 'entity.localization-test.LocalizedAsset.property.name': '名称' }
        }
      ]
    });
    const english = localizeEntityFormFields(metadata, fields, runtime);
    expect(english.map(field => field.displayName)).toEqual(['Name', 'Parent']);
    expect(english.every(field => field.readonly)).toBe(true);
    expect(fields.map(field => field.displayName)).toEqual(['名称', '上级']);
    await runtime.setLocale('zh-Hans');
    const chinese = localizeEntityFormFields(metadata, english, runtime);
    expect(chinese[0]?.displayName).toBe('名称');
    runtime.destroy();
  });
});
