import { IRxDBPlugin, Plugin, RxDB, RxDBPluginBase } from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
import { P2PFileManifestEntity } from './p2p-file-manifest.entity.js';

/** P2P 文件插件没有后台线程；它只把清单/传输原语作为显式服务提供。 */
export type RxDBPluginP2PFilesOptions = object;

/** P2P 插件壳，保证清单实体可与其它 RxDB 插件按标准方式安装。 */
export class RxDBPluginP2PFiles extends RxDBPluginBase implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  name: Uncapitalize<string> = 'p2pFiles';

  install(scope: LifecycleScope): void {
    // 只注册实体，不在安装时创建网络连接；断开连接后撤销本实例的引用。
    scope.acquire(() => {
      const entities = this.rxdb.config.entities as RxDB['config']['entities'];
      if (entities.includes(P2PFileManifestEntity)) return undefined;
      entities.push(P2PFileManifestEntity);
      return () => {
        const index = entities.indexOf(P2PFileManifestEntity);
        if (index >= 0) entities.splice(index, 1);
      };
    }, 'p2p-files:entity');
  }
}

/** 安装 P2P 文件插件。 */
export const rxDBPluginP2PFiles: Plugin<RxDBPluginP2PFilesOptions> = (db: RxDB) => new RxDBPluginP2PFiles(db);
