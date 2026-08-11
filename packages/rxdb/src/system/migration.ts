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
 */
export const RXDB_SYSTEM_SCHEMA_VERSION = 3 as const;
export const RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX = '__rxdb_system_schema__:' as const;
export const RXDB_CHANGE_CODEC_WATERMARK_PREFIX = '__rxdb_change_codec__:' as const;

export const RXDB_SYSTEM_SCHEMA_WATERMARK =
  `${RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX}${RXDB_SYSTEM_SCHEMA_VERSION}` as const;
export const RXDB_CHANGE_CODEC_WATERMARK = `${RXDB_CHANGE_CODEC_WATERMARK_PREFIX}${RXDB_CHANGE_CODEC_VERSION}` as const;

export interface RxDBSystemVersionState {
  schemaVersion: number;
  codecVersion: number;
}

type RxDBSystemVersionKind = 'system schema' | 'change codec';

export class UnsupportedRxDBSystemVersionError extends Error {
  override readonly name = 'UnsupportedRxDBSystemVersionError';

  constructor(kind: RxDBSystemVersionKind, actualVersion: unknown, supportedVersion: number) {
    super(`Unsupported RxDB ${kind} version: stored=${String(actualVersion)}, supported=${String(supportedVersion)}`);
  }
}

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
 * 同名迁移已被另一个 RxDB 实例占坑
 *
 * @remarks
 * 只在「占坑 INSERT」这一条语句上产生。迁移自己的 `up` 里撞到的唯一约束
 * 不会变成这个错误 —— 那是用户数据的问题，静默重试会把一条非幂等迁移跑第二遍。
 *
 * 收到它意味着本次迁移事务已整体回滚，调用方应重新读取已执行集合后重试。
 */
export class RxDBMigrationClaimConflictError extends Error {
  override readonly name = 'RxDBMigrationClaimConflictError';

  constructor(
    /** 被抢走的迁移名 */
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

export const assertSupportedRxDBSystemVersions = (state: RxDBSystemVersionState): void => {
  if (state.schemaVersion > RXDB_SYSTEM_SCHEMA_VERSION) {
    throw new UnsupportedRxDBSystemVersionError('system schema', state.schemaVersion, RXDB_SYSTEM_SCHEMA_VERSION);
  }
  if (state.codecVersion > RXDB_CHANGE_CODEC_VERSION) {
    throw new UnsupportedRxDBSystemVersionError('change codec', state.codecVersion, RXDB_CHANGE_CODEC_VERSION);
  }
};

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
