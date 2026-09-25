import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import buildClientLibrary from '../../cli/build-client-lib.js';
import { loadConfig, main } from '../../cli/cli.js';
import { parseRepositoryGeneratorSpec } from '../../cli/repository-generators.js';

const FIXTURE_MODULE = fileURLToPath(new URL('../fixtures/geo-repository-generator.ts', import.meta.url));
const GEO_GENERATOR_SPEC = `${FIXTURE_MODULE}#GeoRepositoryGenerator`;

describe('parseRepositoryGeneratorSpec', () => {
  it('按 `<模块>#<导出名>` 拆分', () => {
    expect(parseRepositoryGeneratorSpec('@aiao/rxdb-plugin-graph/generator#GraphRepositoryGenerator')).toEqual({
      moduleSpecifier: '@aiao/rxdb-plugin-graph/generator',
      exportName: 'GraphRepositoryGenerator'
    });
  });

  it('从最后一个 # 拆分，Node 的 imports 子路径（#internal/...）才不会被切坏', () => {
    expect(parseRepositoryGeneratorSpec('#internal/geo#GeoRepositoryGenerator')).toEqual({
      moduleSpecifier: '#internal/geo',
      exportName: 'GeoRepositoryGenerator'
    });
  });

  it.each([
    ['@aiao/rxdb-plugin-graph/generator', '缺导出名'],
    ['@aiao/rxdb-plugin-graph/generator#', '导出名为空'],
    ['#GraphRepositoryGenerator', '模块为空']
  ])('拒绝畸形规格 %s（%s）', spec => {
    expect(() => parseRepositoryGeneratorSpec(spec)).toThrow(/repositoryGenerators/);
  });
});

describe('CLI 装载配置声明的 Repository 生成器', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
  });

  /** 造一个「第三方插件包 + 用户实体」的最小工程：基类在插件包里，实体在用户目录里 */
  const setup = async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-plugin-'));
    tempDirs.push(tempDir);

    const packageDir = path.join(tempDir, 'geo-pkg');
    await mkdir(packageDir, { recursive: true });
    await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name: '@fixture/geo', type: 'module' }));
    await writeFile(
      path.join(packageDir, 'GeoEntityBase.ts'),
      `
        import { Entity, EntityBase, EntityMetadataOptions } from '@aiao/rxdb';

        // 插件基类的装饰器实参是常量标识符，CLI 的静态求值取不到它的值，
        // 只能由生成器随身携带的 abstractEntityMetadata 回填。
        const GEO_ENTITY_BASE_OPTIONS: EntityMetadataOptions = { name: 'GeoEntityBase', abstract: true };

        @Entity(GEO_ENTITY_BASE_OPTIONS)
        export abstract class GeoEntityBase extends EntityBase {}
      `,
      'utf8'
    );

    const entityDir = path.join(tempDir, 'entities');
    await mkdir(entityDir, { recursive: true });
    const entityFile = path.join(entityDir, 'Place.ts');
    await writeFile(
      entityFile,
      `
        import { Entity, PropertyType } from '@aiao/rxdb';
        import { GeoEntityBase } from '../geo-pkg/GeoEntityBase.js';

        @Entity({
          name: 'Place',
          repository: 'GeoRepository',
          properties: [{ name: 'title', type: PropertyType.string }]
        })
        export class Place extends GeoEntityBase {
          title!: string;
        }
      `,
      'utf8'
    );

    return { tempDir, entityFile, outDir: path.join(tempDir, 'generated') };
  };

  it('声明生成器后，产物带上插件方法，基类元数据也由生成器补齐', async () => {
    const { entityFile, outDir } = await setup();

    await buildClientLibrary({
      entities: [entityFile],
      outDir,
      repositoryGenerators: [GEO_GENERATOR_SPEC]
    });

    const declaration = await readFile(path.join(outDir, 'index.d.ts'), 'utf8');
    expect(declaration).toContain('findNearby');
    // 基类来自插件包而不是 @aiao/rxdb —— entityBaseModuleSpecifier 生效
    expect(declaration).toContain(`from '@fixture/geo'`);
    expect(declaration).toMatch(/class Place extends GeoEntityBase/);
    // 基类元数据回填后，继承来的 id 属性仍在
    expect(declaration).toContain('title');
  });

  it('不声明生成器时，插件基类的元数据无人提供，分析阶段就拒绝', async () => {
    const { entityFile, outDir } = await setup();

    await expect(buildClientLibrary({ entities: [entityFile], outDir })).rejects.toThrow(
      /Cannot statically evaluate entity metadata[\s\S]*GEO_ENTITY_BASE_OPTIONS/
    );
  });

  it('不声明生成器时，即便实体不继承插件基类也 fail-closed，而不是产出缺方法的半成品', async () => {
    const { tempDir, outDir } = await setup();
    const standaloneFile = path.join(tempDir, 'entities', 'Marker.ts');
    await writeFile(
      standaloneFile,
      `
        import { Entity, PropertyType } from '@aiao/rxdb';

        @Entity({
          name: 'Marker',
          repository: 'GeoRepository',
          properties: [{ name: 'label', type: PropertyType.string }]
        })
        export class Marker {
          label!: string;
        }
      `,
      'utf8'
    );

    await expect(buildClientLibrary({ entities: [standaloneFile], outDir })).rejects.toThrow(
      /No repository generator registered for "GeoRepository"/
    );

    // 同一个实体，声明了生成器就能产出插件方法
    await buildClientLibrary({
      entities: [standaloneFile],
      outDir,
      repositoryGenerators: [GEO_GENERATOR_SPEC]
    });
    expect(await readFile(path.join(outDir, 'index.d.ts'), 'utf8')).toContain('findNearby');
  });

  it('规格指向不存在的导出时报出模块与导出名', async () => {
    const { entityFile, outDir } = await setup();

    await expect(
      buildClientLibrary({
        entities: [entityFile],
        outDir,
        repositoryGenerators: [`${FIXTURE_MODULE}#MissingGenerator`]
      })
    ).rejects.toThrow(/MissingGenerator/);
  });

  it('导出不是生成器类时拒绝装载', async () => {
    const { entityFile, outDir } = await setup();

    await expect(
      buildClientLibrary({
        entities: [entityFile],
        outDir,
        repositoryGenerators: [`${FIXTURE_MODULE}#notAGenerator`]
      })
    ).rejects.toThrow(/notAGenerator/);
  });

  it('与已注册生成器重名时拒绝，而不是静默顶替', async () => {
    const { entityFile, outDir } = await setup();

    await expect(
      buildClientLibrary({
        entities: [entityFile],
        outDir,
        repositoryGenerators: [`${FIXTURE_MODULE}#DuplicateNameGenerator`]
      })
    ).rejects.toThrow(/Repository/);
  });
});

