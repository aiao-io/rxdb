import type { EntityType } from '../entity/entity.interface.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDBBranch } from './branch.js';
import { RxDBChange } from './change.js';
import { RxDBMigration } from './migration.js';
import { RxDBSync } from './sync.js';

/**
 * RxDB 自己注入的四张系统表
 *
 * @remarks
 * 由 {@link SchemaManager.init} 无条件补进 `config.entities`，接入方既不声明也不感知。
 * 顺序即建表顺序：`RxDBChange` 引用 `RxDBBranch`。
 *
 * 清单只此一份。此前每个需要「排除系统表」的地方都自己抄一遍四个类名，
 * 抄漏一个的代价不是编译错误而是运行期的错判。
 */
export const SYSTEM_ENTITIES: readonly EntityType[] = [RxDBBranch, RxDBChange, RxDBMigration, RxDBSync];

/**
 * 系统表的身份集合，形如 `rxdb:RxDBBranch`
 *
 * @remarks
 * 按 `namespace:name` 而不是类引用比对：`@aiao/rxdb` 在混合解析（`src` 与 `dist` 同时在场）
 * 下可能出现两份模块实例，类的引用相等会静默失效，而实体身份不会。
 */
const SYSTEM_ENTITY_IDENTITIES: ReadonlySet<string> = new Set(
  SYSTEM_ENTITIES.map(EntityClass => {
    const { namespace, name } = getEntityMetadata(EntityClass);
    return `${namespace}:${name}`;
  })
);

/**
 * 判断一个实体类是不是 RxDB 注入的系统表
 *
 * @param EntityClass - 待判定的实体类
 * @returns 命中 {@link SYSTEM_ENTITIES} 时为 `true`
 *
 * @remarks
 * 系统表**不是接入方数据**：它们没有自己的 `sync`，因此在
 * {@link getSyncType} 眼里会跟随库级配置，被判成与业务实体同一个同步类型。
 * 凡是「按同步类型枚举接入方仓库」的地方都得先用本谓词把它们摘出去，
 * 否则库级配置一变，系统表就跟着被送进它们从不参与的管道。
 *
 * @example
 * ```ts
 * isSystemEntity(RxDBBranch); // true
 * isSystemEntity(Recipe);     // false
 * ```
 */
export function isSystemEntity(EntityClass: EntityType): boolean {
  const { namespace, name } = getEntityMetadata(EntityClass);
  return SYSTEM_ENTITY_IDENTITIES.has(`${namespace}:${name}`);
}
