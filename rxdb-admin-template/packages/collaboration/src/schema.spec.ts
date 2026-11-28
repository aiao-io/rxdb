import { describe, expect, it } from 'vitest';
import type { ChangeSet, Records, SchemaManifest } from './model.js';
import { planningSchema } from './planning.testing.js';
import {
  assertChangesFit,
  assertRecordsFit,
  namespaceOf,
  parseSchemaManifest,
  recordKeys,
  schemaModel,
  systemFieldOf
} from './schema.js';
import { assetSchema } from './schema.testing.js';

/** 改写清单的副本：用来构造各种不合法的清单。 */
const edited = (change: (manifest: Record<string, unknown> & { entities: Record<string, unknown>[] }) => void) => {
  const copy = structuredClone(planningSchema) as unknown as Record<string, unknown> & {
    entities: Record<string, unknown>[];
  };
  change(copy);
  return copy;
};
const fieldsOf = (manifest: SchemaManifest, entity: string) =>
  schemaModel(manifest)
    .entity(entity)!
    .fields.map(field => field.name);

describe('数据模式清单', () => {
  it('记录字段只取普通属性与单值关联的外键，按清单顺序；系统字段、计算属性与一对多关联不进记录', () => {
    const model = schemaModel(assetSchema);
    expect(model.entities.map(entity => entity.entity)).toEqual(['AssetCategory', 'Asset', 'AssetEvent']);
    expect(fieldsOf(assetSchema, 'AssetCategory')).toEqual(['name', 'description']);
    expect(fieldsOf(assetSchema, 'Asset')).toEqual(['name', 'status', 'purchasePrice', 'purchaseDate', 'categoryId']);
    expect(fieldsOf(assetSchema, 'AssetEvent')).toEqual(['summary', 'cost', 'happenedAt', 'assetId']);
    expect(model.entity('Asset')!.field('categoryId')!.target).toBe('AssetCategory');
    expect(model.entity('Asset')!.field('category')).toBeUndefined();
    expect(model.entity('Asset')!.field('id')).toBeUndefined();
    expect(model.entities.map(entity => entity.title)).toEqual(['name', 'name', 'summary']);
    expect(fieldsOf(planningSchema, 'Milestone')).toEqual(['name', 'weight', 'dueOn', 'done', 'projectId', 'tagId']);
  });

  it('解析出的清单是全新对象，只含已知键，再解析一次不变', () => {
    const raw = structuredClone(assetSchema) as unknown as Record<string, unknown>;
    (raw['entities'] as Record<string, unknown>[])[0]['unknown'] = 'dropped';
    const parsed = parseSchemaManifest(raw);
    expect(parsed).toEqual(assetSchema);
    expect(parseSchemaManifest(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it.each([
    ['顶层多余的键', edited(value => (value['extra'] = 1))],
    ['版本号为 0', edited(value => (value['schemaVersion'] = 0))],
    ['版本号不是整数', edited(value => (value['schemaVersion'] = 1.5))],
    ['没有实体', edited(value => (value['entities'] = []))],
    ['字段描述格式错误', edited(value => (value.entities[0]['dtoVersion'] = 2))],
    ['实体名重复', edited(value => value.entities.push(structuredClone(value.entities[0])))],
    ['实体名不是安全标识', edited(value => (value.entities[2]['entity'] = '__proto__'))],
    ['关联指向清单外的实体', edited(value => value.entities.splice(2, 1))]
  ])('拒绝不合法的清单：%s', (_name, manifest) => {
    expect(() => parseSchemaManifest(manifest)).toThrow(expect.objectContaining({ code: 'invalid' }));
  });

  it('拒绝协作记录无法承载的字段类型（数组、键值、JSON 等）', () => {
    const manifest = edited(value => {
      const fields = value.entities[0]['fields'] as Record<string, unknown>[];
      const code = fields.find(field => field['field'] === 'code')!;
      Object.assign(code, { valueType: 'stringArray', cardinality: 'multiple' });
    });
    expect(() => parseSchemaManifest(manifest)).toThrow('数据模式清单包含协作不支持的字段类型');
  });

  it('命名空间按实体取自清单，未知实体被拒绝', () => {
    expect(namespaceOf(assetSchema)('Asset')).toBe('assets');
    expect(namespaceOf(planningSchema)('Tag')).toBe('planning');
    expect(() => namespaceOf(assetSchema)('Tag')).toThrow('实体不受支持');
  });

  it('网络输入的记录与变更只能用清单里的实体、命名空间与记录字段', () => {
    const records: Records = { p: { entity: 'Project', fields: { title: 'A', code: null } } };
    expect(() => assertRecordsFit(planningSchema, records)).not.toThrow();
    expect(() => assertRecordsFit(planningSchema, { p: { entity: 'Asset', fields: {} } })).toThrow('实体不受支持');
    expect(() => assertRecordsFit(planningSchema, { p: { entity: 'Project', fields: { id: 'x' } } })).toThrow(
      '字段不受支持'
    );
    const change: ChangeSet = {
      namespace: 'planning',
      entity: 'Milestone',
      entityId: 'm',
      operation: 'update',
      patch: { projectId: 'p' },
      inversePatch: { projectId: 'q' }
    };
    expect(() => assertChangesFit(planningSchema, [change])).not.toThrow();
    for (const wrong of [
      { ...change, namespace: 'assets' },
      { ...change, entity: 'Unknown' },
      { ...change, patch: { project: 'p' } },
      { ...change, inversePatch: { id: 'm' } }
    ])
      expect(() => assertChangesFit(planningSchema, [wrong]), JSON.stringify(wrong)).toThrow();
  });

  it('系统字段（主键除外）随 working-tree 的落库形态出现在单元与记录里：按清单接受，但不是记录字段，不参与检查与键索引', () => {
    const asset = schemaModel(assetSchema).entity('Asset')!;
    expect(asset.system).toEqual(['createdAt', 'updatedAt', 'createdBy', 'updatedBy']);
    expect(['name', 'categoryId', 'createdAt', 'updatedBy'].map(name => asset.accepts(name))).toEqual([
      true,
      true,
      true,
      true
    ]);
    expect(['id', 'category', 'events', 'unknown'].map(name => asset.accepts(name))).toEqual([
      false,
      false,
      false,
      false
    ]);
    expect(asset.field('createdAt')).toBeUndefined();
    const system = systemFieldOf(assetSchema);
    expect([system('Asset', 'updatedAt'), system('Asset', 'name'), system('Tag', 'updatedAt')]).toEqual([
      true,
      false,
      false
    ]);
    // sqlite-wasm 上 working-tree 捕获的插入单元：整行字段，含审计时间（ISO 文本）与审计主体
    const captured: ChangeSet = {
      namespace: 'assets',
      entity: 'Asset',
      entityId: 'a1',
      operation: 'insert',
      patch: {
        name: '工作站',
        status: '在用',
        purchasePrice: 120,
        purchaseDate: '2026-11-16T00:00:00.000Z',
        createdAt: '2026-11-18T03:04:05.678Z',
        updatedAt: '2026-11-18T03:04:05.678Z',
        createdBy: 'user-1',
        updatedBy: 'user-1',
        categoryId: 'c1'
      },
      inversePatch: null
    };
    expect(() => assertChangesFit(assetSchema, [captured])).not.toThrow();
    expect(() => assertRecordsFit(assetSchema, { a1: { entity: 'Asset', fields: captured.patch! } })).not.toThrow();
    expect(() => assertChangesFit(assetSchema, [{ ...captured, patch: { ...captured.patch, id: 'a1' } }])).toThrow(
      '字段不受支持'
    );
    expect(recordKeys(assetSchema, { entity: 'Asset', fields: captured.patch! })).toEqual([
      { kind: 'unique', entity: 'Asset', field: 'name', value: '"工作站"' },
      { kind: 'reference', entity: 'Asset', field: 'categoryId', value: 'c1' }
    ]);
  });

  it('键索引收唯一字段的非缺失取值与单值关联指向的标识', () => {
    expect(
      recordKeys(planningSchema, {
        entity: 'Milestone',
        fields: { name: '  ', projectId: 'p1', tagId: null }
      })
    ).toEqual([{ kind: 'reference', entity: 'Milestone', field: 'projectId', value: 'p1' }]);
    expect(recordKeys(planningSchema, { entity: 'Project', fields: { title: 'Alpha', code: ' ', budget: 1 } })).toEqual(
      [{ kind: 'unique', entity: 'Project', field: 'title', value: '"Alpha"' }]
    );
  });
});
