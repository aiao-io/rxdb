import { Observable } from 'rxjs';
import { Entity } from '../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES } from '../entity/entity.interface.js';
import { PropertyType } from '../entity/metadata-options.interface.js';
import {
  CountOptions,
  FindAllOptions,
  FindByCursorOptions,
  FindOneOptions,
  FindOneOrFailOptions,
  FindOptions
} from '../repository/query-options.interface.js';
import { RXDB_CHANGE_CODEC_VERSION } from './change-codec.js';
import { RxDBMigrationOrderByField, RxDBMigrationRuleGroup, RxDBMigrationStaticTypes } from './types.js';

/**
 * 系统表结构版本
 *
 * @remarks
 * 2：`rxdb_migration."name"` 加唯一索引。
 * 4：epic-006 的 10 张工作树 / 提交图表（当时长在核心）。
 * 5：`rxdb_branch.activeKey` 可空唯一列（FR-048 的「至多一个 active」那一半）。
 * 6：`activeKey` 就位，且 v4 那十张表**不再归核心管**——它们随
 * `@aiao/rxdb-plugin-working-tree` 走，认领与否改由能力水位裁决（见 `system/capability-watermark.ts`）。
 *
 * 5 是**补记**而不是新增能力：该列在 v4 水位线之后才进 `system/branch.ts`，于是已经被标成 4 的
 * 库（开发机上的那批）再也不会走进升级路径——版本号是升级路径唯一的触发条件，列本身不是。
 * 不 bump 就只能留下「除了那批库之外都正确」的洞。
 *
 * 6 **不带任何 DDL**，它只是把边界挪了位置。两个适配器的 `migrateSystemSchema()` 是一整块
 * 幂等修复、只由 `isCurrentRxDBSystemVersion()` 把门，于是停在 4 的库补出 `activeKey`、
 * 停在 5 的库空转一趟，两者都被重新标成 6，适配器一行都不用改。**不复用 4 或 5 改语义**：
 * 水位号是升级路径唯一的触发条件，把 4 重新定义成别的意思会让已经标成 4 的那批库被静默误读，
 * 而误读不产生任何编译错误。
 *
 * 有一种库它**接不住**，要写进发布说明：抽包**之前**就启用过提交能力的库停在 4/5，十张表
 * 带着真实数据物理还在，却没有能力水位行（那是抽包之后才有的形态）。于是新客户端即便不装插件
 * 也照常打开它，写入不再经过捕获——`capability-watermark.ts` 的守卫只认得水位行，够不到这一种。
 * 不为它单开迁移是因为这批库只存在于开发机上：epic-006 从未发布过。
 *
 * **改这个常量是一次单向操作**：bump 之后旧版本客户端打开该库会按
 * {@link UnsupportedRxDBSystemVersionError} 拒绝。这不是新增的危险面（2→3 同样如此），
 * 但每次 bump 都必须进发布说明。
 *
 * 常量停在旧值不会让任何一处编译失败——水位线是模板字符串拼出来的，会安静地跟着停住，
 * 既有库于是永远进不了升级路径。`__tests__/system/migration.spec.ts` 的「系统 schema 版本常量
 * 与水位行停在当前值」把它钉死就是为了这个——那是同一节里唯一写死版本号的一条，
 * 不要顺手改成取常量。
 */
export const RXDB_SYSTEM_SCHEMA_VERSION = 6 as const;

/**
 * 系统表结构水位行的名字前缀
 *
 * @remarks
 * 水位不单开一张表，而是**借 `rxdb_migration` 的一行**记录：名字形如
 * `__rxdb_system_schema__:6`，版本号编码在前缀之后。这样「读版本」和「记版本」天然复用
 * 迁移表已有的唯一索引与事务语义——版本推进和产生它的那批 DDL 在同一个事务里落盘，
 * 不存在「DDL 成功但版本没记上」的中间态。
 *
 * 代价是这个前缀落在了用户迁移的命名空间里：双下划线包裹是为了不与用户迁移名相撞。
 * {@link getRxDBSystemVersionState} 按 `startsWith` 认它，所以**前缀一旦发布就不能改**——
 * 改了等于既有库的水位行集体失踪，{@link isCurrentRxDBSystemVersion} 会把一个已经是最新的库
 * 判成需要迁移，并在补记时撞上唯一索引。
 */
