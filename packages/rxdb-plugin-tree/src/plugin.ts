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

/**
 * {@link rxDBPluginTree} 的选项。
 *
 * @remarks
 * 目前无可配项：树的所有行为都由实体元数据（`features.tree`）和查询选项决定，
 * 没有需要在装配期敲定的开关。保留这个类型是为了让 `Plugin<…>` 的形参具名 ——
 * 将来加选项时是加字段，不是改签名。
 */
type RxDBPluginTreeOptions = object;

/**
 * 树形结构插件。
 *
 * @remarks
 * 只做一件事：把 {@link TreeRepository} 登记到 `rxdb` 的仓储注册表，并声明它撑不住
 * `SyncType.QueryCache`。登记是 **scoped** 的 —— 连接断开时随 scope 一起撤销，
 * 不会把指向已拆纪元的仓储留在 `rxdb` 上。
 *
 * 四个树查询（`findDescendants` / `countDescendants` / `findAncestors` / `countAncestors`）
 * 与它们的增量 merge 都挂在 `TreeRepository` 上，不装本插件的应用连 `QueryOptions`
 * 里都没有这四支。
 *
 * 一般不直接 `new`，用工厂 {@link rxDBPluginTree} 交给 `.use()`。
 *
 * @example
 * ```typescript
 * import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';
 *
 * const rxdb = new RxDB({ entities: [Category] }).use(rxDBPluginTree);
 * ```
 */
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

/**
 * {@link RxDBPluginTree} 的工厂，交给 `RxDB.use()`。
 *
 * @remarks
 * 注册树实体（继承 `TreeAdjacencyListEntityBase` 或 `@TreeEntity` 标注）的应用**必须**
 * 装它：没装时 `repository: 'TreeRepository'` 在注册期找不到仓储，实体初始化直接抛错
 * （契约见 `__tests__/contracts/missing-plugin-error.spec.ts`），不会静默降级成普通仓储。
 *
 * @param db - 宿主 `RxDB` 实例，由 `use()` 注入
 * @returns 插件实例
 *
 * @example
 * ```typescript
 * const rxdb = new RxDB({ entities: [Category] }).use(rxDBPluginTree);
 * ```
 */
export const rxDBPluginTree: Plugin<RxDBPluginTreeOptions> = (db: RxDB) => new RxDBPluginTree(db);
