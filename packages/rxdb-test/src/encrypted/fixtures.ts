/**
 * `@aiao/rxdb-adapter-encrypted` 契约套件的共享 fixture。
 *
 * `EncryptedUser` 是 wa-sqlite 与 PGlite adapter 测试 runner 中
 * `runCrudSuite` / `runQueryValidationSuite` 共同使用的规范实体。
 *
 * 混合的属性类型覆盖 `serializeForEnvelope` / `deserializeFromEnvelope`
 * 实现的全部序列化分支（字符串 / 数字 / 布尔 / 日期 / JSON），
 * 再加一个未加密标量，便于反向用例断言磁盘上的普通列未被改动。
 *
 * 哨兵常量就是往返测试插入的**原始明文字节序列**；
 * `scanForPlaintext` 稍后会断言这些字符串从未出现在原始数据库文件 dump 中。
 */
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/** 插入 `creditCardInfo` 的明文探针。 */
export const SENTINEL_CC = 'SENTINEL_CC_4242424242424242';
/** 插入 `apiSecret` 的明文探针。 */
export const SENTINEL_API = 'SENTINEL_API_sk_live_DEADBEEF';
/** 作为嵌套 JSON 值插入 `metadata` 的明文探针。 */
export const SENTINEL_JSON = 'SENTINEL_JSON_payload_marker';
/**
 * 更新用的第二个明文探针。
 *
 * change log 的 `inversePatch` 存旧值、`patch` 存新值：只用一个探针的话两边写的是同一串字节，
 * 扫描分不出「新值泄漏」和「旧值泄漏」，也证明不了 update 真的产生了历史（RXT-018）。
 */
export const SENTINEL_CC_ROTATED = 'SENTINEL_CC_ROTATED_1357913579135791';

/**
 * `EncryptedUser` —— 混合加密 / 普通列的契约测试实体。
 *
 * 列：
 * - `id`         — 主键（明文，由 `EntityBase.uuid` 提供）。
 * - `name`       — 普通字符串；对照列（不能加密）。
 * - `creditCardInfo` — 加密字符串。
 * - `apiSecret`  — 加密字符串。
 * - `metadata`   — 加密 JSON；用于覆盖嵌套对象序列化。
 * - `loginCount` — 加密整数。
 * - `active`     — 加密布尔。
 * - `lastSeenAt` — 加密日期。
 */
@Entity({
  name: 'EncryptedUser',
  tableName: 'encrypted_user',
  namespace: 'encrypted-fixtures',
  log: false,
  properties: [
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'creditCardInfo', type: PropertyType.string, encrypted: true, nullable: true },
    { name: 'apiSecret', type: PropertyType.string, encrypted: true, nullable: true },
    { name: 'metadata', type: PropertyType.json, encrypted: true, nullable: true },
    { name: 'loginCount', type: PropertyType.integer, encrypted: true, nullable: true },
    { name: 'active', type: PropertyType.boolean, encrypted: true, nullable: true },
    { name: 'lastSeenAt', type: PropertyType.date, encrypted: true, nullable: true }
  ]
})
export class EncryptedUser extends EntityBase {
  name!: string;
  creditCardInfo!: string | null;
  apiSecret!: string | null;
  metadata!: Record<string, unknown> | null;
  loginCount!: number | null;
  active!: boolean | null;
  lastSeenAt!: Date | null;
}

/**
 * `EncryptedAuditedUser` —— 在 {@link EncryptedUser} 的类型矩阵上增加数组，并**开启 change log**。
 *
 * 存在的唯一理由：`EncryptedUser` 设了 `log: false`，于是「change log 里没有明文」这条断言
 * 扫的是一张**永远为空的表** —— adapter 即使把密文字段以明文写进 `patch` / `inversePatch`，
 * 套件也全绿（RXT-018）。加密的 change log 有独立的编解码路径
 * （`envelopePlaintextPatches` / `unenvelopePlaintextPatches`），必须由一个真的会写历史的
 * 实体来覆盖。
 *
 * 用独立 `tableName` 而不是改 `EncryptedUser` 的 `log`：后者会让每一条既有 CRUD 用例都
 * 顺带写历史，把「实体表泄漏」和「历史表泄漏」的失败信号混在一起。
 */
@Entity({
  name: 'EncryptedAuditedUser',
  tableName: 'encrypted_audited_user',
  namespace: 'encrypted-fixtures',
  log: true,
  properties: [
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'creditCardInfo', type: PropertyType.string, encrypted: true, nullable: true },
    { name: 'apiSecret', type: PropertyType.string, encrypted: true, nullable: true },
    { name: 'metadata', type: PropertyType.json, encrypted: true, nullable: true },
    { name: 'tags', type: PropertyType.stringArray, encrypted: true, nullable: true },
    { name: 'scores', type: PropertyType.numberArray, encrypted: true, nullable: true },
    { name: 'loginCount', type: PropertyType.integer, encrypted: true, nullable: true },
    { name: 'active', type: PropertyType.boolean, encrypted: true, nullable: true },
    { name: 'lastSeenAt', type: PropertyType.date, encrypted: true, nullable: true }
  ]
})
export class EncryptedAuditedUser extends EntityBase {
  name!: string;
  creditCardInfo!: string | null;
  apiSecret!: string | null;
  metadata!: Record<string, unknown> | null;
  tags!: string[] | null;
  scores!: number[] | null;
  loginCount!: number | null;
  active!: boolean | null;
  lastSeenAt!: Date | null;
}

/** 所有哨兵字符串 —— 为 `scanForPlaintext` 提供便利导出。 */
export const ENCRYPTED_SENTINELS: ReadonlyArray<string> = [
  SENTINEL_CC,
  SENTINEL_API,
  SENTINEL_JSON,
  '9753108642',
  SENTINEL_CC_ROTATED
];
