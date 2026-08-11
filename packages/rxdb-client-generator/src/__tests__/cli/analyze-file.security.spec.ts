import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Project } from 'ts-morph';
import { afterEach, describe, expect, it } from 'vitest';
import analyzeFile from '../../cli/analyze-file.js';

describe('analyzeFile metadata safety', () => {
  const tempDirs: string[] = [];
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    tsConfigFilePath: path.resolve(import.meta.dirname, '../../../../../tsconfig.base.json')
  });

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
  });

  const createEntityFile = async (source: string): Promise<string> => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-analyze-'));
    tempDirs.push(tempDir);
    await mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, 'entity.ts');
    await writeFile(filePath, source, 'utf8');
    return filePath;
  };

  const analyze = (filePath: string) => {
    project.addSourceFileAtPath(filePath);
    project.resolveSourceFileDependencies();
    return analyzeFile(filePath, project);
  };

  it('never executes decorator metadata expressions', async () => {
    const marker = '__RXDB_CLIENT_GENERATOR_EXECUTED_METADATA__';
    Reflect.deleteProperty(globalThis, marker);
    const filePath = await createEntityFile(`
      import { Entity } from '@aiao/rxdb';

      @Entity((globalThis['${marker}'] = true, { name: 'Unsafe', properties: [] }))
      class Unsafe {}
    `);

    let thrown: unknown;
    try {
      analyze(filePath);
    } catch (error) {
      thrown = error;
    }

    try {
      expect(Reflect.has(globalThis, marker)).toBe(false);
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).toEqual(expect.objectContaining({ message: expect.stringContaining(filePath) }));
    } finally {
      Reflect.deleteProperty(globalThis, marker);
    }
  });

  it('fails with source location when metadata references a local value', async () => {
    const filePath = await createEntityFile(`
      import { Entity } from '@aiao/rxdb';

      const metadata = { name: 'LocalValue', properties: [] };

      @Entity(metadata)
      class LocalValue {}
    `);

    expect(() => analyze(filePath)).toThrow(filePath);
    expect(() => analyze(filePath)).toThrow(/:\d+:\d+/);
    expect(() => analyze(filePath)).toThrow(/metadata/);
  });

  it('fails explicitly when metadata contains a dynamic expression', async () => {
    const filePath = await createEntityFile(`
      import { Entity } from '@aiao/rxdb';

      @Entity({ name: 'Dynamic', properties: createProperties() })
      class Dynamic {}

      function createProperties() {
        return [];
      }
    `);

    expect(() => analyze(filePath)).toThrow(filePath);
    expect(() => analyze(filePath)).toThrow(/CallExpression/);
  });

  it('statically evaluates literal metadata and approved enum members', async () => {
    const filePath = await createEntityFile(`
      import { Entity, OnDeleteAction, PropertyType, RelationKind } from '@aiao/rxdb';

      @Entity({
        name: 'SafeEntity',
        displayName: \`Safe entity\`,
        log: false,
        properties: [
          { name: 'id', type: PropertyType.uuid, nullable: true, default: null },
          { name: 'rank', type: PropertyType.integer, default: -1 }
        ],
        relations: [
          {
            name: 'parent',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'SafeEntity',
            mappedProperty: 'children',
            onDelete: OnDeleteAction.CASCADE
          }
        ],
        features: { 'x.y': true }
      })
      class SafeEntity {}
    `);

    const [result] = analyze(filePath);

    expect(result.metadataOptions).toMatchObject({
      name: 'SafeEntity',
      displayName: 'Safe entity',
      log: false,
      properties: [
        { name: 'id', type: 'uuid', nullable: true, default: null },
        { name: 'rank', type: 'integer', default: -1 }
      ],
      relations: [
        {
          name: 'parent',
          kind: 'm:1',
          mappedEntity: 'SafeEntity',
          mappedProperty: 'children',
          onDelete: 'CASCADE'
        }
      ],
      features: { 'x.y': true }
    });
  });
});
