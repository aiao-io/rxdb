import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Node, Project, ts } from 'ts-morph';
import { afterEach, describe, expect, it } from 'vitest';
import analyzeFile, { clearGlobalProject } from '../../cli/analyze-file.js';

describe('analyzeFile edge branches', () => {
  const tempDirs: string[] = [];
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    tsConfigFilePath: path.resolve(import.meta.dirname, '../../../../../tsconfig.base.json')
  });

  afterEach(async () => {
    clearGlobalProject();
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
  });

  const createEntityFile = async (source: string, name = 'entity.ts'): Promise<string> => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-analyze-edge-'));
    tempDirs.push(tempDir);
    await mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, name);
    await writeFile(filePath, source, 'utf8');
    return filePath;
  };

  const createProject = (filePaths: string[]): Project => {
    project.addSourceFilesAtPaths(filePaths);
    project.resolveSourceFileDependencies();
    return project;
  };

  const analyze = (filePath: string) => analyzeFile(filePath, createProject([filePath]));

  it('supports TreeEntity and GraphEntity repository assignment', async () => {
    const filePath = await createEntityFile(`
      import { TreeEntity } from '@aiao/rxdb';
      import { GraphEntity } from '@aiao/rxdb-plugin-graph';

      @TreeEntity({ name: 'TreeNode', properties: [] })
      class TreeNode {}

      @GraphEntity({ name: 'GraphNode', properties: [] })
      class GraphNode {}
    `);

    const results = analyze(filePath);
    const tree = results.find(r => r.metadataOptions.name === 'TreeNode');
    const graph = results.find(r => r.metadataOptions.name === 'GraphNode');
    expect(tree?.decoratorName).toBe('TreeEntity');
    expect(tree?.metadataOptions.repository).toBe('TreeRepository');
    expect(graph?.decoratorName).toBe('GraphEntity');
    expect(graph?.metadataOptions.repository).toBe('GraphRepository');
  });

  it('rejects multiple entity decorators on one class', async () => {
    const filePath = await createEntityFile(`
      import { Entity, TreeEntity } from '@aiao/rxdb';

      @Entity({ name: 'A', properties: [] })
      @TreeEntity({ name: 'A', properties: [] })
      class A {}
    `);
    expect(() => analyze(filePath)).toThrow(/multiple entity decorators/);
  });

  it('rejects non-call entity decorator and wrong arg count', async () => {
    const bare = await createEntityFile(
      `
      import { Entity } from '@aiao/rxdb';
      @Entity
      class Bare {}
    `,
      'bare.ts'
    );
    expect(() => analyze(bare)).toThrow(/must be called/);

    const multi = await createEntityFile(
      `
      import { Entity } from '@aiao/rxdb';
      @Entity({ name: 'A', properties: [] }, { extra: true })
      class Multi {}
    `,
      'multi.ts'
    );
    expect(() => analyze(multi)).toThrow(/exactly one metadata object/);
  });

  it('evaluates unary plus/minus and parenthesized/as expressions', async () => {
    const filePath = await createEntityFile(`
      import { Entity, PropertyType } from '@aiao/rxdb';

      @Entity({
        name: 'Nums',
        properties: [
          { name: 'a', type: PropertyType.integer, default: +2 },
          { name: 'b', type: PropertyType.integer, default: -(1 as const) }
        ]
      })
      class Nums {}
    `);
    const [result] = analyze(filePath);
    expect(result.metadataOptions.properties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'a', default: 2 }),
        expect.objectContaining({ name: 'b', default: -1 })
      ])
    );
  });

  it('rejects computed property names and non-object metadata', async () => {
    const computed = await createEntityFile(
      `
      import { Entity } from '@aiao/rxdb';
      const key = 'name';
      @Entity({ [key]: 'X', properties: [] })
      class Bad {}
    `,
      'computed.ts'
    );
    expect(() => analyze(computed)).toThrow(/Computed property names/);

    const arr = await createEntityFile(
      `
      import { Entity } from '@aiao/rxdb';
      @Entity([{ name: 'X' }])
      class BadArr {}
    `,
      'arr.ts'
    );
    expect(() => analyze(arr)).toThrow(/must be an object literal/);

    const noName = await createEntityFile(
      `
      import { Entity } from '@aiao/rxdb';
      @Entity({ properties: [] })
      class NoName {}
    `,
      'noname.ts'
    );
    expect(() => analyze(noName)).toThrow(/name must be a string/);
  });

  it('collects parent metadata from decorated base class in same file', async () => {
    const filePath = await createEntityFile(`
      import { Entity } from '@aiao/rxdb';

      @Entity({ name: 'Base', properties: [{ name: 'id', type: 'uuid' }] })
      class Base {}

      @Entity({ name: 'Child', properties: [{ name: 'title', type: 'string' }] })
      class Child extends Base {}
    `);
    const results = analyze(filePath);
    const child = results.find(r => r.metadataOptions.name === 'Child');
    expect(child?.extendMetadataOptions.some(m => m.name === 'Base')).toBe(true);
  });

  it('does not treat a local class named EntityBase as the RxDB built-in base', async () => {
    const filePath = await createEntityFile(`
      import { Entity } from '@aiao/rxdb';

      @Entity({ name: 'LocalBase', properties: [{ name: 'localId', type: 'string' }] })
      class EntityBase {}

      @Entity({ name: 'Child', properties: [] })
      class Child extends EntityBase {}
    `);

    const child = analyze(filePath).find(result => result.metadataOptions.name === 'Child');
    expect(child?.extendMetadataOptions.map(metadata => metadata.name)).toEqual(['LocalBase']);
  });

  it('collects a three-level decorated inheritance chain across files regardless of input order', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-inheritance-'));
    tempDirs.push(tempDir);
    const basePath = path.join(tempDir, 'base.ts');
    const middlePath = path.join(tempDir, 'middle.ts');
    const childPath = path.join(tempDir, 'child.ts');

    await Promise.all([
      writeFile(
        basePath,
        `
          import { Entity, EntityBase } from '@aiao/rxdb';
          @Entity({ name: 'Base', properties: [{ name: 'baseField', type: 'string' }] })
          export class Base extends EntityBase {}
        `,
        'utf8'
      ),
      writeFile(
        middlePath,
        `
          import { Entity } from '@aiao/rxdb';
          import { Base } from './base.js';
          @Entity({ name: 'Middle', properties: [{ name: 'middleField', type: 'string' }] })
          export class Middle extends Base {}
        `,
        'utf8'
      ),
      writeFile(
        childPath,
        `
          import { Entity } from '@aiao/rxdb';
          import { Middle } from './middle.js';
          @Entity({ name: 'Child', properties: [{ name: 'childField', type: 'string' }] })
          export class Child extends Middle {}
        `,
        'utf8'
      )
    ]);

    const project = createProject([childPath, middlePath, basePath]);
    const child = analyzeFile(childPath, project).find(result => result.metadataOptions.name === 'Child');

    expect(child?.extendMetadataOptions.map(metadata => metadata.name)).toEqual(['EntityBase', 'Base', 'Middle']);
    expect(
      child?.extendMetadataOptions.flatMap(metadata => metadata.properties ?? []).map(property => property.name)
    ).toEqual(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'baseField', 'middleField']);
  });

  it('resolves named, namespace, and re-export aliases to the original entity decorator symbol', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-alias-'));
    tempDirs.push(tempDir);
    const reExportPath = path.join(tempDir, 'decorators.ts');
    const entityPath = path.join(tempDir, 'entities.ts');

    await writeFile(reExportPath, `export { Entity as ReExportedEntity } from '@aiao/rxdb';`, 'utf8');
    await writeFile(
      entityPath,
      `
        import { Entity as Model } from '@aiao/rxdb';
        import * as Rx from '@aiao/rxdb';
        import { ReExportedEntity as ReExportedModel } from './decorators.js';

        @Model({ name: 'NamedAlias', properties: [] })
        class NamedAlias {}

        @Rx.Entity({ name: 'NamespaceAlias', properties: [] })
        class NamespaceAlias {}

        @ReExportedModel({ name: 'ReExportAlias', properties: [] })
        class ReExportAlias {}
      `,
      'utf8'
    );

    const project = createProject([entityPath, reExportPath]);
    const sourceFile = project.getSourceFileOrThrow(entityPath);
    const namedAliasExpression = sourceFile
      .getClassOrThrow('NamedAlias')
      .getDecorators()[0]!
      .getCallExpressionOrThrow()
      .getExpression();
    expect(Node.isIdentifier(namedAliasExpression)).toBe(true);
    expect(namedAliasExpression.getSymbol()?.getAliasedSymbol()?.getName()).toBe('Entity');

    const results = analyzeFile(entityPath, project);
    expect(results.map(result => [result.decoratorName, result.metadataOptions.name])).toEqual([
      ['Entity', 'NamedAlias'],
      ['Entity', 'NamespaceAlias'],
      ['Entity', 'ReExportAlias']
    ]);
  });

  it('fails closed when an entity decorator behind a re-export cannot resolve its source package', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-unresolved-re-export-'));
    tempDirs.push(tempDir);
    const reExportPath = path.join(tempDir, 'decorators.ts');
    const entityPath = path.join(tempDir, 'entity.ts');
    await Promise.all([
      writeFile(reExportPath, `export { Entity as ReExportedEntity } from '@aiao/rxdb';`, 'utf8'),
      writeFile(
        entityPath,
        `
          import { ReExportedEntity as Model } from './decorators';
          @Model({ name: 'Unresolved', properties: [] })
          class Unresolved {}
        `,
        'utf8'
      )
    ]);
    const unresolvedProject = new Project({
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Classic
      }
    });
    unresolvedProject.addSourceFilesAtPaths([entityPath, reExportPath]);
    unresolvedProject.resolveSourceFileDependencies();

    expect(() => analyzeFile(entityPath, unresolvedProject)).toThrow(/must resolve to an entity decorator/);
  });

  it('fails closed when a decorated class extends an unresolved base class', async () => {
    const filePath = await createEntityFile(`
      import { Entity } from '@aiao/rxdb';
      @Entity({ name: 'BrokenChild', properties: [] })
      class BrokenChild extends MissingBase {}
    `);

    expect(() => analyze(filePath)).toThrow(/Cannot resolve base class MissingBase/);
  });

  it('rejects a local decorator that only reuses the Entity name', async () => {
    const filePath = await createEntityFile(`
      const Entity = (_metadata: object) => (_target: abstract new (...args: never[]) => object) => undefined;

      @Entity({ name: 'Impostor', properties: [] })
      class Impostor {}
    `);

    expect(() => analyze(filePath)).toThrow(/Entity.*@aiao\/rxdb|@aiao\/rxdb.*Entity/);
  });

  it('clears cached decorator package ownership together with the global project', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-package-cache-'));
    tempDirs.push(tempDir);
    const packageDir = path.join(tempDir, 'decorator-package');
    const packageJsonPath = path.join(packageDir, 'package.json');
    const decoratorPath = path.join(packageDir, 'decorator.ts');
    const entityPath = path.join(tempDir, 'entity.ts');
    await mkdir(packageDir, { recursive: true });
    await Promise.all([
      writeFile(packageJsonPath, JSON.stringify({ name: '@aiao/rxdb' }), 'utf8'),
      writeFile(
        decoratorPath,
        `export const Entity = (_metadata: object) => (_target: abstract new (...args: never[]) => object) => undefined;`,
        'utf8'
      ),
      writeFile(
        entityPath,
        `
          import { Entity } from './decorator-package/decorator.js';
          @Entity({ name: 'Cached', properties: [] })
          class Cached {}
        `,
        'utf8'
      )
    ]);
    const isolatedProject = new Project();
    isolatedProject.addSourceFilesAtPaths([decoratorPath, entityPath]);
    isolatedProject.resolveSourceFileDependencies();

    expect(analyzeFile(entityPath, isolatedProject)).toHaveLength(1);
    await writeFile(packageJsonPath, JSON.stringify({ name: '@example/impostor' }), 'utf8');
    clearGlobalProject();

    expect(() => analyzeFile(entityPath, isolatedProject)).toThrow(/Entity.*@aiao\/rxdb|@aiao\/rxdb.*Entity/);
  });

  it('clearGlobalProject allows reusing global project path', async () => {
    clearGlobalProject();
    const filePath = await createEntityFile(`
      import { Entity } from '@aiao/rxdb';
      @Entity({ name: 'Solo', properties: [] })
      class Solo {}
    `);
    // 未传入 project 参数 → 使用全局项目分支
    const results = analyzeFile(filePath);
    expect(results).toHaveLength(1);
    expect(results[0]!.metadataOptions.name).toBe('Solo');
    clearGlobalProject();
  });
});
