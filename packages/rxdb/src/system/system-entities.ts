import type { EntityType } from '../entity/entity.interface.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDBBranch } from './branch.js';
import { RxDBChange } from './change.js';
import { RxDBMigration } from './migration.js';
import { RxDBSync } from './sync.js';

/**
 * 核心自带的系统表，每个库都有
 *
 * @remarks
 * **这是一份快照，不随插件增长**——正因如此它才是**注入**那一侧的起点：每个库的系统表
 * = 这四张 + 它自己 `use()` 过的插件所贡献的那些（见 `RxDB.systemEntities`）。拿会增长的
 * {@link SYSTEM_ENTITIES} 去注入，进程里只要有任何一个库装了贡献方，没装的库也会被建出
 * 那些表、吃它们的迁移。
 *
 * 顺序即建表顺序：`RxDBChange` 引用 `RxDBBranch`。
 */
export const CORE_SYSTEM_ENTITIES: readonly EntityType[] = [RxDBBranch, RxDBChange, RxDBMigration, RxDBSync];

/**
 * 系统表登记簿的背衬数组；{@link SYSTEM_ENTITIES} 是它的只读视图。
 *
 * @remarks
 * 可变是为了让插件能在 `connect()` 之前**追加**自己的系统表（{@link registerSystemEntities}）。
 * 视图与背衬是**同一个数组对象**，因此既有消费者（`capture-hook` 的排除集、
 * `RxDBAdapterHttp` 的同步判定）读到的恒是当前登记，不需要各自改成取函数。
 */
const SYSTEM_ENTITY_REGISTRY: EntityType[] = [...CORE_SYSTEM_ENTITIES];

/**
 * 本进程见过的全部系统表身份
 *
 * @remarks
 * 这是一份**判定**用的清单，不是注入用的：它回答「这个类是不是某个系统表」，
 * 不回答「哪个库该建哪些表」。后者按实例算，见 {@link CORE_SYSTEM_ENTITIES}。
 *
 * **核心只自带四张。** epic-006「本地工作树与提交历史」的十张表随
 * `@aiao/rxdb-plugin-working-tree` 走，装了那个包才经 {@link registerSystemEntities} 追加进来。
 *
 * 判定清单只此一份。此前每个需要「排除系统表」的地方都自己抄一遍类名，
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
 * 多实例不会互相污染，但那**不是**这个函数保证的：保证来自建表那一侧按实例算
 * （`RxDB.systemEntities` = {@link CORE_SYSTEM_ENTITIES} + 本实例 `use()` 过的贡献）。
 * 登记簿只被「这个类是不是系统表」这类判定读，多认几个身份对没装该插件的库没有行为差异——
 * 那些类根本进不了它的 `config.entities`。
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
 * 全部系统表的身份（`namespace:name`，形如 `rxdb:RxDBBranch`）
 *
 * @returns 当前登记簿的身份集合；**每次调用重新求值**
 *
 * @remarks
 * 与 {@link getSystemEntityNames} 同源、同「活视图」口径（理由见那边），区别只在**带不带
 * 命名空间**：裸名回答不了「`public:Commit` 是不是系统表」，而 epic-006 的系统表里恰好有一张
 * `rxdb:Commit`，接入方拿 `Commit` 当业务实体名完全合法。按裸名判的话，那个业务实体的写会被
 * 整批判成 `system` 而静默绕过工作树捕获——改动不进提交，且没有任何报错形态。
 *
 * 交出集合而不是逐个判定的谓词（{@link isSystemEntity} 那一份要的是实体**类**）：消费者手上
 * 常常只有从变更日志读出来的 `namespace` + `entity` 两个字符串，回不到类引用。
 */
export function getSystemEntityIdentities(): ReadonlySet<string> {
  return new Set(SYSTEM_ENTITY_IDENTITIES);
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
