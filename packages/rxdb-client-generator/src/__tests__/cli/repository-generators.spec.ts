import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import buildClientLibrary from '../../cli/build-client-lib.js';
import { loadConfig } from '../../cli/cli.js';
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
