import {
  PropertyType,
  RelationKind,
  transitionMetadata as createEntityMetadata,
  type EntityMetadataOptions
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import { compileGeneratedConsumer } from './helpers/generated-consumer.js';

const createEntityOptions = (overrides: Partial<EntityMetadataOptions> = {}): EntityMetadataOptions => ({
  name: 'User',
  namespace: 'public',
  displayName: 'User',
  repository: 'Repository',
  extends: ['EntityBase'],
  properties: [],
  computedProperties: [],
  relations: [],
  indexes: [],
  ...overrides
});

describe('generator security boundaries', () => {
  it.each<[string, () => EntityMetadataOptions]>([
    ['entity name', () => createEntityOptions({ name: '../Escaped' })],
    ['namespace', () => createEntityOptions({ namespace: '../outside' })],
    ['extends', () => createEntityOptions({ extends: ['EntityBase;globalThis.injected=true'] })],
    [
      'property name',
      () =>
        createEntityOptions({
          properties: [{ name: 'safe;globalThis.injected=true', type: PropertyType.string }]
        })
    ],
    [
      'nested keyValue property name',
      () =>
        createEntityOptions({
          properties: [
            {
              name: 'settings',
              type: PropertyType.keyValue,
              properties: [{ name: 'safe;globalThis.injected=true', type: PropertyType.string }]
            }
          ]
        })
    ],
    [
      'relation name',
      () =>
        createEntityOptions({
          relations: [
            {
              name: 'posts;globalThis.injected=true',
              kind: RelationKind.ONE_TO_MANY,
              mappedEntity: 'Post',
              mappedNamespace: 'public',
              mappedProperty: 'author'
            }
          ]
        })
    ],
    [
      'mapped entity',
      () =>
        createEntityOptions({
          relations: [
            {
              name: 'posts',
              kind: RelationKind.ONE_TO_MANY,
              mappedEntity: 'Post;globalThis.injected=true',
              mappedNamespace: 'public',
              mappedProperty: 'author'
            }
          ]
        })
    ],
    [
      'mapped property',
      () =>
        createEntityOptions({
          relations: [
            {
              name: 'posts',
              kind: RelationKind.ONE_TO_MANY,
              mappedEntity: 'Post',
              mappedNamespace: 'public',
              mappedProperty: 'author;globalThis.injected=true'
            }
          ]
        })
    ],
    [
      'mapped namespace',
      () =>
        createEntityOptions({
          relations: [
            {
              name: 'posts',
              kind: RelationKind.ONE_TO_MANY,
              mappedEntity: 'Post',
              mappedNamespace: '../outside',
              mappedProperty: 'author'
            }
          ]
        })
    ]
  ])('rejects unsafe %s before registration', (_label, createOptions) => {
    const generator = new RxDBClientGenerator({ splitFiles: true });

    expect(() => generator.addEntity(createOptions())).toThrow(/invalid/i);
    expect(generator.metadataSet.size).toBe(0);
  });

  it('rejects duplicate class names across namespaces', () => {
    const generator = new RxDBClientGenerator({ splitFiles: true });
    generator.addEntity(createEntityOptions());

    expect(() => generator.addEntity(createEntityOptions({ namespace: 'auth' }))).toThrow(/duplicate.*User/i);
  });

  it('revalidates metadata inserted directly before creating source files', () => {
    const generator = new RxDBClientGenerator({ splitFiles: true });
    const unsafeMetadata = createEntityMetadata(createEntityOptions({ name: '../Escaped' }));
    generator.metadataSet.add(unsafeMetadata);

    expect(() => generator.exec()).toThrow(/invalid/i);
    expect(generator.project).toBeUndefined();
  });

  it('quotes a safe hyphenated namespace in module augmentation', async () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity(createEntityOptions({ namespace: 'tenant-west' }));
    generator.addEntity(createEntityOptions({ name: 'Role', namespace: 'tenant-west', displayName: 'Role' }));

    generator.exec();

    const declaration = generator.getSourceFiles().find(file => file.getFilePath() === 'index.d.ts');
    expect(declaration?.getText()).toContain('"tenant-west": {');
    await expect(
      compileGeneratedConsumer(
        generator.getSourceFiles(),
        [
          "import './generated/index.js';",
          "import type { RxDB } from '@aiao/rxdb';",
          'declare const db: RxDB;',
          'db["tenant-west"].User;',
          'db["tenant-west"].Role;'
        ].join('\n')
      )
    ).resolves.toEqual([]);
  });
});
