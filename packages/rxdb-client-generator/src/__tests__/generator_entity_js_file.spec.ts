import { PropertyType, RelationKind } from '@aiao/rxdb';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import { Project } from '../core/ts-morph-browser.js';

describe('generator_entity_js_file', () => {
  beforeAll(() => {
    process.setMaxListeners(0);
  });
  it('should generate simple entity without extends or relations', async () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity({
      name: 'SimpleEntity',
      namespace: 'public',
      properties: [
        {
          name: 'id',
          type: PropertyType.uuid,
          nullable: false,
          readonly: true
        },
        {
          name: 'title',
          type: PropertyType.string,
          nullable: false,
          readonly: false
        }
      ],
      displayName: 'SimpleEntity',
      repository: 'Repository'
    });
    generator.project = new Project();

    generator.generateEntityJsFile();

    const files = generator.getSourceFiles();
    const indexJsFile = files.find(f => f.getFilePath() === 'index.js');
    expect(indexJsFile).toBeDefined();

    const content = indexJsFile!.getText();
    expect(content).toContain("import { Entity, PropertyType, __decorateClass } from '@aiao/rxdb'");
    expect(content).toContain('let SimpleEntity = class  {};');
    expect(content).toContain('Entity(');
    expect(content).toContain('const ENTITIES = [ SimpleEntity ];');
    expect(content).toContain('export { ENTITIES, SimpleEntity };');
  });

  it('should generate entity with extends', async () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity({
      name: 'User',
      namespace: 'public',
      properties: [
        {
          name: 'email',
          type: PropertyType.string,
          nullable: false,
          readonly: false
        }
      ],
      extends: ['EntityBase'],
      displayName: 'User',
      repository: 'Repository'
    });
    generator.project = new Project();

    generator.generateEntityJsFile();

    const files = generator.getSourceFiles();
    const indexJsFile = files.find(f => f.getFilePath() === 'index.js');
    const content = indexJsFile!.getText();

    expect(content).toContain('EntityBase');
    expect(content).toContain('let User = class extends EntityBase {};');
  });

  it('should generate entity with relations', async () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity({
      name: 'Author',
      namespace: 'public',
      properties: [
        {
          name: 'name',
          type: PropertyType.string,
          nullable: false,
          readonly: false
        }
      ],
      relations: [
        {
          name: 'posts',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'Post',
          mappedNamespace: 'public',
          mappedProperty: 'author'
        }
      ],
      displayName: 'Author',
      repository: 'Repository'
    });
    generator.addEntity({
      name: 'Post',
      namespace: 'public',
      properties: [
        {
          name: 'title',
          type: PropertyType.string,
          nullable: false,
          readonly: false
        }
      ],
      relations: [
        {
          name: 'author',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Author',
          mappedNamespace: 'public',
          mappedProperty: 'posts',
          nullable: false
        }
      ],
      displayName: 'Post',
      repository: 'Repository'
    });
    generator.project = new Project();

    generator.generateEntityJsFile();

    const files = generator.getSourceFiles();
    const indexJsFile = files.find(f => f.getFilePath() === 'index.js');
    const content = indexJsFile!.getText();

    expect(content).toContain('RelationKind');
    expect(content).toContain('Author');
    expect(content).toContain('Post');
    expect(content).toContain('const ENTITIES = [ Author, Post ];');
  });

  it('should throw error for unmapped many-to-many relation', async () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity({
      name: 'Student',
      namespace: 'public',
      relations: [
        {
          name: 'courses',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'Course',
          mappedNamespace: 'public',
          mappedProperty: 'students'
        }
      ],
      displayName: 'Student',
      repository: 'Repository'
    });
    generator.project = new Project();

    expect(() => {
      generator.generateEntityJsFile();
    }).toThrow('mapped relation not found');
  });

  it('should handle many-to-many relations correctly', async () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity({
      name: 'Student',
      namespace: 'public',
      relations: [
        {
          name: 'courses',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'Course',
          mappedNamespace: 'public',
          mappedProperty: 'students'
        }
      ],
      displayName: 'Student',
      repository: 'Repository'
    });
    generator.addEntity({
      name: 'Course',
      namespace: 'public',
      relations: [
        {
          name: 'students',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'Student',
          mappedNamespace: 'public',
          mappedProperty: 'courses'
        }
      ],
      displayName: 'Course',
      repository: 'Repository'
    });
    generator.project = new Project();

    expect(() => {
      generator.generateEntityJsFile();
    }).not.toThrow();

    const files = generator.getSourceFiles();
    const indexJsFile = files.find(f => f.getFilePath() === 'index.js');
    const content = indexJsFile!.getText();

    expect(content).toContain('Student');
    expect(content).toContain('Course');
  });

  it('should sort imports and exports alphabetically', async () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity({ name: 'Zebra', namespace: 'public', displayName: 'Zebra' });
    generator.addEntity({ name: 'Apple', namespace: 'public', displayName: 'Apple' });
    generator.project = new Project();

    generator.generateEntityJsFile();

    const files = generator.getSourceFiles();
    const indexJsFile = files.find(f => f.getFilePath() === 'index.js');
    const content = indexJsFile!.getText();

    expect(content).toContain('const ENTITIES = [ Apple, Zebra ];');
    expect(content).toContain('export { ENTITIES, Apple, Zebra };');
  });

  it('should generate entity with multiple extends (Tree)', async () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity({
      name: 'Menu',
      namespace: 'public',
      properties: [
        {
          name: 'title',
          type: PropertyType.string,
          nullable: false,
          readonly: false
        }
      ],
      extends: ['TreeAdjacencyListEntityBase', 'EntityBase'],
      displayName: 'Menu',
      repository: 'TreeRepository'
    });
    generator.project = new Project();

    generator.generateEntityJsFile();

    const files = generator.getSourceFiles();
    const indexJsFile = files.find(f => f.getFilePath() === 'index.js');
    const content = indexJsFile!.getText();

    // 验证 import 包含了第一个 extends
    expect(content).toContain('TreeAdjacencyListEntityBase');
    // 验证类继承了第一个 extends
    expect(content).toContain('let Menu = class extends TreeAdjacencyListEntityBase {};');
    // 验证装饰器参数中 extends 数组包含所有继承（多行格式）
    expect(content).toContain('"TreeAdjacencyListEntityBase"');
    expect(content).toContain('"EntityBase"');
    // 验证 extends 数组不是空的
    expect(content).not.toContain('extends: []');
  });

  it('keeps decorator replacement runtime semantics', async () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity({
      name: 'User',
      namespace: 'public',
      displayName: 'User',
      extends: ['EntityBase'],
      properties: [],
      relations: []
    });
    generator.exec();

    const generated = generator.getSourceFiles().find(file => file.getFilePath() === 'index.js');
    expect(generated).toBeDefined();
    const source = generated!
      .getText()
      .replace(
        /import \{[^}]+\} from '@aiao\/rxdb';/,
        [
          'class EntityBase {}',
          'const replacement = class Replacement extends EntityBase {};',
          'const Entity = () => () => replacement;',
          'const __decorateClass = (decorators, target) =>',
          '  decorators.reduce((current, decorator) => decorator(current) ?? current, target);'
        ].join('\n')
      );
    const module = (await import(`data:text/javascript,${encodeURIComponent(source)}`)) as {
      ENTITIES: readonly { readonly name: string }[];
      User: { readonly name: string };
    };

    expect(module.User).toBe(module.ENTITIES[0]);
    expect(module.User.name).toBe('Replacement');
  });

  it('serializes template interpolation payloads as inert metadata strings', async () => {
    const payload = '${globalThis.__rxdbGeneratorInjected = true}';
    const globalState = globalThis as typeof globalThis & { __rxdbGeneratorInjected?: boolean };
    delete globalState.__rxdbGeneratorInjected;

    const generator = new RxDBClientGenerator();
    generator.addEntity({
      name: 'SecureMetadata',
      namespace: 'public',
      displayName: payload,
      properties: [],
      relations: [],
      features: {
        'x.y': payload
      }
    });
    generator.exec();

    const generated = generator.getSourceFiles().find(file => file.getFilePath() === 'index.js');
    expect(generated).toBeDefined();
    const source =
      generated!
        .getText()
        .replace(
          /import \{[^}]+\} from '@aiao\/rxdb';/,
          [
            'let capturedMetadata;',
            'const Entity = metadata => target => { capturedMetadata = metadata; return target; };',
            'const __decorateClass = (decorators, target) =>',
            '  decorators.reduce((current, decorator) => decorator(current) ?? current, target);'
          ].join('\n')
        ) + '\nexport { capturedMetadata };';

    const module = (await import(`data:text/javascript,${encodeURIComponent(source)}`)) as {
      capturedMetadata: {
        displayName: string;
        features: Record<string, unknown>;
      };
    };

    expect(globalState.__rxdbGeneratorInjected).toBeUndefined();
    expect(module.capturedMetadata.displayName).toBe(payload);
    expect(module.capturedMetadata.features['x.y']).toBe(payload);
  });
});