export const RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX = '__rxdb_system_schema__:' as const;

/**
 * 变更编解码版本水位行的名字前缀
 *
 * @remarks
 * 与 {@link RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX} 同一套机制、同一条「发布后不可改」的约束，
 * 但两个号**必须各占一行**：codec 版本管的是 `rxdb_change` 里已落盘负载的解码方式，
 * 没有迁移阶梯（旧客户端读不懂新负载，只能升客户端）；schema 版本管的是表结构，落后可补。
 * 合成一行就没法让 {@link UnsupportedRxDBSystemVersionError} 回答「该升客户端还是该跑迁移」。
 */
export const RXDB_CHANGE_CODEC_WATERMARK_PREFIX = '__rxdb_change_codec__:' as const;

/**
 * 当前系统表结构水位行的完整名字，适配器 `migrateSystemSchema()` 补记时写入这一条
 *
 * @remarks
 * 由前缀与 {@link RXDB_SYSTEM_SCHEMA_VERSION} 模板拼接而成，因此 bump 版本号会自动带着它走——
 * 这也是「常量停在旧值不会让任何一处编译失败」的来源，见 {@link RXDB_SYSTEM_SCHEMA_VERSION} 的说明。
 */
export const RXDB_SYSTEM_SCHEMA_WATERMARK =
  `${RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX}${RXDB_SYSTEM_SCHEMA_VERSION}` as const;

/**
 * 当前变更编解码水位行的完整名字
 *
 * @remarks
 * 版本号取自 `change-codec.ts` 的 `RXDB_CHANGE_CODEC_VERSION`，与本文件的 schema 版本各自演进。
 */
export const RXDB_CHANGE_CODEC_WATERMARK = `${RXDB_CHANGE_CODEC_WATERMARK_PREFIX}${RXDB_CHANGE_CODEC_VERSION}` as const;

/**
 * 从迁移记录里读出来的两个版本号
 *
 * @remarks
 * 全新库读到的是 `{ schemaVersion: 0, codecVersion: 0 }`——**0 表示「没有水位行」而不是「版本 0」**，
 * 因为水位号从 1 起编（{@link getRxDBSystemVersionState} 拒绝 `0` 前缀的编码）。于是
 * 「未初始化」和「落后」在下游是同一条路径：都不满足 {@link isCurrentRxDBSystemVersion}，
 * 都走那一整块幂等的 `migrateSystemSchema()`。
 */
export interface RxDBSystemVersionState {
  /** 系统表结构版本，`0` 表示库里还没有水位行 */
  schemaVersion: number;

  /** 变更编解码版本，`0` 表示库里还没有水位行 */
  codecVersion: number;
}

/**
 * 版本不匹配时报给用户的「哪个号」——**核心自己的**两个。
 *
 * @remarks
 * 两个号各自独立演进，因此不能合成一句「版本不兼容」：用户拿到的错误必须能直接回答
 * 「我该升客户端还是该跑迁移」。`system schema` 有迁移阶梯，落后可补；`change codec` 没有。
 *
 * 这里曾经还有 `'commit protocol' | 'commit graph schema'` 两支，随 epic-006 抽包一并移出：
 * 核心不再认识提交概念，把它们留在一个封闭联合里等于核心替插件枚举号名。插件自己的号改走
 * {@link RxDBCapabilityVersionKind}。
 */
export type RxDBSystemVersionKind = 'system schema' | 'change codec';

/**
 * 版本不匹配时报给用户的「哪个号」——**插件能力自己的**。
 *
 * @remarks
 * 能力版本号由贡献它的插件定义，核心数不清也不该数：第三方插件同样要能报出可读的版本不匹配，
 * 而它的号名核心不可能预先枚举。于是这里不枚举号名，只多要一样东西——**归属哪个能力**。
 *
 * 要它是因为号名单独拿出来没有归属：用户同时装着几个插件时，一句「commit protocol 版本不对」
 * 指不回该升哪个包。带上能力名就和 `capability-watermark.ts` 里 `RxDBCapabilityClaim` 的归因、
 * 以及「未认领能力守卫」报的那个名字对上了，三处口径一致。
 */
export interface RxDBCapabilityVersionKind {
  /** 能力名，与贡献它的插件的 `IRxDBPlugin.name` 同值 */
  readonly capability: string;

