import { getEntityMetadata, PropertyType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { Recipe } from '../recipe-entity.js';
import { RECIPE_SCHEMA } from '../recipe-schema.js';

/**
 * 元数据一致性测试（A1 / A9）。
 *
 * @remarks
 * 前后端共用同一个 {@link Recipe} 类（US-026 AC#13 收敛后不再有第二个实体类），
 * 后端只经 `RxDB` 实例的 `syncOverrides` 换同步策略。这份测试把「装饰出的 name / tableName /
 * 业务字段与 {@link RECIPE_SCHEMA} 逐项相等」钉死——schema 一旦漂移，这里在 CI 变红，
 * 而不是在协议文档里被遗忘。
 */
describe('Recipe 元数据一致性', () => {
  const metadata = getEntityMetadata(Recipe);

  it('name / tableName 取自 RECIPE_SCHEMA', () => {
    expect(metadata.name).toBe('Recipe');
    expect(metadata.tableName).toBe('recipes');
  });

  it('业务字段的类型 / nullable 与 RECIPE_SCHEMA 逐项相等', () => {
    const declared = RECIPE_SCHEMA.properties.map((property): [string, PropertyType, boolean] => [
      property.name,
      property.type,
      'nullable' in property && property.nullable === true
    ]);
    const decorated = declared.map(([name]): [string, PropertyType, boolean] => {
      const property = metadata.propertyMap.get(name);
      if (property === undefined) throw new Error(`Recipe 缺少字段 ${name}`);
      return [name, property.type as PropertyType, property.nullable === true];
    });

    expect(decorated).toEqual(declared);
  });

  it('RECIPE_SCHEMA 业务字段名与 wire 逐字一致', () => {
    const businessFields = RECIPE_SCHEMA.properties
      .filter((property: { name: string }) => property.name !== 'id')
      .map((property: { name: string }) => property.name);
    expect(businessFields).toEqual(['title', 'status', 'price', 'tag']);
    expect(RECIPE_SCHEMA.properties.find((property: { name: string }) => property.name === 'tag')?.nullable).toBe(true);
  });
});
