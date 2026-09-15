import type { EntityType } from '../entity/entity.interface.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDBBranch } from './branch.js';
import { RxDBChange } from './change.js';
import { RxDBMigration } from './migration.js';
import { RxDBSync } from './sync.js';

/**
 * 系统表登记簿的背衬数组；{@link SYSTEM_ENTITIES} 是它的只读视图。
 *
 * @remarks
 * 可变是为了让插件能在 `connect()` 之前**追加**自己的系统表（{@link registerSystemEntities}）。
 * 视图与背衬是**同一个数组对象**，因此所有既有消费者（`SchemaManager.init` 的逐张补表、
 * `capture-hook` 的排除集、`RxDB` 的系统批次划分）读到的恒是当前登记，不需要各自改成取函数。
 */
const SYSTEM_ENTITY_REGISTRY: EntityType[] = [RxDBBranch, RxDBChange, RxDBMigration, RxDBSync];

/**
 * RxDB 自己注入的系统表
 *
 * @remarks
 * 由 {@link SchemaManager.init} 无条件补进 `config.entities`，接入方既不声明也不感知。
 * 顺序即建表顺序：`RxDBChange` 引用 `RxDBBranch`。
 *
 * **核心只有这四张。** epic-006「本地工作树与提交历史」的十张表随
 * `@aiao/rxdb-plugin-working-tree` 走，装了那个包才经 {@link registerSystemEntities} 追加进来——
 * 于是不用提交能力的库既不建那十张表，也不吃它们的迁移。
 *
 * 清单只此一份。此前每个需要「排除系统表」的地方都自己抄一遍类名，
 * 抄漏一个的代价不是编译错误而是运行期的错判。
 *
 * **这是一份活视图，不是快照。** 插件经 {@link registerSystemEntities} 追加的表会直接出现在
 * 这里。不要在模块加载期把它 `map` 成一份派生常量——那会把插件的表永久排除在派生集合之外，
 * 而症状不是编译错误（见 {@link getSystemEntityNames}）。
 */
export const SYSTEM_ENTITIES: readonly EntityType[] = SYSTEM_ENTITY_REGISTRY;

/** 算出一个实体类的身份，形如 `rxdb:RxDBBranch`。 */
const identityOf = (EntityClass: EntityType): string => {
  const { namespace, name } = getEntityMetadata(EntityClass);
  return `${namespace}:${name}`;
};

/**
 * 系统表的身份集合，形如 `rxdb:RxDBBranch`
 *
 * @remarks
 * 按 `namespace:name` 而不是类引用比对：`@aiao/rxdb` 在混合解析（`src` 与 `dist` 同时在场）
 * 下可能出现两份模块实例，类的引用相等会静默失效，而实体身份不会。
 */
const SYSTEM_ENTITY_IDENTITIES = new Set<string>(SYSTEM_ENTITY_REGISTRY.map(identityOf));

/**
 * 登记插件贡献的系统表
 *
 * @param entities - 插件的系统实体类，顺序即建表顺序
 *
 * @remarks
 * **系统表身份是「实体类」的属性，不是「某个数据库」的属性**，所以登记簿是模块级、只增不减的。
 * 这正是 {@link isSystemEntity} 得以保持纯函数签名的原因——它有跨包消费者
 * （`RxDBAdapterHttp` 拿它决定同步行为），改成按实例取会波及包外调用点。
 *
 * 多实例不会互相污染：没装该插件的 RxDB 实例，它的 `config.entities` 里根本没有这些类，
 * 登记簿多认几个身份对它不产生任何行为差异。
 *
 * 按身份幂等：同一张表重复登记是空操作，因此 `disconnect()` → `connect()` 重装插件不会让
 * 登记簿无限增长（与 {@link SchemaManager.init} 逐张判定同一个理由）。
 *
 * 必须在 `connect()` **之前**调用。建表引导只读一次登记簿，之后再登记的表不会被建出来。
 */
export function registerSystemEntities(entities: readonly EntityType[]): void {
  for (const EntityClass of entities) {
    const identity = identityOf(EntityClass);
    if (SYSTEM_ENTITY_IDENTITIES.has(identity)) continue;
    SYSTEM_ENTITY_IDENTITIES.add(identity);
    SYSTEM_ENTITY_REGISTRY.push(EntityClass);
  }
}

/**
 * 全部系统表的实体名（`@Entity` 上的 `name`，不带 namespace）
 *
 * @returns 当前登记簿算出的名字集合；**每次调用重新求值**
 *
 * @remarks
 * 必须现算，不能提成模块级常量。提成常量的代价不是编译错误：插件登记的表会安静地漏成业务实体，
 * 于是库自己的簿记写入开始被当成用户编辑落进工作树，而没有任何测试会因此变红。
 */
export function getSystemEntityNames(): ReadonlySet<string> {
  return new Set(SYSTEM_ENTITY_REGISTRY.map(EntityClass => getEntityMetadata(EntityClass).name));
}

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
  return SYSTEM_ENTITY_IDENTITIES.has(identityOf(EntityClass));
}
