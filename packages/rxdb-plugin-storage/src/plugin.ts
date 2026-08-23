/**
 * @fileoverview RxDB Storage 插件
 * 存储插件入口，注册 StorageFileMeta 实体和 rxdb.storage 实例
 *
 * @module rxdb-plugin-storage
 */

import { IRxDBPlugin, Plugin, RxDB, RxDBPluginBase } from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
import { StorageFileMeta } from './file-meta.entity.js';
import { RxdbFileStorage, type RxDBStoragePluginOptions } from './storage.service.js';

/**
 * 把 {@link RxdbFileStorage} 安装到单个 RxDB 实例的插件生命周期对象。
 *
 * @remarks
 * 三处宿主改动各占一条作用域条目——建服务、挂 `rxdb.storage`、注册 metadata 实体——
 * 断开连接时按逆序退回：先摘实体、再摘属性、最后等 storage 排空。改造前这三件事
 * 分散在构造函数、`install()`、`destroy()` 里，靠 `#ownsStorage` / `#registeredEntity`
 * 两个布尔量对账；现在清单在作用域里，插件不再自己记。
 *
 * 服务只在**连接期间**存在：`storage` 在安装前与拆卸后都是 `undefined`。
 */
export class RxDBPluginStorage extends RxDBPluginBase implements IRxDBPlugin {
  readonly #options: RxDBStoragePluginOptions;
  #storage?: RxdbFileStorage;
  /** 已迁移到作用域拆卸，宿主不再调用 `destroy()`。 */
  readonly lifecycle = 'scoped' as const;
  /** RxDB 插件唯一名称。 */
  readonly name = 'storage' as const;

  /** 当前连接纪元的文件存储服务；安装前与拆卸后为 `undefined`。 */
  get storage(): RxdbFileStorage | undefined {
    return this.#storage;
  }

  /** 创建 storage 插件生命周期对象。 */
  constructor(rxdb: RxDB, options: RxDBStoragePluginOptions = {}) {
    super(rxdb);
    this.#options = options;
  }

  /** 建服务、挂 `rxdb.storage`、注册 metadata 实体，三步各自登记撤销条目。 */
  install(scope: LifecycleScope): void {
    // 同一个 RxDB 实例上已经有别的插件实例挂了 storage：本实例什么都不登记，
    // 于是也什么都不撤销——拆卸的对称性由「谁装谁拆」保证，不需要 #ownsStorage 记账。
    if (Object.prototype.hasOwnProperty.call(this.rxdb, 'storage')) return;

    scope.acquire(() => {
      this.#storage = new RxdbFileStorage(this.rxdb, this.#options);
      return async () => {
        await this.#storage?.destroy();
        this.#storage = undefined;
      };
    }, 'storage:service');

    scope.acquire(() => {
      Object.defineProperty(this.rxdb, 'storage', {
        value: this.#storage,
        enumerable: false,
        configurable: true,
        writable: false
      });
      return () => void Reflect.deleteProperty(this.rxdb, 'storage');
    }, 'storage:property');

    // 不改实体类的模块级 metadata：只往本实例的 entities 里放一份引用
    scope.acquire(() => {
      const entities = this.rxdb.config.entities as RxDB['config']['entities'];
      // 已经在配置里（宿主自己列了）就不是我们放进去的，也就轮不到我们摘走
      if (entities.includes(StorageFileMeta)) return undefined;
      entities.push(StorageFileMeta);
      return () => {
        const index = entities.indexOf(StorageFileMeta);
        if (index >= 0) entities.splice(index, 1);
      };
    }, 'storage:entity');
  }
}

/** RxDB Storage 插件工厂。 */
export const rxDBPluginStorage: Plugin<RxDBStoragePluginOptions> = (db: RxDB, options?: RxDBStoragePluginOptions) =>
  new RxDBPluginStorage(db, options);

/** {@link rxDBPluginStorage} 的兼容别名。 */
export const rxdbStorage = rxDBPluginStorage;

declare module '@aiao/rxdb' {
  interface RxDB {
    /**
     * 安装 storage 插件后、**连接期间**可用的 OPFS 文件服务。
     *
     * @remarks
     * 属性本身是纪元资源：`connect()` 时挂上，`disconnectAll()` 时删掉。
     * 这里**故意**不标成可选——它描述的是连接期间的形态，也是唯一该访问它的时候；
     * 标可选会让每一个正常调用点都背上一次无意义的判空。断连后读到的是 `undefined`，
     * 断连后仍要跑的收尾逻辑请自行判空，或挪到 `disconnectAll()` 之前。
     */
    storage: RxdbFileStorage;
  }
}
