/**
 * @fileoverview 树的排序类型来源与依赖方向（US-028 阶段 C：AC#8 / AC#9）
 *
 * 排序键类型只在核心排序模块声明一处（`SortOrderKey`），`ISortableTreeEntity` 由它组合出
 * 可空的 `sortOrder`；方向是 tree → sortable，核心排序模块不得反向 import 树插件。
 *
 * `SortOrderKey` 是 `string` 的别名，结构上与手写 `string` 无从区分——「唯一来源」只能
 * 在源码上守，所以这里读源文件断言声明方式；类型形状另由 `expectTypeOf` 守。
 */
import {
  PropertyType,
  getEntityMetadata,
  isManualOrderEntity,
  type ISortableEntity,
  type SortOrderKey
} from '@aiao/rxdb';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { TreeAdjacencyListEntityBase } from '../../entity/tree-entity-base.js';
import { TreeEntity } from '../../entity/tree-entity.decorator.js';
import type { ISortableTreeEntity, ITreeEntity } from '../../entity/tree-entity.interface.js';

const PACKAGES_ROOT = join(import.meta.dirname, '../../../..');
const TREE_INTERFACE = join(PACKAGES_ROOT, 'rxdb-plugin-tree/src/entity/tree-entity.interface.ts');
const CORE_SORTABLE_DIR = join(PACKAGES_ROOT, 'rxdb/src/sortable');

@TreeEntity({
  name: 'SortableTreeNode',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'sortOrder', type: PropertyType.string, nullable: true }
  ]
})
class SortableTreeNode extends TreeAdjacencyListEntityBase implements ISortableTreeEntity {
  declare title?: string;
  declare sortOrder?: SortOrderKey | null;
}

describe('US-028 阶段 C 树的排序类型来源', () => {
  it('ISortableTreeEntity 的 sortOrder 由核心 SortOrderKey 组合，保持可空可缺省', () => {
    expectTypeOf<ISortableTreeEntity['sortOrder']>().toEqualTypeOf<SortOrderKey | null | undefined>();
    expectTypeOf<ISortableTreeEntity>().toExtend<ITreeEntity>();
    // 组合的是键类型而不是非空的 ISortableEntity：直接继承会把树的 sortOrder 收窄成非空
    expectTypeOf<ISortableTreeEntity>().not.toExtend<ISortableEntity>();

    const source = readFileSync(TREE_INTERFACE, 'utf8');
    expect(source).toMatch(/import\s+(type\s+)?\{[^}]*\bSortOrderKey\b[^}]*\}\s+from\s+'@aiao\/rxdb'/);
    expect(source).toMatch(/sortOrder\?:\s*SortOrderKey\s*\|\s*null;/);
  });

  it('核心排序模块不 import 树插件（依赖方向 tree → sortable）', () => {
    const files = readdirSync(CORE_SORTABLE_DIR).filter(file => file.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(join(CORE_SORTABLE_DIR, file), 'utf8'), file).not.toMatch(/rxdb-plugin-tree|plugin-tree/);
    }
  });

  it('树实体不因实现 ISortableTreeEntity 而获得手动排序声明', () => {
    const metadata = getEntityMetadata(SortableTreeNode);
    expect(isManualOrderEntity(metadata)).toBe(false);
    expect(metadata.manualOrder).toBeUndefined();
  });
});
