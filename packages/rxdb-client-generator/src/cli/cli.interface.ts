/**
 * @fileoverview RxDB Client Generator CLI 接口定义
 * 命令行工具配置选项
 *
 * @module rxdb-client-generator/cli/interface
 */

import { RxDBClientGeneratorOptions } from '../core/RxDBClientGenerator.js';

/** CLI、Vite 插件与构建器共享的生成配置。 */
export interface RxDBClientCLIentGeneratorOptions extends RxDBClientGeneratorOptions {
  /**
   * 实体源文件或 glob 模式列表。
   *
   * 路径相对于配置文件所在目录解析；默认要求每个 glob 至少匹配一个文件。
   */
  entities: string[];
  /**
   * 生成产物目录。
   *
   * 路径相对于配置文件所在目录解析。同一物理目录不能被多个配置共同拥有，
   * 包括规范化路径和软链别名。
   */
  outDir: string;
  /**
   * 额外装载的 Repository 生成器，每项形如 `<模块>#<导出名>`。
   *
   * @remarks
   * 内置的 `Repository` / `TreeRepository` 自动注册，这里只声明插件带来的生成器。
   * 模块可以是包名、子路径导出或相对配置文件的路径（相对路径按配置文件目录解析）；
   * 导出必须是一个可 `new` 的生成器类。重名会被拒绝而不是顶替已注册的同名生成器。
   *
   * 生成器自带的抽象基类元数据也在这一步被登记，`@GraphEntity` 这类实体因此不再需要
   * 生成器包反向依赖插件包。
   *
   * @example
   * ```jsonc
   * { "repositoryGenerators": ["@aiao/rxdb-plugin-graph/generator#GraphRepositoryGenerator"] }
   * ```
   */
  repositoryGenerators?: string[];
  /**
   * 允许「没有发现任何实体」的构建成功
   *
   * 默认 `false`（fail-closed）。零实体的构建会写出空 `index` 并按上次 manifest
   * **删除全部既有产物**，而 glob 拼错、装饰器被误删、依赖没装都会表现为零实体 ——
   * 静默成功等于把上一次的正确产物删掉（RCG-003）。
   *
   * 只有确实需要生成空客户端时才显式打开。
   */
  allowEmpty?: boolean;
}