describe('loadConfig 归一化 repositoryGenerators', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
  });

  it('相对模块按配置文件目录解析，包名规格原样保留', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-config-'));
    tempDirs.push(tempDir);
    const configPath = path.join(tempDir, 'rxdb.config.ts');
    await writeFile(
      configPath,
      [
        'export default {',
        "  entities: ['./entities/*.ts'],",
        "  outDir: './generated',",
        '  repositoryGenerators: [',
        "    './plugins/geo.js#GeoRepositoryGenerator',",
        "    '@aiao/rxdb-plugin-graph/generator#GraphRepositoryGenerator'",
        '  ]',
        '};'
      ].join('\n'),
      'utf8'
    );

    const [config] = await loadConfig(configPath);

    expect(config!.repositoryGenerators).toEqual([
      `${path.join(tempDir, 'plugins', 'geo.js')}#GeoRepositoryGenerator`,
      '@aiao/rxdb-plugin-graph/generator#GraphRepositoryGenerator'
    ]);
  });

  it('repositoryGenerators 必须是字符串数组', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-config-'));
    tempDirs.push(tempDir);
    const configPath = path.join(tempDir, 'rxdb.config.ts');
    await writeFile(
      configPath,
      `export default { entities: ['./a.ts'], outDir: './out', repositoryGenerators: 'geo#Geo' };`,
      'utf8'
    );

    await expect(loadConfig(configPath)).rejects.toThrow(/repositoryGenerators must be a string array/);
  });
});

