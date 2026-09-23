/**
 * @packageDocumentation
 * 生成物的编译校验工具，供插件包断言自己的生成结果**真的能被 `tsc` 编译**。
 *
 * @remarks
 * 单独开成 `@aiao/rxdb-client-generator/testing` 子路径，是因为插件包不能反过来
 * 被生成器包依赖（依赖方向是插件 → 生成器），插件自己的生成器用例只能自带桩声明。
 *
 * @example
 * ```ts
 * const diagnostics = await compileGeneratedConsumer(generator.getSourceFiles(), consumer, {
 *   pluginStubs: [{ moduleSpecifier: '@aiao/rxdb-plugin-tree', declarations, reexportsFromCore: ['EntityBase'] }]
 * });
 * expect(diagnostics).toEqual([]);
 * ```
 *
 * @module rxdb-client-generator/testing
 */

export {
  compileGeneratedConsumer,
  type CompileGeneratedConsumerOptions,
  type GeneratedConsumerPluginStub
} from './generated-consumer.js';
export { runTypeScriptCompiler } from './typescript-compiler.js';
