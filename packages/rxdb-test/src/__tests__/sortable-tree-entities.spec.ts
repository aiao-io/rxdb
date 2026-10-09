/**
 * 三端 demo 树页面用的四个可排序树实体（US-031 阶段 A）与它们复刻的旧实体同形：
 * 只多「按 `parentId` 分组的手动排序」与「`sortOrder` 非空」两处，名称与表名各自独立。
 *
 * 复刻而不继承（`specs/008-us031-sortable-tree-entities/research.md` R1），所以两边的声明会各自演化；
 * 本文件在漂移发生时变红。旧实体同时被适配器测试、远端测试表与桌面宿主共用，必须保持不可排序。
 */
import {
  getEntityMetadata,
  PropertyType,
  validateEntityMetadata,
  type EntityMetadata,
  type EntityType
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { FileLarge } from '../../entities/FileLarge.js';
import { FileNode } from '../../entities/FileNode.js';
import { ENTITIES } from '../../entities/index.js';
import { MenuLarge } from '../../entities/MenuLarge.js';
import { MenuSimple } from '../../entities/MenuSimple.js';
import { SortableFileLarge } from '../../entities/SortableFileLarge.js';
import { SortableFileNode } from '../../entities/SortableFileNode.js';
import { SortableMenuLarge } from '../../entities/SortableMenuLarge.js';
import { SortableMenuSimple } from '../../entities/SortableMenuSimple.js';

const PAIRS: ReadonlyArray<readonly [string, EntityType, EntityType]> = [
  ['SortableMenuSimple', SortableMenuSimple, MenuSimple],
  ['SortableMenuLarge', SortableMenuLarge, MenuLarge],
  ['SortableFileNode', SortableFileNode, FileNode],
  ['SortableFileLarge', SortableFileLarge, FileLarge]
];

/** `rxdb-test/src/sortable/` 的契约夹具：新实体不得与它们重名 */
const CONTRACT_FIXTURE_NAMES = ['SortableItem', 'SortableList', 'SortableListItem', 'SortableTodo', 'SortableNode'];

const metadataOf = (entity: EntityType): EntityMetadata => getEntityMetadata(entity);

/** 属性与计算属性：`sortOrder` 的可空性是唯一允许的差别，比较前抹平 */
const comparableProperties = (metadata: EntityMetadata) =>
  [...metadata.propertyMap.values()].map(property =>
    property.name === 'sortOrder' ? { ...property, nullable: undefined } : property
  );

/** 关系：自引用关系的对端名已改写成各自实体名，比较前统一成占位 */
const comparableRelations = (metadata: EntityMetadata) =>
  [...metadata.relationMap.values()].map(relation => ({
    ...relation,
    mappedEntity: relation.mappedEntity === metadata.name ? '<self>' : relation.mappedEntity
  }));

describe('US-031 可排序树实体', () => {
  it.each(PAIRS)('%s 与复刻对象同形：属性、计算属性、关系、索引、树特性逐项相等', (_name, sortable, legacy) => {
    const next = metadataOf(sortable);
    const prev = metadataOf(legacy);
    expect(comparableProperties(next)).toEqual(comparableProperties(prev));
    expect([...next.computedPropertyMap.values()]).toEqual([...prev.computedPropertyMap.values()]);
    expect(comparableRelations(next)).toEqual(comparableRelations(prev));
    expect([...next.indexMap.values()]).toEqual([...prev.indexMap.values()]);
    expect(next.features?.tree).toEqual(prev.features?.tree);
  });

  it.each(PAIRS)('%s 按 parentId 分组手动排序，sortOrder 是非空 string，元数据无违规', (_name, sortable) => {
    const metadata = metadataOf(sortable);
    const sortOrder = metadata.propertyMap.get('sortOrder');
    expect(metadata.manualOrder).toEqual({ groupBy: ['parentId'] });
    expect(sortOrder?.type).toBe(PropertyType.string);
    expect(sortOrder?.nullable).toBeFalsy();
    expect(validateEntityMetadata(metadata)).toEqual([]);
  });

  it.each(PAIRS)('%s 复刻的旧实体保持不可排序、sortOrder 可空', (_name, _sortable, legacy) => {
    const metadata = metadataOf(legacy);
    expect(metadata.manualOrder).toBeUndefined();
    expect(metadata.propertyMap.get('sortOrder')?.nullable).toBe(true);
  });

  it('实体名与表名不与契约夹具或任何已登记实体重名', () => {
    const names = ENTITIES.map(entity => metadataOf(entity).name);
    const tables = ENTITIES.map(entity => metadataOf(entity).tableName);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(tables).size).toBe(tables.length);
    for (const [name, sortable] of PAIRS) {
      expect(metadataOf(sortable).name).toBe(name);
      expect(CONTRACT_FIXTURE_NAMES).not.toContain(name);
      expect(ENTITIES).toContain(sortable);
    }
  });

  it.each([
    ['SortableFileNode', SortableFileNode, FileNode],
    ['SortableFileLarge', SortableFileLarge, FileLarge]
  ])('%s 的计算属性与旧实体逐字相同', (_name, Sortable, Legacy) => {
    // 走 `Object.create` 而不是 `new`：实体构造函数要求 RxDB 已初始化，getter 只读字段（同 `published-entity-behavior.spec.ts`）
    const cases = [
      { name: 'report', type: 'file', extension: '.pdf', size: 2048 },
      { name: 'docs', type: 'folder', extension: null, size: null },
      { name: 'README', type: 'file', extension: null, size: 5 * 1024 * 1024 }
    ] as const;
    for (const fields of cases) {
      const next = Object.assign(Object.create(Sortable.prototype) as FileNode, fields);
      const prev = Object.assign(Object.create(Legacy.prototype) as FileNode, fields);
      expect([next.fullName, next.isFolder, next.sizeFormatted]).toEqual([
        prev.fullName,
        prev.isFolder,
        prev.sizeFormatted
      ]);
    }
  });
});
