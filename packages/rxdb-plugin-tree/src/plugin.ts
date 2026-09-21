/**
 * @fileoverview RxDB Tree 插件
 * 树形结构插件入口，提供 TreeRepository 注册与树能力扩展
 *
 * @module rxdb-plugin-tree
 */

import { IRxDBPlugin, Plugin, RxDB, RxDBPluginBase, SyncType } from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
import { EntityMetadataTreeFeatures } from './entity/tree-metadata.interface.js';
import { TreeRepository } from './repository/TreeRepository.js';

type RxDBPluginTreeOptions = object;

export class RxDBPluginTree extends RxDBPluginBase implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  name: Uncapitalize<string> = 'tree';

  install(scope: LifecycleScope) {
    // 传 scope：断开连接时这条注册跟着一起撤销，与 graph 插件同一处理。
    this.rxdb.repository(
      'TreeRepository',
      {
        class: TreeRepository,
        // 这条限制原先是核心 `metadata-validate.ts` 里硬编码的 `unsupportedTreeQueryCache`
        // 规则。核心不该知道 'TreeRepository' 是什么，所以改由注册方自己声明；
        // 核心只负责把声明翻译成 `unsupportedRepositorySyncType` 违规。
        unsupportedSyncTypes: {
          [SyncType.QueryCache]:
            `树查询依赖本地完整的祖先链，而缓存只覆盖查过的 where 命中的行，` +
            `递归会在缺口处静默截断。改用 SyncType.Full / Filter，或把该实体换成普通 Repository。`
        }
      },
      scope
    );
  }
}

declare module '@aiao/rxdb' {
  interface RxDB {
    tree: RxDBPluginTree;
  }
  /**
   * 把 `TreeRepository` 登进门面轴注册表
   *
   * @remarks
   * 与上面 `install()` 里的 `rxdb.repository('TreeRepository', …)` 成对：
   * 那一处是运行期登记，这一处是类型登记。少了它，`@Entity({ repository: 'TreeRepository' })`
   * 只能落到 `RxDBRepositoryName` 的 `(string & {})` 那一支，补全里一个字都没有。
   */
  interface RxDBRepositories {
    TreeRepository: typeof TreeRepository;
  }
  /**
   * 扩展 EntityMetadataFeatures，添加 tree 字段
   */
  interface EntityMetadataFeatures {
    /**
     * 树形特性配置
     * 由 rxdb-plugin-tree 插件提供
     */
    tree?: EntityMetadataTreeFeatures;
  }
}

export const rxDBPluginTree: Plugin<RxDBPluginTreeOptions> = (db: RxDB) => new RxDBPluginTree(db);
