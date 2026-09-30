/**
 * @packageDocumentation
 * Tree 插件的构建期生成器入口
 *
 * @remarks
 * 供 `rxdb-client-generator` 的 CLI 通过 `repositoryGenerators` 装载：
 *
 * ```jsonc
 * { "repositoryGenerators": ["@aiao/rxdb-plugin-tree/generator#TreeRepositoryGenerator"] }
 * ```
 *
 * 与运行时入口分开：本入口只在构建期跑，不应把装饰器与 rxjs 拉进来。
 *
 * @module rxdb-plugin-tree/generator
 */

export { TreeRepositoryGenerator } from './TreeRepositoryGenerator.js';
