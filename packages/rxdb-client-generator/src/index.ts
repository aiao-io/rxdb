/**
 * @fileoverview RxDB Client Generator
 * RxDB 客户端代码生成器，从实体元数据生成类型定义和实体类代码
 *
 * 主要功能：
 * - 从 EntityMetadata 生成 .d.ts 类型定义文件
 * - 生成实体类的 .js 文件（使用装饰器）
 * - 支持分文件（splitFiles）和单文件两种生成模式
 * - 通过 `repositoryGenerators` 装载插件包提供的扩展 Repository 生成器
 *
 * @module rxdb-client-generator
 */

export * from './core/RxDBClientGenerator.js';
export type { SourceFile } from './core/ts-morph-browser.js';
// 插件包实现扩展 Repository 生成器要用到的全部构件：
// 接口与基类、规则收集（generateEntityRules → buildRules），以及自报符号的类型。
export { generateEntityRules, type RuleTypeData } from './generators/entity-rules.js';
export type {
  GeneratorContext,
  IRepositoryGenerator,
  RepositoryGeneratorSymbols,
  RepositoryGeneratorTypeSymbol
} from './generators/RepositoryGenerator.interface.js';
export {
  RepositoryGeneratorBase,
  RepositoryMethodsGenerator,
  buildRules
} from './generators/RepositoryGeneratorBase.js';
