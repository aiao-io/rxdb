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
   * 模块可以是包名、包子路径导出、Node `#imports` 或相对路径；导出必须是一个可 `new` 的生成器类。
   * 重名会被拒绝而不是顶替已注册的同名生成器。
   *
   * **裸包/子路径/`#imports` 与相对路径解析到同一个基准目录**，取决于**入口**，这份配置类型
   * 本身在 CLI 与 Vite 插件间共用，两边的基准目录并不相同：
   * - CLI（`rxdb-client-generator.config.*` 配置文件）下，`build-client-lib.ts` 的
   *   `loadRepositoryGenerators` 按**配置文件所在目录**建一个专用的 `jiti` 实例装载模块——
   *   `cli.ts` 的 `normalizeConfig` 只把相对路径改写成绝对路径（基准同样是配置文件目录），
   *   裸包/子路径/`#imports` 则原样保留字符串，实际解析被推迟到装载那一步，两者用的是
   *   同一个基准目录，只是生效时机不同。
   * - Vite 插件（`plugins/vite.ts` 的 `rxdbClientGeneratorVitePlugin`）没有配置文件这一层：
   *   插件按**调用方（用户工程）的 `process.cwd()`** 建锚点（见 `plugins/vite.ts` 里的
   *   `repositoryGeneratorAnchor`），而不是「相对 `vite.config.*` 所在目录」——两者在项目
   *   根目录起服务时凑巧相同，但从别处（例如仓库根的脚本）起 Vite 时会对不上，用裸包/
   *   子路径/相对路径前请确认清楚基准。
   *
   * 两个入口各自把解析锚点显式传给 `build-client-lib.ts` 的 `buildClientLibrary`，
   * 不再共享同一个模块级单例——同一个全局锚点曾经只能满足其中一种语义，
   * 从配置目录之外的 cwd 跑 CLI（例如从 monorepo 根目录跑子项目配置）时，
   * 裸包/子路径/`#imports` 规格会被错误地按 cwd 解析，报出「找不到模块」。
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
