import { describe, expect, it } from 'vitest';
import { sampleEntity, sampleProperty, sampleRelation, sampleShop } from './fixtures';
import { validateModel } from './validate';

describe('validateModel', () => {
  it('合法模型没有问题', () => {
    expect(validateModel(sampleShop())).toEqual([]);
  });

  it('逐条报告命名、重名、空实体、枚举、关系配对与索引问题', () => {
    const issues = validateModel({
      entities: [
        sampleEntity('e-1', 'order', {
          properties: [sampleProperty('p-1', 'id'), sampleProperty('p-2', 'kind', { propertyType: 'enum' })],
          relations: [sampleRelation('r-1', 'kind', { mappedEntityId: 'e-2', mappedPropertyId: 'r-2' })],
          indexes: [
            { id: 'i-1', propertyIds: [], isUnique: false },
            { id: 'i-2', propertyIds: ['p-ghost'], isUnique: false }
          ]
        }),
        sampleEntity('e-2', 'Empty', {
          relations: [
            sampleRelation('r-2', 'orders', { mappedEntityId: 'e-1', mappedPropertyId: 'r-1' }),
            sampleRelation('r-3', 'ghost', { mappedEntityId: 'e-ghost' })
          ]
        }),
        sampleEntity('e-3', 'Empty', { properties: [sampleProperty('p-3', 'title')] })
      ]
    });
    expect(issues).toEqual([
      expect.stringMatching(/order.*PascalCase/),
      expect.stringMatching(/id.*保留字段/),
      expect.stringMatching(/order\.kind.*枚举选项/),
      expect.stringMatching(/order\.kind.*已存在/),
      expect.stringMatching(/order\.kind.*ONE_TO_MANY.*Empty\.orders.*MANY_TO_ONE/),
      expect.stringMatching(/order.*索引.*至少/),
      expect.stringMatching(/order.*索引.*p-ghost/),
      expect.stringMatching(/Empty.*没有任何属性/),
      expect.stringMatching(/Empty\.orders.*ONE_TO_MANY.*order\.kind.*MANY_TO_ONE/),
      expect.stringMatching(/Empty\.ghost.*目标实体 e-ghost/),
      expect.stringMatching(/实体名 Empty 重复/)
    ]);
  });

  it('报告缺少逆关系或逆关系没有指回的关系', () => {
    const issues = validateModel({
      entities: [
        sampleEntity('e-a', 'Alpha', {
          properties: [sampleProperty('p-a', 'code')],
          relations: [
            sampleRelation('r-a', 'betas', { mappedEntityId: 'e-b' }),
            sampleRelation('r-x', 'other', { mappedEntityId: 'e-b', mappedPropertyId: 'r-b' })
          ]
        }),
        sampleEntity('e-b', 'Beta', {
          properties: [sampleProperty('p-b', 'code')],
          relations: [sampleRelation('r-b', 'alpha', { relationKind: 'MANY_TO_ONE', mappedEntityId: 'e-a' })]
        })
      ]
    });
    expect(issues).toEqual([
      expect.stringMatching(/Alpha\.betas.*缺少逆关系/),
      expect.stringMatching(/Alpha\.other.*没有指回/),
      expect.stringMatching(/Beta\.alpha.*缺少逆关系/)
    ]);
  });
});
