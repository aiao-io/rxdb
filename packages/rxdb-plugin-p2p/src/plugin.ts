import { IRxDBPlugin, Plugin, RxDB, RxDBPluginBase } from '@aiao/rxdb';
import { P2PFileManifestEntity } from './p2p-file-manifest.entity.js';

/** P2P 文件插件没有选项：它只登记清单实体，不建立任何网络连接。 */
export type RxDBPluginP2PFilesOptions = object;

/**
 * P2P 插件壳：在 `use()` 时把清单实体登记进本实例配置。
 *
 * @remarks
 * 实体只在 `init()`（`connect()` 的第一步）时绑定、建表，所以登记必须早于它，也不能放进 `install()`：
 * `init()` 失败后立刻重试时，安装会推迟到上一纪元释放完成之后，那时实体已经绑定完毕。
 * 实体留在本实例配置里跨连接纪元复用，断连时由实体管理器按绑定记录解绑。
 */
export class RxDBPluginP2PFiles extends RxDBPluginBase implements IRxDBPlugin {
  /** 作用域式生命周期：不需要 `destroy()`。 */
  readonly lifecycle = 'scoped' as const;
  /** 插件名。 */
  name: Uncapitalize<string> = 'p2pFiles';

  /**
   * @param rxdb - 要登记清单实体的数据库实例
   * @throws Error 实例已经 `init()`（已调用过 `connect()`）
   */
  constructor(rxdb: RxDB) {
    super(rxdb);
    if (rxdb.initialized) {
      throw new Error('rxDBPluginP2PFiles must be used before connect(): entities are bound when RxDB initializes');
    }
    const entities = rxdb.config.entities as RxDB['config']['entities'];
    if (!entities.includes(P2PFileManifestEntity)) entities.push(P2PFileManifestEntity);
  }

  /** 清单实体已在 `use()` 时登记；连接期间不创建任何资源。 */
  install(): void {
    return undefined;
  }
}

/** 安装 P2P 文件插件；必须在 `connect()` 之前调用 `rxdb.use()`。 */
export const rxDBPluginP2PFiles: Plugin<RxDBPluginP2PFilesOptions> = (db: RxDB) => new RxDBPluginP2PFiles(db);
