import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Project, ts } from 'ts-morph';
import { afterEach, describe, expect, it } from 'vitest';
import analyzeFile from '../../cli/analyze-file.js';

/**
 * import 的模块解析不到时，TS 把绑定指向一个没有声明的 `unknown` 符号，
 * 生成器只能报「X must resolve to ... exported by @aiao/rxdb」，用户会以为是自己写错了；
 * 报错里要点明真正的成因：哪个模块说明符、在哪个文件里解析失败。
 */
describe('analyzeFile 报错点明 import 解析失败的成因', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
  });

  const createDir = async (): Promise<string> => {
    const dir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-unresolved-import-'));
    tempDirs.push(dir);
    await mkdir(dir, { recursive: true });
    return dir;
  };

  const writeFiles = async (files: Record<string, string>): Promise<Record<string, string>> => {
    const dir = await createDir();
    const paths: Record<string, string> = {};
    for (const [name, source] of Object.entries(files)) {
      paths[name] = path.join(dir, name);
      await writeFile(paths[name], source, 'utf8');
    }
    return paths;
  };

  /** 没有任何 paths / node_modules 的工程：`@aiao/rxdb` 在这里解析不到。 */
  const createIsolatedProject = (filePaths: string[]): Project => {
    const project = new Project({
      compilerOptions: {
        experimentalDecorators: true,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ES2022
      }
    });
    project.addSourceFilesAtPaths(filePaths);
    project.resolveSourceFileDependencies();
    return project;
  };

  /** 沿用仓库 tsconfig：`@aiao/rxdb` 能解析，便于单独制造枚举 import 解析失败。整组共用一个，只增量加文件。 */
  const workspaceProject = new Project({
    skipAddingFilesFromTsConfig: true,
    tsConfigFilePath: path.resolve(import.meta.dirname, '../../../../../tsconfig.base.json')
  });
  const createWorkspaceProject = (filePaths: string[]): Project => {
    workspaceProject.addSourceFilesAtPaths(filePaths);
    workspaceProject.resolveSourceFileDependencies();
    return workspaceProject;
  };

  const messageOf = (run: () => unknown): string => {
    try {
      run();
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error('expected analyzeFile to throw');
  };

  describe('实体装饰器', () => {
    it('`@aiao/rxdb` 解析不到时点明模块说明符与出事的文件', async () => {
      const { 'entity.ts': entity } = await writeFiles({
        'entity.ts': `
          import { Entity } from '@aiao/rxdb';
          @Entity({ name: 'Lost', properties: [] })
          class Lost {}
        `
      });

      const message = messageOf(() => analyzeFile(entity, createIsolatedProject([entity])));

      expect(message).toMatch(/Entity must resolve to an entity decorator exported by @aiao\/rxdb/);
      expect(message).toContain(`the import from "@aiao/rxdb" in ${entity} could not be resolved`);
      expect(message).toMatch(/installed/);
      expect(message).toMatch(/tsconfig\.json/);
    });

    it('别名导入同样点明', async () => {
      const { 'entity.ts': entity } = await writeFiles({
        'entity.ts': `
          import { Entity as Model } from '@aiao/rxdb';
          @Model({ name: 'Lost', properties: [] })
          class Lost {}
        `
      });

      const message = messageOf(() => analyzeFile(entity, createIsolatedProject([entity])));

      expect(message).toMatch(/Model must resolve to an entity decorator/);
      expect(message).toContain(`the import from "@aiao/rxdb" in ${entity} could not be resolved`);
    });

    it('命名空间限定的装饰器按最左侧的命名空间 import 点明', async () => {
      const { 'entity.ts': entity } = await writeFiles({
        'entity.ts': `
          import * as Rx from '@aiao/rxdb';
          @Rx.Entity({ name: 'Lost', properties: [] })
          class Lost {}
        `
      });

      const message = messageOf(() => analyzeFile(entity, createIsolatedProject([entity])));

      expect(message).toMatch(/Entity must resolve to an entity decorator/);
      expect(message).toContain(`the import from "@aiao/rxdb" in ${entity} could not be resolved`);
    });

    it('经 re-export 转手的装饰器点明失败的那一环所在的文件', async () => {
      const { 'decorators.ts': decorators, 'entity.ts': entity } = await writeFiles({
        'decorators.ts': `export { Entity as ReExportedEntity } from '@aiao/rxdb';`,
        'entity.ts': `
          import { ReExportedEntity as Model } from './decorators.js';
          @Model({ name: 'Lost', properties: [] })
          class Lost {}
        `
      });

      const message = messageOf(() => analyzeFile(entity, createIsolatedProject([entity, decorators])));

      expect(message).toMatch(/Model must resolve to an entity decorator/);
      expect(message).toContain(`the import from "@aiao/rxdb" in ${decorators} could not be resolved`);
    });
  });

  describe('核心枚举', () => {
    it('枚举所在模块解析不到时点明模块说明符', async () => {
      const { 'entity.ts': entity } = await writeFiles({
        'entity.ts': `
          import { Entity } from '@aiao/rxdb';
          import { PropertyType } from '@acme/not-installed';

          @Entity({ name: 'Lost', properties: [{ name: 'value', type: PropertyType.integer }] })
          class Lost {}
        `
      });

      const message = messageOf(() => analyzeFile(entity, createWorkspaceProject([entity])));

      expect(message).toMatch(/PropertyType must resolve to .*@aiao\/rxdb/);
      expect(message).toContain(`the import from "@acme/not-installed" in ${entity} could not be resolved`);
    });

    it('别名导入的枚举同样点明', async () => {
      const { 'entity.ts': entity } = await writeFiles({
        'entity.ts': `
          import { Entity } from '@aiao/rxdb';
          import { PropertyType as Kind } from '@acme/not-installed';

          @Entity({ name: 'Lost', properties: [{ name: 'value', type: Kind.integer }] })
          class Lost {}
        `
      });

      const message = messageOf(() => analyzeFile(entity, createWorkspaceProject([entity])));

      expect(message).toMatch(/Kind must resolve to .*@aiao\/rxdb/);
      expect(message).toContain(`the import from "@acme/not-installed" in ${entity} could not be resolved`);
    });

    it('经 re-export 转手的枚举点明失败的那一环所在的文件', async () => {
      const { 'enums.ts': enums, 'entity.ts': entity } = await writeFiles({
        'enums.ts': `export { PropertyType as Kind } from '@acme/not-installed';`,
        'entity.ts': `
          import { Entity } from '@aiao/rxdb';
          import { Kind } from './enums.js';

          @Entity({ name: 'Lost', properties: [{ name: 'value', type: Kind.integer }] })
          class Lost {}
        `
      });

      const message = messageOf(() => analyzeFile(entity, createWorkspaceProject([entity, enums])));

      expect(message).toMatch(/Kind must resolve to .*@aiao\/rxdb/);
      expect(message).toContain(`the import from "@acme/not-installed" in ${enums} could not be resolved`);
    });
  });

  describe('不是解析失败时不乱点名', () => {
    it('模块解析得到、但没有这个导出：不报解析失败', async () => {
      const { 'enums.ts': enums, 'entity.ts': entity } = await writeFiles({
        'enums.ts': `export enum Other { integer = 'string' }`,
        'entity.ts': `
          import { Entity } from '@aiao/rxdb';
          import { PropertyType } from './enums.js';

          @Entity({ name: 'Wrong', properties: [{ name: 'value', type: PropertyType.integer }] })
          class Wrong {}
        `
      });

      const message = messageOf(() => analyzeFile(entity, createWorkspaceProject([entity, enums])));

      expect(message).toMatch(/PropertyType must resolve to .*@aiao\/rxdb/);
      expect(message).not.toContain('could not be resolved');
    });

    it('同名枚举来自别的模块：不报解析失败', async () => {
      const { 'enums.ts': enums, 'entity.ts': entity } = await writeFiles({
        'enums.ts': `export enum PropertyType { integer = 'string' }`,
        'entity.ts': `
          import { Entity } from '@aiao/rxdb';
          import { PropertyType } from './enums.js';

          @Entity({ name: 'Foreign', properties: [{ name: 'value', type: PropertyType.integer }] })
          class Foreign {}
        `
      });

      const message = messageOf(() => analyzeFile(entity, createWorkspaceProject([entity, enums])));

      expect(message).toMatch(/PropertyType must resolve to .*@aiao\/rxdb/);
      expect(message).not.toContain('could not be resolved');
    });

    it('同名的局部对象、没有任何 import：不报解析失败', async () => {
      const { 'entity.ts': entity } = await writeFiles({
        'entity.ts': `
          import { Entity } from '@aiao/rxdb';
          const PropertyType = { integer: 'string' } as const;

          @Entity({ name: 'Shadow', properties: [{ name: 'value', type: PropertyType.integer }] })
          class Shadow {}
        `
      });

      const message = messageOf(() => analyzeFile(entity, createWorkspaceProject([entity])));

      expect(message).toMatch(/PropertyType must resolve to .*@aiao\/rxdb/);
      expect(message).not.toContain('could not be resolved');
    });

    it('同名的局部装饰器、没有任何 import：不报解析失败', async () => {
      const { 'entity.ts': entity } = await writeFiles({
        'entity.ts': `
          const Entity = (_metadata: object) => (_target: abstract new (...args: never[]) => object) => undefined;

          @Entity({ name: 'Impostor', properties: [] })
          class Impostor {}
        `
      });

      const message = messageOf(() => analyzeFile(entity, createWorkspaceProject([entity])));

      expect(message).toMatch(/Entity must resolve to an entity decorator/);
      expect(message).not.toContain('could not be resolved');
    });
  });
});