describe('CLI 在配置目录之外的 cwd 装载 repositoryGenerators（跨 cwd 集成测试）', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
  });

  /**
   * 造一个「配置项目」：生成器包只装在**该项目自己的** `node_modules` 里，不落进仓库真正的
   * `node_modules`——测试进程的 cwd（仓库根 / 包目录）因此天然就在配置目录之外，不需要
   * `process.chdir()` 就能复现评审报告的场景（从 monorepo 根目录跑子项目配置 / CI 传绝对配置路径）。
   */
  const setupOutsideCwdProject = async (): Promise<{ tempDir: string; pkgName: string; outDir: string }> => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-outside-cwd-'));
    tempDirs.push(tempDir);
    // 包名带随机后缀：避免和仓库真正 node_modules 里任何已装包撞名，
    // 撞名会让「只能从配置目录解析」这个前提失去意义。
    const pkgName = `rxdb-cg-fixture-${randomUUID().replaceAll('-', '')}`;

    const pkgDir = path.join(tempDir, 'node_modules', pkgName);
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: pkgName,
        version: '1.0.0',
        type: 'module',
        // 根导出 + 子路径导出：分别对应规格里「裸包」与「包子路径」两种写法。
        exports: { '.': './index.js', './sub': './sub.js' }
      }),
      'utf8'
    );
    await writeFile(
      path.join(pkgDir, 'index.js'),
      "export class RootRepositoryGenerator {\n  name = 'RootRepo';\n  generate() {}\n}\n",
      'utf8'
    );
    await writeFile(
      path.join(pkgDir, 'sub.js'),
      "export class SubRepositoryGenerator {\n  name = 'SubRepo';\n  generate() {}\n}\n",
      'utf8'
    );
    await writeFile(
      path.join(tempDir, 'local-generator.js'),
      "export class LocalRepositoryGenerator {\n  name = 'LocalRepo';\n  generate() {}\n}\n",
      'utf8'
    );

    const entityDir = path.join(tempDir, 'entities');
    await mkdir(entityDir, { recursive: true });
    await writeFile(
      path.join(entityDir, 'Thing.ts'),
      `
        import { Entity } from '@aiao/rxdb';

        @Entity({ name: 'Thing', properties: [] })
        class Thing {}
      `,
      'utf8'
    );

    return { tempDir, pkgName, outDir: path.join(tempDir, 'generated') };
  };

  /** 把 `repositoryGenerators` 写进一份最小可用配置，其余字段固定。 */
  const writeConfig = async (tempDir: string, repositoryGenerators: string[]): Promise<string> => {
    const configPath = path.join(tempDir, 'rxdb.config.ts');
    await writeFile(
      configPath,
      [
        'export default {',
        "  entities: ['./entities/*.ts'],",
        "  outDir: './generated',",
        `  repositoryGenerators: ${JSON.stringify(repositoryGenerators)}`,
        '};'
      ].join('\n'),
      'utf8'
    );
    return configPath;
  };

  /** 像真正的 bin 脚本一样，通过 `process.argv` 驱动 CLI 的可编程入口 `main()`。 */
  const runCli = async (configPath: string): Promise<void> => {
    const originalArgv = process.argv;
    process.argv = ['node', 'rxdb-client-generator', configPath];
    try {
      await main();
    } finally {
      process.argv = originalArgv;
    }
  };

  const pathExists = async (filePath: string): Promise<boolean> => {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  };

  it('裸包、包子路径、相对路径三种规格，在 cwd 不是配置目录时都能装载', async () => {
    const { tempDir, pkgName, outDir } = await setupOutsideCwdProject();
    const configPath = await writeConfig(tempDir, [
      `${pkgName}#RootRepositoryGenerator`,
      `${pkgName}/sub#SubRepositoryGenerator`,
      './local-generator.js#LocalRepositoryGenerator'
    ]);

    // 前提断言：不手动 chdir，测试进程的 cwd 本来就不是配置目录——
    // 和评审报告「从仓库根跑子项目配置」是同一件事，这里不需要额外模拟。
    expect(path.resolve(process.cwd())).not.toBe(path.resolve(tempDir));

    await runCli(configPath);

    expect(await pathExists(path.join(outDir, 'index.d.ts'))).toBe(true);
  });

  it('缺包时的错误信息同时包含原始 spec 字符串与配置文件路径', async () => {
    const { tempDir } = await setupOutsideCwdProject();
    const missingSpec = 'this-package-does-not-exist-anywhere#MissingExport';
    const configPath = await writeConfig(tempDir, [missingSpec]);

    await runCli(configPath).then(
      () => {
        throw new Error('main() 本该因为找不到这个包而 reject');
      },
      (error: unknown) => {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        // 只报 jiti 原生的 "Cannot find module" 排查不出是哪份配置的哪一条
        // repositoryGenerators 引发的——尤其是深层 monorepo 里一次跑多份配置时。
        expect(message).toContain(missingSpec);
        expect(message).toContain(configPath);
      }
    );
  });
});