  /** 该能力内部的号名，如 `'commit protocol'`；原样渲染进错误消息 */
  readonly kind: string;
}

/**
 * 库里存着的版本号高于本进程支持的版本
 *
 * @remarks
 * 这是**降级保护**，方向是单向的：只有「库比客户端新」才抛，「库比客户端旧」是正常的待迁移状态。
 * 因为迁移阶梯只朝一个方向铺——新客户端认得怎么把旧库补上来，旧客户端不可能认得未来的表结构，
 * 让它继续读写等于按一份自己读不懂的 schema 写数据。
 *
 * 除了水位比较，{@link getRxDBSystemVersionState} 在**水位行本身畸形**时也抛它
 * （版本段不是正整数、或超出安全整数范围），同样是 fail-closed：一行认不出来的水位
 * 说明这个库不是本实现写的，猜不得。
 *
 * `kind` 收两种形态：核心自己的两个号传字符串（见 {@link RxDBSystemVersionKind}），
 * 插件能力的号传 {@link RxDBCapabilityVersionKind} 以便消息里带上该升哪个包。
 * **核心两个号的消息逐字节不可变**——`migration.spec.ts` 按 `stringContaining` 认它们。
 */
export class UnsupportedRxDBSystemVersionError extends Error {
  override readonly name = 'UnsupportedRxDBSystemVersionError';

  constructor(
    kind: RxDBSystemVersionKind | RxDBCapabilityVersionKind,
    actualVersion: unknown,
    supportedVersion: number
  ) {
    // 核心两个号的消息**逐字节不变**（`migration.spec.ts` 按 `stringContaining` 认它们）；
    // 能力号多渲染一个能力名前缀，这样「升哪个包」不用再猜。
    const label = typeof kind === 'string' ? kind : `${kind.capability} ${kind.kind}`;
    super(`Unsupported RxDB ${label} version: stored=${String(actualVersion)}, supported=${String(supportedVersion)}`);
  }
}

/**
 * 拿不到系统迁移所需的排他锁，本次迁移整体未执行
 *
 * @remarks
 * 由适配器抛出，触发条件是「此刻改 schema 不安全」而不是「改失败了」：PGlite 走
 * `LOCK TABLE ... NOWAIT` 拿不到锁、或 `hasStoragePeer()` 报告另一个客户端正持有同一份持久化存储；
 * sqlite 系走各自绑定的等价判据。两种情况下 DDL 一行都没落地——检查在事务里、抢先返回，
 * 所以收到它时库还停在迁移前的完整状态，**不需要任何回滚补偿**。
 *
 * 不做自动重试是有意的：持有方通常是用户的另一个标签页或另一个进程，重试只会在锁上空转。
 * 调用方应把它当作「请关掉另一个打开该库的窗口后重开」报给用户。
 */
export class RxDBSystemMigrationLockError extends Error {
  override readonly name = 'RxDBSystemMigrationLockError';

  constructor(cause: unknown) {
    super('Cannot acquire the exclusive RxDB system migration lock; another writer may still be active.', { cause });
  }
}

/**
 * 判定错误是否为唯一/主键约束冲突。
 *
 * @param cause - 适配器抛出的原始错误
 * @returns 是唯一/主键约束冲突时返回 `true`
 *
 * @remarks
 * 各适配器的错误对象结构不一，能共用的只有两样：PostgreSQL 的 SQLSTATE `23505`，
 * 以及 SQLite 各绑定（wa-sqlite / sqlite-wasm / sqliteai / node）消息里必带的原生文本。
 * 只匹配这两类，其余错误原样上抛 —— 与 `sqlite-core-keyring-storage.ts` 同一口径（SQLC-029）。
 *
 * **不要**拿它去判断任意位置的写失败**是不是**并发冲突：它只说「这是唯一约束冲突」，
 * 说不了「冲突的是哪张表哪个索引」。调用方必须把它夹在那一条自己发出的 INSERT 上，
 * 否则用户代码里一条无关的唯一约束错误会被误读（见 {@link RxDBMigrationClaimConflictError}）。
 */
export const isUniqueConstraintViolation = (cause: unknown): boolean => {
  if ((cause as { code?: unknown } | null | undefined)?.code === '23505') return true;
  const message = cause instanceof Error ? cause.message : String(cause);
  return /UNIQUE constraint failed|PRIMARY KEY must be unique|duplicate key value violates unique constraint/i.test(
    message
  );
};

