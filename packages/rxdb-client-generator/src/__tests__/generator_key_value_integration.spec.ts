import { PropertyType, RelationKind } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import { compileGeneratedConsumer } from './helpers/generated-consumer.js';

describe('RxDBClientGenerator - KeyValue Type Generation', () => {
  it('should generate JS file with keyValue metadata', () => {
    const generator = new RxDBClientGenerator({
      relationQueryDeep: 1
    });

    generator.addEntity({
      name: 'Config',
      namespace: 'public',
      properties: [
        {
          name: 'id',
          type: PropertyType.uuid,
          nullable: false,
          readonly: true
        },
        {
          name: 'options',
          type: PropertyType.keyValue,
          nullable: false,
          readonly: false,
          properties: [
            {
              name: 'timeout',
              type: PropertyType.number,
              nullable: false
            },
            {
              name: 'retryCount',
              type: PropertyType.integer,
              nullable: false
            }
          ]
        }
      ]
    });

    generator.exec();
    const files = generator.getSourceFiles();
    const indexJsFile = files.find(f => f.getFilePath() === 'index.js');
    const content = indexJsFile?.getText();

    expect(content).toBeDefined();

    // 应包含 keyValue 属性类型
    expect(content).toContain('PropertyType.keyValue');

    // 应包含嵌套 properties 定义
    expect(content).toContain('properties:');
    expect(content).toContain('timeout');
    expect(content).toContain('retryCount');
  });

  it('escapes entity, property, and nested keyValue JSDoc', async () => {
    const unsafeDisplayName = 'safe*/\nexport declare const injected: true;';
    const generator = new RxDBClientGenerator();
    generator.addEntity({
      name: 'SecureConfig',
      namespace: 'public',
      displayName: unsafeDisplayName,
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [
        {
          name: 'label',
          displayName: unsafeDisplayName,
          type: PropertyType.string
        },
        {
          name: 'options',
          displayName: unsafeDisplayName,
          type: PropertyType.keyValue,
          properties: [
            {
              name: 'timeout',
              displayName: unsafeDisplayName,
              type: PropertyType.number
            }
          ]
        }
      ],
      computedProperties: [],
      relations: [],
      indexes: []
    });

    generator.exec();

    const declaration = generator.getSourceFiles().find(file => file.getFilePath() === 'index.d.ts');
    const text = declaration?.getText() ?? '';
    expect(text).toContain(' * safe*\\/');
    expect(text).toContain(' * export declare const injected: true;');
    expect(text).not.toContain('\nexport declare const injected: true;');
    await expect(
      compileGeneratedConsumer(
        generator.getSourceFiles(),
        "import { SecureConfig } from './generated/index.js';\ndeclare const config: SecureConfig;\nconfig.options.timeout;"
      )
    ).resolves.toEqual([]);
  });

  // 关系递归到对端实体时，keyValue 的 valueType 是对端的精确接口（PostMetaKeyValue）。
  // split 模式下每个实体各占一个文件，该接口若不随 sibling 一起导入就是 TS2304；
  // 单文件模式因所有接口同处一处而侥幸正确，所以只有 split 会炸。
  it('imports sibling keyValue interfaces referenced by relation rules in split mode', async () => {
    const generator = new RxDBClientGenerator({ splitFiles: true, relationQueryDeep: 2 });
    generator.addEntity({
      name: 'User',
      namespace: 'public',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [{ name: 'id', type: PropertyType.uuid }],
      relations: [
        {
          name: 'posts',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'Post',
          mappedNamespace: 'public',
          mappedProperty: 'author'
        }
      ],
      indexes: []
    });
    generator.addEntity({
      name: 'Post',
      namespace: 'public',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [
        { name: 'id', type: PropertyType.uuid },
        { name: 'meta', type: PropertyType.keyValue, properties: [{ name: 'views', type: PropertyType.number }] }
      ],
      relations: [
        {
          name: 'author',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'User',
          mappedNamespace: 'public',
          mappedProperty: 'posts'
        }
      ],
      indexes: []
    });

    generator.exec();

    const userDts = generator
      .getSourceFiles()
      .find(file => file.getFilePath() === 'User.d.ts')!
      .getText();
    expect(userDts).toContain("RelationKeyValueRules<'posts.meta', Partial<PostMetaKeyValue>>");
    expect(userDts).toMatch(/import \{[^}]*\bPostMetaKeyValue\b[^}]*\} from '\.\/Post\.js';/);
    await expect(
      compileGeneratedConsumer(generator.getSourceFiles(), "import './generated/index.js';")
    ).resolves.toEqual([]);
  });
});
