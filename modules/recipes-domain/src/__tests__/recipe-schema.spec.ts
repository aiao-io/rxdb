import { getEntityMetadata, PropertyType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { RECIPE_SCHEMA } from '../recipe-schema.js';
import { Recipe, ServerRecipe } from '../recipe-entity.js';

/**
 * 元数据一致性测试（A1 / A9）。
 *
 * @remarks
 * 前端 {@link Recipe} 与后端 {@link ServerRecipe} 用同一份 {@link RECIPE_SCHEMA} 装饰，
 * 只差 `sync` 策略。这份测试把「两个装饰类 name / tableName / 字段名 / 类型 / nullable
 * 逐项相等」钉死——schema 一旦漂移，这里在 CI 变红，而不是在协议文档里被遗忘。
 */
describe('Recipe / ServerRecipe 元数据一致性', () => {
  const frontend = getEntityMetadata(Recipe);
  const backend = getEntityMetadata(ServerRecipe);

  it('name / tableName 逐项相等', () => {
    expect(frontend.name).toBe('Recipe');
    expect(backend.name).toBe(frontend.name);
    expect(frontend.tableName).toBe('recipes');
    expect(backend.tableName).toBe(frontend.tableName);
  });

  it('字段名 / 类型 / nullable 逐项相等', () => {
    const shape = (metadata: typeof frontend): Array<[string, PropertyType, boolean]> =>
      [...metadata.propertyMap.entries()].map(([name, property]) => [
        name,
        property.type as PropertyType,
        property.nullable ?? false
      ]);

    expect(shape(backend)).toEqual(shape(frontend));
  });

  it('RECIPE_SCHEMA 业务字段名与 wire 逐字一致', () => {
    const businessFields = RECIPE_SCHEMA.properties
      .filter((property: { name: string }) => property.name !== 'id')
      .map((property: { name: string }) => property.name);
    expect(businessFields).toEqual(['title', 'status', 'price', 'tag']);
    expect(RECIPE_SCHEMA.properties.find((property: { name: string }) => property.name === 'tag')?.nullable).toBe(true);
  });
});
