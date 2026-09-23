/**
 * @fileoverview Repository 方法生成器接口
 * 提供插件化的 Repository 方法生成机制，支持扩展新的数据结构类型
 */

import type { EntityMetadata, EntityMetadataOptions } from '@aiao/rxdb';
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
 * 生成器自报的一个顶层类型名。
 */
export interface RepositoryGeneratorTypeSymbol {
  /** 类型名，例如 `FolderTreeRuleGroup`。 */
  readonly name: string;
  /** 是否被 `index.d.ts` 再导出；split 模式下导出名另占一个作用域。 */
  readonly exported?: boolean;
}

/**
 * 生成器自报的产物符号
 *
 * @remarks
 * 与 {@link IRepositoryGenerator.generate} 一一对应：**只声明本生成器自己写入的符号**。
 * 扩展类型（`repository` 不是 `Repository`）的实体会先跑一轮基类 `Repository` 生成，
 * 那一轮的符号由基类生成器自报；覆盖了 `generateMethods` 而不调用 `super` 的子类，
 * 同样必须覆盖 {@link IRepositoryGenerator.declareSymbols} 而不合并父类结果，否则同一个
 * 符号会被声明两次，预检把它当成冲突。
 */
export interface RepositoryGeneratorSymbols {
  /** 写入实体声明文件的顶层类型。 */
  readonly types?: readonly RepositoryGeneratorTypeSymbol[];
  /** 写入实体类的实例成员名。 */
  readonly instanceMembers?: readonly string[];
  /**
   * 实体类要 `implements` 的接口名，从 {@link IRepositoryGenerator.entityBaseModuleSpecifier}
   * 引入；非空时取代默认的 `IEntity`。
   */
  readonly entityInterfaces?: readonly string[];
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
   * 本生成器负责的抽象实体基类元数据，键为基类名，值按「自身 → 祖先」顺序排列。
   *
   * @remarks
   * 抽象基类的装饰器实参通常是一个常量标识符（`@Entity(GRAPH_ENTITY_BASE_OPTIONS)`），
   * CLI 的静态求值取不到它的值；而基类元数据又必须在分析实体源码时就位，否则
   * `extends GraphEntityBase` 的实体直接报「无法静态求值」。
   *
   * 由生成器随身携带这份数据后，分析器按 {@link entityBaseModuleSpecifier} 指向的包名
   * 加基类名回填——生成器包因此不必为每个插件的基类反向依赖该插件。
   * 只声明了本字段而没有 {@link entityBaseModuleSpecifier} 的生成器不会被分析器采纳：
   * 少了包名就只能按类名匹配，用户自己写的同名类会被顶替。
   */
  readonly abstractEntityMetadata?: ReadonlyMap<string, EntityMetadataOptions[]>;

  /**
   * 自报本生成器将写入的符号，供生成前的冲突预检与实体声明使用。
   *
   * @remarks
   * 预检必须在建 ts-morph Project 之前跑完，那时还没有任何产物文本可供扫描，
   * 只能由生成器自己申报。不实现本方法的生成器不占任何名字——它写出的符号因此
   * 不参与预检，冲突要等到 {@link generate} 落盘阶段的成员校验才暴露。
   *
   * @param metadata 当前实体的元数据
   * @returns 本生成器为该实体写入的符号
   */
  declareSymbols?(metadata: EntityMetadata): RepositoryGeneratorSymbols;

  /**
   * 生成 Repository 特有的属性和方法
   * @param context 生成上下文
   */
  generate(context: GeneratorContext): void;
}
