import {
    PropertyType,
    RelationKind,
    transitionMetadata as createEntityMetadata,
    type EntityMetadata
} from '@aiao/rxdb';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import { Project } from '../core/ts-morph-browser.js';
import { compileGeneratedConsumer } from './helpers/generated-consumer.js';

describe('generator_split_files', () => {
  beforeAll(() => {
    process.setMaxListeners(0);
  });

  const makeMetadata = (name: EntityMetadata['name'], overrides: Partial<EntityMetadata> = {}): EntityMetadata => ({
    ...createEntityMetadata({ name, namespace: 'public' }),
    ...overrides
  });

  describe('generateEntityJsFile with splitFiles: true', () => {
    it('should generate one js file per entity', () => {
      const generator = new RxDBClientGenerator({ splitFiles: true });
      generator.metadataSet.add(makeMetadata('User'));
      generator.metadataSet.add(makeMetadata('Post'));
      generator.project = new Project();

      generator.generateEntityJsFile();

      const files = generator.getSourceFiles();
      expect(files.find(f => f.getFilePath() === 'User.js')).toBeDefined();
      expect(files.find(f => f.getFilePath() === 'Post.js')).toBeDefined();
    });

    it('each entity file should have its own import and export', () => {
      const generator = new RxDBClientGenerator({ splitFiles: true });
      generator.metadataSet.add(makeMetadata('User'));
      generator.project = new Project();

      generator.generateEntityJsFile();

      const userFile = generator.getSourceFiles().find(f => f.getFilePath() === 'User.js');
      const content = userFile!.getText();

      expect(content).toContain("import { Entity, __decorateClass } from '@aiao/rxdb'");
      expect(content).toContain('let User = class  {};');
      expect(content).toContain('export { User };');
    });

    it('each entity file should include extends import', () => {
      const generator = new RxDBClientGenerator({ splitFiles: true });
      generator.metadataSet.add(makeMetadata('User', { extends: ['EntityBase'] }));
      generator.project = new Project();

      generator.generateEntityJsFile();

      const userFile = generator.getSourceFiles().find(f => f.getFilePath() === 'User.js');
      const content = userFile!.getText();

      expect(content).toContain('EntityBase');
      expect(content).toContain('let User = class extends EntityBase {};');
      expect(content).toContain('export { User };');
    });

    it('each entity file should include PropertyType when has properties', () => {
      const generator = new RxDBClientGenerator({ splitFiles: true });
      generator.metadataSet.add(
        makeMetadata('User', {
          properties: [
            { name: 'name', columnName: 'name', type: PropertyType.string, nullable: false, readonly: false }
          ]
        })
      );
      generator.project = new Project();

      generator.generateEntityJsFile();

      const userFile = generator.getSourceFiles().find(f => f.getFilePath() === 'User.js');
      expect(userFile!.getText()).toContain('PropertyType');
    });

    it('each entity file should include RelationKind when has relations', () => {
      const generator = new RxDBClientGenerator({ splitFiles: true });
      const authorMeta = createEntityMetadata({
        name: 'Author',
        namespace: 'public',
        relations: [
          {
            name: 'posts',
            kind: RelationKind.ONE_TO_MANY,
            mappedEntity: 'Post',
            mappedNamespace: 'public',
            mappedProperty: 'author'
          }
        ]
      });
      generator.metadataSet.add(authorMeta);
      generator.setMetadata(authorMeta);
      generator.project = new Project();

      generator.generateEntityJsFile();

      const authorFile = generator.getSourceFiles().find(f => f.getFilePath() === 'Author.js');
      expect(authorFile!.getText()).toContain('RelationKind');
    });

    it('index.js should import from entity files and re-export all', () => {
      const generator = new RxDBClientGenerator({ splitFiles: true });
      generator.metadataSet.add(makeMetadata('Alpha'));
      generator.metadataSet.add(makeMetadata('Zebra'));
      generator.project = new Project();

      generator.generateEntityJsFile();

      const indexFile = generator.getSourceFiles().find(f => f.getFilePath() === 'index.js');
      const content = indexFile!.getText();

      expect(content).toContain("import { Alpha } from './Alpha.js'");
      expect(content).toContain("import { Zebra } from './Zebra.js'");
      expect(content).toContain('const ENTITIES = [ Alpha, Zebra ];');
      expect(content).toContain('export { ENTITIES, Alpha, Zebra };');
    });

    it('index.js entities should be sorted alphabetically', () => {
      const generator = new RxDBClientGenerator({ splitFiles: true });
      generator.metadataSet.add(makeMetadata('Zebra'));
      generator.metadataSet.add(makeMetadata('Alpha'));
      generator.project = new Project();

      generator.generateEntityJsFile();

      const indexFile = generator.getSourceFiles().find(f => f.getFilePath() === 'index.js');
      const content = indexFile!.getText();

      const alphaPos = content.indexOf('Alpha');
      const zebraPos = content.indexOf('Zebra');
      expect(alphaPos).toBeLessThan(zebraPos);
    });

    it('should not put all entities in index.js when splitFiles: true', () => {
      const generator = new RxDBClientGenerator({ splitFiles: true });
      generator.metadataSet.add(makeMetadata('User'));
      generator.project = new Project();

      generator.generateEntityJsFile();

      const indexFile = generator.getSourceFiles().find(f => f.getFilePath() === 'index.js');
      const content = indexFile!.getText();

      expect(content).not.toContain('__decorateClass');
      expect(content).not.toContain('let User');
    });

    it('should throw for unmapped many-to-many relation in split mode', () => {
      const generator = new RxDBClientGenerator({ splitFiles: true });
      generator.metadataSet.add(
        createEntityMetadata({
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
          ]
        })
      );
      generator.project = new Project();

      expect(() => generator.generateEntityJsFile()).toThrow('mapped relation not found');
    });
  });

  describe('generateAllEntityDefinition split mode (via exec)', () => {
    it('should generate one d.ts file per entity', () => {
      const generator = new RxDBClientGenerator({ splitFiles: true });
      generator.addEntity({
        name: 'Widget',
        namespace: 'public',
        displayName: 'Widget',
        properties: [],
        relations: [],
        indexes: [],
        extends: [],
        repository: 'Repository'
      });

      generator.exec();

      const files = generator.getSourceFiles();
      expect(files.find(f => f.getFilePath() === 'Widget.d.ts')).toBeDefined();
    });

    it('index.d.ts should re-export from entity files', () => {
      const generator = new RxDBClientGenerator({ splitFiles: true });
      generator.addEntity({
        name: 'Widget',
        namespace: 'public',
        displayName: 'Widget',
        properties: [],
        relations: [],
        indexes: [],
        extends: [],
        repository: 'Repository'
      });

      generator.exec();

      const indexDtsFile = generator.getSourceFiles().find(f => f.getFilePath() === 'index.d.ts');
      const content = indexDtsFile!.getText();

      expect(content).toContain('./Widget.js');
      expect(content).toContain('ENTITIES');
    });

    it('index.d.ts should include module augmentation for all entities', () => {
      const generator = new RxDBClientGenerator({ splitFiles: true });
      generator.addEntity({
        name: 'Widget',
        namespace: 'public',
        displayName: 'Widget',
        properties: [],
        relations: [],
        indexes: [],
        extends: [],
        repository: 'Repository'
      });

      generator.exec();

      const indexDtsFile = generator.getSourceFiles().find(f => f.getFilePath() === 'index.d.ts');
      const content = indexDtsFile!.getText();

      expect(content).toContain('"@aiao/rxdb"');
      expect(content).toContain('interface RxDB');
      expect(content).toContain('Widget');
    });

    it('entity d.ts file should declare the entity class', () => {
      const generator = new RxDBClientGenerator({ splitFiles: true });
      generator.addEntity({
        name: 'Widget',
        namespace: 'public',
        displayName: 'Widget',
        properties: [],
        relations: [],
        indexes: [],
        extends: [],
        repository: 'Repository'
      });

      generator.exec();

      const widgetDtsFile = generator.getSourceFiles().find(f => f.getFilePath() === 'Widget.d.ts');
      const content = widgetDtsFile!.getText();

      expect(content).toContain('declare class Widget');
      expect(content).toContain("from '@aiao/rxdb'");
    });

    // `extends: []` 是 README 与两个 CLI fixture 里的入门写法。空基类名一旦进入 import 名单，
    // 排序后排在最前，渲染成 `import { , CountOptions, ... }` —— 整个 .d.ts 无法解析。
    it('entity without extends must still produce parseable .d.ts', async () => {
      const generator = new RxDBClientGenerator({ splitFiles: true });
      generator.addEntity({
        name: 'Widget',
        namespace: 'public',
        displayName: 'Widget',
        properties: [],
        relations: [],
        indexes: [],
        extends: [],
        repository: 'Repository'
      });

      generator.exec();

      generator.getSourceFiles().forEach(file => {
        expect(file.getText()).not.toMatch(/import \{\s*,/);
      });
      await expect(
        compileGeneratedConsumer(generator.getSourceFiles(), "import './generated/index.js';")
      ).resolves.toEqual([]);
    });
  });

  describe('splitFiles: false (default) backward compatibility', () => {
    it('should default to single index.js file', () => {
      const generator = new RxDBClientGenerator();
      generator.metadataSet.add(makeMetadata('User'));
      generator.project = new Project();

      generator.generateEntityJsFile();

      const files = generator.getSourceFiles();
      expect(files.find(f => f.getFilePath() === 'index.js')).toBeDefined();
      expect(files.find(f => f.getFilePath() === 'User.js')).toBeUndefined();
    });

    it('explicit splitFiles: false behaves same as default', () => {
      const generator = new RxDBClientGenerator({ splitFiles: false });
      generator.metadataSet.add(makeMetadata('User'));
      generator.project = new Project();

      generator.generateEntityJsFile();

      const files = generator.getSourceFiles();
      expect(files.find(f => f.getFilePath() === 'index.js')).toBeDefined();
      expect(files.find(f => f.getFilePath() === 'User.js')).toBeUndefined();
    });
  });
});

