/**
 * @fileoverview 捕获侧一致性套件自带的业务实体。
 *
 * @remarks
 * 提交侧套件用 `entities: []` 就够了——它只碰系统表。捕获侧不行：「捕获是否完备」是关于
 * **业务写**的命题，没有业务实体就一条也断言不了。于是实体由套件自己给出，并经
 * `@aiao/rxdb/testing` 导出，6 个调用点原样注册同一份清单。
 *
 * **实体定义不放进 `capture.suite.ts`**：那个文件顶层 `import 'vitest'`，而调用点要在
 * `RxDB` 配置里引用这两个类。同一个模块既是测试注册器又是实体来源，调用点就得先把
 * 套件模块整个求值一遍才能拿到类——实体声明因此单独成文件。
 *
 * @module @aiao/rxdb/testing
 */

import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';

/**
 * 调用点必须在**库级** `sync` 上登记的远端适配器名。
 *
 * @remarks
 * 不是给谁去连的——这个名字下永远不会有适配器被注册，也没有任何用例订阅 `remoteAdapter$`。
 * 它存在的唯一原因是 {@link ConformanceCache} 声明了 `SyncType.QueryCache`，而
 * `validateEntityMetadata` 的 `missingQueryCacheAdapter` 规则查的是**库级** `sync` 两侧是否
 * 齐全：缺 `remote` 时 `EntityManager.init()` 直接抛错，整个套件在 `createDatabase()` 里就死了。
 *
 * 取一个自描述的假名而不是复用后端真名（`'pglite'` / `'sqlite'`），是为了让「它没被连过」
 * 这件事在配置里就看得见——写成真名的话，读配置的人会以为这里真有一条远端链路。
 *
 * @public
 */
export const WORKING_TREE_CONFORMANCE_REMOTE_ADAPTER = 'working-tree-conformance-remote';

/**
 * 本地适配器占位名，只出现在**实体级** `sync` 声明里。
 *
 * @remarks
 * `RxDB.init()` 只从 `rxdb.config.sync` 取适配器名去注册，实体装饰器上的 `adapter` 一个字
 * 都不读（见 `metadata-validate.ts` 的 `missingQueryCacheAdapterSides`）。套件要跨 6 个后端
 * 跑，而每个后端的本地注册名都不同，所以这里只能是一个不参与解析的占位符。
 *
 * @public
 */
export const WORKING_TREE_CONFORMANCE_LOCAL_ADAPTER = 'working-tree-conformance-local';

/**
 * 调用点必须写进 `RxDBConfig.context.userId` 的审计主体。
 *
 * @remarks
 * **不是可选装饰。** 适配器在生成 INSERT / UPDATE 语句时会用 `context.userId` 覆写
 * `createdBy` / `updatedBy`（sqlite-core 的 `insert_sql` / `update_sql`，PGlite 同名文件），
 * 而这两列按 `UNTRACKED_BOOKKEEPING_FIELDS` 的定义是 **tracked** 的——审计主体属于净变化。
 * 于是「捕获到的 patch 有没有把适配器盖上去的那两列算进来」只有在 `userId` 非空时才成立为一道
 * 判据；不设它的库里两列恒为 `null`，冷重放两边同时是 `null`，这一整类缺陷全程假绿。
 *
 * 取值与 5 个 SQLite 家族 factory 既有的 `context` 同字面量，纯为让六个后端的业务行长得一样；
 * 套件本身不读这个值，只要求它非空（见 `workingTreeCaptureConformanceSuite` 的建库自检）。
 *
 * @public
 */
export const WORKING_TREE_CONFORMANCE_USER_ID = 'userId';

/**
 * 受版本化管辖的业务实体：套件里绝大多数断言的被写对象。
 *
 * @remarks
 * 字段刻意只留两个可写列。`title` 是常规的 tracked 列；`body` 可空，用来构造「一次更新只动
 * 一列」的场景。簿记字段不在这里声明——`createdAt` / `updatedAt` 由 {@link EntityBase} 带来，
 * 它们正是 `UNTRACKED_BOOKKEEPING_FIELDS` 里的两项，§1.2 的「只动簿记字段不产生单元」
 * 就靠它们驱动。
 *
 * @public
 */
@Entity({
  name: 'ConformanceNote',
  tableName: 'conformance_notes',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'body', type: PropertyType.string, nullable: true }
  ]
})
export class ConformanceNote extends EntityBase {
  /** tracked 列：改它必然产生工作树单元 */
  title!: string;

  /** 可空的 tracked 列：用来构造「只动一列」的更新 */
  body!: string | null;
}

/**
 * `SyncType.QueryCache` 实体：第一类 untracked 的驱动源。
 *
 * @remarks
 * §1.1 的「`upsertMany` 放行」与 §1.4 的「QueryCache 整体不进版本化域」都需要一个**真在库里
 * 建了表**的 QueryCache 实体，单测里那种 `buildVersionedDomain()` 的纯内存登记证明不了
 * 「生产路径上也这么判」。
 *
 * 套件从不对它调 `getRepository()`：QueryCache 仓储在构造时就要求两侧适配器具备缓存能力，
 * 而这里两侧都是占位名。所有写都走 `adapter.upsertMany()` / `deleteByIds()` 这条裸批量通道，
 * 那正好也是 §1.1 第 4 组要断言的挂载点。
 *
 * @public
 */
@Entity({
  name: 'ConformanceCache',
  tableName: 'conformance_caches',
  properties: [{ name: 'label', type: PropertyType.string }],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: WORKING_TREE_CONFORMANCE_LOCAL_ADAPTER },
    remote: { adapter: WORKING_TREE_CONFORMANCE_REMOTE_ADAPTER }
  }
})
export class ConformanceCache extends EntityBase {
  /** 缓存行上的唯一业务列 */
  label!: string;
}

/**
 * 捕获侧套件要求调用点注册的全部业务实体。
 *
 * @remarks
 * 导出成一个常量而不是让 6 个调用点各写各的数组：少注册一个类不会有编译错误，只会让依赖它的
 * 用例在那一个后端上以「实体未注册」的形态报错，而那种报错读起来像后端缺陷。
 *
 * @public
 */
export const WORKING_TREE_CONFORMANCE_ENTITIES: readonly EntityType[] = [ConformanceNote, ConformanceCache];
