/**
 * @fileoverview 已知插件生成器的提示表
 * 把「树/图的 Repository 生成器不再内置」这件事，翻译成用户能直接抄进配置的一行。
 *
 * @module rxdb-client-generator/core/known-repository-generators
 */

/**
 * 官方插件包 → `repositoryGenerators` 里该写的规格。
 *
 * @remarks
 * 这是一张**纯字符串**表：本包不 import 任何 `@aiao/rxdb-plugin-*`，
 * 否则依赖图会反向成环（插件包依赖本包）。表外的包一律沉默，
 * 第三方生成器的提示由它自己的文档负责。
 */
const KNOWN_GENERATOR_SPECS: ReadonlyMap<string, string> = new Map([
  ['@aiao/rxdb-plugin-graph', '@aiao/rxdb-plugin-graph/generator#GraphRepositoryGenerator'],
  ['@aiao/rxdb-plugin-tree', '@aiao/rxdb-plugin-tree/generator#TreeRepositoryGenerator']
]);

/** Repository 注册名 → 提供它的插件包。 */
const REPOSITORY_TYPE_PACKAGES: ReadonlyMap<string, string> = new Map([
  ['GraphRepository', '@aiao/rxdb-plugin-graph'],
  ['TreeRepository', '@aiao/rxdb-plugin-tree']
]);

const describeSpec = (packageName: string | undefined): string => {
  const spec = packageName === undefined ? undefined : KNOWN_GENERATOR_SPECS.get(packageName);
  if (spec === undefined) return '';
  return ` Add "${spec}" to \`repositoryGenerators\` in the generator config.`;
};

/**
 * 按包名给出装载提示；不认识的包返回空串。
 *
 * @param packageName - 实体基类或装饰器所属的包名
 * @returns 以空格开头、可直接拼到错误消息尾部的一句话，或 `''`
 */
export const describeMissingGeneratorForPackage = (packageName: string): string => describeSpec(packageName);

/**
 * 按 Repository 注册名给出装载提示；不认识的类型返回空串。
 *
 * @param repositoryType - `metadata.repository` 上的注册名，如 `TreeRepository`
 * @returns 以空格开头、可直接拼到错误消息尾部的一句话，或 `''`
 */
export const describeMissingGeneratorForRepository = (repositoryType: string): string =>
  describeSpec(REPOSITORY_TYPE_PACKAGES.get(repositoryType));
