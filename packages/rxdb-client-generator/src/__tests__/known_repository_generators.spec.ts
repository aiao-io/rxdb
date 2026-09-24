import { describe, expect, it } from 'vitest';
import {
  describeMissingGeneratorForPackage,
  describeMissingGeneratorForRepository
} from '../core/known-repository-generators.js';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import type { IRepositoryGenerator } from '../generators/RepositoryGenerator.interface.js';
import { GeoRepositoryGenerator } from './helpers/fixture-repository-generator.js';

describe('known repository generator hints', () => {
  it('names the config entry for a known plugin package', () => {
    expect(describeMissingGeneratorForPackage('@aiao/rxdb-plugin-tree')).toContain(
      '@aiao/rxdb-plugin-tree/generator#TreeRepositoryGenerator'
    );
    expect(describeMissingGeneratorForPackage('@aiao/rxdb-plugin-graph')).toContain(
      '@aiao/rxdb-plugin-graph/generator#GraphRepositoryGenerator'
    );
  });

  it('stays silent for packages it does not know', () => {
    expect(describeMissingGeneratorForPackage('@acme/rxdb-plugin-geo')).toBe('');
    expect(describeMissingGeneratorForRepository('GeoRepository')).toBe('');
  });

  it('points a missing TreeRepository generator at the plugin subpath', () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity({
      extends: ['TreeAdjacencyListEntityBase'],
      name: 'Folder',
      namespace: 'public',
      properties: [],
      repository: 'TreeRepository'
    });

    expect(() => generator.exec()).toThrow(/@aiao\/rxdb-plugin-tree\/generator#TreeRepositoryGenerator/);
  });
});

// 重名拒绝必须在 RxDBClientGenerator.registerRepositoryGenerator 本身，不能只在 CLI 装载路径
// （cli/repository-generators.ts 的 registerRepositoryGenerators()）：直接 `new RxDBClientGenerator()`
// 手动注册的编程调用方（例如 apps/dev-rxdb-angular 的 generator.page.ts）走不到 CLI 那一层，
// 同名插件会静默顶掉已注册的生成器。
describe('registerRepositoryGenerator rejects duplicate names', () => {
  it('同一实例重复注册同名生成器时抛错，而不是静默顶替', () => {
    const generator = new RxDBClientGenerator();
    generator.registerRepositoryGenerator(new GeoRepositoryGenerator());

    expect(() => generator.registerRepositoryGenerator(new GeoRepositoryGenerator())).toThrow(
      /Duplicate repository generator name "GeoRepository"/
    );
  });

  it('重名与内置的 Repository 生成器冲突时同样抛错', () => {
    const generator = new RxDBClientGenerator();
    const collidingWithBuiltIn: IRepositoryGenerator = {
      name: 'Repository',
      generate: () => undefined
    };

    expect(() => generator.registerRepositoryGenerator(collidingWithBuiltIn)).toThrow(
      /Duplicate repository generator name "Repository"/
    );
  });
});
