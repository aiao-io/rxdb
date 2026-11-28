/**
 * @fileoverview 按一个库的实体登记建出它的版本化域——捕获运行时与导入远端提交（US-319）共用的那一份。
 *
 * @remarks
 * 搬自 `capture-hook.ts`：导入要问「这张表受不受版本控制」，答案必须与捕获问的是同一份清单。另建一份的话，
 * 某个实体会在捕获那边算 untracked、在导入那边算 tracked——它的改动被导入写进业务表与变更日志，
 * 却从不进任何人的工作树，epic-006「版本化域」第二条硬规则禁止的正是这种形态。
 *
 * **不在公开面上**（`index.ts` 不导出本模块）：调用方要判类别，问装好的捕获运行时（`WorkingTreeCaptureRuntime.domain`），
 * 而不是自己再建一份。
 */

import type { EntitySyncResolver, EntityType, RxDBAdapterLocalBase, SyncOptions } from '@aiao/rxdb';
import { getEntityMetadata, getEntitySync, isSystemEntity, RxDBError } from '@aiao/rxdb';
import { buildVersionedDomain, type VersionedDomain, type VersionedDomainEntityInput } from './versioned-domain.js';

/**
 * 建域时唯一要向适配器问的那件事：这张表在它发出的 SQL 里叫什么
 *
 * @remarks
 * 收窄到一个成员而不是整个 `RxDBAdapterLocalBase`，是因为建域只读这一项——收整个适配器会让
 * 「建域还依赖适配器的什么」变成要逐行读实现才能回答的问题。
 *
 * 不收一个裸的 `(metadata) => string[]`：那样任何一处都能就地塞一份自己拼的规则进来，
 * 而这次改动的全部意义正是让规则只有一份、且归写表的那一方所有。要求**有这个方法的对象**，
 * 生产路径上就只有适配器本身能交得出。
 */
export type PhysicalTableNameSource = Pick<RxDBAdapterLocalBase, 'physicalTableNames'>;

/**
 * 把一个实体类折成域的登记项
 *
 * @param adapter - 物理表名的唯一出处
 * @param databaseSync - 实例解析器或库级同步配置，见 {@link buildDatabaseVersionedDomain}
 * @returns 可直接喂给 `Array.prototype.map` 的折叠函数
 * @throws RxDBError 实体解析不出生效的同步配置时
 *
 * @remarks
 * 表名问适配器而不是读 `metadata.tableName`：后者是**逻辑**名，而 SQLite 家族真正建出来的是
 * `public$post`，那也是它们唯一能用的表名。在这里只登记逻辑名的话，raw 门禁在 5/6 的后端上
 * 整条失效，且没有报错形态。
 *
 * 同步策略走 {@link getEntitySync} 而不是直接读 `metadata.sync`：「实体优先、否则继承库级」
 * 这条规则已经有一份实现，在这里重写一遍就等于给 `QueryCache` 的判定开了第二个入口。
 * 解析不出同步配置时抛而不是当作 `Full`：`RxDBConfig.sync` 是必填的，这个分支在正常构造下走不到；
 * 真走到了说明配置形状已经不是这里以为的样子，此时按「不是 QueryCache」继续只会把一张缓存表静默地纳入版本化。
 */
const toVersionedDomainEntityInput =
  (adapter: PhysicalTableNameSource, databaseSync: SyncOptions | EntitySyncResolver) =>
  (EntityType: EntityType): VersionedDomainEntityInput => {
    const metadata = getEntityMetadata(EntityType);
    const sync = getEntitySync(EntityType, databaseSync);
    if (!sync) throw new RxDBError(`实体 ${metadata.name} 解析不出生效的同步配置，无法判定它是否版本化。`);
    return {
      entityName: metadata.name,
      namespace: metadata.namespace,
      physicalTableNames: adapter.physicalTableNames(metadata),
      syncType: sync.type,
      log: metadata.log
    };
  };

/**
 * 这个库注册的业务实体：`rxdb.config.entities` 去掉系统表。
 *
 * @param entities - `rxdb.config.entities`
 * @returns 业务实体，顺序照旧
 *
 * @remarks
 * `rxdb.config.entities` 已经被 `SchemaManager.init()` 补过系统表，照单全收会让 `rxdb_branch` / `rxdb_change`
 * 这些表落进版本化域。导入判「这条分支是不是空的」时逐张数业务表，也要的是这一份。
 */
export const businessEntitiesOf = (entities: readonly EntityType[]): EntityType[] =>
  entities.filter(EntityType => !isSystemEntity(EntityType));

/**
 * 按一个库的实体登记建出它的版本化域。
 *
 * @param adapter - 本纪元的本地适配器；只问它物理表名
 * @param entities - 这个库注册的全部实体（`rxdb.config.entities`）
 * @param databaseSync - 实例解析器 `rxdb.entitySync`（含实例覆盖）；传库级 `rxdb.config.sync` 时只按「实体优先、否则继承库级」解析
 * @returns 只含业务实体的版本化域
 * @throws RxDBError 某个实体解析不出生效的同步配置时
 *
 * @remarks
 * **系统表先摘出去再建域**（{@link businessEntitiesOf}）：留着它们，raw 写四步门禁的判定域整个错位——
 * 库自己的簿记 SQL 会被当成绕过捕获的业务写而拦下。摘干净之后还多一层作用：域认得的名字必定是业务实体，
 * `WorkingTreeCaptureRuntime.targetClassOf` 正是靠这一点先问域再问系统表清单。
 */
export const buildDatabaseVersionedDomain = (
  adapter: PhysicalTableNameSource,
  entities: readonly EntityType[],
  databaseSync: SyncOptions | EntitySyncResolver
): VersionedDomain =>
  buildVersionedDomain(businessEntitiesOf(entities).map(toVersionedDomainEntityInput(adapter, databaseSync)));
