/**
 * @fileoverview Repository 方法生成器接口
 * 提供插件化的 Repository 方法生成机制，支持扩展新的数据结构类型
 */

import type { EntityMetadata } from '@aiao/rxdb';
import type { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import type {
  AddedInterface,
  MethodDeclarationStructure,
  OptionalKind,
  PropertyDeclarationStructure,
  SourceFile
} from '../core/ts-morph-browser.js';

/**
 * Generator 上下文
 * 包含生成属性和方法所需的所有上下文信息
 */
export interface GeneratorContext {
  /** 实体元数据 */
  metadata: EntityMetadata;
  /** 类属性声明数组 */
  classProperties: OptionalKind<PropertyDeclarationStructure>[];
  /** 类方法声明数组 */
  classMethods: OptionalKind<MethodDeclarationStructure>[];
  /** rxdb 命名导入集合 */
  rxdbNamedImports: Set<string>;
  /** Repository 插件按模块登记的额外命名导入。 */
  namedImportsByModule: Map<string, Set<string>>;
  /**
   * 关系递归中引用到的对端实体类型名，按对端实体名分组。
   *
   * @remarks
   * split 模式下每个实体独占一个 `.d.ts`，这些名字必须从 `./<对端实体>.js` 导入，
   * 否则生成的规则类型引用未声明标识符（TS2304）。单文件模式下同处一处，不需要导入。
   */
  siblingNamedImports: Map<string, Set<string>>;
  /** 生成器实例 */
  generator: RxDBClientGenerator;
  /** 源文件 */
  file: SourceFile;
  /** 静态类型接口 */
  staticTypesInterface: AddedInterface;
}

/**
 * Repository 生成器接口
 *
 * 用于为不同类型的 Repository 生成特定的属性、类型定义和静态方法签名
 * 遵循开闭原则：对扩展开放，对修改封闭
 *
 * @remarks
 * 生成器采用两阶段生成：
 * 1. **generateProperties()**: 生成 Repository 特有的计算属性、缓存属性等（可选）
 * 2. **generateMethods()**: 生成 Repository 特有的查询方法（必需）
 *
 * 基类 {@link RepositoryMethodsGenerator} 提供了 generateProperties() 钩子，
 * 子类可选择性覆盖此方法。
 *
 * @example
 * ```typescript
 * // 实现自定义 GeoRepository 生成器
 * export class GeoRepositoryGenerator extends RepositoryMethodsGenerator {
 *   readonly name = 'GeoRepository';
 *
 *   // 【可选】生成 Geo 特有属性
 *   protected generateProperties(context: GeneratorContext): void {
 *     context.classProperties.push({
 *       name: 'spatialIndex',
 *       type: 'SpatialIndex',
 *       isReadonly: true,
 *       docs: ['空间索引实例，用于地理位置查询']
 *     });
 *   }
 *
 *   // 【必需】生成 Geo 特有方法
 *   protected generateMethods(context: GeneratorContext): void {
 *     this.addStaticMethod(context, {
 *       method: 'findNearby',
 *       options: 'FindNearbyOptions<typeof Entity>',
 *       returnType: 'Entity[]',
 *       metHodDoc: '查询附近的实体'
 *     });
 *   }
 * }
 *
 * // 注册到生成器
 * const generator = new RxDBClientGenerator();
 * generator.registerRepositoryGenerator(new GeoRepositoryGenerator());
 * ```
 */
export interface IRepositoryGenerator {
  /**
   * Generator 名称
   * 必须与 EntityMetadata.repository 字段匹配
   * @example 'Repository', 'TreeRepository', 'GraphRepository', 'GeoRepository'
   */
  readonly name: string;

  /** 实体运行时基类的来源模块；未设置时使用 @aiao/rxdb。 */
  readonly entityBaseModuleSpecifier?: string;

  /**
   * 生成 Repository 特有的属性和方法
   * @param context 生成上下文
   */
  generate(context: GeneratorContext): void;
}