/**
 * 同名迁移已被另一个 RxDB 实例认领执行权
 *
 * @remarks
 * 只在「认领执行权的 INSERT」这一条语句上产生。迁移自己的 `up` 里撞到的唯一约束
 * 不会变成这个错误 —— 那是用户数据的问题，静默重试会把一条非幂等迁移跑第二遍。
 *
 * 收到它意味着本次迁移事务已整体回滚，调用方应重新读取已执行集合后重试。
 */
export class RxDBMigrationClaimConflictError extends Error {
  override readonly name = 'RxDBMigrationClaimConflictError';

  constructor(
    /** 被抢先认领的迁移名 */
    readonly migrationName: string,
    override readonly cause: unknown
  ) {
    super(`Migration '${migrationName}' was claimed by another RxDB instance.`, { cause });
  }
}

const readWatermarkVersion = (
  name: string,
  prefix: string,
  kind: RxDBSystemVersionKind,
  supportedVersion: number
): number | undefined => {
  if (!name.startsWith(prefix)) return undefined;
  const encodedVersion = name.slice(prefix.length);
  if (!/^[1-9]\d*$/.test(encodedVersion)) {
    throw new UnsupportedRxDBSystemVersionError(kind, encodedVersion, supportedVersion);
  }
  const version = Number(encodedVersion);
  if (!Number.isSafeInteger(version)) {
    throw new UnsupportedRxDBSystemVersionError(kind, encodedVersion, supportedVersion);
  }
  return version;
};

/**
 * 从迁移名集合里解出两个版本号。
 *
 * @param migrationNames - `rxdb_migration` 全表的 `name` 列，顺序无关
 * @returns 两个号各自的最大值；没有对应水位行时为 `0`
 * @throws {@link UnsupportedRxDBSystemVersionError} 任一水位行的版本段畸形时
 *
 * @remarks
 * 取 `max` 而不是「最后一条」：水位行是历次迁移累积下来的，一个升到 6 的库里
 * `__rxdb_system_schema__:4` 那行仍在（迁移记录不删，删了等于丢掉执行历史），
 * 而迁移表的读取顺序不保证。
 *
 * 用户自己的迁移名一律被跳过（前缀不匹配即 `undefined`），不会误判成水位。
 */
export const getRxDBSystemVersionState = (migrationNames: Iterable<string>): RxDBSystemVersionState => {
  let schemaVersion = 0;
  let codecVersion = 0;
  for (const name of migrationNames) {
    schemaVersion = Math.max(
      schemaVersion,
      readWatermarkVersion(name, RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX, 'system schema', RXDB_SYSTEM_SCHEMA_VERSION) ?? 0
    );
    codecVersion = Math.max(
      codecVersion,
      readWatermarkVersion(name, RXDB_CHANGE_CODEC_WATERMARK_PREFIX, 'change codec', RXDB_CHANGE_CODEC_VERSION) ?? 0
    );
  }
  return { schemaVersion, codecVersion };
};

/**
 * 断言库的版本不高于本进程支持的版本，否则拒绝打开。
 *
 * @param state - {@link getRxDBSystemVersionState} 的结果
 * @throws {@link UnsupportedRxDBSystemVersionError} 任一号高于本进程常量时
 *
 * @remarks
 * 只拦「库比客户端新」。落后（含全新库的 `0`）在这里一律放行——那是
 * {@link isCurrentRxDBSystemVersion} 接手、由适配器补迁移的正常路径，
 * 在这里拦住会让所有需要升级的库都打不开。
 */
export const assertSupportedRxDBSystemVersions = (state: RxDBSystemVersionState): void => {
  if (state.schemaVersion > RXDB_SYSTEM_SCHEMA_VERSION) {
    throw new UnsupportedRxDBSystemVersionError('system schema', state.schemaVersion, RXDB_SYSTEM_SCHEMA_VERSION);
  }
  if (state.codecVersion > RXDB_CHANGE_CODEC_VERSION) {
    throw new UnsupportedRxDBSystemVersionError('change codec', state.codecVersion, RXDB_CHANGE_CODEC_VERSION);
  }
};

