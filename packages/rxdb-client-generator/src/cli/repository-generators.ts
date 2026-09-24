/**
 * @fileoverview CLI 的 Repository 生成器装载
 * 把配置里的 `<模块>#<导出名>` 规格解析、动态装载并注册到生成器实例上
 *
 * @module rxdb-client-generator/cli/repository-generators
 */

import { createJiti } from 'jiti';
import { normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import type { IRepositoryGenerator } from '../generators/RepositoryGenerator.interface.js';

const SPEC_SEPARATOR = '#';

/**
 * 以用户工程为基准解析插件模块。
 *
 * @remarks
 * 锚点必须是 `process.cwd()` 而不是本文件：生成器包在 monorepo / pnpm 下常被提升到别处，
 * 以自身为锚点会解析不到用户工程里装的插件包。
 */
const jiti = createJiti(pathToFileURL(resolve(process.cwd(), 'rxdb-client-generator.js')).href, {
  fsCache: false,
  moduleCache: false
});

/** 拆开后的生成器规格。 */
export interface RepositoryGeneratorSpec {
  /** 导出生成器类的模块，可以是包名、子路径导出或绝对路径。 */
  moduleSpecifier: string;
  /** 生成器类在该模块上的命名导出。 */
  exportName: string;
}

/**
 * 解析 `<模块>#<导出名>` 形式的生成器规格。
 *
 * @remarks
 * 从**最后**一个 `#` 拆分：Node 的 imports 字段子路径本身以 `#` 开头
 * （`#internal/geo`），从第一个 `#` 拆会把模块名切成空串。
 *
 * @param spec 配置里 `repositoryGenerators` 的一项
 * @returns 模块与导出名
 * @throws {Error} 缺少分隔符、模块为空或导出名为空时抛出
 */
export const parseRepositoryGeneratorSpec = (spec: string): RepositoryGeneratorSpec => {
  const separatorIndex = spec.lastIndexOf(SPEC_SEPARATOR);
  const moduleSpecifier = separatorIndex < 0 ? '' : spec.slice(0, separatorIndex);
  const exportName = separatorIndex < 0 ? '' : spec.slice(separatorIndex + 1);
  if (!moduleSpecifier || !exportName) {
    throw new Error(
      `Invalid repositoryGenerators entry ${JSON.stringify(spec)}: expected "<module>${SPEC_SEPARATOR}<ExportName>"`
    );
  }
  return { moduleSpecifier, exportName };
};

/**
 * 把规格里的相对模块解析为绝对路径，包名与 `#` 子路径原样保留。
 *
 * @param spec 生成器规格
 * @param configDir 配置文件所在目录
 * @returns 模块部分已解析的规格
 */
export const resolveRepositoryGeneratorSpec = (spec: string, configDir: string): string => {
  const { exportName, moduleSpecifier } = parseRepositoryGeneratorSpec(spec);
  const resolved = moduleSpecifier.startsWith('.') ? normalize(resolve(configDir, moduleSpecifier)) : moduleSpecifier;
  return `${resolved}${SPEC_SEPARATOR}${exportName}`;
};

const isRepositoryGenerator = (value: unknown): value is IRepositoryGenerator => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<IRepositoryGenerator>;
  return typeof candidate.name === 'string' && candidate.name.length > 0 && typeof candidate.generate === 'function';
};

const loadRepositoryGenerator = async (spec: string): Promise<IRepositoryGenerator> => {
  const { exportName, moduleSpecifier } = parseRepositoryGeneratorSpec(spec);
  const loaded = (await jiti.import(moduleSpecifier)) as Record<string, unknown>;
  const exported = loaded[exportName];
  if (exported === undefined) {
    throw new Error(`Repository generator ${JSON.stringify(exportName)} is not exported by ${moduleSpecifier}`);
  }
  if (typeof exported !== 'function') {
    throw new Error(
      `Repository generator ${JSON.stringify(exportName)} from ${moduleSpecifier} must be a class, got ${typeof exported}`
    );
  }

  const instance: unknown = new (exported as new () => unknown)();
  if (!isRepositoryGenerator(instance)) {
    throw new Error(
      `Repository generator ${JSON.stringify(exportName)} from ${moduleSpecifier} must expose a non-empty \`name\` and a \`generate()\` method`
    );
  }
  return instance;
};

/**
 * 按配置顺序装载生成器。
 *
 * @param specs `repositoryGenerators` 配置项
 * @returns 实例化后的生成器
 * @throws {Error} 规格畸形、模块装载失败、导出缺失或导出不是生成器类时抛出
 */
export const loadRepositoryGenerators = async (specs: readonly string[]): Promise<IRepositoryGenerator[]> => {
  const generators: IRepositoryGenerator[] = [];
  for (const spec of specs) {
    generators.push(await loadRepositoryGenerator(spec));
  }
  return generators;
};

/**
 * 把装载好的生成器按顺序注册到生成器实例上。
 *
 * @remarks
 * 重名拒绝由 `RxDBClientGenerator.registerRepositoryGenerator` 自己保证，这里不再重复
 * check-then-register：两处各写一份时，直接 `new RxDBClientGenerator()` 手动注册的编程调用方
 * 走不到 CLI 这一层，「重名会被拒绝」对那条路径不成立。检查只留一处，这里只按配置顺序转发。
 *
 * @param target 生成器实例
 * @param generators 已装载的生成器
 * @throws {Error} 与已注册生成器重名时抛出（见 `RxDBClientGenerator.registerRepositoryGenerator`）
 */
export const registerRepositoryGenerators = (
  target: RxDBClientGenerator,
  generators: readonly IRepositoryGenerator[]
): void => {
  generators.forEach(generator => target.registerRepositoryGenerator(generator));
};
