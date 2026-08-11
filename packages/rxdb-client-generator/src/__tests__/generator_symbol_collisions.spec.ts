import { PropertyType, RelationKind, type EntityMetadataOptions } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import type { GeneratorContext } from '../generators/RepositoryGenerator.interface.js';
import { RepositoryGeneratorBase } from '../generators/RepositoryGeneratorBase.js';
import { compileGeneratedConsumer } from './helpers/generated-consumer.js';

const createEntity = (name: string, overrides: Partial<EntityMetadataOptions> = {}): EntityMetadataOptions => ({
  name: name as Capitalize<string>,
  namespace: 'public',
  repository: 'Repository',
  extends: ['EntityBase'],
  properties: [],
  computedProperties: [],
  relations: [],
  indexes: [],
  ...overrides
});

const expectCollision = (
  generator: RxDBClientGenerator,
  expected: { entity: string; symbol: string; sources: readonly string[] }
): void => {
  let error: unknown;
  try {
    generator.exec();
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(Error);
  const message = error instanceof Error ? error.message : '';
  expect(message).toContain('Generated symbol collision');
  expect(message).toContain(expected.entity);
  expect(message).toContain(expected.symbol);
  expected.sources.forEach(source => expect(message).toContain(source));
  expect(generator.project).toBeUndefined();
};

const addOwnerRelation = (generator: RxDBClientGenerator, propertyName: 'owner$' | 'ownerId'): void => {
  generator.addEntity(
    createEntity('Owner', {
      relations: [
        {
          name: 'tasks',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'Task',
          mappedNamespace: 'public',
          mappedProperty: 'owner'
        }
      ]
    })
  );
  generator.addEntity(
    createEntity('Task', {
      properties: [{ name: propertyName, type: PropertyType.string }],
      relations: [
        {
          name: 'owner',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Owner',
          mappedNamespace: 'public',
          mappedProperty: 'tasks'
        }
      ]
    })
  );
};

class ConflictingRepositoryGenerator extends RepositoryGeneratorBase {
  readonly name = 'ConflictingRepository';

  protected generateMethods(context: GeneratorContext): void {
    this.addInstanceMethod(context, {
      name: 'save',
      returnType: 'void',
      docs: ['冲突方法']
    });
  }
}

class OverloadedRepositoryGenerator extends RepositoryGeneratorBase {
  readonly name = 'OverloadedRepository';

  protected generateMethods(context: GeneratorContext): void {
    context.classMethods.push(
      {
        name: 'lookup',
        isStatic: true,
        parameters: [{ name: 'value', type: 'string' }],
        returnType: 'string'
      },
      {
        name: 'lookup',
        isStatic: true,
        parameters: [{ name: 'value', type: 'number' }],
        returnType: 'number'
      }
    );
  }
}

describe('generated symbol collisions', () => {
  it('rejects an entity property that collides with the fixed save member', () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity(
      createEntity('Task', {
        properties: [{ name: 'save', type: PropertyType.string }]
      })
    );

    expectCollision(generator, {
      entity: 'Task',
      symbol: 'save',
      sources: ['entity property "Task.save"', 'Repository generator "Repository"']
    });
  });

  it.each(['ownerId', 'owner$'] as const)('rejects property %s colliding with relation owner output', propertyName => {
    const generator = new RxDBClientGenerator();
    addOwnerRelation(generator, propertyName);

    expectCollision(generator, {
      entity: 'Task',
      symbol: propertyName,
      sources: [`entity property "Task.${propertyName}"`, 'relation "Task.owner"']
    });
  });

  it('rejects keyValue properties whose generated interface names collide', () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity(
      createEntity('Config', {
        properties: [
          {
            name: 'meta',
            type: PropertyType.keyValue,
            properties: [{ name: 'left', type: PropertyType.string }]
          },
          {
            name: 'Meta' as Uncapitalize<string>,
            type: PropertyType.keyValue,
            properties: [{ name: 'right', type: PropertyType.number }]
          }
        ]
      })
    );

    expectCollision(generator, {
      entity: 'Config',
      symbol: 'ConfigMetaKeyValue',
      sources: ['keyValue property "Config.meta"', 'keyValue property "Config.Meta"']
    });
  });

  it('rejects case-insensitive split output file collisions', () => {
    const generator = new RxDBClientGenerator({ splitFiles: true });
    generator.addEntity(createEntity('User'));
    generator.addEntity(createEntity('user'));

    expectCollision(generator, {
      entity: 'user',
      symbol: 'user.js',
      sources: ['entity "User" split JavaScript file', 'entity "user" split JavaScript file']
    });
  });

  it('rejects exported type collisions across split files', () => {
    const generator = new RxDBClientGenerator({ splitFiles: true });
    generator.addEntity(createEntity('Task'));
    generator.addEntity(createEntity('TaskInitData'));

    expectCollision(generator, {
      entity: 'TaskInitData',
      symbol: 'TaskInitData',
      sources: ['entity "Task" initialization interface', 'entity declaration "TaskInitData"']
    });
  });

  it('rejects a public entity and namespace that emit the same RxDB member', () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity(createEntity('Tenant'));
    generator.addEntity(createEntity('User', { namespace: 'Tenant' as Lowercase<string> }));

    expectCollision(generator, {
      entity: 'User',
      symbol: 'Tenant',
      sources: ['entity "Tenant" RxDB interface member', 'namespace "Tenant" RxDB interface member']
    });
  });

  it.each([
    ['EntityType', 'fixed RxDB import "EntityType"'],
    ['IEntity', 'fixed RxDB import "IEntity"'],
    ['ITreeEntity', 'fixed RxDB import "ITreeEntity"'],
    ['RuleGroupBase', 'fixed RxDB import "RuleGroupBase"'],
    ['UUID', 'fixed RxDB import "UUID"'],
    ['Observable', 'fixed RxJS import "Observable"']
  ] as const)('rejects entity %s colliding with a fixed declaration import', (name, importSource) => {
    const generator = new RxDBClientGenerator();
    generator.addEntity(createEntity(name));

    expectCollision(generator, {
      entity: name,
      symbol: name,
      sources: [importSource, `entity declaration "${name}"`]
    });
  });

  it('includes repository plugin members in collision validation', () => {
    const generator = new RxDBClientGenerator();
    generator.registerRepositoryGenerator(new ConflictingRepositoryGenerator());
    generator.addEntity(createEntity('Task', { repository: 'ConflictingRepository' }));

    expectCollision(generator, {
      entity: 'Task',
      symbol: 'save',
      sources: ['Repository generator "Repository"', 'Repository generator "ConflictingRepository"']
    });
  });

  it('allows legal method overloads emitted by a repository plugin', async () => {
    const generator = new RxDBClientGenerator();
    generator.registerRepositoryGenerator(new OverloadedRepositoryGenerator());
    generator.addEntity(createEntity('Task', { repository: 'OverloadedRepository' }));

    expect(() => generator.exec()).not.toThrow();
    const declaration = generator.getSourceFiles().find(file => file.getFilePath() === 'index.d.ts');
    expect(declaration?.getText().match(/static lookup/g)).toHaveLength(2);
    await expect(
      compileGeneratedConsumer(
        generator.getSourceFiles(),
        [
          "import { Task } from './generated/index.js';",
          "const byText: string = Task.lookup('task');",
          'const byNumber: number = Task.lookup(1);'
        ].join('\n')
      )
    ).resolves.toEqual([]);
  });
});
