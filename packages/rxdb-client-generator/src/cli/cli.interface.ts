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