/**
 * 判断库是否已经停在当前水位，两个号都相等才算。
 *
 * @param state - {@link getRxDBSystemVersionState} 的结果
 * @returns 两个号都与本进程常量相等时返回 `true`
 *
 * @remarks
 * 各适配器 `migrateSystemSchema()` 唯一的门：`true` 直接返回，`false` 走那一整块**幂等**修复。
 * 因为幂等，停在 4、停在 5、和全新的 `0` 共用同一条路径，适配器不需要按版本分支
 * （见 {@link RXDB_SYSTEM_SCHEMA_VERSION} 里 6 号水位的说明）。
 *
 * 用**相等**而不是 `>=`：库比进程新时这里返回 `false` 会把它推进迁移路径，
 * 而那份 DDL 只认得往当前水位补。该情况由 {@link assertSupportedRxDBSystemVersions} 在更早处拦掉，
 * 两者必须成对调用。
 */
export const isCurrentRxDBSystemVersion = (state: RxDBSystemVersionState): boolean =>
  state.schemaVersion === RXDB_SYSTEM_SCHEMA_VERSION && state.codecVersion === RXDB_CHANGE_CODEC_VERSION;

/**
 * 数据库迁移记录
 *
 * 用于记录数据库迁移脚本的执行历史。这个类捕获每次数据库迁移的关键信息，
 * 包括迁移名称和执行时间，确保迁移脚本不会被重复执行，
 * 并提供迁移历史的追踪能力。
 */
@Entity({
  namespace: 'rxdb',
  name: 'RxDBMigration',
  tableName: 'rxdb_migration',
  log: false,
  properties: [
    {
      name: 'id',
      type: PropertyType.integer,
      primary: true
    },
    {
      // 唯一索引是「同一条迁移只跑一次」的唯一仲裁者。少了它，
      // 「查全表再按 name 判断」就只是一次快照，并发实例各读各的空快照，
      // 非幂等迁移会被执行两遍。
      name: 'name',
      type: PropertyType.string,
      readonly: true,
      unique: true
    },
    {
      name: 'executedAt',
      type: PropertyType.date,
      readonly: true,
      default: () => new Date()
    }
  ]
})
export class RxDBMigration {
  static [ENTITY_STATIC_TYPES]: RxDBMigrationStaticTypes;

  /**
   * id
   */
  id!: number;
  /**
   * 执行时间
   * @default new Date()
   */
  executedAt!: Date;
  /**
   * 名称
   */
  name!: string;

  /**
   * count 查询
   * @param options 查询选项
   */
  declare static count: (options: CountOptions<typeof RxDBMigration, RxDBMigrationRuleGroup>) => Observable<number>;

  /**
   * find 查询
   * @param options 查询选项
   */
  declare static find: (
    options: FindOptions<typeof RxDBMigration, RxDBMigrationRuleGroup, RxDBMigrationOrderByField>
  ) => Observable<RxDBMigration[]>;

  /**
   * findAll 查询
   * @param options 查询选项
   */
  declare static findAll: (
    options: FindAllOptions<typeof RxDBMigration, RxDBMigrationRuleGroup, RxDBMigrationOrderByField>
  ) => Observable<RxDBMigration[]>;

  /**
   * findByCursor 查询
   * @param options 查询选项
   */
  declare static findByCursor: (
    options: FindByCursorOptions<typeof RxDBMigration, RxDBMigrationRuleGroup, RxDBMigrationOrderByField>
  ) => Observable<RxDBMigration[]>;

  /**
   * findOne 查询
   * @param options 查询选项
   */
  declare static findOne: (
    options: FindOneOptions<typeof RxDBMigration, RxDBMigrationRuleGroup, RxDBMigrationOrderByField>
  ) => Observable<RxDBMigration | null>;

  /**
   * findOneOrFail 查询
   * @param options 查询选项
   */
  declare static findOneOrFail: (
    options: FindOneOrFailOptions<typeof RxDBMigration, RxDBMigrationRuleGroup, RxDBMigrationOrderByField>
  ) => Observable<RxDBMigration>;

  /**
   * get 查询
   * @param options 查询选项
   */
  declare static get: (options: number) => Observable<RxDBMigration>;

  /**
   * 删除
   */
  declare remove: () => Promise<RxDBMigration>;
  /**
   * 重置数据
   */
  declare reset: () => void;
  /**
   * 保存
   */
  declare save: () => Promise<RxDBMigration>;
}
