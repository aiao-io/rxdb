/**
 * @fileoverview RxDB Storage 插件
 * 存储插件入口，注册 StorageFileMeta 实体和 rxdb.storage 实例
 *
 * @module rxdb-plugin-storage
 */

import { IRxDBPlugin, Plugin, RxDB, RxDBPluginBase } from '@aiao/rxdb';
import { StorageFileMeta } from './file-meta.entity.js';
import { RxdbFileStorage, RxDBStoragePluginOptions } from './storage.service.js';

/**
 * 把 {@link RxdbFileStorage} 安装到单个 RxDB 实例的插件生命周期对象。
 *
 * 首次安装注册 metadata 实体和 `rxdb.storage`；销毁时等待 storage 排空，
 * 再对称移除本实例新增的属性与实体注册，允许后续重新安装。
 */
export class RxDBPluginStorage extends RxDBPluginBase implements IRxDBPlugin {
  readonly #ownsStorage: boolean;
  #registeredEntity = false;
  /** RxDB 插件唯一名称。 */
  readonly name = 'storage' as const;
  /** 当前 RxDB 实例专属的文件存储服务。 */
  readonly storage: RxdbFileStorage;

  /** 创建 storage 插件生命周期对象。 */
  constructor(rxdb: RxDB, options: RxDBStoragePluginOptions = {}) {
    super(rxdb);
    const hasStorage = Object.prototype.hasOwnProperty.call(rxdb, 'storage');
    this.storage = hasStorage ? rxdb.storage : new RxdbFileStorage(rxdb, options);
    this.#ownsStorage = !hasStorage;

    if (this.#ownsStorage) {
      Object.defineProperty(rxdb, 'storage', {
        value: this.storage,
        enumerable: false,
        configurable: true,
        writable: false
      });
    }
  }

  /** 注册 storage metadata 实体，不修改实体类的模块级 metadata。 */
  install(): void {
    const entities = this.rxdb.config.entities as RxDB['config']['entities'];
    if (!entities.includes(StorageFileMeta)) {
      entities.push(StorageFileMeta);
      this.#registeredEntity = true;
    }
  }

  /** 销毁本插件创建的服务，并对称撤销实例级注册。 */
  async destroy(): Promise<void> {
    if (!this.#ownsStorage) return;

    await this.storage.destroy();
    Reflect.deleteProperty(this.rxdb, 'storage');
    if (!this.#registeredEntity) return;

    const entities = this.rxdb.config.entities as RxDB['config']['entities'];
    const index = entities.indexOf(StorageFileMeta);
    if (index >= 0) entities.splice(index, 1);
    this.#registeredEntity = false;
  }
}

/** RxDB Storage 插件工厂。 */
export const rxDBPluginStorage: Plugin<RxDBStoragePluginOptions> = (db: RxDB, options?: RxDBStoragePluginOptions) =>
  new RxDBPluginStorage(db, options);

/** {@link rxDBPluginStorage} 的兼容别名。 */
export const rxdbStorage = rxDBPluginStorage;

declare module '@aiao/rxdb' {
  interface RxDB {
    /** 安装 storage 插件后可用的 OPFS 文件服务。 */
    storage: RxdbFileStorage;
  }
}
