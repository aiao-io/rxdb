import { PropertyType, transitionMetadata as createEntityMetadata } from '@aiao/rxdb';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import { generateEntityRules } from '../generators/entity-rules.js';

describe('generator_entity_rules - KeyValue Support', () => {
  beforeAll(() => {
    process.setMaxListeners(0);
  });
  it('should generate KeyValueRules for keyValue property', () => {
    const metadata = createEntityMetadata({
      name: 'Product',
      namespace: 'public',
      properties: [
        {
          name: 'id',
          type: PropertyType.uuid,
          nullable: false
        },
        {
          name: 'metadata',
          type: PropertyType.keyValue,
          nullable: false,
          properties: [
            {
              name: 'price',
              type: PropertyType.number,
              nullable: false
            },
            {
              name: 'description',
              type: PropertyType.string,
              nullable: false
            },
            {
              name: 'inStock',
              type: PropertyType.boolean,
              nullable: false
            },
            {
              name: 'releaseDate',
              type: PropertyType.date,
              nullable: false
            }
          ]
        }
      ],
      extends: ['EntityBase']
    });

    const generator = new RxDBClientGenerator();
    const rules = generateEntityRules(generator, metadata);

    // id 应有 UUIDRules。
    const idRule = rules.find(r => r.key === 'id' && r.rule === 'UUIDRules');
    expect(idRule).toBeDefined();
    expect(idRule?.entity).toBe('Product');

    // metadata 应有 KeyValueRules。
    const metadataRule = rules.find(r => r.key === 'metadata' && r.rule === 'KeyValueRules');
    expect(metadataRule).toBeDefined();
    expect(metadataRule?.entity).toBe('Product');

    // metadata.price 应有 NumberRules。
    const priceRule = rules.find(r => r.key === 'metadata.price' && r.rule === 'NumberRules');
    expect(priceRule).toBeDefined();
    expect(priceRule?.entity).toBe('Product');
    expect(priceRule?.valueType).toBe('number');

    // metadata.description 应有 StringRules。
    const descRule = rules.find(r => r.key === 'metadata.description' && r.rule === 'StringRules');
    expect(descRule).toBeDefined();
    expect(descRule?.entity).toBe('Product');
    expect(descRule?.valueType).toBe('string');

    // metadata.inStock 应有 BooleanRules。
    const stockRule = rules.find(r => r.key === 'metadata.inStock' && r.rule === 'BooleanRules');
    expect(stockRule).toBeDefined();
    expect(stockRule?.entity).toBe('Product');
    expect(stockRule?.valueType).toBe('boolean');

    // metadata.releaseDate 应有 DateRules。
    const dateRule = rules.find(r => r.key === 'metadata.releaseDate' && r.rule === 'DateRules');
    expect(dateRule).toBeDefined();
    expect(dateRule?.entity).toBe('Product');
    expect(dateRule?.valueType).toBe('Date');
  });

  it('should generate correct types for keyValue with all supported basic types', () => {
    const metadata = createEntityMetadata({
      name: 'User',
      namespace: 'public',
      properties: [
        {
          name: 'settings',
          type: PropertyType.keyValue,
          nullable: false,
          properties: [
            {
              name: 'theme',
              type: PropertyType.string,
              nullable: false
            },
            {
              name: 'fontSize',
              type: PropertyType.integer,
              nullable: false
            },
            {
              name: 'darkMode',
              type: PropertyType.boolean,
              nullable: false
            },
            {
              name: 'lastLogin',
              type: PropertyType.date,
              nullable: false
            }
          ]
        }
      ],
      extends: ['EntityBase']
    });

    const generator = new RxDBClientGenerator();
    const rules = generateEntityRules(generator, metadata);

    // 验证所有嵌套属性类型都已生成。
    expect(rules.find(r => r.key === 'settings.theme')).toMatchObject({
      rule: 'StringRules',
      entity: 'User',
      valueType: 'string'
    });

    expect(rules.find(r => r.key === 'settings.fontSize')).toMatchObject({
      rule: 'NumberRules',
      entity: 'User',
      valueType: 'number'
    });

    expect(rules.find(r => r.key === 'settings.darkMode')).toMatchObject({
      rule: 'BooleanRules',
      entity: 'User',
      valueType: 'boolean'
    });

    expect(rules.find(r => r.key === 'settings.lastLogin')).toMatchObject({
      rule: 'DateRules',
      entity: 'User',
      valueType: 'Date'
    });
  });

  it('should handle nullable keyValue nested properties', () => {
    const metadata = createEntityMetadata({
      name: 'Config',
      namespace: 'public',
      properties: [
        {
          name: 'options',
          type: PropertyType.keyValue,
          nullable: true,
          properties: [
            {
              name: 'timeout',
              type: PropertyType.number,
              nullable: true
            }
          ]
        }
      ],
      extends: ['EntityBase']
    });

    const generator = new RxDBClientGenerator();
    const rules = generateEntityRules(generator, metadata);

    const optionsRule = rules.find(r => r.key === 'options');
    expect(optionsRule?.rule).toBe('KeyValueRules');

    const timeoutRule = rules.find(r => r.key === 'options.timeout');
    expect(timeoutRule).toBeDefined();
    expect(timeoutRule?.rule).toBe('NumberRules');
    expect(timeoutRule?.valueType).toBe('number | null');
  });

  it('should generate rules for multiple keyValue properties', () => {
    const metadata = createEntityMetadata({
      name: 'Article',
      namespace: 'public',
      properties: [
        {
          name: 'metadata',
          type: PropertyType.keyValue,
          nullable: false,
          properties: [
            {
              name: 'views',
              type: PropertyType.number,
              nullable: false
            }
          ]
        },
        {
          name: 'settings',
          type: PropertyType.keyValue,
          nullable: false,
          properties: [
            {
              name: 'published',
              type: PropertyType.boolean,
              nullable: false
            }
          ]
        }
      ],
      extends: ['EntityBase']
    });

    const generator = new RxDBClientGenerator();
    const rules = generateEntityRules(generator, metadata);

    // 两个 keyValue 属性都应有规则。
    expect(rules.find(r => r.key === 'metadata')).toBeDefined();
    expect(rules.find(r => r.key === 'settings')).toBeDefined();

    // 嵌套属性应有规则。
    expect(rules.find(r => r.key === 'metadata.views')).toMatchObject({
      rule: 'NumberRules',
      entity: 'Article',
      valueType: 'number'
    });

    expect(rules.find(r => r.key === 'settings.published')).toMatchObject({
      rule: 'BooleanRules',
      entity: 'Article',
      valueType: 'boolean'
    });
  });

  it('should handle empty keyValue properties array', () => {
    const metadata = createEntityMetadata({
      name: 'EmptyTest',
      namespace: 'public',
      properties: [
        {
          name: 'data',
          type: PropertyType.keyValue,
          nullable: false,
          properties: []
        }
      ],
      extends: ['EntityBase']
    });

    const generator = new RxDBClientGenerator();
    const rules = generateEntityRules(generator, metadata);

    // 属性本身只能有 KeyValueRules。
    const dataRule = rules.find(r => r.key === 'data');
    expect(dataRule).toBeDefined();
    expect(dataRule?.rule).toBe('KeyValueRules');

    // 不应有任何嵌套规则。
    const nestedRules = rules.filter(r => r.key.startsWith('data.'));
    expect(nestedRules).toHaveLength(0);
  });
});

describe('generator_entity_rules - TreeRepository validation', () => {
  it('rejects a TreeRepository without children query rules', () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity({
      name: 'OrphanTree',
      namespace: 'public',
      displayName: 'Orphan tree',
      repository: 'TreeRepository',
      extends: [],
      properties: [{ name: 'id', type: PropertyType.uuid, primary: true }],
      computedProperties: [],
      relations: [],
      indexes: []
    });

    expect(() => generator.exec()).toThrow(/TreeRepository.*children/i);
  });
});
