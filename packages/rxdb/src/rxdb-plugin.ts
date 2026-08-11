import { RxDB } from './RxDB.js';

/**
 * RxDB 插件接口
 */
export interface IRxDBPlugin {
  name: Uncapitalize<string>;
  install(): void | Promise<void>;
  destroy(): void | Promise<void>;
}

/**
 * RxDB 插件基类
 */
export abstract class RxDBPluginBase {
  constructor(protected readonly rxdb: RxDB) {}
}

/**
 * RxDB 插件
 */
export type Plugin<Options = never> = (rxDB: RxDB, options?: Options) => IRxDBPlugin;
