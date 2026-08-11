/**
 * @fileoverview RxDB Client Generator
 * RxDB 客户端代码生成器，从实体元数据生成类型定义和实体类代码
 *
 * 主要功能：
 * - 从 EntityMetadata 生成 .d.ts 类型定义文件
 * - 生成实体类的 .js 文件（使用装饰器）
 * - 支持分文件（splitFiles）和单文件两种生成模式
 * - 支持 TreeRepository 等扩展 Repository 类型
 *
 * @module rxdb-client-generator
 */

export * from './core/RxDBClientGenerator.js';
export type { SourceFile } from './core/ts-morph-browser.js';
export type { GeneratorContext, IRepositoryGenerator } from './generators/RepositoryGenerator.interface.js';
export { RepositoryGeneratorBase } from './generators/RepositoryGeneratorBase.js';