describe('generator_split_files — generated consumer declarations', () => {
  const addNamespacedEntities = (generator: RxDBClientGenerator): void => {
    generator.addEntity({
      name: 'User',
      namespace: 'auth',
      displayName: 'User',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [],
      computedProperties: [],
      relations: [],
      indexes: []
    });
    generator.addEntity({
      name: 'Role',
      namespace: 'auth',
      displayName: 'Role',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [],
      computedProperties: [],
      relations: [],
      indexes: []
    });
  };

  const expectNamespacedConsumerToCompile = async (generator: RxDBClientGenerator): Promise<void> => {
    const declaration = generator.getSourceFiles().find(file => file.getFilePath() === 'index.d.ts')!;
    expect(declaration.getText().match(/\bauth:/g)).toHaveLength(1);
    await expect(
      compileGeneratedConsumer(
        generator.getSourceFiles(),
        [
          "import './generated/index.js';",
          "import type { RxDB } from '@aiao/rxdb';",
          'declare const db: RxDB;',
          'db.auth.User;',
          'db.auth.Role;'
        ].join('\n')
      )
    ).resolves.toEqual([]);
  };

  it('single-file mode aggregates entities in the same namespace once', async () => {
    const generator = new RxDBClientGenerator();
    addNamespacedEntities(generator);

    generator.exec();

    await expectNamespacedConsumerToCompile(generator);
  });

  it('split-file mode aggregates entities in the same namespace once', async () => {
    const generator = new RxDBClientGenerator({ splitFiles: true });
    addNamespacedEntities(generator);

    generator.exec();

    await expectNamespacedConsumerToCompile(generator);
  });

  it('split-file mode imports sibling entity and RuleGroup types', async () => {
    const generator = new RxDBClientGenerator({ splitFiles: true });
    generator.addEntity({
      name: 'Author',
      namespace: 'public',
      displayName: 'Author',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [],
      computedProperties: [],
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
      displayName: 'Post',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [],
      computedProperties: [],
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
      indexes: []
    });

    generator.exec();

    const authorDeclaration = generator.getSourceFiles().find(file => file.getFilePath() === 'Author.d.ts')!;
    expect(authorDeclaration.getText()).toContain("import type { Post, PostRuleGroup } from './Post.js';");
    await expect(
      compileGeneratedConsumer(
        generator.getSourceFiles(),
        "import { Author } from './generated/index.js';\ndeclare const author: Author;\nauthor.posts$;"
      )
    ).resolves.toEqual([]);
  });

  it('split-file barrel re-exports the class and StaticTypes without local import shadowing', async () => {
    const generator = new RxDBClientGenerator({ splitFiles: true });
    generator.addEntity({
      name: 'Widget',
      namespace: 'public',
      displayName: 'Widget',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [],
      computedProperties: [],
      relations: [],
      indexes: []
    });

    generator.exec();

    const indexDeclaration = generator.getSourceFiles().find(file => file.getFilePath() === 'index.d.ts')!;
    const content = indexDeclaration.getText();
    expect(content).not.toMatch(/import \{ Widget \} from '\.\/Widget\.js'/);
    expect(content).toContain("typeof import('./Widget.js').Widget");
    expect(content).toContain("export * from './Widget.js'");

    await expect(
      compileGeneratedConsumer(
        generator.getSourceFiles(),
        [
          "import { Widget, type WidgetStaticTypes } from './generated/index.js';",
          "const options: WidgetStaticTypes['findOptions'] = {};",
          'void Widget;',
          'void options;'
        ].join('\n')
      )
    ).resolves.toEqual([]);
  });

  it('rebuilds the in-memory source manifest on every exec', () => {
    const generator = new RxDBClientGenerator({ splitFiles: true });
    generator.addEntity({ name: 'User', namespace: 'public', properties: [], relations: [] });
    generator.addEntity({ name: 'Role', namespace: 'public', properties: [], relations: [] });
    generator.exec();
    expect(generator.getSourceFiles().map(file => file.getFilePath())).toContain('Role.d.ts');

    generator.metadataSet.clear();
    generator.metadataMap.clear();
    generator.addEntity({ name: 'User', namespace: 'public', properties: [], relations: [] });
    generator.exec();

    const paths = generator.getSourceFiles().map(file => file.getFilePath());
    expect(paths).not.toContain('Role.d.ts');
    expect(paths).not.toContain('Role.js');
  });
});
